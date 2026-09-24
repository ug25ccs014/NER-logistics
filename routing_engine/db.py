"""
Database access for the routing engine. Pulls the road-segment graph
plus each segment's latest risk score.
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


def fetch_segments_with_risk(conn):
    """
    Every road segment plus its most recent risk score (via the
    segment_current_status view created in the DB schema). This is
    the node data for the routing graph.
    """
    query = "SELECT * FROM segment_current_status;"
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        return cur.fetchall()


def fetch_segment_details(conn):
    """
    Travel time and status per segment -- not in the view, needed
    separately for edge weight calculation.
    """
    query = """
        SELECT id, name, normal_travel_min, status, corridor
        FROM road_segments;
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        return {row["id"]: row for row in cur.fetchall()}


def fetch_connections(conn):
    """
    Which segments connect to which -- the edges of the routing graph.
    """
    query = "SELECT segment_a_id, segment_b_id, junction_name FROM segment_connections;"
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        return cur.fetchall()
