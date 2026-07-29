"""Rule-based ("heuristic") architecture checker.

Phase 1 of the simulation engine described in the project plan. Walks the
component graph plus declared requirements and returns a flat list of
findings. Deliberately kept as a single, self-contained module so a future
`loadsim.py` (discrete-event load simulation) can be added as a sibling
behind the same `/simulate` endpoint without touching this code.
"""

from collections import defaultdict

from ..catalog import (
    CACHE_TYPES,
    CATALOG,
    DATASTORE_TYPES,
    QUEUE_TYPES,
    effective_props,
)
from ..schemas import Finding

MANAGED_HA_TYPES = {"client", "dns", "cdn", "load_balancer"}
MAX_PATHS = 500


class _Graph:
    def __init__(self, components, connections):
        self.by_id = {c.id: c for c in components}
        self.eff = {c.id: effective_props(c.type, c.props or {}) for c in components}
        self.out_edges: dict[str, list] = defaultdict(list)
        self.in_edges: dict[str, list] = defaultdict(list)
        for conn in connections:
            self.out_edges[conn.source_id].append((conn.target_id, conn))
            self.in_edges[conn.target_id].append((conn.source_id, conn))

    def name(self, node_id: str) -> str:
        comp = self.by_id.get(node_id)
        if comp is None:
            return node_id
        return comp.name or CATALOG.get(comp.type, {}).get("label") or comp.type

    def entries(self) -> list[str]:
        clients = [cid for cid, c in self.by_id.items() if c.type == "client"]
        if clients:
            return clients
        return [cid for cid in self.by_id if not self.in_edges.get(cid)]

    def find_paths(self, sync_only: bool) -> list[list[tuple[str, object]]]:
        paths: list[list[tuple[str, object]]] = []

        def edges_from(node_id: str):
            edges = self.out_edges.get(node_id, [])
            if sync_only:
                edges = [e for e in edges if e[1].protocol != "async_queue"]
            return edges

        def dfs(node_id: str, path: list, visited: set):
            if len(paths) >= MAX_PATHS:
                return
            edges = edges_from(node_id)
            if not edges:
                paths.append(list(path))
                return
            for target_id, conn in edges:
                if target_id in visited:
                    paths.append(list(path))
                    continue
                path.append((target_id, conn))
                visited.add(target_id)
                dfs(target_id, path, visited)
                visited.remove(target_id)
                path.pop()

        for entry in self.entries():
            dfs(entry, [(entry, None)], {entry})
        return paths

    def ancestors(self, node_id: str) -> set[str]:
        seen: set[str] = set()
        stack = [node_id]
        while stack:
            cur = stack.pop()
            for src, _conn in self.in_edges.get(cur, []):
                if src not in seen:
                    seen.add(src)
                    stack.append(src)
        return seen

    def effective_capacity(self, node_id: str):
        e = self.eff[node_id]
        if e["capacity_rps"] is None:
            return None
        return e["capacity_rps"] * max(e["replicas"], 1)


def run_heuristics(components, connections, requirements) -> list[Finding]:
    if not components:
        return []

    g = _Graph(components, connections)
    findings: list[Finding] = []

    reachable_fwd: set[str] = set()
    stack = list(g.entries())
    while stack:
        cur = stack.pop()
        if cur in reachable_fwd:
            continue
        reachable_fwd.add(cur)
        for target_id, _conn in g.out_edges.get(cur, []):
            stack.append(target_id)

    _rule_spof(g, reachable_fwd, findings)
    _rule_missing_load_balancer(g, findings)
    _rule_direct_client_to_db(g, connections, findings)
    _rule_db_without_cache(g, findings)

    sync_paths = g.find_paths(sync_only=True)
    all_paths = g.find_paths(sync_only=False)

    _rule_no_async_decoupling(g, requirements, findings)
    _rule_latency_budget(g, sync_paths, requirements, findings)
    _rule_throughput_bottleneck(g, sync_paths, requirements, findings)
    _rule_availability_estimate(g, sync_paths, requirements, findings)
    _rule_functional_paths(g, all_paths, requirements, findings)

    return findings


