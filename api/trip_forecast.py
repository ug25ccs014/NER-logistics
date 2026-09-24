"""Compute route-aware forecast risk for a planned trip."""
import json
from datetime import datetime, timedelta, timezone
import db
import forecast_service
import risk_model


def compute_forecast_segments(depart_at_utc: datetime, segment_ids: list, journey_minutes: int = 60) -> dict:
    rows = db.fetch_segment_midpoints(segment_ids)
    cache = {}
    features = []
    total = max(1, int(journey_minutes or 60))
    count = max(1, len(rows))

    for idx, row in enumerate(rows):
        # The frontend supplies segments in route order. Estimate the ETA at
        # each monitored section rather than evaluating all sections at the
        # departure timestamp.
        offset_min = round(total * idx / count)
        segment_duration = max(5, round(total / count))
        seg_start = depart_at_utc + timedelta(minutes=offset_min)
        seg_end = seg_start + timedelta(minutes=segment_duration)
        weather = forecast_service.forecast_for_window(row["lat"], row["lon"], seg_start, seg_end, cache)

        score = risk_model.score_segment(
            **weather,
            avg_slope_deg=row["avg_slope_deg"],
            seasonal_restriction=row["seasonal_restriction"],
            has_bridge=row["has_bridge"],
            active_alerts=row["active_alerts"],
            active_hazard_reports=row["active_hazard_reports"],
            verified_hazard_reports=row["verified_hazard_reports"],
            status=row["status"],
        )
        level = risk_model.classify_risk_level(score)
        props = {
            "id": row["id"], "name": row["name"], "corridor": row["corridor"],
            "status": row["status"], "has_bridge": row["has_bridge"],
            "seasonal_restriction": row["seasonal_restriction"],
            "avg_slope_deg": float(row["avg_slope_deg"]) if row["avg_slope_deg"] is not None else None,
            "risk_score": score, "risk_level": level,
            **weather,
            "active_alerts": row["active_alerts"],
            "active_hazard_reports": row["active_hazard_reports"],
            "verified_hazard_reports": row["verified_hazard_reports"],
            "forecast_arrival": seg_start.astimezone(timezone.utc).isoformat(),
            "risk_source": "Open-Meteo hourly forecast + terrain + live incidents",
            "model_version": risk_model.MODEL_VERSION,
        }
        features.append({
            "type": "Feature",
            "geometry": json.loads(row["geometry"]) if row["geometry"] else None,
            "properties": props,
        })

    scored = [f["properties"] for f in features]
    max_score = max((float(x["risk_score"]) for x in scored), default=None)
    max_level = risk_model.classify_risk_level(max_score) if max_score is not None else None

    return {
        "type": "FeatureCollection",
        "features": features,
        "forecast_for": depart_at_utc.astimezone(timezone.utc).isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "weather_api_calls_made": len(cache),
        "model_version": risk_model.MODEL_VERSION,
        "route_risk": {"score": round(max_score, 1) if max_score is not None else None, "level": max_level},
        "weather_source": "Open-Meteo Best Match hourly forecast",
        "weather_model": "Open-Meteo Best Match (ECMWF IFS where available)",
        "forecast_method": "Each monitored segment is evaluated at its estimated arrival time; pre-arrival forecast rain is also included for wet-ground risk.",
    }
