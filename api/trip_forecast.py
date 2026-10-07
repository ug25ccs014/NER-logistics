"""Route-aware live forecast risk + an auto-generated weather report for a trip."""
import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import db
import forecast_service
import risk_model

IST = ZoneInfo("Asia/Kolkata")
# Hours after the requested departure that we also score, to suggest a better time to leave.
DEPARTURE_OFFSETS_H = (0, 1, 2, 3, 4, 6, 8, 10, 12, 18, 24)


def _evaluate(rows, depart_at_utc, journey_minutes, cache):
    """Score every segment at its own ETA. Pure local computation once `cache` is filled."""
    total = max(1, int(journey_minutes or 60))
    count = max(1, len(rows))
    features = []
    for idx, row in enumerate(rows):
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
        props = {
            "id": row["id"], "name": row["name"], "corridor": row["corridor"],
            "status": row["status"], "has_bridge": row["has_bridge"],
            "seasonal_restriction": row["seasonal_restriction"],
            "avg_slope_deg": float(row["avg_slope_deg"]) if row["avg_slope_deg"] is not None else None,
            "risk_score": score, "risk_level": risk_model.classify_risk_level(score),
            **weather,
            "active_alerts": row["active_alerts"],
            "active_hazard_reports": row["active_hazard_reports"],
            "verified_hazard_reports": row["verified_hazard_reports"],
            "forecast_arrival": seg_start.astimezone(timezone.utc).isoformat(),
            "risk_source": f"{weather['weather_model']} + terrain + live incidents",
            "model_version": risk_model.MODEL_VERSION,
        }
        features.append({
            "type": "Feature",
            "geometry": json.loads(row["geometry"]) if row.get("geometry") else None,
            "properties": props,
        })
    return features


def _fmt_ist(dt):
    return dt.astimezone(IST).strftime("%a %d %b, %I:%M %p IST").replace(" 0", " ")


def _departure_options(rows, depart_at_utc, journey_minutes, cache):
    now = datetime.now(timezone.utc)
    horizon = forecast_service.max_forecastable_at()
    options = []
    for h in DEPARTURE_OFFSETS_H:
        t = depart_at_utc + timedelta(hours=h)
        if t > horizon:
            break
        try:
            feats = _evaluate(rows, max(t, now), journey_minutes, cache)
        except forecast_service.ForecastUnavailable:
            continue
        scores = [f["properties"]["risk_score"] for f in feats]
        if not scores:
            continue
        s = max(scores)
        options.append({"depart_at": t.isoformat(), "depart_label": _fmt_ist(t),
                        "score": round(s, 1), "level": risk_model.classify_risk_level(s)})
    return options


