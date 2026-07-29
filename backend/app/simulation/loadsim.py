"""Continuous load simulation (Phase 2 of the simulation engine).

Where `heuristics.py` answers "is this design sound?" as a one-shot check,
this module answers "what happens when traffic actually flows through it?" —
it pushes a request stream from the entry points through the graph and reports
per-component and per-connection load, saturation, drops, and latency.

The `/simulate/live` WebSocket endpoint calls `compute_tick` on a timer and
streams the result, so the UI can animate the flow until the user stops it.

Routing model
-------------
Traffic arriving at a node is forwarded downstream by edge category:

* **Routing edges** (to app/edge tiers) split the load — that's a load
  balancer fanning out, a gateway routing to services, or an app sharding
  across datastores.
* **Data edges** (to caches/datastores) are *per-request work*, not a split:
  a node serving 100 rps issues ~100 rps of queries. When a node has both a
  cache and a datastore downstream, cache-aside applies — the cache absorbs
  `CACHE_HIT_RATIO`, the datastore only sees the misses.
* **Async edges** (`async_queue`) are fire-and-forget: the target receives the
  full stream, but the producer doesn't wait on it, so it stays out of the
  synchronous latency path.

Connections that lie on a declared functional (`path_exists`) requirement get
a routing weight boost, so declared user journeys carry more of the traffic
than incidental links.
"""

import random
from collections import defaultdict, deque
from typing import Optional

from ..catalog import CACHE_TYPES, DATASTORE_TYPES, effective_props

DEFAULT_ARRIVAL_RPS = 200.0
CACHE_HIT_RATIO = 0.8
# Queueing delay blows up as utilization approaches 1; clamp so the reported
# latency stays a large-but-finite number instead of dividing by zero.
MAX_UTIL_FOR_LATENCY = 0.98
PREFERRED_EDGE_WEIGHT = 2.0


class Snapshot:
    """Plain copy of a project's graph, detached from the DB session.

    The live simulation runs for minutes; holding an ORM session open that
    long would be wasteful, so the WebSocket endpoint snapshots the project
    once at connect time and simulates against this.
    """

    def __init__(self, components, connections, requirements):
        self.components = [
            _Comp(c.id, c.type, c.name, dict(c.props or {})) for c in components
        ]
        self.connections = [
            _Conn(c.id, c.source_id, c.target_id, c.protocol) for c in connections
        ]
        self.requirements = [
            _Req(r.id, r.kind, r.subtype, dict(r.params or {})) for r in requirements
        ]


class _Comp:
    def __init__(self, id, type, name, props):
        self.id = id
        self.type = type
        self.name = name
        self.props = props


class _Conn:
    def __init__(self, id, source_id, target_id, protocol):
        self.id = id
        self.source_id = source_id
        self.target_id = target_id
        self.protocol = protocol


class _Req:
    def __init__(self, id, kind, subtype, params):
        self.id = id
        self.kind = kind
        self.subtype = subtype
        self.params = params


def base_arrival_rps(requirements) -> float:
    """Target traffic level — the throughput the design is asked to sustain."""
    for r in requirements:
        if r.kind == "nonfunctional" and r.subtype == "min_throughput_rps":
            value = r.params.get("value")
            if value:
                return float(value)
    return DEFAULT_ARRIVAL_RPS


class FlowGraph:
    def __init__(self, components, connections, requirements):
        self.components = components
        self.connections = connections
        self.by_id = {c.id: c for c in components}
        self.eff = {c.id: effective_props(c.type, c.props) for c in components}
        self.conn_by_id = {c.id: c for c in connections}

        self.out_edges: dict = defaultdict(list)
        self.in_edges: dict = defaultdict(list)
        for conn in connections:
            if conn.source_id in self.by_id and conn.target_id in self.by_id:
                self.out_edges[conn.source_id].append(conn)
                self.in_edges[conn.target_id].append(conn)

        self.preferred_edges = _preferred_edges(self, requirements)
        self.order = self._topo_order()

    def entries(self) -> list:
        clients = [c.id for c in self.components if c.type == "client"]
        if clients:
            return clients
        return [c.id for c in self.components if not self.in_edges.get(c.id)]

    def capacity(self, node_id: str) -> Optional[float]:
        e = self.eff[node_id]
        if e["capacity_rps"] is None:
            return None
        return float(e["capacity_rps"]) * max(int(e["replicas"]), 1)

    def _topo_order(self) -> list:
        """Kahn's algorithm; nodes left inside cycles are appended at the end."""
        indeg = {c.id: len(self.in_edges.get(c.id, [])) for c in self.components}
        queue = deque([nid for nid, d in indeg.items() if d == 0])
        order = []
        seen = set()
        while queue:
            nid = queue.popleft()
            order.append(nid)
            seen.add(nid)
            for conn in self.out_edges.get(nid, []):
                indeg[conn.target_id] -= 1
                if indeg[conn.target_id] == 0:
                    queue.append(conn.target_id)
        order.extend(c.id for c in self.components if c.id not in seen)
        return order


