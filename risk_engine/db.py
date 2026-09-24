"""
Thin database access layer. Uses psycopg2 directly -- no ORM needed
for a script this focused, and it keeps the SQL visible/debuggable.
"""
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


def fetch_all_segments(conn):
    """
    Returns every road segment with the fields the risk model needs,
    plus the midpoint lat/lon (used to query the weather API).
    """
    query = """
        SELECT
            id,
            name,
            avg_slope_deg,
            seasonal_restriction,
            ST_Y(ST_PointN(geom, 1)) AS start_lat,
            ST_X(ST_PointN(geom, 1)) AS start_lon,
            ST_Y(ST_PointN(geom, -1)) AS end_lat,
            ST_X(ST_PointN(geom, -1)) AS end_lon
        FROM road_segments;
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        return cur.fetchall()


def insert_risk_score(conn, segment_id, risk_score, rainfall_24h, rainfall_72h, risk_level, model_version):
    query = """
        INSERT INTO risk_scores
            (segment_id, risk_score, rainfall_24h_mm, rainfall_72h_mm, risk_level, model_version)
        VALUES (%s, %s, %s, %s, %s, %s);
    """
    with conn.cursor() as cur:
        cur.execute(query, (segment_id, risk_score, rainfall_24h, rainfall_72h, risk_level, model_version))
    conn.commit()


def has_unresolved_alert(conn, segment_id, alert_type):
    query = """
        SELECT 1 FROM alerts
        WHERE segment_id = %s AND alert_type = %s AND resolved_at IS NULL
        LIMIT 1;
    """
    with conn.cursor() as cur:
        cur.execute(query, (segment_id, alert_type))
        return cur.fetchone() is not None


def create_alert(conn, segment_id, alert_type, severity, message, source):
    query = """
        INSERT INTO alerts (segment_id, alert_type, severity, message, source)
        VALUES (%s, %s, %s, %s, %s);
    """
    with conn.cursor() as cur:
        cur.execute(query, (segment_id, alert_type, severity, message, source))
    conn.commit()


def resolve_alerts_below_threshold(conn, segment_id, alert_type):
    """
    Auto-clears a previously fired risk alert once the segment's
    score has dropped back down (e.g. rain stopped).
    """
    query = """
        UPDATE alerts SET resolved_at = now()
        WHERE segment_id = %s AND alert_type = %s AND resolved_at IS NULL;
    """
    with conn.cursor() as cur:
        cur.execute(query, (segment_id, alert_type))
    conn.commit()
