"""Live, multi-source weather forecasting for route risk (100% free providers).

Sources (all free, no paid key required):
  1. Open-Meteo        -- hourly forecast + past 3 days of observed/analysed rain
                          (batched: many grid cells in ONE request).
  2. MET Norway (yr.no) -- independent second opinion, hourly, needs only a
                          descriptive User-Agent.
  3. OpenWeather        -- optional 3-hourly fallback, used only if a key is set
                          AND the two sources above both failed.

What changed vs. the single-provider version
  * One shared TTL cache across requests (the old per-request dict meant every
    search re-hit the provider -> 429 -> "forecast unavailable").
  * Batched Open-Meteo calls + providers fetched in parallel.
  * Consensus of the available sources, with an agreement/confidence signal.
  * Stale-on-error: if every provider is down but we fetched a cell recently,
    serve that (clearly flagged) instead of failing the whole route.
"""
from datetime import datetime, timedelta, timezone
import concurrent.futures
import threading
import time
import requests
import config

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
MET_NO_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact"

PROVIDER_LABELS = {
    "open_meteo": "Open-Meteo",
    "met_no": "MET Norway",
    "openweather": "OpenWeather",
}
# Relative trust when blending. OpenWeather is only ever used alone (fallback).
PROVIDER_WEIGHTS = {"open_meteo": 0.6, "met_no": 0.4, "openweather": 0.5}

STALE_MAX_AGE_SEC = 6 * 3600
OPEN_METEO_BATCH = 40

_CACHE = {}                 # cell -> {"at": epoch, "series": {provider: S}, "current_rain": float}
_CACHE_LOCK = threading.Lock()
_FETCH_LOCK = threading.Lock()   # serialises network phases so concurrent requests share one fetch
_HEALTH = {p: {"ok": None, "last_ok": None, "last_error": None, "last_error_at": None} for p in PROVIDER_LABELS}


class ForecastUnavailable(Exception):
    pass


# ---------------------------------------------------------------- helpers
def max_forecastable_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=config.FORECAST_MAX_HOURS_AHEAD)


def _cell(lat, lon):
    size = config.FORECAST_GRID_SIZE_DEG
    return (round(round(float(lat) / size) * size, 4), round(round(float(lon) / size) * size, 4))


def _mark(provider, ok, err=None):
    h = _HEALTH[provider]
    h["ok"] = ok
    now = datetime.now(timezone.utc).isoformat()
    if ok:
        h["last_ok"] = now
    else:
        h["last_error"] = str(err)[:200]
        h["last_error_at"] = now


def provider_health():
    with _CACHE_LOCK:
        cached = len(_CACHE)
    return {
        "providers": {PROVIDER_LABELS[k]: dict(v) for k, v in _HEALTH.items()},
        "cached_grid_cells": cached,
        "cache_ttl_seconds": config.FORECAST_CACHE_TTL_SECONDS,
    }


def _parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc) \
        if value.endswith("Z") or "+" in value[10:] else datetime.fromisoformat(value).replace(tzinfo=timezone.utc)


def _fnum(v, default=None):
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------- provider: Open-Meteo
_OM_HOURLY = ["temperature_2m", "precipitation", "rain", "showers", "precipitation_probability",
              "visibility", "wind_speed_10m", "wind_gusts_10m", "weather_code", "soil_moisture_0_to_10cm"]
_OM_CURRENT = ["rain"]


def _normalize_open_meteo(data):
    h = data.get("hourly") or {}
    times = [_parse_time(t) for t in h.get("time", [])]
    if not times:
        raise ForecastUnavailable("Open-Meteo returned no hourly data.")

    def col(key):
        vals = h.get(key) or []
        return [_fnum(vals[i]) if i < len(vals) else None for i in range(len(times))]

    codes = col("weather_code")
    return {
        "times": times, "precip": col("precipitation"), "rain": col("rain"), "showers": col("showers"),
        "pop": col("precipitation_probability"), "vis": col("visibility"),
        "wind": col("wind_speed_10m"), "gust": col("wind_gusts_10m"), "temp": col("temperature_2m"),
        "code": codes, "soil": col("soil_moisture_0_to_10cm"),
        "thunder": [c is not None and int(c) in (95, 96, 99) for c in codes],
        "has_past": True,
    }


_OM_BLOCKED_UNTIL = 0.0


