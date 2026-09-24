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


def _grid_cell(lat, lon):
    """
    Rounds a coordinate down to the nearest grid cell, used to group
    nearby segments so they share a single weather API call. See
    config.WEATHER_GRID_SIZE_DEG for the cell size.
    """
    size = config.WEATHER_GRID_SIZE_DEG
    return (round(lat / size) * size, round(lon / size) * size)


def run_once():
    conn = db.get_connection()
    try:
        segments = db.fetch_all_segments(conn)
        print(f"Scoring {len(segments)} segment(s)...\n")

        # Group segments by weather grid cell so segments in the same
        # area share one weather API call instead of one each. This is
        # what makes the engine scale to a full state's road network
        # (thousands of segments) without exhausting the free weather
        # API's rate limit.
        cell_weather_cache = {}

        for seg in segments:
            lat = (seg["start_lat"] + seg["end_lat"]) / 2
            lon = (seg["start_lon"] + seg["end_lon"]) / 2
            cell = _grid_cell(lat, lon)

            if cell not in cell_weather_cache:
                cell_weather_cache[cell] = weather.get_rainfall_data(cell[0], cell[1])
            rainfall_24h, rainfall_72h = cell_weather_cache[cell]

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

            print(f"  [{level.upper():8}] {seg['name'][:45]:45} score={score:5.1f}  rain24h={rainfall_24h}mm")

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

        print(f"\nDone. Used {len(cell_weather_cache)} weather API call(s) for {len(segments)} segment(s).")
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
