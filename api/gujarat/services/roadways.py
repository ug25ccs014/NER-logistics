"""Gujarat road graph adapter.

This intentionally duplicates only the small path-weighting contract from
api/routing.py while loading exclusively gujarat_* records. It does not
read, mutate, or cache the NER graph.
"""
import networkx as nx
import db


def _load_graph():
    conn = db.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.id, s.name, s.corridor, s.status,
                       COALESCE(s.normal_travel_min, 15) AS normal_travel_min,
                       COALESCE(r.risk_score, 0) AS risk_score,
                       COALESCE(r.risk_level, 'low') AS risk_level
                FROM gujarat_road_segments s
                LEFT JOIN LATERAL (
                    SELECT risk_score, risk_level
                    FROM gujarat_risk_scores
                    WHERE segment_id = s.id
                    ORDER BY computed_at DESC
                    LIMIT 1
                ) r ON TRUE
            """)
            segment_rows = cur.fetchall()
            cur.execute("""
                SELECT segment_a_id, segment_b_id, junction_name
                FROM gujarat_segment_connections
            """)
            connection_rows = cur.fetchall()
    finally:
        conn.close()

    graph = nx.Graph()
    for row in segment_rows:
        segment_id, name, corridor, status, travel_min, risk_score, risk_level = row
        graph.add_node(
            int(segment_id),
            name=name,
            corridor=corridor,
            status=status,
            normal_travel_min=float(travel_min or 15),
            risk_score=float(risk_score or 0),
            risk_level=risk_level or "low",
        )

    for row in connection_rows:
        a, b, junction_name = row
        if int(a) in graph and int(b) in graph:
            graph.add_edge(int(a), int(b), junction_name=junction_name)
    return graph


def _route(graph, start_id, end_id, mode):
    def weight(u, v, edge_data):
        node = graph.nodes[v]
        if mode == "safest" and (
            node["status"] == "blocked" or node["risk_score"] >= 85
        ):
            return None
        if mode == "fastest":
            return node["normal_travel_min"]
        return node["normal_travel_min"] * (1 + node["risk_score"] / 100)

    try:
        path = nx.shortest_path(graph, int(start_id), int(end_id), weight=weight)
    except (nx.NetworkXNoPath, nx.NodeNotFound, ValueError, TypeError):
        return None

    segments = []
    total = 0.0
    for segment_id in path:
        node = graph.nodes[segment_id]
        segment_time = (
            node["normal_travel_min"]
            if mode == "fastest"
            else node["normal_travel_min"] * (1 + node["risk_score"] / 100)
        )
        total += segment_time
        segments.append({
            "id": segment_id,
            "name": node["name"],
            "corridor": node["corridor"],
            "status": node["status"],
            "travel_min": round(segment_time, 1),
            "risk_score": round(node["risk_score"], 1),
            "risk_level": node["risk_level"],
        })

    return {
        "mode": mode,
        "total_time_min": round(total, 1),
        "segments": segments,
        "data_status": "UNVERIFIED" if any(s["risk_score"] == 0 for s in segments) else "UNVERIFIED",
    }


def compare_routes(start_id, end_id):
    graph = _load_graph()
    if not graph:
        return {"fastest": None, "safest": None, "reason": "No Gujarat road segments are loaded."}
    fastest = _route(graph, start_id, end_id, "fastest")
    safest = _route(graph, start_id, end_id, "safest")
    if fastest is None and safest is None:
        return {"fastest": None, "safest": None, "reason": "No connected Gujarat road route exists between these segment IDs."}
    return {"fastest": fastest, "safest": safest, "region": "GUJARAT"}
