"""
Core routing logic built on NetworkX.

Two route modes:
  - "fastest": shortest travel time, ignoring risk entirely.
  - "safest":  risk-aware -- inflates travel time through high-risk
               segments so the router prefers lower-risk paths when
               an alternate physical route exists, and excludes
               severe/blocked segments outright.

This is the "AI-based alternate route suggestion" feature from the
problem statement: it doesn't just find *a* route, it compares the
fastest route against the safest route and tells you the tradeoff.
"""
import networkx as nx
import config
from graph_builder import edge_weight_fastest, edge_weight_safest


def _make_weight_fn(G, mode):
    weight_fn = edge_weight_fastest if mode == "fastest" else edge_weight_safest

    def weight(u, v, edge_data):
        w = weight_fn(G, u, v, edge_data)
        return None if w == float("inf") else w  # None tells NetworkX to exclude this edge

    return weight


def _path_total(G, path, weight_fn):
    """
    Sums the weight function across every edge in the path. Computed
    manually (rather than via nx.path_weight) since callable-weight
    support varies across NetworkX versions.
    """
    total = 0
    for u, v in zip(path[:-1], path[1:]):
        edge_data = G.get_edge_data(u, v) or {}
        w = weight_fn(u, v, edge_data)
        if w is None:
            return float("inf")
        total += w
    return total


def find_route(G, start_id, end_id, mode="safest"):
    """
    Returns (path, total_minutes) for the given mode, or (None, None)
    if no route exists (e.g. every path is blocked).
    """
    weight = _make_weight_fn(G, mode)
    try:
        path = nx.shortest_path(G, start_id, end_id, weight=weight)
        total = _path_total(G, path, weight)
        return path, total
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None, None


def find_alternate_routes(G, start_id, end_id, mode="safest", k=None):
    """
    Returns up to k alternate paths, ordered from best to worst under
    the given mode's weighting. Useful when the network has more than
    one physical way through (a single linear corridor, like the demo
    seed data, will only ever have one route -- this becomes valuable
    as more of the real NER road network is added).
    """
    k = k or config.NUM_ALTERNATE_ROUTES
    weight = _make_weight_fn(G, mode)
    routes = []
    try:
        for path in nx.shortest_simple_paths(G, start_id, end_id, weight=weight):
            total = _path_total(G, path, weight)
            if total == float("inf"):
                continue
            routes.append((path, total))
            if len(routes) >= k:
                break
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        pass
    return routes


def summarize_route(G, path, mode="fastest"):
    """
    Turns a path (list of segment ids) into a human-readable summary:
    segment-by-segment breakdown, total time, and any risk warnings
    for segments above 'moderate'. In "safest" mode, each segment's
    displayed time includes its risk penalty, so the per-segment
    numbers add up to the same total shown at the top -- avoids a
    confusing mismatch where the total is inflated but each line
    still shows the plain travel time.
    """
    if not path:
        return None

    segments = []
    total_time = 0
    warnings = []

    for seg_id in path:
        node = G.nodes[seg_id]
        base_time = node["normal_travel_min"]
        if mode == "safest":
            penalty = 1 + (node["risk_score"] / 100) * config.RISK_DELAY_FACTOR
            display_time = round(base_time * penalty, 1)
        else:
            display_time = base_time

        segments.append({
            "id": seg_id,
            "name": node["name"],
            "travel_min": display_time,
            "risk_score": node["risk_score"],
            "risk_level": node["risk_level"],
        })
        total_time += display_time

        if node["risk_level"] in ("high", "severe"):
            warnings.append(
                f"{node['name']}: {node['risk_level'].upper()} risk (score {node['risk_score']})"
            )

    return {
        "segments": segments,
        "total_normal_time_min": total_time,
        "warnings": warnings,
    }
