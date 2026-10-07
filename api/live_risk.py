"""Refresh the stored per-segment risk scores from LIVE weather.

The map, /segments and the safest-route graph read the latest row of
risk_scores. Previously that table was filled by a separate script whose
weather inputs were silently ignored by the model, so scores never reflected
real weather. This module scores every segment "as of now" with the same
multi-source forecast + model used for trip planning.

Serverless hosts can't run a background loop, so call it on a schedule via
POST /admin/refresh-risk (see .github/workflows/refresh-risk.yml).
"""
from datetime import datetime, timedelta, timezone
import config
import db
import forecast_service
import risk_model


def refresh(limit=250, offset=0, prune=True):
    ids, total = db.fetch_segment_ids_page(limit, offset)
    rows = db.fetch_segment_midpoints(ids)
    now = datetime.now(timezone.utc)
    cache = {}
    forecast_service.prefetch({forecast_service._cell(r["lat"], r["lon"]) for r in rows}, cache)

    inserts, fire, clear, skipped = [], [], [], 0
    for row in rows:
        try:
            w = forecast_service.forecast_for_window(row["lat"], row["lon"], now, now + timedelta(minutes=30), cache)
        except forecast_service.ForecastUnavailable:
            skipped += 1          # keep the previous score rather than writing a fake one
            continue
        score = risk_model.score_segment(
            **w,
            avg_slope_deg=row["avg_slope_deg"], seasonal_restriction=row["seasonal_restriction"],
            has_bridge=row["has_bridge"], active_alerts=row["active_alerts"],
            active_hazard_reports=row["active_hazard_reports"],
            verified_hazard_reports=row["verified_hazard_reports"], status=row["status"],
        )
        level = risk_model.classify_risk_level(score)
        inserts.append((row["id"], score, w["past_24h_mm"], w["past_72h_mm"], level, risk_model.MODEL_VERSION))
        if score >= config.THRESHOLD_HIGH:
            fire.append((row["id"], "critical" if level == "severe" else "warning",
                         f"{row['name']} flagged {level} risk (score {score}): "
                         f"{w['forecast_rain_1h_mm']} mm/h now, {w['past_24h_mm']} mm in last 24 h."))
        else:
            clear.append(row["id"])

    db.insert_risk_scores_bulk(inserts)
    alerts_created = db.sync_model_alerts(fire, clear)
    if prune and offset == 0:
        db.prune_old_risk_scores(config.RISK_SCORE_RETENTION_DAYS)
    nxt = offset + limit
    return {
        "scored": len(inserts), "skipped_no_weather": skipped, "alerts_created": alerts_created,
        "weather_cells": len(cache), "total_segments": total,
        "next_offset": nxt if nxt < total else None,
        "model_version": risk_model.MODEL_VERSION, "at": now.isoformat(),
    }
