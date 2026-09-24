import psycopg2
import psycopg2.extras
import uuid
import config


def get_connection():
    return psycopg2.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        dbname=config.DB_NAME,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
    )


def fetch_field_reports(limit=50, include_resolved=False):
    query = f"""
        SELECT
            fr.id, fr.report_type, fr.description, fr.photo_url,
            ST_Y(fr.location) AS lat, ST_X(fr.location) AS lon,
            fr.confidence_score, fr.corroborated_by, fr.verified,
            fr.captured_at, fr.resolved_at, fr.segment_id, rs.name AS segment_name,
            r.name AS reporter_name, r.role AS reporter_role
        FROM field_reports fr
        LEFT JOIN road_segments rs ON rs.id = fr.segment_id
        LEFT JOIN reporters r ON r.id = fr.reporter_id
        {"" if include_resolved else "WHERE fr.resolved_at IS NULL"}
        ORDER BY fr.captured_at DESC
        LIMIT %s;
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, (limit,))
            rows = cur.fetchall()
    finally:
        conn.close()

    return [
        {
            "id": str(row["id"]),
            "report_type": row["report_type"],
            "description": row["description"],
            "photo_url": row["photo_url"],
            "lat": float(row["lat"]),
            "lon": float(row["lon"]),
            "confidence_score": float(row["confidence_score"]) if row["confidence_score"] is not None else None,
            "corroborated_by": row["corroborated_by"],
            "verified": row["verified"],
            "captured_at": row["captured_at"].isoformat() if row["captured_at"] else None,
            "resolved_at": row["resolved_at"].isoformat() if row["resolved_at"] else None,
            "segment_id": row["segment_id"],
            "segment_name": row["segment_name"],
            "reporter_name": row["reporter_name"],
            "reporter_role": row["reporter_role"],
        }
        for row in rows
    ]


def get_account_by_phone(phone):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, full_name, phone, password_hash, role FROM accounts WHERE phone = %s;",
                (phone,),
            )
            return cur.fetchone()
    finally:
        conn.close()


def create_account(full_name, phone, password_hash, role):
    """Raises psycopg2.errors.UniqueViolation if phone is already taken
    -- callers should check get_account_by_phone first to return a
    clean 409 instead of a raw DB error, but this is the actual
    integrity guarantee."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO accounts (full_name, phone, password_hash, role)
                VALUES (%s, %s, %s, %s)
                RETURNING id;
                """,
                (full_name, phone, password_hash, role),
            )
            new_id = cur.fetchone()[0]
        conn.commit()
        return new_id
    finally:
        conn.close()


def touch_account_login(account_id):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE accounts SET last_login_at = now() WHERE id = %s;", (account_id,))
        conn.commit()
    finally:
        conn.close()


def _get_or_create_reporter(cur, name, role):
    cur.execute(
        "INSERT INTO reporters (name, role) VALUES (%s, %s) RETURNING id, trust_score, role;",
        (name or "Anonymous", role),
    )
    return cur.fetchone()


def create_field_report(lat, lon, report_type, description, reporter_name, reporter_role="citizen",
                         report_id=None, captured_at=None, photo_url=None):
    """report_id/captured_at let a client that captured this offline (no
    signal) generate its own id + timestamp up front, then sync later --
    ON CONFLICT DO NOTHING below means re-sending the same id after a
    dropped connection or app restart is a safe no-op, not a duplicate
    report."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # If this id already exists (a retried offline sync), don't
            # re-run reporter/corroboration/insert logic at all.
            if report_id:
                cur.execute("SELECT id FROM field_reports WHERE id = %s;", (report_id,))
                if cur.fetchone():
                    return report_id

            reporter = _get_or_create_reporter(cur, reporter_name, reporter_role)

            # Nearest road segment, if one exists within a reasonable radius
            # (20km) -- otherwise leave it unattached rather than falsely
            # tagging a report to a road it isn't actually on.
            cur.execute(
                """
                SELECT id, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography) AS dist_m
                FROM road_segments
                ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                LIMIT 1;
                """,
                (lon, lat, lon, lat),
            )
            nearest = cur.fetchone()
            segment_id = nearest["id"] if nearest and nearest["dist_m"] is not None and nearest["dist_m"] <= 20000 else None

            # Basic corroboration: other reports of the same type, within
            # 5km, in the last 24h. More corroborating reports -> higher
            # confidence and eventually auto-verified.
            cur.execute(
                """
                SELECT id FROM field_reports
                WHERE report_type = %s
                  AND captured_at >= now() - interval '24 hours'
                  AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 5000);
                """,
                (report_type, lon, lat),
            )
            corroborating_ids = [row["id"] for row in cur.fetchall()]

            confidence = min(100, float(reporter["trust_score"]) + len(corroborating_ids) * 15)
            verified = len(corroborating_ids) >= 2 or reporter["role"] in ("field_official", "local_authority")

            new_id = report_id or str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO field_reports
                    (id, segment_id, reporter_id, report_type, description, photo_url, location,
                     confidence_score, corroborated_by, captured_at, verified)
                VALUES (%s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                        %s, %s, COALESCE(%s, now()), %s)
                ON CONFLICT (id) DO NOTHING;
                """,
                (new_id, segment_id, reporter["id"], report_type, description, photo_url,
                 lon, lat, confidence, len(corroborating_ids), captured_at, verified),
            )

            if corroborating_ids:
                cur.execute(
                    "UPDATE field_reports SET corroborated_by = corroborated_by + 1 WHERE id = ANY(%s);",
                    (corroborating_ids,),
                )

        conn.commit()
        return new_id
    finally:
        conn.close()


def upsert_driver_location(session_id, driver_name, phone, role, lat, lon, status):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO driver_locations (session_id, driver_name, phone, role, location, status, last_updated)
                VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s, now())
                ON CONFLICT (session_id) DO UPDATE SET
                    driver_name = EXCLUDED.driver_name,
                    phone = EXCLUDED.phone,
                    role = EXCLUDED.role,
                    location = EXCLUDED.location,
                    status = EXCLUDED.status,
                    last_updated = now();
                """,
                (session_id, driver_name, phone, role, lon, lat, status),
            )
        conn.commit()
    finally:
        conn.close()


