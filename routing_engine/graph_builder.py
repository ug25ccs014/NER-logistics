"""
Builds a NetworkX graph where each road segment is a node, and
segment_connections define the edges. Each node carries its current
risk score and travel time so the router can compute both a
"fastest" and a "safest" route.
"""
import networkx as nx
import config


def build_graph(segments_with_risk, segment_details, connections):
    """
    segments_with_risk: rows from segment_current_status (id, risk_score, risk_level, status, active_alerts, ...)
    segment_details: dict of segment_id -> {normal_travel_min, status, name, corridor}
    connections: rows from segment_connections (segment_a_id, segment_b_id, junction_name)

    Returns a NetworkX Graph with segment_id as node keys.
    """
    G = nx.Graph()

    risk_by_id = {row["segment_id"]: row for row in segments_with_risk}

    for seg_id, details in segment_details.items():
        risk_row = risk_by_id.get(seg_id, {})
        G.add_node(
            seg_id,
            name=details["name"],
            corridor=details["corridor"],
            status=details["status"],
            normal_travel_min=details["normal_travel_min"] or 15,  # fallback if not set
            risk_score=float(risk_row.get("risk_score") or 0),
            risk_level=risk_row.get("risk_level") or "low",
        )

    for conn in connections:
        a, b = conn["segment_a_id"], conn["segment_b_id"]
        if a in G.nodes and b in G.nodes:
            G.add_edge(a, b, junction_name=conn["junction_name"])

    return G


def edge_weight_fastest(G, u, v, mode_data):
    """Ignores risk entirely -- shortest travel time only."""
    return G.nodes[v]["normal_travel_min"]


def edge_weight_safest(G, u, v, mode_data):
    """
    Inflates travel time proportionally to the destination segment's
    risk score. A segment flagged severe (near 100) effectively costs
    much more to traverse, steering the router around it whenever an
    alternate physical path exists.

    Segments at or above SEVERE_RISK_CUTOFF, or explicitly marked
    'blocked' in the database, are excluded entirely (infinite weight)
    since they should not be routed through at all.
    """
    node = G.nodes[v]
    if node["status"] == "blocked" or node["risk_score"] >= config.SEVERE_RISK_CUTOFF:
        return float("inf")

    base = node["normal_travel_min"]
    penalty = 1 + (node["risk_score"] / 100) * config.RISK_DELAY_FACTOR
    return base * penalty
