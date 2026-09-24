"""
Fetches rainfall data from OpenWeatherMap for a given lat/lon.

Uses the free "Current Weather" + "5 day / 3 hour forecast" endpoints
to approximate 24h and 72h cumulative rainfall (OpenWeatherMap's free
tier doesn't give true historical rainfall, so we approximate using
recent forecast/current data -- good enough for a hackathon demo;
swap in a paid historical API or IMD data for production).
"""
import requests
import config

BASE_URL = "https://api.openweathermap.org/data/2.5"


def get_rainfall_data(lat, lon):
    """
    Returns (rainfall_24h_mm, rainfall_72h_mm) estimated for the
    given coordinates. Falls back to (0, 0) if the API call fails
    or no API key is configured, so the pipeline never crashes.
    """
    if not config.OPENWEATHER_API_KEY:
        print("  [warn] No OPENWEATHER_API_KEY set -- using 0mm rainfall (demo mode).")
        return 0.0, 0.0

    try:
        # Current weather gives "rain" for the last 1h/3h if it's raining now.
        current_resp = requests.get(
            f"{BASE_URL}/weather",
            params={"lat": lat, "lon": lon, "appid": config.OPENWEATHER_API_KEY, "units": "metric"},
            timeout=10,
        )
        current_resp.raise_for_status()
        current = current_resp.json()
        current_rain_3h = current.get("rain", {}).get("3h", current.get("rain", {}).get("1h", 0) * 3)

        # 5-day/3-hour forecast includes recent-past-adjacent 3h buckets
        # we use it here as a proxy for recent rainfall trend.
        forecast_resp = requests.get(
            f"{BASE_URL}/forecast",
            params={"lat": lat, "lon": lon, "appid": config.OPENWEATHER_API_KEY, "units": "metric"},
            timeout=10,
        )
        forecast_resp.raise_for_status()
        forecast = forecast_resp.json()

        # Sum rainfall across the next several 3h buckets as a stand-in
        # signal for regional rainfall intensity (proxy, not true history).
        buckets = forecast.get("list", [])[:8]  # ~24h of 3h buckets
        rainfall_24h = sum(b.get("rain", {}).get("3h", 0) for b in buckets) + current_rain_3h

        buckets_72h = forecast.get("list", [])[:24]  # ~72h of 3h buckets (forecast max ~5 days)
        rainfall_72h = sum(b.get("rain", {}).get("3h", 0) for b in buckets_72h) + current_rain_3h

        return round(rainfall_24h, 1), round(rainfall_72h, 1)

    except requests.exceptions.RequestException as e:
        print(f"  [warn] Weather API call failed ({e}) -- using 0mm rainfall.")
        return 0.0, 0.0
