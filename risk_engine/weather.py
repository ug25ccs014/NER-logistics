"""Live conditions for the standalone risk engine (free Open-Meteo, no key).

Returns observed/analysed rain for the last 24h/72h plus current and next-3h
conditions, in the field names risk_model.score_segment() expects.
Falls back to None (caller skips the segment) rather than inventing zeros.
"""
from datetime import datetime, timezone
import requests

URL = "https://api.open-meteo.com/v1/forecast"


def get_conditions(lat, lon):
    params = {
        "latitude": lat, "longitude": lon, "timezone": "UTC", "past_days": 3, "forecast_days": 1,
        "hourly": "precipitation,precipitation_probability,visibility,wind_speed_10m,wind_gusts_10m,weather_code",
        "wind_speed_unit": "kmh",
    }
    try:
        r = requests.get(URL, params=params, timeout=10)
        r.raise_for_status()
        h = r.json()["hourly"]
    except (requests.exceptions.RequestException, KeyError, ValueError) as exc:
        print(f"  [warn] weather fetch failed ({exc}) -- skipping this cell.")
        return None
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
    times = h["time"]
    i = max(0, min(range(len(times)), key=lambda k: abs(datetime.fromisoformat(times[k]) - datetime.fromisoformat(now))))
    v = lambda key, k, d=0.0: (h[key][k] if 0 <= k < len(h[key]) and h[key][k] is not None else d)
    rain_now = v("precipitation", i)
    return {
        "past_24h_mm": round(sum(v("precipitation", k) for k in range(max(0, i - 23), i + 1)), 1),
        "past_72h_mm": round(sum(v("precipitation", k) for k in range(max(0, i - 71), i + 1)), 1),
        "forecast_during_trip_mm": round(sum(v("precipitation", k) for k in range(i, i + 3)), 1),
        "forecast_next_6h_mm": round(sum(v("precipitation", k) for k in range(i, i + 6)), 1),
        "current_rain_1h_mm": rain_now,
        "forecast_rain_1h_mm": rain_now,
        "rain_probability_pct": max(v("precipitation_probability", k) for k in range(i, i + 3)),
        "thunderstorm_expected": any(int(v("weather_code", k)) in (95, 96, 99) for k in range(i, i + 6)),
        "forecast_visibility_m": v("visibility", i, 10000),
        "forecast_wind_kmh": v("wind_speed_10m", i),
        "forecast_gust_kmh": v("wind_gusts_10m", i),
    }
