"""Explainable planned-trip risk model.

The score combines the actual weather forecast at each segment ETA with
terrain/infrastructure vulnerability and live incidents. It is a transparent
rule model, not a trained ML probability.
"""
import config

MODEL_VERSION = "trip_rule_v3_weather_eta"


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


def score_segment(
    forecast_to_departure_mm=0,
    forecast_during_trip_mm=0,
    forecast_next_6h_mm=0,
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
):
    # Weather: 50 points. The ETA hour is primary; pre-arrival rain matters for
    # saturated/landslide-prone ground, while probability and storms capture
    # forecast uncertainty and acute hazards.
    pre_rain = _norm(forecast_to_departure_mm, 60)
    trip_rain = _norm(forecast_during_trip_mm, 25)
    eta_rain = _norm(forecast_rain_1h_mm or forecast_precipitation_1h_mm, 15)
    pop = _norm(rain_probability_pct, 100)
    thunder = 100.0 if thunderstorm_expected else 0.0
    current = _norm(current_rain_1h_mm, 20)
    wind = _norm(max(float(forecast_wind_kmh or 0), float(forecast_gust_kmh or 0)), 80)
    visibility = _visibility_risk(forecast_visibility_m)

    weather = (
        pre_rain * .12 + trip_rain * .08 + eta_rain * .10 +
        pop * .07 + thunder * .04 + current * .03 + wind * .04 + visibility * .02
    )

    # Terrain/infrastructure: vulnerability changes how dangerous otherwise
    # ordinary weather becomes on steep, seasonal or bridge sections.
    slope = _norm(avg_slope_deg, 35)
    seasonal = 100.0 if seasonal_restriction else 0.0
    bridge = 100.0 if has_bridge else 0.0
    terrain = slope * .22 + seasonal * .09 + bridge * .04

    # Verified/current reports can override a dry forecast.
    incident = min(100.0, active_alerts * 20.0 + active_hazard_reports * 20.0 + verified_hazard_reports * 30.0)
    score = weather + terrain + incident

    if status == "blocked":
        score = max(score, 95.0)
    elif verified_hazard_reports > 0:
        score = max(score, 80.0)
    elif active_hazard_reports > 0:
        score = max(score, 65.0)
    elif active_alerts >= 2:
        score = max(score, 60.0)

    return round(min(100.0, score), 1)


def classify_risk_level(score):
    if score >= config.THRESHOLD_SEVERE:
        return "severe"
    if score >= config.THRESHOLD_HIGH:
        return "high"
    if score >= config.THRESHOLD_MODERATE:
        return "moderate"
    return "low"
