"""Compute route-aware forecast risk for a planned trip."""
import concurrent.futures
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

    # A multi-segment route commonly spans several weather grid cells, and
    # forecast_for_window() used to fetch each one lazily, in turn, inside
    # the scoring loop below -- meaning a 5-segment route touching 4
    # distinct cells made 4 sequential blocking HTTP calls to Open-Meteo.
    # On a serverless function with a hard execution time limit, that's
    # the difference between finishing in ~1s and getting killed by the
    # platform mid-request (which surfaces to the user as a silent
    # "Live forecast unavailable"). Fetching every distinct cell up front,
    # in parallel, bounds the wait to roughly the slowest single call
    # instead of the sum of all of them.
    cells_needed = {forecast_service._cell(row["lat"], row["lon"]) for row in rows}
    if cells_needed:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, len(cells_needed))) as pool:
            future_to_cell = {pool.submit(forecast_service._fetch, *cell): cell for cell in cells_needed}
            for future in concurrent.futures.as_completed(future_to_cell):
                cell = future_to_cell[future]
                try:
                    cache[cell] = future.result()
                except forecast_service.ForecastUnavailable:
                    # Leave it out of the cache -- forecast_for_window will
                    # hit the same failure again for any segment needing
                    # this cell, which is the existing/expected behavior.
                    pass

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