def remove_driver_location(session_id):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM driver_locations WHERE session_id = %s;", (session_id,))
        conn.commit()
    finally:
        conn.close()


def fetch_nearby_drivers(lat, lon, exclude_session_id, radius_km=15, max_age_minutes=15):
    """Other drivers/field officers who have shared their location
    recently (within max_age_minutes) and are within radius_km --
    real live positions, not a history log; a driver's row is
    overwritten (not appended) on every location update."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT session_id, driver_name, phone, role, status,
                       ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lon,
                       ST_Distance(location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography) / 1000.0 AS distance_km,
                       last_updated
                FROM driver_locations
                WHERE session_id != %s
                  AND last_updated >= now() - (%s || ' minutes')::interval
                  AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s * 1000)
                ORDER BY distance_km ASC
                LIMIT 20;
                """,
                (lon, lat, exclude_session_id, max_age_minutes, lon, lat, radius_km),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    return [
        {
            "session_id": r["session_id"],
            "driver_name": r["driver_name"],
            "phone": r["phone"],
            "role": r["role"],
            "status": r["status"],
            "lat": float(r["lat"]),
            "lon": float(r["lon"]),
            "distance_km": round(float(r["distance_km"]), 1),
            "last_updated": r["last_updated"].isoformat(),
        }
        for r in rows
    ]


