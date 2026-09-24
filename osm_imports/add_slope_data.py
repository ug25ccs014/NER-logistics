"""
Computes real average slope for every road segment currently missing
it (avg_slope_deg IS NULL -- i.e. segments imported by import_roads.py,
which doesn't know slope on its own) using real elevation data.

Run AFTER import_roads.py:
    python add_slope_data.py

For each segment:
  1. Sample a few evenly-spaced points along its geometry
     (SLOPE_SAMPLE_POINTS_PER_SEGMENT in config.py).
  2. Fetch real elevation for each sample point.
  3. Compute the slope angle between consecutive points
     (rise / run -> degrees), and average across the segment.
  4. Write the result into road_segments.avg_slope_deg.

This directly feeds the risk-scoring engine, which already uses
avg_slope_deg as one of its four weighted risk factors -- no changes
needed there once this has run.
"""
import math
import json
import psycopg2
import psycopg2.extras
import config
from elevation_client import fetch_elevations


def get_connection():
    return psycopg2.connect(
        host=config.DB_HOST, port=config.DB_PORT, dbname=config.DB_NAME,
        user=config.DB_USER, password=config.DB_PASSWORD,
    )


def haversine_m(p1, p2):
    """p1, p2 are (lon, lat) tuples. Returns distance in meters."""
    lon1, lat1, lon2, lat2 = map(math.radians, [p1[0], p1[1], p2[0], p2[1]])
    dlon, dlat = lon2 - lon1, lat2 - lat1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))


def sample_points_along(coords, n):
    """Picks n evenly-spaced points from a list of (lon, lat) coordinates."""
    if len(coords) <= n:
        return coords
    step = (len(coords) - 1) / (n - 1)
    return [coords[round(i * step)] for i in range(n)]


def fetch_segments_needing_slope(conn):
    query = "SELECT id, name, ST_AsGeoJSON(geom) AS geometry FROM road_segments WHERE avg_slope_deg IS NULL;"
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        return cur.fetchall()


def update_slope(conn, segment_id, slope_deg):
    with conn.cursor() as cur:
        cur.execute("UPDATE road_segments SET avg_slope_deg = %s WHERE id = %s;", (round(slope_deg, 2), segment_id))


def compute_slope_for_segment(coords, elevations):
    """
    coords, elevations are parallel lists for the same sample points.
    Returns average slope in degrees across consecutive sample pairs.
    Skips pairs with missing elevation or ~zero horizontal distance.
    """
    slopes = []
    for i in range(len(coords) - 1):
        e1, e2 = elevations[i], elevations[i + 1]
        if e1 is None or e2 is None:
            continue
        horizontal_m = haversine_m(coords[i], coords[i + 1])
        if horizontal_m < 1:  # avoid divide-by-near-zero on overlapping points
            continue
        rise_m = abs(e2 - e1)
        slope_deg = math.degrees(math.atan(rise_m / horizontal_m))
        slopes.append(slope_deg)
    return sum(slopes) / len(slopes) if slopes else 0.0


def process_chunk(conn, chunk):
    """Fetches elevation for one chunk of segments and writes+commits
    their slopes immediately, so this chunk's work survives even if
    the script is interrupted right after it."""
    all_points = []
    segment_point_ranges = []
    segment_coords_list = []

    for seg in chunk:
        coords = json.loads(seg["geometry"])["coordinates"]  # [[lon,lat], ...]
        sampled = sample_points_along(coords, config.SLOPE_SAMPLE_POINTS_PER_SEGMENT)
        segment_coords_list.append(sampled)
        start_idx = len(all_points)
        all_points.extend(sampled)
        segment_point_ranges.append((start_idx, len(all_points)))

    elevations = fetch_elevations(all_points)

    for seg, sampled_coords, (start_idx, end_idx) in zip(chunk, segment_coords_list, segment_point_ranges):
        seg_elevations = elevations[start_idx:end_idx]
        slope = compute_slope_for_segment(sampled_coords, seg_elevations)
        update_slope(conn, seg["id"], slope)

    conn.commit()  # save this chunk's work now, before moving to the next chunk


def add_slope_data():
    conn = get_connection()
    try:
        segments = fetch_segments_needing_slope(conn)
        if not segments:
            print("No segments need slope data -- everything is already scored, or nothing has been imported yet.")
            return

        chunk_size = config.SLOPE_SEGMENT_CHUNK_SIZE
        total = len(segments)
        chunks = [segments[i:i + chunk_size] for i in range(0, total, chunk_size)]

        print(f"Computing real slope for {total} segment(s) using elevation data, in {len(chunks)} chunk(s) of up to {chunk_size}.")
        print("(This calls a free public elevation API and is rate-limited, so it will take a while for a large import.")
        print(" Progress is saved after each chunk -- if you need to stop, Ctrl+C only loses the current chunk, not everything.)\n")

        done = 0
        for i, chunk in enumerate(chunks):
            process_chunk(conn, chunk)
            done += len(chunk)
            print(f"  [{i + 1}/{len(chunks)}] {done}/{total} segments done "
                  f"({', '.join(s['name'][:30] for s in chunk[:2])}{', ...' if len(chunk) > 2 else ''})")

        print(f"\nDone. Updated slope for {total} segment(s).")
        print("Run the risk engine again to incorporate real slope into risk scores:")
        print("  cd ../risk_engine && python risk_engine.py")
    finally:
        conn.close()


if __name__ == "__main__":
    add_slope_data()
