"""
Fetches elevation data from Open Topo Data -- a free, public,
no-API-key service backed by SRTM 30m global elevation data.
Good enough for slope estimation at road-segment granularity; for
higher precision later, a paid/higher-resolution DEM source could
replace this without changing anything else in the pipeline.
"""
import time
import requests
import config


def fetch_elevations(points):
    """
    points: list of (lon, lat) tuples.
    Returns a list of elevations in meters, same order as input.
    Automatically batches and rate-limits requests to stay within the
    free public service's fair-use expectations.
    """
    elevations = [None] * len(points)
    batch_size = config.ELEVATION_BATCH_SIZE

    for start in range(0, len(points), batch_size):
        batch = points[start:start + batch_size]
        locations = "|".join(f"{lat},{lon}" for lon, lat in batch)

        try:
            resp = requests.get(config.ELEVATION_API_URL, params={"locations": locations}, timeout=30)
            resp.raise_for_status()
            results = resp.json().get("results", [])
            for i, r in enumerate(results):
                elevations[start + i] = r.get("elevation")
        except requests.exceptions.RequestException as e:
            print(f"  [warn] Elevation API call failed for batch starting at {start} ({e}) -- leaving as unknown.")

        # Respect the free service's rate limit before the next batch.
        if start + batch_size < len(points):
            time.sleep(config.ELEVATION_RATE_LIMIT_DELAY_SEC)

    return elevations