def _open_meteo_request(cells):
    global _OM_BLOCKED_UNTIL
    if time.time() < _OM_BLOCKED_UNTIL:
        raise ForecastUnavailable("Open-Meteo rate-limited (HTTP 429); pausing calls briefly")
    params = {
        "latitude": ",".join(str(c[0]) for c in cells),
        "longitude": ",".join(str(c[1]) for c in cells),
        "hourly": ",".join(_OM_HOURLY), "current": ",".join(_OM_CURRENT),
        "timezone": "UTC", "forecast_days": 10, "past_days": 3,
        "wind_speed_unit": "kmh", "precipitation_unit": "mm",
    }
    last = None
    for backoff in (0, 1.0):
        if backoff:
            time.sleep(backoff)
        try:
            resp = requests.get(OPEN_METEO_URL, params=params, timeout=7)
        except requests.exceptions.RequestException as exc:
            last = f"network error: {exc}"
            continue
        if resp.status_code == 429 or resp.status_code >= 500:
            last = f"HTTP {resp.status_code}"
            continue
        if not resp.ok:
            raise ForecastUnavailable(f"Open-Meteo HTTP {resp.status_code}")
        payload = resp.json()
        return payload if isinstance(payload, list) else [payload]
    if last and "429" in last:
        _OM_BLOCKED_UNTIL = time.time() + 120
    raise ForecastUnavailable(f"Open-Meteo failed ({last})")


def _fetch_open_meteo(cells):
    """Return {cell: (series, current_rain)} for as many cells as succeeded."""
    out = {}
    for i in range(0, len(cells), OPEN_METEO_BATCH):
        chunk = cells[i:i + OPEN_METEO_BATCH]
        try:
            payloads = _open_meteo_request(chunk)
            for cell, data in zip(chunk, payloads):
                try:
                    out[cell] = (_normalize_open_meteo(data), _fnum((data.get("current") or {}).get("rain"), 0.0))
                except ForecastUnavailable:
                    pass
            _mark("open_meteo", True)
        except ForecastUnavailable as exc:
            _mark("open_meteo", False, exc)
    return out


# ------------------------------------------------------ provider: MET Norway
def _normalize_met_no(data):
    ts = ((data.get("properties") or {}).get("timeseries")) or []
    if not ts:
        raise ForecastUnavailable("MET Norway returned no timeseries.")
    pts = []
    for e in ts:
        t = _parse_time(e["time"])
        inst = ((e.get("data") or {}).get("instant") or {}).get("details") or {}
        d = e.get("data") or {}
        if "next_1_hours" in d:
            block, div = d["next_1_hours"], 1.0
        elif "next_6_hours" in d:
            block, div = d["next_6_hours"], 6.0
        else:
            block, div = {}, 1.0
        amount = _fnum(((block.get("details") or {}).get("precipitation_amount")), 0.0) / div
        sym = ((block.get("summary") or {}).get("symbol_code")) or ""
        pts.append((t, inst, amount, "thunder" in sym))
    pts.sort(key=lambda p: p[0])

    # Resample onto an hourly grid (forward-fill) so window sums are comparable
    # with Open-Meteo even where MET Norway switches to 6-hourly steps.
    start = pts[0][0].replace(minute=0, second=0, microsecond=0)
    end = pts[-1][0]
    times, precip, wind, gust, temp, thunder = [], [], [], [], [], []
    j, t = 0, start
    while t <= end:
        while j + 1 < len(pts) and pts[j + 1][0] <= t:
            j += 1
        _, inst, amt, thd = pts[j]
        ws = _fnum(inst.get("wind_speed"))
        wg = _fnum(inst.get("wind_speed_of_gust"))
        times.append(t)
        precip.append(amt)
        wind.append(ws * 3.6 if ws is not None else None)
        gust.append(wg * 3.6 if wg is not None else (ws * 3.6 * 1.4 if ws is not None else None))
        temp.append(_fnum(inst.get("air_temperature")))
        thunder.append(thd)
        t += timedelta(hours=1)
    n = len(times)
    return {"times": times, "precip": precip, "rain": precip, "showers": [None] * n, "pop": [None] * n,
            "vis": [None] * n, "wind": wind, "gust": gust, "temp": temp, "code": [None] * n,
            "soil": [None] * n, "thunder": thunder, "has_past": False}


