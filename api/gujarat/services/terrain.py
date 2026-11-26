"""Route-level terrain profile using Open-Meteo's Copernicus GLO-90 elevation data.

This is an indicative 90 m DEM profile, not a surveyed road grade or a road
condition/safety score. It operates only on caller-supplied Gujarat route points.
"""
import math
import requests
import copy
import hashlib
import json
import threading
import time
from collections import OrderedDict

# Per-process cache: 24-hour TTL, bounded to avoid unbounded memory growth.
_CACHE_TTL_SECONDS = 24 * 60 * 60
_CACHE_MAX_ENTRIES = 128
_PROFILE_CACHE = OrderedDict()
_PROFILE_CACHE_LOCK = threading.Lock()


def _profile_cache_key(points):
    canonical = [
        [round(float(point["lat"]), 5), round(float(point["lon"]), 5)]
        for point in points
    ]
    payload = json.dumps(canonical, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_cached_terrain_profile(points):
    """Return a cached route profile or calculate and cache a new one."""
    key = _profile_cache_key(points)
    now = time.time()
    with _PROFILE_CACHE_LOCK:
        entry = _PROFILE_CACHE.get(key)
        if entry and now - entry["cached_at"] < _CACHE_TTL_SECONDS:
            _PROFILE_CACHE.move_to_end(key)
            result = copy.deepcopy(entry["profile"])
            result["cache_hit"] = True
            result["cache_age_seconds"] = max(0, int(now - entry["cached_at"]))
            return result
        if entry:
            del _PROFILE_CACHE[key]

    profile = build_terrain_profile(points)
    with _PROFILE_CACHE_LOCK:
        _PROFILE_CACHE[key] = {"profile": copy.deepcopy(profile), "cached_at": now}
        _PROFILE_CACHE.move_to_end(key)
        while len(_PROFILE_CACHE) > _CACHE_MAX_ENTRIES:
            _PROFILE_CACHE.popitem(last=False)

    result = copy.deepcopy(profile)
    result["cache_hit"] = False
    result["cache_age_seconds"] = 0
    return result

ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
MAX_POINTS = 80


def _distance_m(a, b):
    lat1, lon1 = math.radians(a["lat"]), math.radians(a["lon"])
    lat2, lon2 = math.radians(b["lat"]), math.radians(b["lon"])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def build_terrain_profile(points):
    if len(points) < 2:
        raise ValueError("At least two route points are required for a terrain profile.")
    if len(points) > MAX_POINTS:
        raise ValueError(f"At most {MAX_POINTS} route points can be profiled.")

    # Primary: Open-Meteo Copernicus GLO-90. If its public daily quota is
    # exhausted, fall back to OpenTopoData SRTM90m (global coverage).
    elevations = []
    provider_used = None
    provider_dataset = None
    provider_resolution = None

    try:
        for offset in range(0, len(points), 10):
            batch = points[offset:offset + 10]
            params = {
                "latitude": ",".join(f"{p['lat']:.6f}" for p in batch),
                "longitude": ",".join(f"{p['lon']:.6f}" for p in batch),
            }
            response = requests.get(ELEVATION_URL, params=params, timeout=(8, 25))
            if not response.ok:
                detail = ""
                try:
                    payload = response.json()
                    detail = payload.get("reason", "") if isinstance(payload, dict) else ""
                except ValueError:
                    detail = response.text[:160]
                raise RuntimeError(
                    f"Open-Meteo HTTP {response.status_code}"
                    + (f": {detail}" if detail else "")
                )
            payload = response.json()
            batch_elevations = payload.get("elevation")
            if not isinstance(batch_elevations, list) or len(batch_elevations) != len(batch):
                raise RuntimeError("Open-Meteo returned an incomplete profile.")
            elevations.extend(batch_elevations)
        provider_used = "Open-Meteo Elevation API"
        provider_dataset = "Copernicus DEM GLO-90"
        provider_resolution = 90
    except (requests.RequestException, RuntimeError) as primary_error:
        # OpenTopoData accepts up to 100 pipe-separated locations per request.
        # Keep a single request for this route to respect its public fair-use limits.
        locations = "|".join(f"{p['lat']:.6f},{p['lon']:.6f}" for p in points)
        fallback_url = "https://api.opentopodata.org/v1/srtm90m"
        try:
            fallback = requests.get(
                fallback_url,
                params={"locations": locations, "interpolation": "bilinear"},
                timeout=(8, 30),
            )
            fallback.raise_for_status()
            fallback_payload = fallback.json()
            results = fallback_payload.get("results")
            if fallback_payload.get("status") != "OK" or not isinstance(results, list) or len(results) != len(points):
                raise RuntimeError(f"OpenTopoData returned status {fallback_payload.get('status')!r} or incomplete results.")
            elevations = [item.get("elevation") for item in results]
            if any(value is None for value in elevations):
                raise RuntimeError("OpenTopoData has no elevation value for one or more route points.")
            provider_used = "OpenTopoData public API (fallback)"
            provider_dataset = "SRTM90m"
            provider_resolution = 90
        except (requests.RequestException, ValueError, RuntimeError) as fallback_error:
            raise RuntimeError(
                f"Open-Meteo failed ({primary_error}); OpenTopoData fallback failed ({fallback_error})."
            ) from fallback_error


    samples = []
    for index, (point, elevation) in enumerate(zip(points, elevations)):
        samples.append({
            "index": index,
            "lat": point["lat"],
            "lon": point["lon"],
            "elevation_m": round(float(elevation), 1) if elevation is not None else None,
        })

    ascent = 0.0
    descent = 0.0
    grades = []
    legs = []
    for index in range(len(samples) - 1):
        first, second = samples[index], samples[index + 1]
        distance = _distance_m(points[index], points[index + 1])
        e1, e2 = first["elevation_m"], second["elevation_m"]
        if distance < 1 or e1 is None or e2 is None:
            continue
        delta = e2 - e1
        grade = (delta / distance) * 100
        angle = math.degrees(math.atan(grade / 100))
        if delta > 0:
            ascent += delta
        else:
            descent += abs(delta)
        grades.append(abs(grade))
        legs.append({
            "from_index": index,
            "to_index": index + 1,
            "distance_m": round(distance, 1),
            "elevation_change_m": round(delta, 1),
            "grade_percent": round(grade, 2),
            "slope_angle_deg": round(angle, 2),
        })

    valid_elevations = [s["elevation_m"] for s in samples if s["elevation_m"] is not None]
    if not valid_elevations or not legs:
        raise RuntimeError("Elevation data was insufficient to calculate route slope.")

    max_grade = max(grades) if grades else 0.0
    mean_grade = sum(grades) / len(grades) if grades else 0.0
    terrain_class = "steep" if max_grade >= 6 else "rolling" if max_grade >= 3 else "mostly_flat"
    return {
        "source": provider_used,
        "dataset": provider_dataset,
        "resolution_m": provider_resolution,
        "data_status": "UNVERIFIED",
        "point_count": len(samples),
        "valid_elevation_points": len(valid_elevations),
        "start_elevation_m": valid_elevations[0],
        "end_elevation_m": valid_elevations[-1],
        "minimum_elevation_m": round(min(valid_elevations), 1),
        "maximum_elevation_m": round(max(valid_elevations), 1),
        "total_ascent_m": round(ascent, 1),
        "total_descent_m": round(descent, 1),
        "mean_absolute_grade_percent": round(mean_grade, 2),
        "maximum_absolute_grade_percent": round(max_grade, 2),
        "terrain_class": terrain_class,
        "samples": samples,
        "legs": legs,
        "note": "Indicative route terrain from a 90 m digital elevation model. Short road gradients may be smoothed or missed. This is not a surveyed grade, verified road condition, or complete safety score. OpenTopoData fallback uses SRTM90m and is subject to public fair-use limits.",
    }
