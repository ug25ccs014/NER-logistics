"""
Fetches every road (of the configured classes) within a named region
from OpenStreetMap's Overpass API. Free, no API key -- but it's a
shared public service, so this query can take anywhere from ~30
seconds to a few minutes for a state-sized region. Be patient.
"""
import requests
import config


def build_query(bbox):
    highway_pattern = "|".join(config.INCLUDED_HIGHWAY_TYPES)
    min_lat, min_lon, max_lat, max_lon = bbox
    return f"""
    [out:json][timeout:180];
    (
      way["highway"~"^({highway_pattern})$"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out body;
    >;
    out skel qt;
    """


def fetch_road_network(bbox, label="region"):
    query = build_query(bbox)
    print(f"Querying OpenStreetMap for all {', '.join(config.INCLUDED_HIGHWAY_TYPES)} roads in {label} "
          f"(bounding box {bbox})...")
    print("(Bounding-box queries are much faster than whole-state ones -- should take well under a minute.)")
    headers = {
        # The public Overpass server rejects requests that don't
        # identify themselves with a real User-Agent -- Python's
        # default header looks like an anonymous bot and gets a
        # 406 error. This is a good citizen convention for using any
        # free public API, not something specific to this project.
        "User-Agent": "NER-Logistics-Hackathon-Project/1.0 (educational hackathon use)"
    }
    response = requests.post(config.OVERPASS_URL, data={"data": query}, headers=headers, timeout=240)
    response.raise_for_status()
    data = response.json()
    print(f"Received {len(data.get('elements', []))} raw OSM elements.")
    return data


def parse_ways_and_nodes(osm_data):
    """
    OSM returns nodes (points with lat/lon) and ways (ordered lists of
    node IDs representing a road). This resolves ways into actual
    coordinate lists, and returns them alongside a node-to-way index
    used later to detect which roads connect to which.
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
                continue  # skip degenerate ways with no usable geometry
            ways.append({
                "osm_id": el["id"],
                "name": el.get("tags", {}).get("name", f"Unnamed road ({el.get('tags', {}).get('highway', 'unknown')})"),
                "highway_type": el.get("tags", {}).get("highway", "unclassified"),
                "node_ids": el["nodes"],
                "coords": coords,  # list of (lon, lat)
            })

    print(f"Parsed {len(ways)} usable road segments from {len(nodes)} nodes.")
    return ways