def _fetch_met_no_one(cell):
    lat, lon = cell
    headers = {"User-Agent": config.WEATHER_USER_AGENT}
    resp = requests.get(MET_NO_URL, params={"lat": round(lat, 4), "lon": round(lon, 4)}, headers=headers, timeout=7)
    if not resp.ok:
        raise ForecastUnavailable(f"MET Norway HTTP {resp.status_code}")
    return _normalize_met_no(resp.json())


def _fetch_met_no(cells):
    out = {}
    if not cells:
        return out
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(6, len(cells))) as pool:
        futs = {pool.submit(_fetch_met_no_one, c): c for c in cells}
        errors = []
        for f in concurrent.futures.as_completed(futs):
            try:
                out[futs[f]] = f.result()
            except (ForecastUnavailable, requests.exceptions.RequestException, KeyError, ValueError) as exc:
                errors.append(exc)
    _mark("met_no", bool(out), errors[0] if errors and not out else None)
    return out


# ----------------------------------------------- provider: OpenWeather (optional)
def _fetch_openweather_one(cell):
    resp = requests.get("https://api.openweathermap.org/data/2.5/forecast",
                        params={"lat": cell[0], "lon": cell[1], "appid": config.OPENWEATHER_API_KEY, "units": "metric"},
                        timeout=8)
    if not resp.ok:
        raise ForecastUnavailable(f"OpenWeather HTTP {resp.status_code}")
    buckets = resp.json().get("list") or []
    if not buckets:
        raise ForecastUnavailable("OpenWeather returned no buckets.")
    first = datetime.fromtimestamp(int(buckets[0]["dt"]), tz=timezone.utc)
    last = datetime.fromtimestamp(int(buckets[-1]["dt"]), tz=timezone.utc) + timedelta(hours=2)
    times, precip, pop, vis, wind, gust, temp, code, thunder = ([] for _ in range(9))
    j, t = 0, first
    while t <= last:
        while j + 1 < len(buckets) and int(buckets[j + 1]["dt"]) <= t.timestamp():
            j += 1
        b = buckets[j]
        w = (b.get("wind") or {})
        wid = int(((b.get("weather") or [{}])[0]).get("id") or 0)
        times.append(t)
        precip.append(_fnum((b.get("rain") or {}).get("3h"), 0.0) / 3.0)
        pop.append(_fnum(b.get("pop"), 0.0) * 100)
        vis.append(_fnum(b.get("visibility")))
        wind.append((_fnum(w.get("speed"), 0.0)) * 3.6)
        gust.append((_fnum(w.get("gust"), _fnum(w.get("speed"), 0.0))) * 3.6)
        temp.append(_fnum((b.get("main") or {}).get("temp")))
        code.append(wid)
        thunder.append(200 <= wid <= 232)
        t += timedelta(hours=1)
    n = len(times)
    return {"times": times, "precip": precip, "rain": precip, "showers": [None] * n, "pop": pop, "vis": vis,
            "wind": wind, "gust": gust, "temp": temp, "code": code, "soil": [None] * n, "thunder": thunder,
            "has_past": False}


# ------------------------------------------------------------ cache + prefetch
def _fresh(entry):
    return entry is not None and (time.time() - entry["at"]) < config.FORECAST_CACHE_TTL_SECONDS


def prefetch(cells, cache=None):
    """Ensure every grid cell has a (fresh or stale-but-usable) bundle; fill `cache`."""
    cache = cache if cache is not None else {}
    cells = list(dict.fromkeys(cells))
    with _CACHE_LOCK:
        need = [c for c in cells if not _fresh(_CACHE.get(c))]
    if need:
        with _FETCH_LOCK:
            # Another request may have fetched these while we waited for the lock.
            with _CACHE_LOCK:
                need = [c for c in need if not _fresh(_CACHE.get(c))]
            if need:
                _network_fetch(need)
    with _CACHE_LOCK:
        for c in cells:
            entry = _CACHE.get(c)
            if entry is not None and (time.time() - entry["at"]) < STALE_MAX_AGE_SEC:
                cache[c] = entry
    return cache


