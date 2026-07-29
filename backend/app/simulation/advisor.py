"""Turns load-simulation results into concrete architecture recommendations.

`heuristics.py` says what's structurally wrong; `loadsim.py` says what actually
happens under traffic. This module joins the two: it reads a simulated flow
state and produces prioritized, *quantified* advice — not "consider adding a
cache", but "the DB is shedding 1.4k rps; a cache at an 80% hit ratio takes it
from 1.9k to 380 rps, back under its 500 rps ceiling".

Every recommendation carries the raw numbers in `details` so the frontend can
render a localized sentence from `rule_id` + `details`, the same way findings
work.
"""

import math
from collections import defaultdict
from typing import Optional

from ..catalog import (
    APP_TIER_TYPES,
    CACHE_TYPES,
    DATASTORE_TYPES,
    QUEUE_TYPES,
)
from .loadsim import CACHE_HIT_RATIO, FlowGraph

# Priority ordering used for sorting; also sent to the client.
PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

SATURATION_THRESHOLD = 1.0
PRESSURE_THRESHOLD = 0.75
IDLE_UTILIZATION = 0.03
# Below this rps a component isn't really "on the hot path" worth flagging.
HOT_PATH_MIN_RPS = 1.0


def _ancestors(graph: FlowGraph, node_id: str) -> set:
    seen = set()
    stack = [node_id]
    while stack:
        current = stack.pop()
        for conn in graph.in_edges.get(current, []):
            if conn.source_id not in seen:
                seen.add(conn.source_id)
                stack.append(conn.source_id)
    return seen


def _name(graph: FlowGraph, node_id: str) -> str:
    comp = graph.by_id.get(node_id)
    if comp is None:
        return node_id
    return comp.name or comp.type


def _rec(
    rule_id: str,
    priority: str,
    details: dict,
    component_ids: Optional[list] = None,
    connection_ids: Optional[list] = None,
) -> dict:
    return {
        "rule_id": rule_id,
        "priority": priority,
        "details": details,
        "component_ids": component_ids or [],
        "connection_ids": connection_ids or [],
    }


def advise(graph: FlowGraph, state: dict, requirements, arrival_rps: float) -> dict:
    """Build recommendations from a simulated flow state."""
    components = state["components"]
    totals = state["totals"]
    recommendations: list = []

    ancestors_cache: dict = {}

    def ancestor_types(node_id: str) -> set:
        if node_id not in ancestors_cache:
            ancestors_cache[node_id] = {
                graph.by_id[a].type for a in _ancestors(graph, node_id) if a in graph.by_id
            }
        return ancestors_cache[node_id]

    _advise_capacity(graph, components, recommendations)
    _advise_caching(graph, components, ancestor_types, recommendations)
    _advise_async(graph, components, ancestor_types, recommendations)
    _advise_redundancy(graph, components, recommendations)
    _advise_load_balancing(graph, components, recommendations)
    _advise_topology(graph, components, recommendations)
    _advise_requirements(graph, components, totals, requirements, recommendations)
    _advise_cost(graph, components, recommendations)

    recommendations.sort(key=lambda r: PRIORITY_ORDER.get(r["priority"], 9))

    critical = sum(1 for r in recommendations if r["priority"] == "critical")
    high = sum(1 for r in recommendations if r["priority"] == "high")
    served_ratio = (
        totals["served_rps"] / arrival_rps if arrival_rps > 0 else 1.0
    )

    return {
        "arrival_rps": round(arrival_rps, 1),
        "summary": {
            "served_ratio": round(min(served_ratio, 1.0), 4),
            "dropped_rps": totals["dropped_rps"],
            "max_utilization": totals["max_utilization"],
            "critical_path_latency_ms": totals["critical_path_latency_ms"],
            "critical_count": critical,
            "high_count": high,
            "healthy": critical == 0 and high == 0,
        },
        "recommendations": recommendations,
    }


