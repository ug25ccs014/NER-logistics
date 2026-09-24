"""
Imports a full road network (all configured road classes) for a named
region into the existing road_segments / segment_connections tables.

Run with:
    python import_roads.py

This does NOT touch or delete your existing demo corridor segments --
it only adds new rows. The risk-scoring engine will automatically pick
up every newly imported segment on its next run (no changes needed
there, other than the weather-batching upgrade in weather_grid.py,
which is separate -- see that file's README section).
"""
import math
import time
import psycopg2
import psycopg2.extras
import config
from overpass_client import fetch_road_network, parse_ways_and_nodes


def get_connection():
    return psycopg2.connect(
        host=config.DB_HOST, port=config.DB_PORT, dbname=config.DB_NAME,
        user=config.DB_USER, password=config.DB_PASSWORD,
    )


def haversine_km(p1, p2):
    """p1, p2 are (lon, lat) tuples."""
    lon1, lat1, lon2, lat2 = map(math.radians, [p1[0], p1[1], p2[0], p2[1]])
    dlon, dlat = lon2 - lon1, lat2 - lat1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def way_length_km(coords):
    return sum(haversine_km(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def coords_to_linestring_wkt(coords):
    points = ", ".join(f"{lon} {lat}" for lon, lat in coords)
    return f"LINESTRING({points})"


def find_connections(ways):
    """
    Two ways are connected if they share at least one OSM node ID
    (a real intersection/junction point). Returns a list of
    (way_index_a, way_index_b) pairs.
    """
    node_to_ways = {}
    for i, way in enumerate(ways):
        for node_id in way["node_ids"]:
            node_to_ways.setdefault(node_id, set()).add(i)

    connections = set()
    for node_id, way_indices in node_to_ways.items():
        if len(way_indices) > 1:
            way_list = list(way_indices)
            for a in range(len(way_list)):
                for b in range(a + 1, len(way_list)):
                    pair = tuple(sorted((way_list[a], way_list[b])))
                    connections.add(pair)
    return connections


def import_region(bbox, label, conn):
    """Fetch, parse, and insert the road network for a single bounding-box
    region. Returns (segments_inserted, connections_inserted)."""
    try:
        osm_data = fetch_road_network(bbox, label)
    except Exception as e:
        print(f"  Failed: Overpass query failed ({e}).")
        return 0, 0

    ways = parse_ways_and_nodes(osm_data)
    if not ways:
        print(f"  No roads found in this bounding box.")
        return 0, 0

    print(f"  Detecting road junctions/connections for {label}...")
    connections = find_connections(ways)
    print(f"  Found {len(connections)} junctions connecting these roads.")

    with conn.cursor() as cur:
        print(f"  Inserting {label} road segments into the database...")
        way_id_map = {}  # osm way index -> new database segment id

        for i, way in enumerate(ways):
            length_km = way_length_km(way["coords"])
            speed = config.SPEED_BY_ROAD_CLASS_KMH.get(way["highway_type"], 20)
            travel_min = round((length_km / speed) * 60, 1) if speed > 0 else None
            wkt = coords_to_linestring_wkt(way["coords"])

            raw_name = (way.get("name") or "").strip()
            is_unnamed = (not raw_name) or raw_name.lower().startswith("unnamed road")
            display_name = "Unnamed Road" if is_unnamed else raw_name
            cur.execute(
                """
                INSERT INTO road_segments
                    (name, road_code, name_status, name_source, corridor, geom, length_km, road_type, normal_travel_min, status)
                VALUES (%s, %s, %s, %s, %s, ST_GeomFromText(%s, 4326), %s, %s, %s, 'open')
                RETURNING id;
                """,
                (display_name, None, 'unnamed' if is_unnamed else 'named', 'osm_unnamed' if is_unnamed else 'osm',
                 label, wkt, round(length_km, 2), way["highway_type"], travel_min),
            )
            new_id = cur.fetchone()[0]
            cur.execute("UPDATE road_segments SET road_code = 'NER-SEG-' || id WHERE id = %s;", (new_id,))
            way_id_map[i] = new_id

            if (i + 1) % 500 == 0:
                print(f"    ...{i + 1}/{len(ways)} segments inserted")

        print(f"  Inserted {len(ways)} road segments for {label}.")

        print(f"  Inserting {label} segment connections...")
        for a, b in connections:
            cur.execute(
                """
                INSERT INTO segment_connections (segment_a_id, segment_b_id)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING;
                """,
                (way_id_map[a], way_id_map[b]),
            )
        print(f"  Inserted {len(connections)} connections for {label}.")

    conn.commit()
    return len(ways), len(connections)


def import_roads():
    """
    Imports the single bounding-box test region defined by
    config.BOUNDING_BOX / config.REGION_LABEL.

    Run with:
        python import_roads.py
    """
    conn = get_connection()
    try:
        print(f"\n=== {config.REGION_LABEL} ===")
        total_segments, total_connections = import_region(config.BOUNDING_BOX, config.REGION_LABEL, conn)
    finally:
        conn.close()

    print(f"\nDone. Imported {total_segments} road segments and {total_connections} connections for {config.REGION_LABEL}.")
    print("Run add_slope_data.py, then the risk-scoring engine, next.")
    if total_segments == 0:
        print("Nothing was imported -- check your internet connection and the BOUNDING_BOX values in config.py.")


if __name__ == "__main__":
    import_roads()
