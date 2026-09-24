"""
Rule-based risk-scoring model (rule_v1).

This is intentionally transparent/explainable rather than a black-box
ML model -- easy to defend in front of judges, and easy to swap for
a trained scikit-learn model later (see train_ml_model_stub below)
without touching the rest of the pipeline: just change what
score_segment() returns.
"""
import config

MODEL_VERSION = "rule_v1"


def _normalize(value, max_expected):
    """Scales a raw value to 0-100, capped at 100."""
    if max_expected <= 0:
        return 0
    return min(100, (value / max_expected) * 100)


def score_segment(rainfall_24h_mm, rainfall_72h_mm, avg_slope_deg, seasonal_restriction):
    """
    Combines rainfall, terrain slope, and known seasonal constraints
    into a single 0-100 risk score using weighted normalization.

    Reasoning:
    - Rainfall in the last 24h matters most (immediate landslide/flood trigger).
    - 72h cumulative rainfall captures saturated-soil risk (ground already
      holding water is far more prone to slides from additional rain).
    - Steeper average slope = structurally higher baseline risk.
    - A known seasonal restriction (e.g. "impassable in monsoon") adds
      a flat risk bump, since it reflects real historical incident patterns
      even before this run's weather data is factored in.
    """
    # Normalize each factor to a 0-100 sub-score.
    # Max-expected values are rough calibration points for NER terrain --
    # tune these against real incident data as it becomes available.
    # PostgreSQL NUMERIC columns come back as Decimal, not float --
    # cast explicitly so arithmetic below doesn't break.
    rainfall_24h_mm = float(rainfall_24h_mm or 0)
    rainfall_72h_mm = float(rainfall_72h_mm or 0)
    avg_slope_deg = float(avg_slope_deg or 0)

    rain24_score = _normalize(rainfall_24h_mm, max_expected=80)     # 80mm/24h = very heavy
    rain72_score = _normalize(rainfall_72h_mm, max_expected=150)    # 150mm/72h = saturated soil
    slope_score = _normalize(avg_slope_deg, max_expected=35)        # 35 degrees = steep NER terrain
    seasonal_score = 100 if seasonal_restriction else 0

    weighted = (
        rain24_score * config.WEIGHT_RAINFALL_24H
        + rain72_score * config.WEIGHT_RAINFALL_72H
        + slope_score * config.WEIGHT_SLOPE
        + seasonal_score * config.WEIGHT_SEASONAL_FLAG
    )

    return round(min(100, weighted), 1)


def classify_risk_level(score):
    if score >= config.THRESHOLD_SEVERE:
        return "severe"
    elif score >= config.THRESHOLD_HIGH:
        return "high"
    elif score >= config.THRESHOLD_MODERATE:
        return "moderate"
    return "low"


# ------------------------------------------------------------------
# ROADMAP STUB (not run by default): once real incident history
# accumulates in risk_scores + field_reports, replace score_segment()
# with a trained model, e.g.:
#
#   from sklearn.ensemble import RandomForestRegressor
#   model = RandomForestRegressor()
#   model.fit(X_train, y_train)  # X = [rain24, rain72, slope, ...], y = incident occurred
#   score = model.predict([[rain24, rain72, slope, ...]])[0] * 100
#
# Everything else in this pipeline (db writes, alerts) stays unchanged.
# ------------------------------------------------------------------
