"""Import OpenStreetMap road geometry into the Gujarat-only road graph.

Run from osm_imports/ with the configured Gujarat test database environment:
    python import_gujarat_roads.py

Imports two independent pilot datasets:
  * Gandhinagar–Ahmedabad: primary corridor
  * Kamrej–Surat: parallel local test area (approximately 15 km target radius)

The query uses bounding boxes around each pilot area; this is an extraction
envelope, not a claim that every road inside it is validated. OSM-derived
records remain UNKNOWN / UNVERIFIED. Estimated speeds are planning assumptions,
not measured or live traffic. No NER tables are read or modified.
"""
import argparse
import math
from pathlib import Path

import osmium
import psycopg2
import config

GJ_SPEED_KMH = {
    "motorway": 80, "trunk": 65, "primary": 50, "secondary": 40,
    "tertiary": 30, "unclassified": 25, "residential": 20,
    "service": 15, "track": 12,
}

# Bounding boxes are extraction envelopes. Kamrej's rectangle approximates
# the requested 15 km local pilot; it is not an administrative boundary.
PILOT_REGIONS = [
    {
        "key": "AHMEDABAD_GANDHINAGAR",
        "label": "Gandhinagar–Ahmedabad (PRIMARY)",
        "bbox": (22.85, 72.40, 23.35, 72.80),
    },
    {
        "key": "KAMREJ_SURAT_15KM",
        "label": "Kamrej–Surat (PARALLEL TEST, approx. 15 km target)",
        "bbox": (21.12, 72.80, 21.42, 73.12),
    },
]


def haversine_km(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlon, dlat = lon2 - lon1, lat2 - lat1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(value))


