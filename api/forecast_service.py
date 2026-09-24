"""Route-aware live weather forecasting for planned-trip risk.

Uses Open-Meteo's continuously updated hourly forecast instead of relying on
coarse 3-hour buckets. A legacy OpenWeather fallback is retained only when
its existing server-side key is configured.  Each monitored road segment is scored using
weather at that segment's estimated arrival time, plus the forecast rain
between now and arrival (useful for wet/unstable mountain roads).

The provider is server-side only; no weather key is required for the normal
non-commercial Open-Meteo endpoint.
"""
from datetime import datetime, timedelta, timezone
import requests
import config

BASE_URL = "https://api.open-meteo.com/v1/forecast"

class ForecastUnavailable(Exception):
    pass


def max_forecastable_at() -> datetime:
    # Open-Meteo supports forecasts beyond this, but keeping the UI horizon
    # conservative avoids pretending a far-out trip has the same confidence
    # as a near-term forecast.
    return datetime.now(timezone.utc) + timedelta(hours=config.FORECAST_MAX_HOURS_AHEAD)


def _cell(lat, lon):
    size = config.FORECAST_GRID_SIZE_DEG
    return (round(float(lat) / size) * size, round(float(lon) / size) * size)


def _fetch_open_meteo(lat, lon):
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join([
            "temperature_2m",
            "precipitation",
            "rain",
            "showers",
            "precipitation_probability",
            "visibility",
            "wind_speed_10m",
            "wind_gusts_10m",
            "weather_code",
            "soil_moisture_0_to_10cm",
        ]),
        "current": ",".join([
            "temperature_2m",
            "precipitation",
            "rain",
            "showers",
            "weather_code",
            "visibility",
            "wind_speed_10m",
            "wind_gusts_10m",
        ]),
        "timezone": "UTC",
        "forecast_days": 16,
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }
    try:
        resp = requests.get(BASE_URL, params=params, timeout=15)
        if not resp.ok:
            raise ForecastUnavailable(f"Weather forecast request failed ({resp.status_code}).")
        data = resp.json()
    except requests.exceptions.RequestException as exc:
        raise ForecastUnavailable(f"Weather forecast API call failed: {exc}") from exc

    if not data.get("hourly", {}).get("time"):
        raise ForecastUnavailable("Weather provider returned no hourly forecast for this location.")
    return data




def _fetch_openweather(lat, lon):
    """Compatibility fallback for deployments that already have an OWM key."""
    if not config.OPENWEATHER_API_KEY:
        raise ForecastUnavailable("No weather provider is reachable and no OPENWEATHER_API_KEY is configured.")
    url = "https://api.openweathermap.org/data/2.5/forecast"
    try:
        resp = requests.get(
            url,
            params={"lat": lat, "lon": lon, "appid": config.OPENWEATHER_API_KEY, "units": "metric"},
            timeout=12,
        )
        if not resp.ok:
            raise ForecastUnavailable(f"Fallback weather provider failed ({resp.status_code}).")
        buckets = resp.json().get("list") or []
    except requests.exceptions.RequestException as exc:
        raise ForecastUnavailable(f"Fallback weather API call failed: {exc}") from exc
    if not buckets:
        raise ForecastUnavailable("Fallback weather provider returned no forecast buckets.")
    return {"_fallback": "openweather", "list": buckets}


def _fetch(lat, lon):
    try:
        return _fetch_open_meteo(lat, lon)
    except ForecastUnavailable as primary_error:
        # Keep the feature usable on networks where Open-Meteo is blocked.
        # OpenWeather is only used if the existing server-side key is present.
        if not config.OPENWEATHER_API_KEY:
            raise primary_error
        return _fetch_openweather(lat, lon)


def _forecast_from_openweather(data, window_start_utc, window_end_utc):
    buckets = data.get("list", [])
    def bucket_time(b):
        return datetime.fromtimestamp(int(b.get("dt", 0)), tz=timezone.utc)
    arrival = min(buckets, key=lambda b: abs(bucket_time(b) - window_start_utc))
    near = [b for b in buckets if window_start_utc - timedelta(hours=3) <= bucket_time(b) <= window_start_utc + timedelta(hours=6)]
    trip = [b for b in buckets if window_start_utc <= bucket_time(b) <= window_end_utc + timedelta(hours=1)]
    pre = [b for b in buckets if max(datetime.now(timezone.utc), window_start_utc - timedelta(hours=24)) <= bucket_time(b) <= window_start_utc]
    def rain(b): return float((b.get("rain") or {}).get("3h") or 0.0)
    weather = arrival.get("weather") or [{}]
    main = arrival.get("main") or {}
    wind = arrival.get("wind") or {}
    return {
        "forecast_to_departure_mm": round(sum(rain(b) for b in pre), 1),
        "forecast_during_trip_mm": round(sum(rain(b) for b in trip), 1),
        "forecast_next_6h_mm": round(sum(rain(b) for b in near), 1),
        "rain_probability_pct": round(max((float(b.get("pop") or 0) for b in near), default=0) * 100, 1),
        "thunderstorm_expected": any(200 <= int(w.get("id", 0)) <= 232 for b in near for w in (b.get("weather") or [])),
        "current_rain_1h_mm": 0.0,
        "forecast_rain_1h_mm": round(rain(arrival) / 3.0, 1),
        "forecast_precipitation_1h_mm": round(rain(arrival) / 3.0, 1),
        "forecast_showers_1h_mm": 0.0,
        "forecast_visibility_m": round(float(arrival.get("visibility") or 10000), 0),
        "forecast_wind_kmh": round(float(wind.get("speed") or 0) * 3.6, 1),
        "forecast_gust_kmh": round(float(wind.get("gust") or wind.get("speed") or 0) * 3.6, 1),
        "forecast_temperature_c": round(float(main.get("temp") or 0), 1),
        "forecast_weather_code": int(main.get("weather_id") or weather[0].get("id") or 0),
        "forecast_soil_moisture": 0.0,
        "forecast_time": bucket_time(arrival).isoformat(),
        "source": "OpenWeather 3-hour fallback",
        "weather_model": "OpenWeather fallback (3-hour forecast)",
    }

