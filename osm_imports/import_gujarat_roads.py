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
import math
import psycopg2
import config
from overpass_client import fetch_road_network, parse_ways_and_nodes

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


def import_region(conn, region):
    osm_data = fetch_road_network(region["bbox"], region["label"])
    ways = parse_ways_and_nodes(osm_data)
    if not ways:
        raise RuntimeError(f"{region['label']}: OSM returned no usable roads; this region was not changed.")

    pairs = find_connections(ways)
    way_to_segment = {}
    with conn:
        with conn.cursor() as cur:
            for index, way in enumerate(ways):
                coords = way["coords"]
                length_km = way_length_km(coords)
                road_class = way.get("highway_type", "unclassified")
                speed_kmh = GJ_SPEED_KMH.get(road_class, 20)
                estimated_minutes = round((length_km / speed_kmh) * 60, 1) if speed_kmh > 0 else None
                raw_name = (way.get("name") or "").strip()
                name = raw_name if raw_name and not raw_name.lower().startswith("unnamed road") else "Unnamed Road"
                external_ref = f"osm:way:{way['osm_id']}"
                source_url = f"https://www.openstreetmap.org/way/{way['osm_id']}"
                cur.execute("""
                    INSERT INTO gujarat_road_segments
                        (external_ref, name, corridor, geom, length_km, road_type,
                         normal_travel_min, status, data_status, source_name, source_url)
                    VALUES
                        (%s, %s, %s, ST_GeomFromText(%s, 4326), %s, %s,
                         %s, 'unknown', 'UNVERIFIED', 'OpenStreetMap contributors (ODbL)', %s)
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
                    RETURNING id
                """, (
                    external_ref, name, region["label"], coords_to_wkt(coords),
                    round(length_km, 3), road_class, estimated_minutes, source_url,
                ))
                way_to_segment[index] = cur.fetchone()[0]

            segment_ids = list(way_to_segment.values())
            cur.execute("""
                DELETE FROM gujarat_segment_connections
                WHERE segment_a_id = ANY(%s) OR segment_b_id = ANY(%s)
            """, (segment_ids, segment_ids))

            for a, b in pairs:
                id_a, id_b = sorted((way_to_segment[a], way_to_segment[b]))
                cur.execute("""
                    INSERT INTO gujarat_segment_connections
                        (segment_a_id, segment_b_id, junction_name)
                    VALUES (%s, %s, NULL)
                    ON CONFLICT (segment_a_id, segment_b_id) DO NOTHING
                """, (id_a, id_b))

    print(f"{region['key']}: imported/updated {len(ways)} road ways and {len(pairs)} connections.")
    print("All imported rows remain status=unknown and data_status=UNVERIFIED.")


def import_gujarat_roads():
    conn = psycopg2.connect(
        host=config.DB_HOST, port=config.DB_PORT, dbname=config.DB_NAME,
        user=config.DB_USER, password=config.DB_PASSWORD, sslmode="require",
    )
    try:
        for region in PILOT_REGIONS:
            import_region(conn, region)
        print("Gujarat pilot road import complete.")
        print("Primary: Gandhinagar–Ahmedabad. Parallel test: Kamrej–Surat.")
        print("Source attribution: © OpenStreetMap contributors, ODbL.")
    finally:
        conn.close()


if __name__ == "__main__":
    import_gujarat_roads()