def way_length_km(coords):
    return sum(haversine_km(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def coords_to_wkt(coords):
    return "LINESTRING(" + ", ".join(f"{lon} {lat}" for lon, lat in coords) + ")"


def find_connections(ways):
    node_to_ways = {}
    for index, way in enumerate(ways):
        for node_id in way["node_ids"]:
            node_to_ways.setdefault(node_id, set()).add(index)
    pairs = set()
    for indices in node_to_ways.values():
        ordered = sorted(indices)
        for i, a in enumerate(ordered):
            for b in ordered[i + 1:]:
                pairs.add((a, b))
    return sorted(pairs)


def load_road_ways(pbf_path, region):
    """Read only road ways intersecting the pilot bbox from a local PBF extract."""
    min_lat, min_lon, max_lat, max_lon = region["bbox"]
    included = set(config.INCLUDED_HIGHWAY_TYPES)
    ways = []

    class RoadHandler(osmium.SimpleHandler):
        def way(self, way):
            highway = way.tags.get("highway")
            if highway not in included:
                return
            coords = []
            node_ids = []
            intersects = False
            for node in way.nodes:
                if not node.location.valid():
                    continue
                lon, lat = float(node.lon), float(node.lat)
                coords.append((lon, lat))
                node_ids.append(int(node.ref))
                if min_lat <= lat <= max_lat and min_lon <= lon <= max_lon:
                    intersects = True
            if len(coords) < 2 or not intersects:
                return
            ways.append({
                "osm_id": int(way.id),
                "name": way.tags.get("name"),
                "highway_type": highway,
                "node_ids": node_ids,
                "coords": coords,
            })

    print(f"[{region['label']}] Reading local OSM extract: {pbf_path}", flush=True)
    RoadHandler().apply_file(str(pbf_path), locations=True)
    print(f"[{region['label']}] Found {len(ways)} road ways intersecting the pilot area.", flush=True)
    return ways


def import_region(conn, region, pbf_path):
    from psycopg2.extras import execute_values

    ways = load_road_ways(pbf_path, region)
    if not ways:
        raise RuntimeError(f"{region['label']}: OSM returned no usable roads; this region was not changed.")

    pairs = find_connections(ways)
    way_to_segment = {}
    batch_size = 500
    total = len(ways)

    insert_sql = """
        INSERT INTO gujarat_road_segments
            (external_ref, name, corridor, geom, length_km, road_type,
             normal_travel_min, status, data_status, source_name, source_url)
        VALUES %s
        ON CONFLICT (external_ref) DO UPDATE SET
            name = EXCLUDED.name,
            corridor = EXCLUDED.corridor,
            geom = EXCLUDED.geom,
            length_km = EXCLUDED.length_km,
            road_type = EXCLUDED.road_type,
            normal_travel_min = EXCLUDED.normal_travel_min,
            status = 'unknown',
            data_status = 'UNVERIFIED',
            source_name = EXCLUDED.source_name,
            source_url = EXCLUDED.source_url,
            updated_at = now()
        RETURNING id, external_ref
    """
    value_template = """(
        %s, %s, %s, ST_GeomFromText(%s, 4326), %s, %s, %s,
        'unknown', 'UNVERIFIED', 'OpenStreetMap contributors (ODbL)', %s
    )"""

    print(f"[{region['label']}] Preparing {total} roads for batched database import...", flush=True)
    for offset in range(0, total, batch_size):
        batch = ways[offset:offset + batch_size]
        values = []
        for way in batch:
            coords = way["coords"]
            length_km = way_length_km(coords)
            road_class = way.get("highway_type", "unclassified")
            speed_kmh = GJ_SPEED_KMH.get(road_class, 20)
            estimated_minutes = round((length_km / speed_kmh) * 60, 1) if speed_kmh > 0 else None
            raw_name = (way.get("name") or "").strip()
            name = raw_name if raw_name and not raw_name.lower().startswith("unnamed road") else "Unnamed Road"
            external_ref = f"osm:way:{way['osm_id']}"
            source_url = f"https://www.openstreetmap.org/way/{way['osm_id']}"
            values.append((
                external_ref, name, region["label"], coords_to_wkt(coords),
                round(length_km, 3), road_class, estimated_minutes, source_url,
            ))

        try:
            with conn.cursor() as cur:
                returned = execute_values(
                    cur, insert_sql, values, template=value_template,
                    page_size=batch_size, fetch=True,
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise

        for segment_id, external_ref in returned:
            way_to_segment[external_ref] = segment_id

        done = min(offset + len(batch), total)
        print(f"[{region['label']}] Database import: {done}/{total} roads committed.", flush=True)

    segment_ids = list(way_to_segment.values())
    print(f"[{region['label']}] Rebuilding connections for {len(segment_ids)} imported roads...", flush=True)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM gujarat_segment_connections
                WHERE segment_a_id = ANY(%s) OR segment_b_id = ANY(%s)
            """, (segment_ids, segment_ids))
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    connection_rows = []
    for a, b in pairs:
        id_a, id_b = sorted((way_to_segment[f"osm:way:{ways[a]['osm_id']}"],
                             way_to_segment[f"osm:way:{ways[b]['osm_id']}"]))
        connection_rows.append((id_a, id_b, None))

    for offset in range(0, len(connection_rows), 5000):
        batch = connection_rows[offset:offset + 5000]
        try:
            with conn.cursor() as cur:
                execute_values(
                    cur,
                    """INSERT INTO gujarat_segment_connections
                       (segment_a_id, segment_b_id, junction_name)
                       VALUES %s
                       ON CONFLICT (segment_a_id, segment_b_id) DO NOTHING""",
                    batch,
                    page_size=5000,
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        print(
            f"[{region['label']}] Connections inserted: "
            f"{min(offset + len(batch), len(connection_rows))}/{len(connection_rows)}.",
            flush=True,
        )

    print(f"{region['key']}: imported/updated {len(ways)} road ways and {len(pairs)} connections.")
    print("All imported rows remain status=unknown and data_status=UNVERIFIED.")


def import_gujarat_roads(pbf_path):
    if not pbf_path.is_file():
        raise FileNotFoundError(
            f"OSM PBF extract not found: {pbf_path}\n"
            "Download western-zone-latest.osm.pbf from "
            "https://download.geofabrik.de/asia/india/western-zone.html "
            "and place it inside osm_imports."
        )
    conn = psycopg2.connect(
        host=config.DB_HOST, port=config.DB_PORT, dbname=config.DB_NAME,
        user=config.DB_USER, password=config.DB_PASSWORD, sslmode="require",
    )
    try:
        for region in PILOT_REGIONS:
            import_region(conn, region, pbf_path)
        print("Gujarat pilot road import complete.")
        print("Primary: Gandhinagar–Ahmedabad. Parallel test: Kamrej–Surat.")
        print("Source attribution: © OpenStreetMap contributors, ODbL.")
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Import Gujarat pilot roads from a local Geofabrik OSM PBF extract."
    )
    parser.add_argument(
        "--pbf",
        default=str(Path(__file__).with_name("western-zone-latest.osm.pbf")),
        help="Path to the Western Zone .osm.pbf file",
    )
    args = parser.parse_args()
    import_gujarat_roads(Path(args.pbf).expanduser().resolve())
