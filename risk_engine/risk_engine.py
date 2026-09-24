"""
Risk-scoring engine -- main entry point.

For every road segment in the database:
  1. Fetch current rainfall data for its location.
  2. Compute a risk score (rainfall + slope + seasonal factors).
  3. Write the score into risk_scores.
  4. If the score crosses ALERT_THRESHOLD, auto-create an alert
     (and auto-resolve a prior alert if the risk has dropped back down).

Run once:
    python risk_engine.py

Run continuously (re-scores every RUN_INTERVAL_HOURS):
    python risk_engine.py --loop
"""
import sys
import time
import config
import db
import weather
import risk_model


def grid_cell(lat, lon):
    """Rounds a coordinate down to its grid cell key, so multiple
    segments whose midpoints fall in the same cell share one weather
    call instead of each making their own."""
    size = config.WEATHER_GRID_SIZE_DEG
    return (round(lat / size) * size, round(lon / size) * size)


def run_once():
    conn = db.get_connection()
    weather_cache = {}  # grid_cell -> (rainfall_24h, rainfall_72h), reused across segments in the same run
    try:
        segments = db.fetch_all_segments(conn)
        print(f"Scoring {len(segments)} segment(s)...\n")

        for seg in segments:
            # Use the segment's midpoint (average of start/end) for the
            # weather lookup -- good enough at this segment granularity.
            lat = (seg["start_lat"] + seg["end_lat"]) / 2
            lon = (seg["start_lon"] + seg["end_lon"]) / 2

            cell = grid_cell(lat, lon)
            if cell in weather_cache:
                rainfall_24h, rainfall_72h = weather_cache[cell]
            else:
                rainfall_24h, rainfall_72h = weather.get_rainfall_data(lat, lon)
                weather_cache[cell] = (rainfall_24h, rainfall_72h)
                # Only pay the rate-limit delay for an actual fresh API
                # call, not for segments that reuse a cached cell.
                time.sleep(config.WEATHER_RATE_LIMIT_DELAY_SEC)

            score = risk_model.score_segment(
                rainfall_24h_mm=rainfall_24h,
                rainfall_72h_mm=rainfall_72h,
                avg_slope_deg=seg["avg_slope_deg"],
                seasonal_restriction=seg["seasonal_restriction"],
            )
            level = risk_model.classify_risk_level(score)

            db.insert_risk_score(
                conn,
                segment_id=seg["id"],
                risk_score=score,
                rainfall_24h=rainfall_24h,
                rainfall_72h=rainfall_72h,
                risk_level=level,
                model_version=risk_model.MODEL_VERSION,
            )

            print(f"  [{level.upper():8}] {seg['name']:45} score={score:5.1f}  rain24h={rainfall_24h}mm")

            # Alert logic: fire when crossing the threshold, auto-clear when it drops back.
            if score >= config.ALERT_THRESHOLD:
                if not db.has_unresolved_alert(conn, seg["id"], "high_risk"):
                    db.create_alert(
                        conn,
                        segment_id=seg["id"],
                        alert_type="high_risk",
                        severity="critical" if level == "severe" else "warning",
                        message=f"{seg['name']} flagged {level} risk (score {score}) "
                                f"after {rainfall_24h}mm rainfall in 24h.",
                        source="risk_model",
                    )
                    print(f"    -> ALERT created (score {score} >= threshold {config.ALERT_THRESHOLD})")
            else:
                db.resolve_alerts_below_threshold(conn, seg["id"], "high_risk")

        print(f"\nDone. Made {len(weather_cache)} weather API call(s) for {len(segments)} segment(s) "
              f"({len(segments) - len(weather_cache)} reused a cached grid cell).")
    finally:
        conn.close()


def run_loop():
    interval_seconds = config.RUN_INTERVAL_HOURS * 3600
    print(f"Starting risk engine loop -- scoring every {config.RUN_INTERVAL_HOURS}h. Ctrl+C to stop.\n")
    while True:
        run_once()
        print(f"\nSleeping {config.RUN_INTERVAL_HOURS}h until next run...\n")
        time.sleep(interval_seconds)


if __name__ == "__main__":
    if "--loop" in sys.argv:
        run_loop()
    else:
        run_once()