def _preferred_edges(graph: "FlowGraph", requirements) -> set:
    """Connection ids lying on a path that satisfies a functional requirement."""
    sequences = [
        r.params.get("types", [])
        for r in requirements
        if r.kind == "functional" and r.subtype == "path_exists"
    ]
    sequences = [s for s in sequences if s]
    if not sequences:
        return set()

    preferred = set()
    for seq in sequences:
        for entry in graph.entries():
            found = _match_sequence(graph, entry, seq)
            if found:
                preferred.update(found)
                break
    return preferred


def _match_sequence(graph: "FlowGraph", start: str, seq: list, limit: int = 2000):
    """Depth-first search for a path whose node types contain `seq` in order."""
    counter = {"steps": 0}

    def walk(node_id: str, idx: int, visited: set, edges: list):
        counter["steps"] += 1
        if counter["steps"] > limit:
            return None
        node_type = graph.by_id[node_id].type
        if idx < len(seq) and node_type == seq[idx]:
            idx += 1
        if idx == len(seq):
            return list(edges)
        for conn in graph.out_edges.get(node_id, []):
            if conn.target_id in visited:
                continue
            visited.add(conn.target_id)
            edges.append(conn.id)
            result = walk(conn.target_id, idx, visited, edges)
            edges.pop()
            visited.remove(conn.target_id)
            if result is not None:
                return result
        return None

    return walk(start, 0, {start}, [])


def _split_downstream(graph: FlowGraph, node_id: str, accepted: float) -> dict:
    """Distribute a node's accepted load across its outgoing edges."""
    outs = graph.out_edges.get(node_id, [])
    if not outs or accepted <= 0:
        return {}

    async_edges, cache_edges, store_edges, routing_edges = [], [], [], []
    for conn in outs:
        target_type = graph.by_id[conn.target_id].type
        if conn.protocol == "async_queue":
            async_edges.append(conn)
        elif target_type in CACHE_TYPES:
            cache_edges.append(conn)
        elif target_type in DATASTORE_TYPES:
            store_edges.append(conn)
        else:
            routing_edges.append(conn)

    flows: dict = {}

    def weight(conn):
        return PREFERRED_EDGE_WEIGHT if conn.id in graph.preferred_edges else 1.0

    def share(edges: list, total: float):
        """Split `total` across `edges`, weighted toward declared user paths."""
        if not edges or total <= 0:
            return
        weights = [weight(c) for c in edges]
        sum_w = sum(weights) or 1.0
        for conn, w in zip(edges, weights):
            flows[conn.id] = flows.get(conn.id, 0.0) + total * (w / sum_w)

    # Routing/service tier: the request stream is divided between peers.
    share(routing_edges, accepted)

    # Data tier: each request does data work, so this is not a split of the
    # request stream. Cache-aside when a cache fronts a datastore.
    if cache_edges and store_edges:
        share(cache_edges, accepted * CACHE_HIT_RATIO)
        share(store_edges, accepted * (1.0 - CACHE_HIT_RATIO))
    else:
        share(cache_edges, accepted)
        share(store_edges, accepted)

    # Fire-and-forget: every request also emits an event downstream.
    for conn in async_edges:
        flows[conn.id] = flows.get(conn.id, 0.0) + accepted

    return flows