def _advise_capacity(graph: FlowGraph, components: dict, out: list) -> None:
    """Saturated components: say exactly how much more capacity is needed."""
    for node_id, stat in components.items():
        capacity = stat["capacity"]
        if capacity is None or stat["utilization"] < SATURATION_THRESHOLD:
            continue

        eff = graph.eff[node_id]
        current_replicas = max(int(eff["replicas"]), 1)
        per_replica = capacity / current_replicas
        needed = int(math.ceil(stat["offered"] / per_replica)) if per_replica > 0 else 0
        comp_type = graph.by_id[node_id].type

        out.append(
            _rec(
                "scale_out",
                "critical",
                {
                    "name": _name(graph, node_id),
                    "type": comp_type,
                    "is_datastore": comp_type in DATASTORE_TYPES,
                    "offered": stat["offered"],
                    "capacity": capacity,
                    "dropped": stat["dropped"],
                    "current_replicas": current_replicas,
                    "needed_replicas": max(needed, current_replicas + 1),
                    "per_replica": round(per_replica, 1),
                    "latency_ms": stat["latency_ms"],
                },
                [node_id],
            )
        )

    # Components under pressure but not yet dropping — no headroom for spikes.
    for node_id, stat in components.items():
        capacity = stat["capacity"]
        if capacity is None:
            continue
        if PRESSURE_THRESHOLD <= stat["utilization"] < SATURATION_THRESHOLD:
            headroom = capacity - stat["offered"]
            out.append(
                _rec(
                    "no_headroom",
                    "high",
                    {
                        "name": _name(graph, node_id),
                        "utilization_pct": round(stat["utilization"] * 100),
                        "headroom_rps": round(headroom, 1),
                        "capacity": capacity,
                    },
                    [node_id],
                )
            )


def _advise_caching(graph: FlowGraph, components: dict, ancestor_types, out: list) -> None:
    """Hot datastores with nothing caching in front of them."""
    for node_id, stat in components.items():
        comp = graph.by_id[node_id]
        if comp.type not in DATASTORE_TYPES:
            continue
        if stat["utilization"] < PRESSURE_THRESHOLD:
            continue
        if ancestor_types(node_id) & CACHE_TYPES:
            continue

        projected = stat["offered"] * (1.0 - CACHE_HIT_RATIO)
        capacity = stat["capacity"]
        projected_util = (projected / capacity) if capacity else 0.0
        upstream = [c.source_id for c in graph.in_edges.get(node_id, [])]

        out.append(
            _rec(
                "add_cache",
                "high" if stat["utilization"] >= SATURATION_THRESHOLD else "medium",
                {
                    "name": _name(graph, node_id),
                    "offered": stat["offered"],
                    "projected_offered": round(projected, 1),
                    "projected_util_pct": round(projected_util * 100),
                    "hit_ratio_pct": round(CACHE_HIT_RATIO * 100),
                    "upstream_name": _name(graph, upstream[0]) if upstream else None,
                    "solves": projected_util < 1.0,
                },
                [node_id] + upstream[:1],
            )
        )


def _advise_async(graph: FlowGraph, components: dict, ancestor_types, out: list) -> None:
    """Saturated datastores with no queue to absorb write bursts."""
    for node_id, stat in components.items():
        comp = graph.by_id[node_id]
        if comp.type not in DATASTORE_TYPES:
            continue
        if stat["utilization"] < SATURATION_THRESHOLD:
            continue
        if ancestor_types(node_id) & QUEUE_TYPES:
            continue

        out.append(
            _rec(
                "add_queue",
                "medium",
                {
                    "name": _name(graph, node_id),
                    "offered": stat["offered"],
                    "capacity": stat["capacity"],
                },
                [node_id],
            )
        )


def _advise_redundancy(graph: FlowGraph, components: dict, out: list) -> None:
    """Single instances carrying real traffic — one failure takes them out."""
    for node_id, stat in components.items():
        eff = graph.eff[node_id]
        if eff["managed_ha"]:
            continue
        if int(eff["replicas"]) > 1:
            continue
        if stat["accepted"] < HOT_PATH_MIN_RPS:
            continue
        # Already reported as a capacity problem; don't say it twice.
        if stat["capacity"] is not None and stat["utilization"] >= SATURATION_THRESHOLD:
            continue

        out.append(
            _rec(
                "add_redundancy",
                "high",
                {
                    "name": _name(graph, node_id),
                    "rps": stat["accepted"],
                    "availability_pct": eff["availability_pct"],
                },
                [node_id],
            )
        )


def _advise_load_balancing(graph: FlowGraph, components: dict, out: list) -> None:
    """Parallel same-tier instances fed directly, with no balancer in front."""
    groups: dict = defaultdict(list)
    for node_id, comp in graph.by_id.items():
        preds = frozenset(c.source_id for c in graph.in_edges.get(node_id, []))
        if preds:
            groups[(comp.type, preds)].append(node_id)

    for (comp_type, preds), ids in groups.items():
        if len(ids) < 2:
            continue
        pred_types = {graph.by_id[p].type for p in preds if p in graph.by_id}
        if "load_balancer" in pred_types:
            continue
        traffic = sum(components.get(i, {}).get("accepted", 0.0) for i in ids)
        if traffic < HOT_PATH_MIN_RPS:
            continue

        out.append(
            _rec(
                "add_load_balancer",
                "medium",
                {"type": comp_type, "count": len(ids), "rps": round(traffic, 1)},
                list(ids),
            )
        )


