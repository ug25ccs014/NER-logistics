"""Explainable planned-trip risk model.

The score combines the actual weather forecast at each segment ETA with
terrain/infrastructure vulnerability and live incidents. It is a transparent
rule model, not a trained ML probability.
"""
import config

MODEL_VERSION = "trip_rule_v6_weighted"

# Overall = weighted blend of the three separated sub-scores (each 0-100).
W_WEATHER, W_TERRAIN, W_HAZARD = 0.30, 0.30, 0.40
# Wet weather on steep/fragile ground is worse than either alone.
INTERACTION = 0.35


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
    thunder_probability_pct=None,
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
    # forecast_service.forecast_for_window() also returns display-only fields
    # (temperature, weather code, soil moisture, source labels...). They are
    # swallowed by **_extra_forecast_fields so passing the whole forecast dict
    # in never raises TypeError.

    # ---- 1) WEATHER sub-score (0-100) from the live forecast at this segment's ETA.
    # Each component is 0-100. The score is mostly a weighted blend, but the single
    # worst component also counts, so one serious signal (e.g. a 70% thunder
    # probability) can't be averaged away by a dozen calm ones.
    if thunder_probability_pct is None:
        thunder_probability_pct = 90.0 if thunderstorm_expected else 0.0
    comps = {
        "wet_ground": _norm(float(forecast_to_departure_mm or 0) + 0.7 * float(past_24h_mm or 0)
                            + 0.25 * float(past_72h_mm or 0), 80),
        "trip_rain": _norm(forecast_during_trip_mm, 25),
        "eta_rain": _norm(max(float(forecast_rain_1h_mm or 0), float(forecast_precipitation_1h_mm or 0)), 15),
        "rain_chance": _norm(rain_probability_pct, 100),
        "thunder": _norm(thunder_probability_pct, 100),
        "current_rain": _norm(current_rain_1h_mm, 20),
        "wind": _norm(max(float(forecast_wind_kmh or 0), float(forecast_gust_kmh or 0)), 80),
        "visibility": _visibility_risk(forecast_visibility_m),
    }
    weights = {"wet_ground": .16, "trip_rain": .12, "eta_rain": .16, "rain_chance": .10,
               "thunder": .22, "current_rain": .04, "wind": .12, "visibility": .08}   # sums to 1.0
    blended = sum(comps[k] * w for k, w in weights.items())
    weather_score = min(100.0, 0.75 * blended + 0.25 * max(comps.values()))

    # ---- 2) TERRAIN sub-score (0-100): how vulnerable this stretch is.
    slope = _norm(avg_slope_deg, 35)
    terrain_score = min(100.0, (slope * .22 + (100.0 if seasonal_restriction else 0.0) * .09
                                + (100.0 if has_bridge else 0.0) * .04) / .35)

    # ---- 3) FIELD-HAZARD sub-score (0-100): live reports and alerts. Severity
    # floors live here (not in the overall) so the displayed number is the real one.
    raw_hazard = min(100.0, active_alerts * 20.0 + active_hazard_reports * 20.0 + verified_hazard_reports * 30.0)
    hazard_floor = 0.0
    if status == "blocked":
        hazard_floor = 100.0
    elif verified_hazard_reports > 0:
        hazard_floor = 80.0
    elif active_hazard_reports > 0:
        hazard_floor = 50.0
    elif active_alerts >= 2:
        hazard_floor = 40.0
    hazard_score = max(raw_hazard, hazard_floor)

    # ---- Overall = 30% weather + 30% terrain + 40% field hazards, plus a small
    # weather x terrain interaction. Different inputs now give different scores.
    parts = {"weather": W_WEATHER * weather_score, "terrain": W_TERRAIN * terrain_score,
             "hazards": W_HAZARD * hazard_score}
    overall = sum(parts.values()) + INTERACTION * weather_score * terrain_score / 100.0
    overall = min(100.0, overall)

    # ---- Critical overrides: a real road closure / verified report outranks any forecast.
    override_floor, override_reason = 0.0, None
    if status == "blocked":
        override_floor, override_reason = 95.0, "road blocked"
    elif verified_hazard_reports > 0:
        override_floor, override_reason = 80.0, "verified field hazard"
    if override_floor > overall:
        overall, driver = override_floor, override_reason
    else:
        driver = {"weather": "weather", "terrain": "terrain", "hazards": "field hazards"}[max(parts, key=parts.get)]
    return {
        "overall": round(min(100.0, overall), 1), "weather_score": round(weather_score, 1),
        "terrain_score": round(terrain_score, 1), "hazard_score": round(hazard_score, 1),
        "driver": driver,
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