def compute_tick(graph: FlowGraph, arrival_rps: float) -> dict:
    """One steady-state pass of the graph at the given arrival rate."""
    entries = graph.entries()
    offered: dict = defaultdict(float)
    edge_flow: dict = {}

    if entries:
        per_entry = arrival_rps / len(entries)
        for entry in entries:
            offered[entry] += per_entry

    node_stats: dict = {}
    # Latency of the slowest synchronous chain ending at each node.
    path_latency: dict = defaultdict(float)

    for node_id in graph.order:
        node_offered = offered.get(node_id, 0.0)
        capacity = graph.capacity(node_id)
        base_latency = float(graph.eff[node_id]["latency_ms"])

        if capacity is None:
            accepted = node_offered
            utilization = 0.0
        else:
            accepted = min(node_offered, capacity)
            utilization = (node_offered / capacity) if capacity > 0 else 0.0

        dropped = max(node_offered - accepted, 0.0)
        # M/M/1-style queueing delay: latency climbs steeply near saturation.
        latency = base_latency / (1.0 - min(utilization, MAX_UTIL_FOR_LATENCY))

        upstream_latency = 0.0
        for conn in graph.in_edges.get(node_id, []):
            if conn.protocol == "async_queue":
                continue
            upstream_latency = max(upstream_latency, path_latency[conn.source_id])
        path_latency[node_id] = upstream_latency + latency

        node_stats[node_id] = {
            "offered": round(node_offered, 1),
            "accepted": round(accepted, 1),
            "dropped": round(dropped, 1),
            "capacity": capacity,
            "utilization": round(utilization, 4),
            "latency_ms": round(latency, 2),
            "saturated": capacity is not None and utilization >= 1.0,
        }

        for conn_id, flow in _split_downstream(graph, node_id, accepted).items():
            edge_flow[conn_id] = edge_flow.get(conn_id, 0.0) + flow
            offered[graph.conn_by_id[conn_id].target_id] += flow

    connection_stats = {}
    for conn in graph.connections:
        rps = edge_flow.get(conn.id, 0.0)
        target_stat = node_stats.get(conn.target_id)
        connection_stats[conn.id] = {
            "rps": round(rps, 1),
            "protocol": conn.protocol,
            "saturated": bool(target_stat and target_stat["saturated"]),
        }

    served = 0.0
    dropped_total = 0.0
    max_util = 0.0
    bottleneck_id = None
    for node_id, stat in node_stats.items():
        dropped_total += stat["dropped"]
        if stat["utilization"] > max_util:
            max_util = stat["utilization"]
            bottleneck_id = node_id
    # Traffic that made it all the way to a sink without being shed.
    for node_id, stat in node_stats.items():
        if not graph.out_edges.get(node_id):
            served += stat["accepted"]

    critical_latency = max(path_latency.values()) if path_latency else 0.0

    return {
        "components": node_stats,
        "connections": connection_stats,
        "totals": {
            "arrival_rps": round(arrival_rps, 1),
            "served_rps": round(served, 1),
            "dropped_rps": round(dropped_total, 1),
            "max_utilization": round(max_util, 4),
            "critical_path_latency_ms": round(critical_latency, 2),
            "bottleneck_id": bottleneck_id if max_util >= 0.85 else None,
        },
    }


class LiveSimulation:
    """Stateful driver: adds traffic jitter and accumulates totals across ticks."""

    def __init__(self, snapshot: Snapshot, tick_seconds: float = 0.5):
        self.graph = FlowGraph(
            snapshot.components, snapshot.connections, snapshot.requirements
        )
        self.base_rps = base_arrival_rps(snapshot.requirements)
        self.tick_seconds = tick_seconds
        self.tick_index = 0
        self.elapsed = 0.0
        self.total_requests = 0.0
        self.total_dropped = 0.0
        self._jitter = 1.0

    def set_base_rps(self, rps: float) -> None:
        self.base_rps = max(0.0, float(rps))

    def next_tick(self) -> dict:
        # Smoothed random walk keeps traffic lively without wild jumps.
        self._jitter += random.uniform(-0.08, 0.08)
        self._jitter = min(1.25, max(0.75, self._jitter))
        arrival = self.base_rps * self._jitter

        state = compute_tick(self.graph, arrival)

        self.tick_index += 1
        self.elapsed += self.tick_seconds
        self.total_requests += arrival * self.tick_seconds
        self.total_dropped += state["totals"]["dropped_rps"] * self.tick_seconds

        state["tick"] = self.tick_index
        state["elapsed_s"] = round(self.elapsed, 1)
        state["totals"]["base_rps"] = round(self.base_rps, 1)
        state["totals"]["total_requests"] = round(self.total_requests)
        state["totals"]["total_dropped"] = round(self.total_dropped)
        return state