def fetch_segments_geojson():
    """
    Returns every road segment as a GeoJSON FeatureCollection, with
    risk level/score baked into each feature's properties -- this is
    the single call the dashboard map needs to draw every road,
    color-coded by risk.
    """
    query = """
        SELECT
            rs.id,
            rs.name,
            rs.corridor,
            rs.status,
            rs.has_bridge,
            rs.seasonal_restriction,
            rs.avg_slope_deg,
            latest_risk.risk_score,
            latest_risk.risk_level,
            latest_risk.rainfall_24h_mm,
            latest_risk.rainfall_72h_mm,
            latest_risk.computed_at AS risk_computed_at,
            (SELECT COUNT(*) FROM alerts a WHERE a.segment_id = rs.id AND a.resolved_at IS NULL) AS active_alerts,
            ST_AsGeoJSON(rs.geom) AS geometry
        FROM road_segments rs
        LEFT JOIN LATERAL (
            SELECT risk_score, risk_level, rainfall_24h_mm, rainfall_72h_mm, computed_at
            FROM risk_scores
            WHERE segment_id = rs.id
            ORDER BY computed_at DESC
            LIMIT 1
        ) latest_risk ON TRUE;
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            rows = cur.fetchall()
    finally:
        conn.close()

    import json
    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "geometry": json.loads(row["geometry"]),
            "properties": {
                "id": row["id"],
                "name": row["name"],
                "corridor": row["corridor"],
                "status": row["status"],
                "has_bridge": row["has_bridge"],
                "seasonal_restriction": row["seasonal_restriction"],
                "avg_slope_deg": float(row["avg_slope_deg"]) if row["avg_slope_deg"] is not None else None,
                "risk_score": float(row["risk_score"]) if row["risk_score"] is not None else None,
                "risk_level": row["risk_level"],  # null = never scored yet, not "low"
                "rainfall_24h_mm": float(row["rainfall_24h_mm"]) if row["rainfall_24h_mm"] is not None else None,
                "rainfall_72h_mm": float(row["rainfall_72h_mm"]) if row["rainfall_72h_mm"] is not None else None,
                "risk_computed_at": row["risk_computed_at"].isoformat() if row["risk_computed_at"] else None,
                "active_alerts": row["active_alerts"],
            }
        })
    return {"type": "FeatureCollection", "features": features}


def fetch_active_alerts():
    query = """
        SELECT a.id, a.segment_id, rs.name AS segment_name, a.alert_type,
               a.severity, a.message, a.created_at
        FROM alerts a
        JOIN road_segments rs ON rs.id = a.segment_id
        WHERE a.resolved_at IS NULL
        ORDER BY a.created_at DESC;
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            return cur.fetchall()
    finally:
        conn.close()


def fetch_segment_midpoints(segment_ids):
    """
    Same road_segments fields the risk model needs, plus each
    segment's midpoint lat/lon (for a weather lookup) and its geometry
    (so the forecast response can stand alone as GeoJSON, same shape
    as fetch_segments_geojson) -- but only for the given ids, since
    this backs an on-demand per-trip forecast, not a full-network scan.
    """
    if not segment_ids:
        return []
    query = """
        SELECT
            id,
            name,
            corridor,
            status,
            has_bridge,
            seasonal_restriction,
            avg_slope_deg,
            ST_Y(ST_LineInterpolatePoint(geom, 0.5)) AS lat,
            ST_X(ST_LineInterpolatePoint(geom, 0.5)) AS lon,
            ST_AsGeoJSON(geom) AS geometry,
            (SELECT COUNT(*) FROM alerts a WHERE a.segment_id = road_segments.id AND a.resolved_at IS NULL) AS active_alerts,
            (SELECT COUNT(*) FROM field_reports fr WHERE fr.segment_id = road_segments.id AND fr.resolved_at IS NULL AND fr.report_type IN ('landslide','flood','road_damage','bridge_damage')) AS active_hazard_reports,
            (SELECT COUNT(*) FROM field_reports fr WHERE fr.segment_id = road_segments.id AND fr.resolved_at IS NULL AND fr.report_type IN ('landslide','flood','road_damage','bridge_damage') AND fr.verified = TRUE) AS verified_hazard_reports
        FROM road_segments
        WHERE id = ANY(%s)
        ORDER BY array_position(%s::integer[], id);
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, (list(segment_ids), list(segment_ids)))
            return cur.fetchall()
    finally:
        conn.close()


def fetch_segment_details():
    query = "SELECT id, name, normal_travel_min, status, corridor FROM road_segments;"
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            return {row["id"]: row for row in cur.fetchall()}
    finally:
        conn.close()


def create_shipment_post(session_id, driver_name, phone, vehicle_reg, origin_text, origin_lat, origin_lon,
                          dest_text, dest_lat, dest_lon, travel_date, travel_time, cargo_type,
                          available_capacity_kg, space_notes):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO shipment_posts
                    (session_id, driver_name, phone, vehicle_reg, origin_text, origin_lat, origin_lon,
                     dest_text, dest_lat, dest_lon, travel_date, travel_time, cargo_type,
                     available_capacity_kg, space_notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (session_id, driver_name, phone, vehicle_reg, origin_text, origin_lat, origin_lon,
                 dest_text, dest_lat, dest_lon, travel_date, travel_time, cargo_type,
                 available_capacity_kg, space_notes),
            )
            new_id = cur.fetchone()["id"]
        conn.commit()
        return new_id
    finally:
        conn.close()


def fetch_shipment_posts(travel_date=None, cargo_type=None, origin_text=None, dest_text=None, include_past=False):
    """Open shipment-board posts, soonest travel date first. Filters
    are optional and additive -- the board defaults to "everything
    open, from today onward" and narrows as the caller supplies
    date/cargo/route filters."""
    clauses = ["status = 'open'"]
    params = []
    if not include_past:
        clauses.append("travel_date >= CURRENT_DATE")
    if travel_date:
        clauses.append("travel_date = %s")
        params.append(travel_date)
    if cargo_type:
        clauses.append("cargo_type = %s")
        params.append(cargo_type)
    if origin_text:
        clauses.append("origin_text ILIKE %s")
        params.append(f"%{origin_text}%")
    if dest_text:
        clauses.append("dest_text ILIKE %s")
        params.append(f"%{dest_text}%")

    query = f"""
        SELECT id, session_id, driver_name, phone, vehicle_reg,
               origin_text, origin_lat, origin_lon, dest_text, dest_lat, dest_lon,
               travel_date, travel_time, cargo_type, available_capacity_kg, space_notes, created_at
        FROM shipment_posts
        WHERE {' AND '.join(clauses)}
        ORDER BY travel_date ASC, created_at DESC
        LIMIT 100;
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
    finally:
        conn.close()

    return [
        {
            "id": row["id"],
            "session_id": row["session_id"],
            "driver_name": row["driver_name"],
            "phone": row["phone"],
            "vehicle_reg": row["vehicle_reg"],
            "origin_text": row["origin_text"],
            "origin_lat": row["origin_lat"],
            "origin_lon": row["origin_lon"],
            "dest_text": row["dest_text"],
            "dest_lat": row["dest_lat"],
            "dest_lon": row["dest_lon"],
            "travel_date": row["travel_date"].isoformat(),
            # HH:MM if the driver gave a departure time, else None -- the
            # frontend falls back to date-only bucketing when this is null.
            "travel_time": row["travel_time"].strftime("%H:%M") if row["travel_time"] else None,
            "cargo_type": row["cargo_type"],
            "available_capacity_kg": row["available_capacity_kg"],
            "space_notes": row["space_notes"],
            "created_at": row["created_at"].isoformat(),
        }
        for row in rows
    ]