def build_report(props_list, depart_at_utc, journey_minutes, options):
    """Plain-language weather report generated from the live forecast (no paid AI needed)."""
    if not props_list:
        return None
    worst = max(props_list, key=lambda p: p["risk_score"])
    score, level = worst["risk_score"], worst["risk_level"]
    heavy = [p for p in props_list if p["forecast_rain_1h_mm"] >= 5]
    rainy = [p for p in props_list if p["forecast_rain_1h_mm"] >= 0.5 or p["rain_probability_pct"] >= 60]
    storms = [p for p in props_list if p["thunderstorm_expected"]]
    gusty = [p for p in props_list if p["forecast_gust_kmh"] >= 50]
    foggy = [p for p in props_list if 0 < p["forecast_visibility_m"] < 3000]
    steep_wet = [p for p in props_list if (p.get("avg_slope_deg") or 0) >= 15 and (p["forecast_to_departure_mm"] + p["past_24h_mm"]) >= 10]
    incidents = sum(p["active_hazard_reports"] + p["verified_hazard_reports"] for p in props_list)

    peak = max(props_list, key=lambda p: p["forecast_rain_1h_mm"])
    max_gust = max(p["forecast_gust_kmh"] for p in props_list)
    min_vis = min((p["forecast_visibility_m"] for p in props_list if p["forecast_visibility_m"]), default=10000)
    max_trip_rain = max(p["forecast_during_trip_mm"] for p in props_list)
    past24 = max(p["past_24h_mm"] for p in props_list)

    # ---- headline
    drivers = []
    if storms: drivers.append("thunderstorms")
    if heavy: drivers.append("heavy rain")
    elif rainy: drivers.append("rain")
    if gusty: drivers.append("strong winds")
    if foggy: drivers.append("low visibility")
    if incidents: drivers.append("reported road hazards")
    why = (" from " + ", ".join(drivers)) if drivers else ""
    headline = {
        "low": "Conditions look good for this trip",
        "moderate": f"Moderate risk expected{why}",
        "high": f"High risk expected{why}",
        "severe": f"Severe risk expected{why}",
    }.get(level, "Forecast ready")

    # ---- facts
    facts = [f"Worst section: {worst['name']} (risk {score}/100, {level}) around "
             f"{_fmt_ist(datetime.fromisoformat(worst['forecast_arrival']))}."]
    if peak["forecast_rain_1h_mm"] >= 0.5:
        facts.append(f"Heaviest rain: {peak['forecast_rain_1h_mm']} mm/h near {peak['name']}; "
                     f"up to {round(max_trip_rain, 1)} mm falls during the drive.")
    else:
        facts.append("No significant rain is forecast at your estimated arrival times.")
    if past24 >= 10:
        facts.append(f"Up to {round(past24)} mm of rain fell in the last 24 h, so slopes and road edges may still be saturated.")
    if storms: facts.append(f"Thunderstorm signal on {len(storms)} of {len(props_list)} sections.")
    if max_gust >= 40: facts.append(f"Wind gusts up to {round(max_gust)} km/h.")
    if min_vis < 5000: facts.append(f"Visibility may drop to {min_vis / 1000:.1f} km.")
    if incidents: facts.append(f"{incidents} active/verified hazard report(s) on the route.")

    # ---- advice
    advice = []
    if level in ("high", "severe"):
        advice.append("Avoid this departure time if the load is not urgent; check the better-time suggestions below.")
    if heavy or storms:
        advice.append("Slow down, increase following distance, and do not cross flooded or flowing-water stretches.")
    if steep_wet or incidents:
        advice.append("Stay alert for landslides and falling debris on steep sections; avoid stopping below slopes.")
    if foggy: advice.append("Use low-beam/fog lights and reduce speed in low visibility.")
    if gusty: advice.append("High-sided vehicles: expect strong crosswinds on exposed stretches.")
    if level == "low" and not advice:
        advice.append("Drive normally, and re-check before leaving as forecasts update through the day.")
    advice.append("Re-check just before you leave; this report refreshes with live forecasts.")

    # ---- confidence
    agreements = [p["source_agreement"] for p in props_list]
    sources = sorted({s for p in props_list for s in p["sources"]})
    if "low" in agreements:
        confidence = "low"
        conf_note = "Weather sources disagree on rainfall for part of this route; treat timing as uncertain."
    elif all(a == "single_source" for a in agreements):
        confidence = "medium"
        conf_note = "Only one weather source was reachable, so there was no cross-check."
    elif "medium" in agreements:
        confidence = "medium"
        conf_note = "Weather sources broadly agree, with some difference in rainfall amounts."
    else:
        confidence = "high"
        conf_note = "Independent weather sources agree."
    stale = max(p["data_age_min"] for p in props_list)

    # ---- departure suggestion
    suggestion = None
    if options:
        current = options[0]
        best = min(options, key=lambda o: (o["score"], o["depart_at"]))
        if best["depart_at"] != current["depart_at"] and current["score"] - best["score"] >= 8 \
                and current["level"] in ("moderate", "high", "severe"):
            suggestion = (f"Leaving at {best['depart_label']} lowers expected risk from "
                          f"{current['score']} to {best['score']} ({best['level']}).")
        elif current["level"] in ("low",):
            suggestion = "Your chosen time is among the safest in the next 24 hours." \
                if current["score"] <= best["score"] + 3 else None

    return {
        "headline": headline, "level": level, "score": score,
        "facts": facts, "advice": advice,
        "confidence": confidence, "confidence_note": conf_note,
        "sources": sources, "data_age_min": stale,
        "departure_options": options, "departure_suggestion": suggestion,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def compute_forecast_segments(depart_at_utc: datetime, segment_ids: list, journey_minutes: int = 60) -> dict:
    rows = db.fetch_segment_midpoints(segment_ids)
    cache = {}
    # One batched, cached, parallel fetch for every grid cell on the route.
    forecast_service.prefetch({forecast_service._cell(r["lat"], r["lon"]) for r in rows}, cache)

    features = _evaluate(rows, depart_at_utc, journey_minutes, cache)
    scored = [f["properties"] for f in features]
    max_score = max((float(x["risk_score"]) for x in scored), default=None)
    max_level = risk_model.classify_risk_level(max_score) if max_score is not None else None

    options = _departure_options(rows, depart_at_utc, journey_minutes, cache) if rows else []
    report = build_report(scored, depart_at_utc, journey_minutes, options)
    weather_model = scored[0]["weather_model"] if scored else None

    return {
        "type": "FeatureCollection",
        "features": features,
        "forecast_for": depart_at_utc.astimezone(timezone.utc).isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "weather_api_calls_made": len(cache),
        "model_version": risk_model.MODEL_VERSION,
        "route_risk": {"score": round(max_score, 1) if max_score is not None else None, "level": max_level},
        "weather_source": ", ".join(report["sources"]) if report else None,
        "weather_model": weather_model,
        "forecast_method": "Each monitored segment is scored at its estimated arrival time from a multi-source hourly forecast, "
                           "plus recent rainfall (wet ground), terrain and live field incidents.",
        "report": report,
    }
