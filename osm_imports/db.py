import psycopg2
import psycopg2.extras
import config


def get_connection():
    return psycopg2.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        dbname=config.DB_NAME,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
    )


def fetch_segments_geojson():
    """
    Returns every road segment as a GeoJSON FeatureCollection, with
    risk level/score baked into each feature's properties -- this is
    the single call the dashboard map needs to draw every road,
    color-coded by risk.
    """
    query = """
        SELECT
            rs.id,
            rs.name,
            rs.corridor,
            rs.status,
            rs.has_bridge,
            rs.seasonal_restriction,
            latest_risk.risk_score,
            latest_risk.risk_level,
            (SELECT COUNT(*) FROM alerts a WHERE a.segment_id = rs.id AND a.resolved_at IS NULL) AS active_alerts,
            ST_AsGeoJSON(rs.geom) AS geometry
        FROM road_segments rs
        LEFT JOIN LATERAL (
            SELECT risk_score, risk_level
            FROM risk_scores
            WHERE segment_id = rs.id
            ORDER BY computed_at DESC
            LIMIT 1
        ) latest_risk ON TRUE;
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            rows = cur.fetchall()
    finally:
        conn.close()

    import json
    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "geometry": json.loads(row["geometry"]),
            "properties": {
                "id": row["id"],
                "name": row["name"],
                "corridor": row["corridor"],
                "status": row["status"],
                "has_bridge": row["has_bridge"],
                "seasonal_restriction": row["seasonal_restriction"],
                "risk_score": float(row["risk_score"]) if row["risk_score"] is not None else None,
                "risk_level": row["risk_level"],  # null = never scored yet, not "low"
                "active_alerts": row["active_alerts"],
            }
        })
    return {"type": "FeatureCollection", "features": features}


def fetch_active_alerts():
    query = """
        SELECT a.id, a.segment_id, rs.name AS segment_name, a.alert_type,
               a.severity, a.message, a.created_at
        FROM alerts a
        JOIN road_segments rs ON rs.id = a.segment_id
        WHERE a.resolved_at IS NULL
        ORDER BY a.created_at DESC;
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            return cur.fetchall()
    finally:
        conn.close()


def fetch_segment_details():
    query = "SELECT id, name, normal_travel_min, status, corridor FROM road_segments;"
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            return {row["id"]: row for row in cur.fetchall()}
    finally:
        conn.close()


def fetch_connections():
    query = "SELECT segment_a_id, segment_b_id, junction_name FROM segment_connections;"
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            return cur.fetchall()
    finally:
        conn.close()


def fetch_segments_with_risk_plain():
    """Same as segment_current_status view, without the geometry -- used for routing."""
    query = "SELECT * FROM segment_current_status;"
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            return cur.fetchall()
    finally:
        conn.close()
    query = """
        SELECT fr.id, fr.segment_id, rs.name AS segment_name, fr.report_type,
               fr.description, fr.confidence_score, fr.verified, fr.captured_at,
               ST_Y(fr.location) AS lat, ST_X(fr.location) AS lon
        FROM field_reports fr
        LEFT JOIN road_segments rs ON rs.id = fr.segment_id
        ORDER BY fr.captured_at DESC
        LIMIT %s;
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, (limit,))
            return cur.fetchall()
    finally:
        conn.close()