def set_shipment_post_status(post_id, status, session_id):
    """Only the posting driver's own session can change their post's
    status (mirrors how driver_locations rows are only ever touched
    by their own session_id)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE shipment_posts SET status = %s WHERE id = %s AND session_id = %s;",
                (status, post_id, session_id),
            )
            updated = cur.rowcount
        conn.commit()
    finally:
        conn.close()
    if updated == 0:
        raise ValueError("Post not found or not owned by this session")


def fetch_connections():
    query = "SELECT segment_a_id, segment_b_id, junction_name FROM segment_connections;"
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            return cur.fetchall()
    finally:
        conn.close()


def create_notification(to_session_id, from_session_id, from_name, from_phone, from_role, message, lat=None, lon=None):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO notifications
                    (to_session_id, from_session_id, from_name, from_phone, from_role, message, lat, lon)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (to_session_id, from_session_id, from_name, from_phone, from_role, message, lat, lon),
            )
            new_id = cur.fetchone()["id"]
        conn.commit()
        return new_id
    finally:
        conn.close()


def fetch_and_clear_notifications(session_id):
    """Returns any pending notifications for this session and marks
    them delivered in the same pass -- a one-shot mailbox (polled by
    the recipient's own client) rather than a persistent inbox."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE notifications
                SET delivered = TRUE
                WHERE to_session_id = %s AND delivered = FALSE
                RETURNING id, from_session_id, from_name, from_phone, from_role, message, lat, lon, created_at;
                """,
                (session_id,),
            )
            rows = cur.fetchall()
        conn.commit()
    finally:
        conn.close()

    return [
        {
            "id": r["id"],
            "from_session_id": r["from_session_id"],
            "from_name": r["from_name"],
            "from_phone": r["from_phone"],
            "from_role": r["from_role"],
            "message": r["message"],
            "lat": r["lat"],
            "lon": r["lon"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


def fetch_district_status():
    """District-wise connectivity rollup for the authority dashboard:
    per district, how many segments are blocked/high-risk, and how
    many active alerts are outstanding. connectivity_status is a
    simple traffic-light summary derived from those counts."""
    query = """
        SELECT
            d.id, d.name, d.state, d.population, d.is_remote,
            COUNT(rs.id) AS total_segments,
            COUNT(*) FILTER (WHERE scs.status = 'blocked') AS blocked_segments,
            COUNT(*) FILTER (WHERE scs.status = 'restricted') AS restricted_segments,
            COUNT(*) FILTER (WHERE scs.risk_level = 'severe') AS severe_risk_segments,
            COUNT(*) FILTER (WHERE scs.risk_level = 'high') AS high_risk_segments,
            COALESCE(SUM(scs.active_alerts), 0) AS active_alerts
        FROM districts d
        LEFT JOIN road_segments rs ON rs.district_id = d.id
        LEFT JOIN segment_current_status scs ON scs.segment_id = rs.id
        GROUP BY d.id, d.name, d.state, d.population, d.is_remote
        ORDER BY d.name;
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            rows = cur.fetchall()
    finally:
        conn.close()

    results = []
    for row in rows:
        if row["blocked_segments"] > 0:
            connectivity_status = "disrupted"
        elif row["severe_risk_segments"] > 0 or row["restricted_segments"] > 0:
            connectivity_status = "at_risk"
        elif row["high_risk_segments"] > 0:
            connectivity_status = "watch"
        else:
            connectivity_status = "normal"
        results.append({
            "id": row["id"],
            "name": row["name"],
            "state": row["state"],
            "population": row["population"],
            "is_remote": row["is_remote"],
            "total_segments": row["total_segments"],
            "blocked_segments": row["blocked_segments"],
            "restricted_segments": row["restricted_segments"],
            "severe_risk_segments": row["severe_risk_segments"],
            "high_risk_segments": row["high_risk_segments"],
            "active_alerts": row["active_alerts"],
            "connectivity_status": connectivity_status,
        })
    return results


def set_field_report_verified(report_id, verified):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE field_reports SET verified = %s WHERE id = %s;",
                (verified, report_id),
            )
            if cur.rowcount == 0:
                raise ValueError("report not found")
        conn.commit()
    finally:
        conn.close()


