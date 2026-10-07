"""Explainable planned-trip risk model.

The score combines the actual weather forecast at each segment ETA with
terrain/infrastructure vulnerability and live incidents. It is a transparent
rule model, not a trained ML probability.
"""
import config

MODEL_VERSION = "trip_rule_v5_separated_scores"


def _norm(value, cap):
    try:
        value = float(value or 0)
    except (TypeError, ValueError):
        value = 0.0
    return max(0.0, min(100.0, value / cap * 100.0)) if cap > 0 else 0.0


def _visibility_risk(meters):
    if meters is None:
        return 0.0
    # Good visibility is not a risk contribution. Below 2 km it rises quickly;
    # below 500 m it is treated as severe travel visibility.
    m = float(meters)
    if m >= 10000:
        return 0.0
    return max(0.0, min(100.0, (10000.0 - m) / 9500.0 * 100.0))


def score_breakdown(
    forecast_to_departure_mm=0,
    forecast_during_trip_mm=0,
    forecast_next_6h_mm=0,
    past_24h_mm=0,
    past_72h_mm=0,
    rain_probability_pct=0,
    thunderstorm_expected=False,
    current_rain_1h_mm=0,
    forecast_rain_1h_mm=0,
    forecast_precipitation_1h_mm=0,
    forecast_showers_1h_mm=0,
    forecast_visibility_m=10000,
    forecast_wind_kmh=0,
    forecast_gust_kmh=0,
    avg_slope_deg=0,
    seasonal_restriction=None,
    has_bridge=False,
    active_alerts=0,
    active_hazard_reports=0,
    verified_hazard_reports=0,
    status="open",
    source=None,
    **_extra_forecast_fields,
):
    # trip_forecast.py calls this as score_segment(**weather, ...), and
    # `weather` (from forecast_service.forecast_for_window) carries a few
    # descriptive/display-only fields -- forecast_temperature_c,
    # forecast_weather_code, forecast_soil_moisture, forecast_time,
    # weather_model -- that this model doesn't score against. Without
    # **_extra_forecast_fields above, any one of those raised
    # `TypeError: score_segment() got an unexpected keyword argument`
    # on every single call, which is why live forecasting was failing
    # 100% of the time. They're intentionally unused here; add a named
    # parameter (and fold it into the score below) if one of them
    # should start affecting risk.

    # ---- 1) WEATHER sub-score (0-100) from the forecast at this segment's ETA.
    # Wet-ground rain, rain during the trip, intensity at arrival, chance of rain,
    # thunder, current rain, wind and visibility. Terrain/hazards are NOT mixed in.
    pre_rain = _norm(
        float(forecast_to_departure_mm or 0) + 0.7 * float(past_24h_mm or 0) + 0.25 * float(past_72h_mm or 0), 80)
    trip_rain = _norm(forecast_during_trip_mm, 25)
    eta_rain = _norm(forecast_rain_1h_mm or forecast_precipitation_1h_mm, 15)
    pop = _norm(rain_probability_pct, 100)
    thunder = 100.0 if thunderstorm_expected else 0.0
    current = _norm(current_rain_1h_mm, 20)
    wind = _norm(max(float(forecast_wind_kmh or 0), float(forecast_gust_kmh or 0)), 80)
    visibility = _visibility_risk(forecast_visibility_m)
    weather_score = min(100.0, 2.0 * (
        pre_rain * .12 + trip_rain * .08 + eta_rain * .10 +
        pop * .07 + thunder * .04 + current * .03 + wind * .04 + visibility * .02))

    # ---- 2) TERRAIN sub-score (0-100): how vulnerable this stretch is.
    slope = _norm(avg_slope_deg, 35)
    terrain_score = min(100.0, (slope * .22 + (100.0 if seasonal_restriction else 0.0) * .09
                                + (100.0 if has_bridge else 0.0) * .04) / .35)

    # ---- 3) FIELD-HAZARD sub-score (0-100): live reports and alerts.
    hazard_score = min(100.0, active_alerts * 20.0 + active_hazard_reports * 20.0 + verified_hazard_reports * 30.0)

    # ---- Overall: weather leads; terrain only amplifies it (steep road in dry
    # weather stays low, steep road in a storm goes severe); hazards add on top
    # and set floors because a real report overrides a dry forecast.
    overall = weather_score + 0.30 * terrain_score * (0.4 + weather_score / 100.0) + 0.15 * hazard_score
    floor, driver_floor = 0.0, None
    if status == "blocked":
        floor, driver_floor = 95.0, "road blocked"
    elif verified_hazard_reports > 0:
        floor, driver_floor = 80.0, "verified field hazard"
    elif active_hazard_reports > 0:
        floor, driver_floor = 65.0, "field hazard reports"
    elif active_alerts >= 2:
        floor, driver_floor = 60.0, "active alerts"
    overall = min(100.0, max(overall, floor))

    parts = {"weather": weather_score, "terrain": 0.30 * terrain_score * (0.4 + weather_score / 100.0),
             "hazards": max(0.15 * hazard_score, floor)}
    driver = driver_floor if (driver_floor and floor >= weather_score) else max(parts, key=parts.get)
    return {
        "overall": round(overall, 1), "weather_score": round(weather_score, 1),
        "terrain_score": round(terrain_score, 1), "hazard_score": round(max(hazard_score, floor), 1),
        "driver": {"weather": "weather", "terrain": "terrain", "hazards": "field hazards"}.get(driver, driver),
    }


def score_segment(**kwargs):
    """Overall 0-100 risk (see score_breakdown for the separate weather/terrain/hazard parts)."""
    return score_breakdown(**kwargs)["overall"]


def classify_risk_level(score):
    if score >= config.THRESHOLD_SEVERE:
        return "severe"
    if score >= config.THRESHOLD_HIGH:
        return "high"
    if score >= config.THRESHOLD_MODERATE:
        return "moderate"
    return "low"