def _parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _series_at(hourly, key, idx, default=0.0):
    values = hourly.get(key) or []
    try:
        value = values[idx]
        return float(value) if value is not None else float(default)
    except (IndexError, TypeError, ValueError):
        return float(default)


def _nearest_index(times, target):
    if not times:
        return None
    return min(range(len(times)), key=lambda i: abs(times[i] - target))


def _window_indices(times, start, end):
    return [i for i, t in enumerate(times) if start <= t <= end]


def _thunderstorm(code):
    # WMO weather codes 95/96/99 represent thunderstorms.
    return int(code or 0) in {95, 96, 99}


def forecast_for_window(lat, lon, window_start_utc, window_end_utc, cache):
    """Return hourly forecast features for one route segment.

    window_start_utc is the estimated arrival time at the segment.  The
    forecast at that hour is the primary weather signal.  Rain forecast from
    now through arrival is also retained because rainfall before a mountain
    segment can increase soil saturation and landslide susceptibility.
    """
    key = _cell(lat, lon)
    if key not in cache:
        cache[key] = _fetch(*key)
    data = cache[key]
    if data.get("_fallback") == "openweather":
        return _forecast_from_openweather(data, window_start_utc, window_end_utc)
    hourly = data["hourly"]
    times = [_parse_time(t) for t in hourly.get("time", [])]

    arrival_idx = _nearest_index(times, window_start_utc)
    if arrival_idx is None:
        raise ForecastUnavailable("Weather provider returned no usable forecast times.")

    # The route can start shortly after 'now'. Do not fabricate historical
    # rainfall from forecast data; only sum forecast precipitation from now
    # forward.
    now = datetime.now(timezone.utc)
    pre_start = now
    pre_indices = _window_indices(times, pre_start, window_start_utc)
    trip_indices = _window_indices(times, window_start_utc, window_end_utc)
    next6_indices = _window_indices(times, window_start_utc, window_start_utc + timedelta(hours=6))

    arrival_precip = _series_at(hourly, "precipitation", arrival_idx)
    arrival_rain = _series_at(hourly, "rain", arrival_idx)
    arrival_showers = _series_at(hourly, "showers", arrival_idx)
    arrival_pop = _series_at(hourly, "precipitation_probability", arrival_idx)
    arrival_visibility = _series_at(hourly, "visibility", arrival_idx)
    arrival_wind = _series_at(hourly, "wind_speed_10m", arrival_idx)
    arrival_gust = _series_at(hourly, "wind_gusts_10m", arrival_idx)
    arrival_temp = _series_at(hourly, "temperature_2m", arrival_idx)
    arrival_code = int(_series_at(hourly, "weather_code", arrival_idx))

    def sum_field(field, indices):
        return round(sum(_series_at(hourly, field, i) for i in indices), 1)

    # Soil moisture is a contextual signal; it is reported to the UI but is
    # deliberately not given a large independent weight to avoid double
    # counting rainfall and terrain vulnerability.
    soil = _series_at(hourly, "soil_moisture_0_to_10cm", arrival_idx)

    return {
        "forecast_to_departure_mm": sum_field("precipitation", pre_indices),
        "forecast_during_trip_mm": sum_field("precipitation", trip_indices),
        "forecast_next_6h_mm": sum_field("precipitation", next6_indices),
        "rain_probability_pct": round(arrival_pop, 1),
        "thunderstorm_expected": any(_thunderstorm(_series_at(hourly, "weather_code", i)) for i in next6_indices or [arrival_idx]),
        "current_rain_1h_mm": round(float((data.get("current") or {}).get("rain") or 0.0), 1),
        "forecast_rain_1h_mm": round(arrival_rain, 1),
        "forecast_precipitation_1h_mm": round(arrival_precip, 1),
        "forecast_showers_1h_mm": round(arrival_showers, 1),
        "forecast_visibility_m": round(arrival_visibility, 0),
        "forecast_wind_kmh": round(arrival_wind, 1),
        "forecast_gust_kmh": round(arrival_gust, 1),
        "forecast_temperature_c": round(arrival_temp, 1),
        "forecast_weather_code": arrival_code,
        "forecast_soil_moisture": round(soil, 3),
        "forecast_time": times[arrival_idx].isoformat(),
        "source": "Open-Meteo Best Match hourly forecast",
        "weather_model": "Open-Meteo Best Match (ECMWF IFS where available)",
    }