def resolve_field_report(report_id):
    """Marks a report as handled/cleared (resolved_at = now()) so it
    drops out of the active review queue. Distinct from 'verified',
    which records whether the report was accurate."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE field_reports SET resolved_at = now() WHERE id = %s AND resolved_at IS NULL;",
                (report_id,),
            )
            if cur.rowcount == 0:
                raise ValueError("report not found")
        conn.commit()
    finally:
        conn.close()


def create_alert(segment_id, alert_type, severity, message):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO alerts (segment_id, alert_type, severity, message, source)
                VALUES (%s, %s, %s, %s, 'manual')
                RETURNING id;
                """,
                (segment_id, alert_type, severity, message),
            )
            new_id = cur.fetchone()["id"]
        conn.commit()
        return new_id
    finally:
        conn.close()


def resolve_alert(alert_id):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE alerts SET resolved_at = now() WHERE id = %s AND resolved_at IS NULL;",
                (alert_id,),
            )
            if cur.rowcount == 0:
                raise ValueError("alert not found or already resolved")
        conn.commit()
    finally:
        conn.close()


def fetch_trips(status=None):
    query = """
        SELECT
            t.id, t.cargo_type, t.status, t.started_at, t.eta, t.completed_at,
            v.registration_no, v.vehicle_type, v.driver_phone,
            ST_Y(v.current_location::geometry) AS lat, ST_X(v.current_location::geometry) AS lon,
            v.last_ping_at,
            od.name AS origin_district, dd.name AS dest_district
        FROM trips t
        LEFT JOIN vehicles v ON v.id = t.vehicle_id
        LEFT JOIN districts od ON od.id = t.origin_district_id
        LEFT JOIN districts dd ON dd.id = t.dest_district_id
        WHERE (%s IS NULL OR t.status = %s)
        ORDER BY t.started_at DESC NULLS LAST
        LIMIT 100;
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, (status, status))
            rows = cur.fetchall()
    finally:
        conn.close()

    return [
        {
            "id": row["id"],
            "cargo_type": row["cargo_type"],
            "status": row["status"],
            "started_at": row["started_at"].isoformat() if row["started_at"] else None,
            "eta": row["eta"].isoformat() if row["eta"] else None,
            "completed_at": row["completed_at"].isoformat() if row["completed_at"] else None,
            "registration_no": row["registration_no"],
            "vehicle_type": row["vehicle_type"],
            "driver_phone": row["driver_phone"],
            "lat": float(row["lat"]) if row["lat"] is not None else None,
            "lon": float(row["lon"]) if row["lon"] is not None else None,
            "last_ping_at": row["last_ping_at"].isoformat() if row["last_ping_at"] else None,
            "origin_district": row["origin_district"],
            "dest_district": row["dest_district"],
        }
        for row in rows
    ]


def fetch_segments_with_risk_plain():
    """Same as segment_current_status view, without the geometry -- used for routing."""
    query = "SELECT * FROM segment_current_status;"
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            return cur.fetchall()
    finally:
        conn.close()
    query = """
        SELECT fr.id, fr.segment_id, rs.name AS segment_name, fr.report_type,
               fr.description, fr.confidence_score, fr.verified, fr.captured_at,
               ST_Y(fr.location) AS lat, ST_X(fr.location) AS lon
        FROM field_reports fr
        LEFT JOIN road_segments rs ON rs.id = fr.segment_id
        ORDER BY fr.captured_at DESC
        LIMIT %s;
    """
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, (limit,))
            return cur.fetchall()
    finally:
        conn.close()


# --- Chat (WhatsApp-style direct messages between two sessions --
#     driver <-> field officer <-> authority) ---

def send_chat_message(from_session_id, from_name, from_role, to_session_id, to_name, message):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO chat_messages
                    (from_session_id, from_name, from_role, to_session_id, to_name, message)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, created_at;
                """,
                (from_session_id, from_name, from_role, to_session_id, to_name, message),
            )
            row = cur.fetchone()
        conn.commit()
        return {"id": row["id"], "created_at": row["created_at"].isoformat()}
    finally:
        conn.close()