def _advise_topology(graph: FlowGraph, components: dict, out: list) -> None:
    """Structural smells, reported with the traffic actually flowing through them."""
    for conn in graph.connections:
        source = graph.by_id.get(conn.source_id)
        target = graph.by_id.get(conn.target_id)
        if not source or not target:
            continue
        if source.type == "client" and target.type in DATASTORE_TYPES:
            out.append(
                _rec(
                    "insert_app_layer",
                    "critical",
                    {
                        "name": _name(graph, conn.target_id),
                        "rps": components.get(conn.target_id, {}).get("offered", 0.0),
                    },
                    [conn.source_id, conn.target_id],
                    [conn.id],
                )
            )

    # Edge caching: clients hitting the app tier directly at volume.
    has_cdn = any(c.type == "cdn" for c in graph.components)
    if not has_cdn:
        entry_traffic = 0.0
        entry_targets: list = []
        for entry in graph.entries():
            for conn in graph.out_edges.get(entry, []):
                if graph.by_id[conn.target_id].type in APP_TIER_TYPES | {
                    "load_balancer",
                    "reverse_proxy",
                }:
                    entry_traffic += components.get(conn.target_id, {}).get("offered", 0.0)
                    entry_targets.append(conn.target_id)
        if entry_traffic >= 100:
            out.append(
                _rec(
                    "add_cdn",
                    "low",
                    {"rps": round(entry_traffic, 1)},
                    entry_targets[:2],
                )
            )


def _advise_requirements(
    graph: FlowGraph, components: dict, totals: dict, requirements, out: list
) -> None:
    """Where the measured behaviour misses a declared requirement."""
    worst_id = None
    worst_latency = 0.0
    for node_id, stat in components.items():
        if stat["latency_ms"] > worst_latency:
            worst_latency = stat["latency_ms"]
            worst_id = node_id

    for req in requirements:
        if req.kind != "nonfunctional":
            continue

        if req.subtype == "max_latency_ms":
            budget = req.params.get("value_ms")
            measured = totals["critical_path_latency_ms"]
            if budget and measured > budget:
                out.append(
                    _rec(
                        "latency_over_budget",
                        "critical",
                        {
                            "measured_ms": measured,
                            "budget_ms": budget,
                            "worst_name": _name(graph, worst_id) if worst_id else None,
                            "worst_ms": round(worst_latency, 1),
                        },
                        [worst_id] if worst_id else [],
                    )
                )

        elif req.subtype == "min_throughput_rps":
            required = req.params.get("value")
            served = totals["served_rps"]
            if required and served < required * 0.99:
                bottleneck = totals.get("bottleneck_id")
                out.append(
                    _rec(
                        "throughput_below_target",
                        "critical",
                        {
                            "served_rps": served,
                            "required_rps": required,
                            "shortfall_pct": round((1 - served / required) * 100),
                            "bottleneck_name": _name(graph, bottleneck) if bottleneck else None,
                        },
                        [bottleneck] if bottleneck else [],
                    )
                )

        elif req.subtype == "min_availability_pct":
            target = req.params.get("value_pct")
            if not target:
                continue
            composite = 1.0
            for node_id in components:
                eff = graph.eff[node_id]
                p = eff["availability_pct"] / 100.0
                replicas = max(int(eff["replicas"]), 1)
                composite *= 1 - (1 - p) ** replicas
            composite_pct = composite * 100
            if composite_pct < target:
                weakest = min(
                    components,
                    key=lambda n: 1
                    - (1 - graph.eff[n]["availability_pct"] / 100.0)
                    ** max(int(graph.eff[n]["replicas"]), 1),
                    default=None,
                )
                out.append(
                    _rec(
                        "availability_below_target",
                        "high",
                        {
                            "measured_pct": round(composite_pct, 3),
                            "target_pct": target,
                            "weakest_name": _name(graph, weakest) if weakest else None,
                        },
                        [weakest] if weakest else [],
                    )
                )


def _advise_cost(graph: FlowGraph, components: dict, out: list) -> None:
    """Capacity that traffic never comes close to using."""
    for node_id, stat in components.items():
        capacity = stat["capacity"]
        if capacity is None or capacity <= 0:
            continue
        eff = graph.eff[node_id]
        replicas = max(int(eff["replicas"]), 1)
        if replicas < 2:
            continue
        if stat["utilization"] > IDLE_UTILIZATION:
            continue

        out.append(
            _rec(
                "overprovisioned",
                "low",
                {
                    "name": _name(graph, node_id),
                    "utilization_pct": round(stat["utilization"] * 100, 1),
                    "replicas": replicas,
                    "offered": stat["offered"],
                },
                [node_id],
            )
        )
