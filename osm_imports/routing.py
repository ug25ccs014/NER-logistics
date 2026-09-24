"""
Same fastest-vs-safest routing logic as routing_engine/, reimplemented
here so the API service has no cross-folder import dependency and can
be deployed independently.
"""
import time
import networkx as nx
import config
import db

# Rebuilding the graph means 3 full-table DB queries plus graph
# construction -- fine for a handful of demo segments, too slow to do
# on every single request once the network covers thousands of
# segments across several states. Cache it and only rebuild after
# GRAPH_CACHE_TTL_SEC, so risk-score/status updates still show up
# within a bounded delay without paying the rebuild cost per request.
GRAPH_CACHE_TTL_SEC = 120
_graph_cache = {"graph": None, "built_at": 0}


def build_graph(force_refresh=False):
    now = time.time()
    if not force_refresh and _graph_cache["graph"] is not None \
            and (now - _graph_cache["built_at"]) < GRAPH_CACHE_TTL_SEC:
        return _graph_cache["graph"]

    segments_with_risk = {row["segment_id"]: row for row in db.fetch_segments_with_risk_plain()}
    segment_details = db.fetch_segment_details()
    connections = db.fetch_connections()

    G = nx.Graph()
    for seg_id, details in segment_details.items():
        risk_row = segments_with_risk.get(seg_id, {})
        G.add_node(
            seg_id,
            name=details["name"],
            corridor=details["corridor"],
            status=details["status"],
            normal_travel_min=details["normal_travel_min"] or 15,
            risk_score=float(risk_row.get("risk_score") or 0),
            risk_level=risk_row.get("risk_level") or "low",
        )
    for conn in connections:
        a, b = conn["segment_a_id"], conn["segment_b_id"]
        if a in G.nodes and b in G.nodes:
            G.add_edge(a, b, junction_name=conn["junction_name"])

    _graph_cache["graph"] = G
    _graph_cache["built_at"] = now
    return G


def _weight_fn(G, mode):
    def weight(u, v, edge_data):
        node = G.nodes[v]
        if mode == "fastest":
            return node["normal_travel_min"]
        # safest mode
        if node["status"] == "blocked" or node["risk_score"] >= config.SEVERE_RISK_CUTOFF:
            return None
        penalty = 1 + (node["risk_score"] / 100) * config.RISK_DELAY_FACTOR
        return node["normal_travel_min"] * penalty
    return weight


def _path_total(G, path, weight_fn):
    total = 0
    for u, v in zip(path[:-1], path[1:]):
        w = weight_fn(u, v, G.get_edge_data(u, v) or {})
        if w is None:
            return float("inf")
        total += w
    return total


def compute_route(start_id, end_id, mode="safest"):
    G = build_graph()
    weight = _weight_fn(G, mode)
    try:
        path = nx.shortest_path(G, start_id, end_id, weight=weight)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None

    total = _path_total(G, path, weight)
    segments = []
    for seg_id in path:
        node = G.nodes[seg_id]
        if mode == "safest":
            penalty = 1 + (node["risk_score"] / 100) * config.RISK_DELAY_FACTOR
            display_time = round(node["normal_travel_min"] * penalty, 1)
        else:
            display_time = node["normal_travel_min"]
        segments.append({
            "id": seg_id,
            "name": node["name"],
            "travel_min": display_time,
            "risk_score": node["risk_score"],
            "risk_level": node["risk_level"],
        })

    return {
        "mode": mode,
        "total_time_min": round(total, 1) if total != float("inf") else None,
        "segments": segments,
    }