def _network_fetch(cells):
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        om_f = pool.submit(_fetch_open_meteo, cells)
        mn_f = pool.submit(_fetch_met_no, cells)
        om, mn = om_f.result(), mn_f.result()
    now = time.time()
    missing = []
    for c in cells:
        series = {}
        current_rain = 0.0
        if c in om:
            series["open_meteo"], current_rain = om[c]
        if c in mn:
            series["met_no"] = mn[c]
        results[c] = {"at": now, "series": series, "current_rain": current_rain}
        if "open_meteo" not in series:
            missing.append(c)
    # Open-Meteo missing for a cell (e.g. rate-limited): add OpenWeather as the
    # second opinion so the route still gets a cross-checked forecast.
    if missing and config.OPENWEATHER_API_KEY:
        for c in missing:
            try:
                results[c]["series"]["openweather"] = _fetch_openweather_one(c)
                _mark("openweather", True)
            except (ForecastUnavailable, requests.exceptions.RequestException, KeyError, ValueError) as exc:
                _mark("openweather", False, exc)
    results = {c: r for c, r in results.items() if r["series"]}
    with _CACHE_LOCK:
        _CACHE.update(results)


def _fetch(lat, lon):
    """Back-compat single-cell fetch used by older callers."""
    cell = _cell(lat, lon)
    bundle = prefetch([cell]).get(cell)
    if bundle is None:
        raise ForecastUnavailable("All weather providers are currently unreachable and no recent cached forecast exists.")
    return bundle


# ------------------------------------------------------------ feature extraction
def _nearest_index(times, target):
    if not times:
        return None
    return min(range(len(times)), key=lambda i: abs(times[i] - target))


def _at(series, key, idx, default=None):
    vals = series.get(key) or []
    v = vals[idx] if 0 <= idx < len(vals) else None
    return default if v is None else float(v)


def _sum(series, key, idxs):
    return sum((_at(series, key, i, 0.0) or 0.0) for i in idxs)


def _idx_between(times, a, b):
    return [i for i, t in enumerate(times) if a <= t <= b]


def _features(series, now, start, end):
    """Numeric features for one provider's series, or None if it doesn't cover `start`."""
    times = series["times"]
    ai = _nearest_index(times, start)
    if ai is None or abs(times[ai] - start) > timedelta(hours=3):
        return None
    pre = _idx_between(times, now, start)
    trip = _idx_between(times, start, end)
    nxt6 = _idx_between(times, start, start + timedelta(hours=6))
    f = {
        "forecast_to_departure_mm": _sum(series, "precip", pre),
        "forecast_during_trip_mm": _sum(series, "precip", trip),
        "forecast_next_6h_mm": _sum(series, "precip", nxt6),
        "rain_probability_pct": _at(series, "pop", ai),
        "forecast_rain_1h_mm": _at(series, "rain", ai, 0.0),
        "forecast_precipitation_1h_mm": _at(series, "precip", ai, 0.0),
        "forecast_showers_1h_mm": _at(series, "showers", ai, 0.0),
        "forecast_visibility_m": _at(series, "vis", ai),
        "forecast_wind_kmh": _at(series, "wind", ai, 0.0),
        "forecast_gust_kmh": _at(series, "gust", ai, 0.0),
        "forecast_temperature_c": _at(series, "temp", ai),
        "forecast_soil_moisture": _at(series, "soil", ai),
        "thunderstorm_expected": any((series["thunder"][i] if i < len(series["thunder"]) else False)
                                     for i in (nxt6 or [ai])),
        "forecast_weather_code": _at(series, "code", ai),
        "forecast_time": times[ai].isoformat(),
    }
    if series.get("has_past"):
        f["past_24h_mm"] = _sum(series, "precip", _idx_between(times, now - timedelta(hours=24), now))
        f["past_72h_mm"] = _sum(series, "precip", _idx_between(times, now - timedelta(hours=72), now))
    else:
        f["past_24h_mm"] = f["past_72h_mm"] = None
    return f


_BLEND_KEYS = ["forecast_to_departure_mm", "forecast_during_trip_mm", "forecast_next_6h_mm",
               "rain_probability_pct", "forecast_rain_1h_mm", "forecast_precipitation_1h_mm",
               "forecast_showers_1h_mm", "forecast_visibility_m", "forecast_wind_kmh", "forecast_gust_kmh",
               "forecast_temperature_c", "forecast_soil_moisture", "past_24h_mm", "past_72h_mm"]