def fetch_chat_thread(session_id, other_session_id, limit=200):
    """Full back-and-forth between these two sessions, oldest first,
    and marks anything the other side sent to me as read in the same
    call (opening the thread is what "reads" it, same as a phone)."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE chat_messages
                SET read_at = now()
                WHERE to_session_id = %s AND from_session_id = %s AND read_at IS NULL;
                """,
                (session_id, other_session_id),
            )
            cur.execute(
                """
                SELECT id, from_session_id, from_name, from_role,
                       to_session_id, to_name, message, created_at
                FROM chat_messages
                WHERE (from_session_id = %s AND to_session_id = %s)
                   OR (from_session_id = %s AND to_session_id = %s)
                ORDER BY created_at ASC
                LIMIT %s;
                """,
                (session_id, other_session_id, other_session_id, session_id, limit),
            )
            rows = cur.fetchall()
        conn.commit()
    finally:
        conn.close()

    return [
        {
            "id": r["id"],
            "from_session_id": r["from_session_id"],
            "from_name": r["from_name"],
            "from_role": r["from_role"],
            "to_session_id": r["to_session_id"],
            "to_name": r["to_name"],
            "message": r["message"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


def fetch_chat_inbox(session_id):
    """One row per conversation partner (like a WhatsApp chat list):
    the other party's best-known name/role, their last message, and
    how many of their messages to me are still unread. Built in
    Python rather than one big window-function query -- this table
    is small enough per session that it isn't worth the SQL."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT from_session_id, from_name, from_role,
                       to_session_id, to_name, message, created_at, read_at
                FROM chat_messages
                WHERE from_session_id = %s OR to_session_id = %s
                ORDER BY created_at ASC;
                """,
                (session_id, session_id),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    convos = {}
    for r in rows:
        outgoing = r["from_session_id"] == session_id
        other_id = r["to_session_id"] if outgoing else r["from_session_id"]
        convo = convos.setdefault(other_id, {
            "other_session_id": other_id,
            "other_name": None,
            "other_role": None,
            "last_message": None,
            "last_message_at": None,
            "unread_count": 0,
        })
        # Prefer the other party's own self-reported name/role (from
        # a message *they* sent) over whatever I happened to call
        # them when I sent to them.
        if not outgoing:
            convo["other_name"] = r["from_name"] or convo["other_name"]
            convo["other_role"] = r["from_role"] or convo["other_role"]
        elif not convo["other_name"]:
            convo["other_name"] = r["to_name"]
        convo["last_message"] = r["message"]
        convo["last_message_at"] = r["created_at"].isoformat() if r["created_at"] else None
        if not outgoing and r["read_at"] is None:
            convo["unread_count"] += 1

    return sorted(convos.values(), key=lambda c: c["last_message_at"] or "", reverse=True)

VALID_AI_REPORT_TYPES = {'landslide','flood','road_damage','bridge_damage','clear'}


# --- AI live dashcam -------------------------------------------------

def register_ai_session(session_id, account_id, role):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ai_sessions (session_id, account_id, role, last_seen_at)
                VALUES (%s, %s, %s, now())
                ON CONFLICT (session_id)
                DO UPDATE SET account_id = EXCLUDED.account_id,
                              role = EXCLUDED.role,
                              last_seen_at = now();
                """,
                (session_id, account_id, role),
            )
        conn.commit()
    finally:
        conn.close()


def touch_ai_session(session_id):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE ai_sessions SET last_seen_at = now() WHERE session_id = %s;", (session_id,))
        conn.commit()
    finally:
        conn.close()


def fetch_ai_sessions_for_roles(roles, exclude_session_id=None, max_age_minutes=5):
    if not roles:
        return []
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if exclude_session_id:
                cur.execute(
                    """
                    SELECT session_id, account_id, role
                    FROM ai_sessions
                    WHERE role = ANY(%s)
                      AND session_id <> %s
                      AND last_seen_at >= now() - (%s || ' minutes')::interval;
                    """,
                    (list(roles), exclude_session_id, max_age_minutes),
                )
            else:
                cur.execute(
                    """
                    SELECT session_id, account_id, role
                    FROM ai_sessions
                    WHERE role = ANY(%s)
                      AND last_seen_at >= now() - (%s || ' minutes')::interval;
                    """,
                    (list(roles), max_age_minutes),
                )
            return cur.fetchall()
    finally:
        conn.close()


def find_nearest_segment(conn, lat, lon):
    """Always returns the closest road_segments row + its distance in
    meters (as dist_m), or None only if road_segments is completely
    empty. Does NOT apply the 20km "close enough to alert on" cutoff
    itself -- callers (see main.py's _process_ai_frame) decide that,
    so the actual distance is visible for diagnosis even when it's
    too far to use, instead of silently collapsing "180km away" and
    "21km away" into the same None."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, name,
                   ST_Distance(
                       geom::geography,
                       ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
                   ) AS dist_m
            FROM road_segments
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326)
            LIMIT 1;
            """,
            (lon, lat, lon, lat),
        )
        row = cur.fetchone()
    if not row or row["dist_m"] is None:
        return None
    return row


def latest_segment_risk(conn, segment_id):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT risk_score
            FROM risk_scores
            WHERE segment_id = %s
            ORDER BY computed_at DESC
            LIMIT 1;
            """,
            (segment_id,),
        )
        row = cur.fetchone()
    return float(row["risk_score"]) if row and row["risk_score"] is not None else 0.0


def count_recent_ai_detections(conn, session_id, segment_id, detection_type, seconds=30):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*)
            FROM ai_detections
            WHERE session_id = %s
              AND segment_id = %s
              AND detection_type = %s
              AND detected_at >= now() - (%s || ' seconds')::interval;
            """,
            (session_id, segment_id, detection_type, seconds),
        )
        return int(cur.fetchone()[0])


def max_recent_ai_alert_risk(conn, segment_id, detection_type, cooldown_seconds):
    """Highest risk_score among this segment+hazard's alerted detections in
    the cooldown window, or 0.0 if none. This is what lets a WORSENING
    situation (e.g. risk climbing from 40 to 85 within the same cooldown
    window) still fire the higher-tier alert instead of being silently
    suppressed by the earlier, lower-tier alert's cooldown -- see
    _process_ai_frame's tier-rank comparison in main.py, which is the
    actual fix for "escalation gets swallowed"."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT MAX(risk_score)
            FROM ai_detections
            WHERE segment_id = %s
              AND detection_type = %s
              AND alert_id IS NOT NULL
              AND detected_at >= now() - (%s || ' seconds')::interval;
            """,
            (segment_id, detection_type, cooldown_seconds),
        )
        row = cur.fetchone()
        return float(row[0]) if row and row[0] is not None else 0.0


def create_ai_detection_event(
    *,
    detection_id,
    session_id,
    segment_id,
    detection_type,
    confidence,
    hazard_score,
    risk_score,
    model_version,
    provider,
    evidence_url,
    description,
    lat,
    lon,
    create_incident,
    alert_type,
    severity,
    reporter_name,
    reporter_role,
):
    """Persist a detection and, when create_incident is true, atomically
    create the evidence field report and alert. alert_type/severity are
    decided by the caller (main.py) based on which risk tier this
    detection crossed -- 'high_risk'/'warning' for the medium tier,
    'emergency'/'critical' for the high-risk tier -- rather than being
    recomputed here, so there's exactly one place that owns the tier
    thresholds (config.AI_RISK_THRESHOLD / AI_HIGH_RISK_THRESHOLD)."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            alert_id = None
            field_report_id = None

            if create_incident:
                cur.execute(
                    """
                    SELECT id, name FROM road_segments
                    WHERE id = %s;
                    """,
                    (segment_id,),
                )
                seg = cur.fetchone()
                segment_name = seg["name"] if seg else f"segment {segment_id}"

                # AI-generated evidence is treated as a field report with
                # explicit AI attribution; the authority can still verify it.
                reporter = _get_or_create_reporter(
                    cur, reporter_name or "AI Dashcam", reporter_role or "driver"
                )
                field_report_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO field_reports
                        (id, segment_id, reporter_id, report_type, description,
                         photo_url, location, confidence_score, corroborated_by,
                         captured_at, verified)
                    VALUES
                        (%s, %s, %s, %s, %s, %s,
                         ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                         %s, 0, now(), FALSE);
                    """,
                    (
                        field_report_id, segment_id, reporter["id"],
                        detection_type if detection_type in VALID_AI_REPORT_TYPES else "road_damage",
                        description, evidence_url, lon, lat,
                        round(float(confidence) * 100, 2),
                    ),
                )

                cur.execute(
                    """
                    INSERT INTO alerts
                        (segment_id, alert_type, severity, message, source)
                    VALUES (%s, %s, %s, %s, 'ai_dashcam')
                    RETURNING id;
                    """,
                    (
                        segment_id,
                        alert_type,
                        severity,
                        f"AI dashcam detected {detection_type.replace('_', ' ')} on "
                        f"{segment_name}. Risk score {risk_score:.1f}/100 "
                        f"(confidence {float(confidence) * 100:.0f}%).",
                    ),
                )
                alert_id = cur.fetchone()["id"]

            cur.execute(
                """
                INSERT INTO ai_detections
                    (id, session_id, segment_id, detection_type, confidence,
                     hazard_score, risk_score, model_version, provider,
                     evidence_url, description, location, alert_id, field_report_id)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                     ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s);
                """,
                (
                    detection_id, session_id, segment_id, detection_type,
                    confidence, hazard_score, risk_score, model_version,
                    provider, evidence_url, description, lon, lat,
                    alert_id, field_report_id,
                ),
            )
        conn.commit()
        return {"alert_id": alert_id, "field_report_id": field_report_id}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def fetch_recent_ai_detections(limit=50):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT d.id, d.session_id, d.segment_id, rs.name AS segment_name,
                       d.detection_type, d.confidence, d.hazard_score, d.risk_score,
                       d.model_version, d.provider, d.evidence_url, d.description,
                       ST_Y(d.location::geometry) AS lat,
                       ST_X(d.location::geometry) AS lon,
                       d.detected_at, d.alert_id, d.field_report_id
                FROM ai_detections d
                LEFT JOIN road_segments rs ON rs.id = d.segment_id
                ORDER BY d.detected_at DESC
                LIMIT %s;
                """,
                (limit,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return [
        {
            **{k: r[k] for k in (
                "id", "session_id", "segment_id", "segment_name",
                "detection_type", "model_version", "provider",
                "evidence_url", "description", "alert_id", "field_report_id"
            )},
            "confidence": float(r["confidence"]),
            "hazard_score": float(r["hazard_score"]),
            "risk_score": float(r["risk_score"]),
            "lat": float(r["lat"]),
            "lon": float(r["lon"]),
            "detected_at": r["detected_at"].isoformat(),
        }
        for r in rows
    ]