def _rule_spof(g: _Graph, reachable_fwd: set[str], findings: list[Finding]):
    for cid, comp in g.by_id.items():
        if comp.type in MANAGED_HA_TYPES:
            continue
        if cid not in reachable_fwd:
            continue
        if g.eff[cid]["replicas"] <= 1:
            findings.append(
                Finding(
                    severity="warning",
                    rule_id="spof",
                    message=(
                        f"'{g.name(cid)}' has no redundancy (replicas=1). "
                        "A single failure takes it down."
                    ),
                    component_ids=[cid],
                    details={"name": g.name(cid)},
                )
            )


def _rule_missing_load_balancer(g: _Graph, findings: list[Finding]):
    groups: dict[tuple, list[str]] = defaultdict(list)
    for cid, comp in g.by_id.items():
        preds = frozenset(s for s, _ in g.in_edges.get(cid, []))
        groups[(comp.type, preds)].append(cid)

    for (ctype, preds), ids in groups.items():
        if len(ids) < 2:
            continue
        pred_types = {g.by_id[p].type for p in preds if p in g.by_id}
        if "load_balancer" not in pred_types:
            findings.append(
                Finding(
                    severity="warning",
                    rule_id="missing_load_balancer",
                    message=(
                        f"{len(ids)} instances of '{ctype}' share the same upstream "
                        "but aren't fronted by a load balancer."
                    ),
                    component_ids=ids,
                    details={"count": len(ids), "type": ctype},
                )
            )


def _rule_direct_client_to_db(g: _Graph, connections, findings: list[Finding]):
    for conn in connections:
        src = g.by_id.get(conn.source_id)
        tgt = g.by_id.get(conn.target_id)
        if src and tgt and src.type == "client" and tgt.type in DATASTORE_TYPES:
            findings.append(
                Finding(
                    severity="error",
                    rule_id="direct_client_to_db",
                    message=(
                        f"Client connects directly to '{g.name(tgt.id)}'; "
                        "add an application layer in between."
                    ),
                    component_ids=[src.id, tgt.id],
                    connection_ids=[conn.id],
                    details={"name": g.name(tgt.id)},
                )
            )


def _rule_db_without_cache(g: _Graph, findings: list[Finding]):
    for cid, comp in g.by_id.items():
        if comp.type not in DATASTORE_TYPES:
            continue
        ancestor_types = {g.by_id[a].type for a in g.ancestors(cid) if a in g.by_id}
        if not (ancestor_types & CACHE_TYPES):
            findings.append(
                Finding(
                    severity="info",
                    rule_id="db_without_cache",
                    message=(
                        f"'{g.name(cid)}' has no cache upstream. Consider adding one "
                        "to reduce read load."
                    ),
                    component_ids=[cid],
                    details={"name": g.name(cid)},
                )
            )


def _rule_no_async_decoupling(g: _Graph, requirements, findings: list[Finding]):
    throughput_reqs = [
        r for r in requirements if r.kind == "nonfunctional" and r.subtype == "min_throughput_rps"
    ]
    for req in throughput_reqs:
        target = req.params.get("value")
        if not target:
            continue
        for cid, comp in g.by_id.items():
            if comp.type not in DATASTORE_TYPES:
                continue
            cap = g.effective_capacity(cid)
            if cap is None or target <= cap * 2:
                continue
            ancestor_types = {g.by_id[a].type for a in g.ancestors(cid) if a in g.by_id}
            if not (ancestor_types & QUEUE_TYPES):
                findings.append(
                    Finding(
                        severity="warning",
                        rule_id="no_async_decoupling",
                        message=(
                            f"Target throughput ({target} rps) is well above "
                            f"'{g.name(cid)}' capacity ({cap} rps) with no queue "
                            "buffering writes; consider async processing."
                        ),
                        component_ids=[cid],
                        requirement_id=req.id,
                        details={"target": target, "name": g.name(cid), "cap": cap},
                    )
                )


def _path_ids(path):
    return [nid for nid, _ in path]


