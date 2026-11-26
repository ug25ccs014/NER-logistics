"""
Fetch road geometry from OpenStreetMap in small Overpass tiles.

Overpass is a shared public service. Small tiles reduce query load and make
progress visible; a failed tile stops the import instead of silently producing
an incomplete region. Overlapping edges help retain ways near tile boundaries.
"""
import math
import time

import requests
import config

# Approximately 11 km north-south by 10 km east-west at Gujarat latitudes.
# A small overlap avoids edge omissions; duplicate OSM elements are merged.
TILE_LAT_DEG = 0.05
TILE_LON_DEG = 0.05
TILE_OVERLAP_DEG = 0.002
OVERPASS_QUERY_TIMEOUT_SEC = 180
HTTP_CONNECT_TIMEOUT_SEC = 20
HTTP_READ_TIMEOUT_SEC = 240
REQUEST_PAUSE_SEC = 2.0
MAX_ATTEMPTS_PER_SERVER = 2

# Use the configured endpoint first, then try independent global mirrors.
# Public instances are best-effort; never send parallel requests.
FALLBACK_OVERPASS_URLS = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]


def build_query(bbox):
    highway_pattern = "|".join(config.INCLUDED_HIGHWAY_TYPES)
    min_lat, min_lon, max_lat, max_lon = bbox
    return f"""
    [out:json][timeout:{OVERPASS_QUERY_TIMEOUT_SEC}];
    (
      way["highway"~"^({highway_pattern})$"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out body;
    >;
    out skel qt;
    """


def build_tiles(bbox):
    """Split (min_lat, min_lon, max_lat, max_lon) into overlapping tiles."""
    min_lat, min_lon, max_lat, max_lon = bbox
    tiles = []
    lat = min_lat
    while lat < max_lat:
        tile_max_lat = min(lat + TILE_LAT_DEG, max_lat)
        lon = min_lon
        while lon < max_lon:
            tile_max_lon = min(lon + TILE_LON_DEG, max_lon)
            tile = (
                max(min_lat, lat - TILE_OVERLAP_DEG),
                max(min_lon, lon - TILE_OVERLAP_DEG),
                min(max_lat, tile_max_lat + TILE_OVERLAP_DEG),
                min(max_lon, tile_max_lon + TILE_OVERLAP_DEG),
            )
            tiles.append(tile)
            lon = tile_max_lon
        lat = tile_max_lat
    return tiles


def fetch_tile(bbox, label, tile_number, total_tiles):
    query = build_query(bbox)
    headers = {
        "User-Agent": "NER-Logistics-Hackathon-Project/1.0 (educational hackathon use)"
    }
    configured_url = config.OVERPASS_URL
    endpoints = list(dict.fromkeys([configured_url, *FALLBACK_OVERPASS_URLS]))
    failures = []

    for endpoint_index, endpoint in enumerate(endpoints, start=1):
        for attempt in range(1, MAX_ATTEMPTS_PER_SERVER + 1):
            try:
                print(
                    f"[{label}] Fetching tile {tile_number}/{total_tiles} "
                    f"via {endpoint} (server {endpoint_index}/{len(endpoints)}, "
                    f"attempt {attempt}/{MAX_ATTEMPTS_PER_SERVER}): {bbox}",
                    flush=True,
                )
                response = requests.post(
                    endpoint,
                    data={"data": query},
                    headers=headers,
                    timeout=(HTTP_CONNECT_TIMEOUT_SEC, HTTP_READ_TIMEOUT_SEC),
                )
                response.raise_for_status()
                data = response.json()
                print(
                    f"[{label}] Tile {tile_number}/{total_tiles}: "
                    f"{len(data.get('elements', []))} OSM elements received.",
                    flush=True,
                )
                return data.get("elements", [])
            except (requests.RequestException, ValueError) as exc:
                failures.append(f"{endpoint}: {type(exc).__name__}: {exc}")
                print(
                    f"[{label}] Tile {tile_number}/{total_tiles} failed on "
                    f"{endpoint}: {type(exc).__name__}: {exc}",
                    flush=True,
                )
                if attempt < MAX_ATTEMPTS_PER_SERVER:
                    time.sleep(8 * attempt)
        if endpoint_index < len(endpoints):
            print(f"[{label}] Switching to next Overpass mirror after failure.", flush=True)
            time.sleep(5)

    raise RuntimeError(
        f"{label}: tile {tile_number}/{total_tiles} failed on all "
        f"{len(endpoints)} Overpass endpoints. Last errors: {' | '.join(failures)}"
    )


def fetch_road_network(bbox, label="region"):
    tiles = build_tiles(bbox)
    print(
        f"Querying OpenStreetMap for {label}: {len(tiles)} tiles, "
        f"road classes: {', '.join(config.INCLUDED_HIGHWAY_TYPES)}.",
        flush=True,
    )
    # Key by (element type, OSM ID) because overlapping tiles return duplicates.
    merged = {}
    for index, tile in enumerate(tiles, start=1):
        elements = fetch_tile(tile, label, index, len(tiles))
        for element in elements:
            key = (element.get("type"), element.get("id"))
            if key[0] is not None and key[1] is not None:
                merged[key] = element
        if index < len(tiles):
            time.sleep(REQUEST_PAUSE_SEC)

    result = {"elements": list(merged.values())}
    way_count = sum(1 for item in result["elements"] if item.get("type") == "way")
    node_count = sum(1 for item in result["elements"] if item.get("type") == "node")
    print(
        f"{label}: merged {len(result['elements'])} unique OSM elements "
        f"({way_count} ways, {node_count} nodes) from {len(tiles)} tiles.",
        flush=True,
    )
    return result


def parse_ways_and_nodes(osm_data):
    """
    Resolve OSM way node IDs into coordinates. Merged tile responses ensure
    shared nodes and ways returned by overlapping tiles are deduplicated.
    """
    nodes = {}
    ways = []

    for el in osm_data["elements"]:
        if el["type"] == "node":
            nodes[el["id"]] = (el["lon"], el["lat"])

    for el in osm_data["elements"]:
        if el["type"] == "way" and "nodes" in el:
            coords = [nodes[n] for n in el["nodes"] if n in nodes]
            if len(coords) < 2:
                continue
            ways.append({
                "osm_id": el["id"],
                "name": el.get("tags", {}).get(
                    "name",
                    f"Unnamed road ({el.get('tags', {}).get('highway', 'unknown')})",
                ),
                "highway_type": el.get("tags", {}).get("highway", "unclassified"),
                "node_ids": el["nodes"],
                "coords": coords,
            })

    print(f"Parsed {len(ways)} usable road segments from {len(nodes)} nodes.", flush=True)
    return ways
