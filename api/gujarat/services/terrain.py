"""Route-level terrain profile using Open-Meteo's Copernicus GLO-90 elevation data.

This is an indicative 90 m DEM profile, not a surveyed road grade or a road
condition/safety score. It operates only on caller-supplied Gujarat route points.
"""
import math
import requests

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

    params = {
        "latitude": ",".join(f"{p['lat']:.6f}" for p in points),
        "longitude": ",".join(f"{p['lon']:.6f}" for p in points),
    }
    response = requests.get(ELEVATION_URL, params=params, timeout=(8, 25))
    response.raise_for_status()
    elevations = response.json().get("elevation")
    if not isinstance(elevations, list) or len(elevations) != len(points):
        raise RuntimeError("Elevation provider returned an incomplete profile.")

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
        "source": "Open-Meteo Elevation API",
        "dataset": "Copernicus DEM GLO-90",
        "resolution_m": 90,
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
        "note": "Indicative route terrain from a 90 m digital elevation model. Short road gradients may be smoothed or missed. This is not a surveyed grade, verified road condition, or complete safety score.",
    }
