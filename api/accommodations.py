"""
Finds nearby overnight accommodation (hotels, guest houses, lodges,
hostels) around a point -- e.g. for a driver who wants to rest rather
than push through a blocked or high-risk stretch after dark.

Uses the same free OpenStreetMap Overpass API the road-network import
already relies on (see osm_imports/overpass_client.py), so no API key
or paid provider is needed. Results are cached in-memory for a while
since Overpass is a shared public service and repeat "near this spot"
lookups are common (a driver refreshing, several people opening the
same blocked-segment popup).
"""
import math
import time

import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
HEADERS = {
    # Same convention as overpass_client.py -- the public Overpass
    # server rejects requests without a real User-Agent.
    "User-Agent": "NER-Logistics-Hackathon-Project/1.0 (educational hackathon use)"
}

_CACHE = {}
_CACHE_TTL_SECONDS = 15 * 60


def _cache_key(lat, lon, radius_km):
    # Round so lookups a few hundred meters apart share a cache entry
    # instead of each re-querying Overpass.
    return (round(lat, 2), round(lon, 2), radius_km)


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _build_query(lat, lon, radius_km):
    radius_m = int(radius_km * 1000)
    return f"""
    [out:json][timeout:25];
    (
      node["tourism"~"^(hotel|guest_house|motel|hostel)$"](around:{radius_m},{lat},{lon});
      way["tourism"~"^(hotel|guest_house|motel|hostel)$"](around:{radius_m},{lat},{lon});
      node["amenity"="lodging"](around:{radius_m},{lat},{lon});
    );
    out center;
    """


def _run_query(lat, lon, radius_km):
    query = _build_query(lat, lon, radius_km)
    try:
        response = requests.post(OVERPASS_URL, data={"data": query}, headers=HEADERS, timeout=30)
        response.raise_for_status()
        return response.json().get("elements", [])
    except (requests.RequestException, ValueError):
        # Overpass is a free shared service and does occasionally time
        # out or rate-limit -- fail soft with an empty list rather than
        # taking the whole dashboard down over an optional feature.
        return []


def find_nearby_accommodation(lat, lon, radius_km=15, limit=15):
    """Returns nearby lodging sorted by distance (nearest first). Each
    result: name, type (hotel/guest_house/motel/hostel/lodging),
    lat, lon, distance_km, address (if tagged), phone (if tagged)."""
    key = _cache_key(lat, lon, radius_km)
    cached = _CACHE.get(key)
    if cached and (time.time() - cached["fetched_at"]) < _CACHE_TTL_SECONDS:
        return cached["results"][:limit]

    elements = _run_query(lat, lon, radius_km)

    results = []
    for el in elements:
        tags = el.get("tags", {})
        if el["type"] == "node":
            el_lat, el_lon = el.get("lat"), el.get("lon")
        else:  # way -- "out center" gives us a computed center point
            center = el.get("center") or {}
            el_lat, el_lon = center.get("lat"), center.get("lon")
        if el_lat is None or el_lon is None:
            continue

        address_parts = [tags.get("addr:housenumber"), tags.get("addr:street"), tags.get("addr:city")]
        results.append({
            "name": tags.get("name", "Unnamed lodging"),
            "type": tags.get("tourism") or tags.get("amenity") or "lodging",
            "lat": el_lat,
            "lon": el_lon,
            "distance_km": round(_haversine_km(lat, lon, el_lat, el_lon), 1),
            "address": ", ".join(p for p in address_parts if p) or None,
            "phone": tags.get("phone") or tags.get("contact:phone"),
            "stars": tags.get("stars"),
        })

    results.sort(key=lambda r: r["distance_km"])
    _CACHE[key] = {"results": results, "fetched_at": time.time()}
    return results[:limit]