def _blend(per_provider):
    """Weighted mean of each numeric field over providers that report it."""
    use = per_provider
    out = {}
    for key in _BLEND_KEYS:
        num = den = 0.0
        for p, f in use.items():
            if f.get(key) is not None:
                w = PROVIDER_WEIGHTS[p]
                num += f[key] * w
                den += w
        out[key] = (num / den) if den else None
    return out, use


def _agreement(use):
    """high / medium / low from how closely providers agree on next-6h rain."""
    if len(use) < 2:
        return "single_source", None
    vals = [f["forecast_next_6h_mm"] for f in use.values()]
    spread = max(vals) - min(vals)
    if spread <= 1.0:
        return "high", round(spread, 1)
    if spread <= 4.0:
        return "medium", round(spread, 1)
    return "low", round(spread, 1)


def forecast_for_window(lat, lon, window_start_utc, window_end_utc, cache):
    """Blended forecast features for one road segment at its estimated arrival window."""
    key = _cell(lat, lon)
    bundle = cache.get(key)
    if bundle is None:
        bundle = _fetch(lat, lon)
        cache[key] = bundle

    now = datetime.now(timezone.utc)
    per = {}
    for provider, series in bundle["series"].items():
        f = _features(series, now, window_start_utc, window_end_utc)
        if f is not None:
            per[provider] = f
    if not per:
        raise ForecastUnavailable("No weather provider covers the requested departure time.")

    blended, used = _blend(per)
    agreement, spread = _agreement(used)
    primary = used.get("open_meteo") or next(iter(used.values()))
    age_min = round((time.time() - bundle["at"]) / 60)
    pop = blended["rain_probability_pct"]
    pop_estimated = False
    if pop is None:  # MET-only: derive a rough chance from the amount (flagged as an estimate)
        r = blended["forecast_precipitation_1h_mm"] or 0.0
        pop, pop_estimated = (80.0 if r >= 0.5 else 40.0 if r >= 0.1 else 5.0), True
    vis = blended["forecast_visibility_m"]
    labels = [PROVIDER_LABELS[p] for p in used]

    return {
        "forecast_to_departure_mm": round(blended["forecast_to_departure_mm"] or 0.0, 1),
        "forecast_during_trip_mm": round(blended["forecast_during_trip_mm"] or 0.0, 1),
        "forecast_next_6h_mm": round(blended["forecast_next_6h_mm"] or 0.0, 1),
        "past_24h_mm": round(blended["past_24h_mm"] or 0.0, 1),
        "past_72h_mm": round(blended["past_72h_mm"] or 0.0, 1),
        "rain_probability_pct": round(pop, 1),
        "rain_probability_estimated": pop_estimated,
        "thunderstorm_expected": any(f["thunderstorm_expected"] for f in used.values()),
        "current_rain_1h_mm": round(float(bundle.get("current_rain") or 0.0), 1),
        "forecast_rain_1h_mm": round(blended["forecast_rain_1h_mm"] or 0.0, 1),
        "forecast_precipitation_1h_mm": round(blended["forecast_precipitation_1h_mm"] or 0.0, 1),
        "forecast_showers_1h_mm": round(blended["forecast_showers_1h_mm"] or 0.0, 1),
        "forecast_visibility_m": round(vis, 0) if vis is not None else 10000,
        "forecast_wind_kmh": round(blended["forecast_wind_kmh"] or 0.0, 1),
        "forecast_gust_kmh": round(blended["forecast_gust_kmh"] or 0.0, 1),
        "forecast_temperature_c": round(blended["forecast_temperature_c"], 1) if blended["forecast_temperature_c"] is not None else None,
        "forecast_weather_code": int(primary["forecast_weather_code"]) if primary.get("forecast_weather_code") is not None else None,
        "forecast_soil_moisture": round(blended["forecast_soil_moisture"], 3) if blended["forecast_soil_moisture"] is not None else None,
        "forecast_time": primary["forecast_time"],
        "source": " + ".join(labels) + (" (cached, may be outdated)" if age_min * 60 > config.FORECAST_CACHE_TTL_SECONDS * 2 else ""),
        "weather_model": " + ".join(labels) + " consensus" if len(labels) > 1 else f"{labels[0]} forecast",
        "sources": labels,
        "source_agreement": agreement,
        "rain_spread_mm": spread,
        "data_age_min": age_min,
    }