def _rule_latency_budget(g: _Graph, sync_paths, requirements, findings: list[Finding]):
    latency_reqs = [
        r for r in requirements if r.kind == "nonfunctional" and r.subtype == "max_latency_ms"
    ]
    for req in latency_reqs:
        budget = req.params.get("value_ms")
        if not budget:
            continue
        failing = []
        for path in sync_paths:
            total = sum(g.eff[nid]["latency_ms"] for nid in _path_ids(path))
            if total > budget:
                failing.append((total, path))
        failing.sort(key=lambda t: -t[0])
        for total, path in failing[:3]:
            ids = _path_ids(path)
            path_names = [g.name(nid) for nid in ids]
            names = " -> ".join(path_names)
            findings.append(
                Finding(
                    severity="warning",
                    rule_id="latency_budget_exceeded",
                    message=(
                        f"Path {names} totals {total}ms, exceeding the {budget}ms budget."
                    ),
                    component_ids=ids,
                    requirement_id=req.id,
                    details={"path": path_names, "total": total, "budget": budget},
                )
            )


def _rule_throughput_bottleneck(g: _Graph, sync_paths, requirements, findings: list[Finding]):
    throughput_reqs = [
        r for r in requirements if r.kind == "nonfunctional" and r.subtype == "min_throughput_rps"
    ]
    for req in throughput_reqs:
        target = req.params.get("value")
        if not target:
            continue
        seen_bottlenecks: dict[str, float] = {}
        for path in sync_paths:
            caps = [
                (nid, g.effective_capacity(nid))
                for nid in _path_ids(path)
                if g.effective_capacity(nid) is not None
            ]
            if not caps:
                continue
            min_nid, min_cap = min(caps, key=lambda t: t[1])
            if min_cap < target:
                seen_bottlenecks[min_nid] = min_cap
        for nid, cap in seen_bottlenecks.items():
            findings.append(
                Finding(
                    severity="error",
                    rule_id="throughput_bottleneck",
                    message=(
                        f"'{g.name(nid)}' caps this path at {cap} rps, below the "
                        f"required {target} rps."
                    ),
                    component_ids=[nid],
                    requirement_id=req.id,
                    details={"name": g.name(nid), "cap": cap, "target": target},
                )
            )


def _rule_availability_estimate(g: _Graph, sync_paths, requirements, findings: list[Finding]):
    avail_reqs = [
        r for r in requirements if r.kind == "nonfunctional" and r.subtype == "min_availability_pct"
    ]
    for req in avail_reqs:
        target = req.params.get("value_pct")
        if not target:
            continue
        worst = None
        for path in sync_paths:
            prob = 1.0
            for nid in _path_ids(path):
                e = g.eff[nid]
                p = e["availability_pct"] / 100.0
                replicas = max(e["replicas"], 1)
                node_avail = 1 - (1 - p) ** replicas
                prob *= node_avail
            composite_pct = prob * 100
            if worst is None or composite_pct < worst[0]:
                worst = (composite_pct, path)
        if worst and worst[0] < target:
            composite_pct, path = worst
            ids = _path_ids(path)
            findings.append(
                Finding(
                    severity="warning",
                    rule_id="availability_below_target",
                    message=(
                        f"Estimated composite availability along the critical path is "
                        f"{composite_pct:.3f}%, below the {target}% target."
                    ),
                    component_ids=ids,
                    requirement_id=req.id,
                    details={"pct": round(composite_pct, 3), "target": target},
                )
            )


def _rule_functional_paths(g: _Graph, all_paths, requirements, findings: list[Finding]):
    functional_reqs = [
        r for r in requirements if r.kind == "functional" and r.subtype == "path_exists"
    ]
    for req in functional_reqs:
        seq = req.params.get("types", [])
        if not seq:
            continue
        satisfied_ids = None
        for path in all_paths:
            idx = 0
            matched = []
            for nid in _path_ids(path):
                if idx < len(seq) and g.by_id[nid].type == seq[idx]:
                    matched.append(nid)
                    idx += 1
            if idx == len(seq):
                satisfied_ids = matched
                break
        if satisfied_ids is not None:
            findings.append(
                Finding(
                    severity="info",
                    rule_id="functional_path_ok",
                    message=f"Requirement '{req.description or ' -> '.join(seq)}' is satisfied.",
                    component_ids=satisfied_ids,
                    requirement_id=req.id,
                    details={"description": req.description, "sequence": seq},
                )
            )
        else:
            findings.append(
                Finding(
                    severity="error",
                    rule_id="functional_path_missing",
                    message=(
                        f"Requirement '{req.description or ' -> '.join(seq)}' is not "
                        f"satisfied: no path matching {' -> '.join(seq)} was found."
                    ),
                    requirement_id=req.id,
                    details={"description": req.description, "sequence": seq},
                )
            )
