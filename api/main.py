"""
NER Logistics Platform -- API service.

Sits between the database and the dashboard (or any future mobile
app). Exposes:
  GET  /segments        -> GeoJSON of every road segment + risk data (for the map)
  GET  /segments/forecast -> same, but risk scored against a forecast for a future depart_at
  GET  /alerts          -> currently active alerts
  GET  /field-reports   -> recent field reports
  GET  /route           -> fastest vs safest route between two segments
  GET  /shipment-board  -> open cargo-sharing posts (merge-a-shipment board)
  POST /shipment-board  -> post an upcoming trip + spare capacity

Run with:
    uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI, HTTPException, Query, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
from datetime import date, time, datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
except ImportError:  # Python <3.9 fallback, shouldn't be hit in practice
    from backports.zoneinfo import ZoneInfo
import base64
import binascii
import os
import uuid
import psycopg2.errors
import jwt as pyjwt
import db
import routing
import accommodations
import i18n
import auth
import config
import ai_service
import forecast_service
import trip_forecast

IST = ZoneInfo("Asia/Kolkata")

VALID_REPORT_TYPES = {"landslide", "flood", "road_damage", "bridge_damage", "congestion", "clear"}

# Where uploaded field-report photos land. Served back out at /uploads/<file>
# via the StaticFiles mount below -- fine for a hackathon demo; swap for
# S3/GCS + a CDN URL before this handles real traffic.
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _save_report_photo(photo_base64: str) -> str:
    """Decode a base64 (optionally data:-URL-prefixed) image and save it.
    Returns the relative URL path to store in field_reports.photo_url."""
    raw = photo_base64.split(",", 1)[1] if photo_base64.startswith("data:") else photo_base64
    try:
        image_bytes = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("photo_base64 is not valid base64 image data")
    filename = f"{uuid.uuid4().hex}.jpg"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(image_bytes)
    return f"/uploads/{filename}"


class FieldReportIn(BaseModel):
    lat: float
    lon: float
    report_type: str
    description: Optional[str] = None
    reporter_name: Optional[str] = None
    reporter_role: Optional[str] = "citizen"
    # Offline-sync support: the client (web or Flutter) generates this UUID
    # and captured_at the moment the report is captured, even with no
    # signal. When connectivity returns, it POSTs the same payload -- the
    # server upserts on this id so a retried sync never creates a duplicate.
    id: Optional[str] = None
    captured_at: Optional[datetime] = None
    # Geo-tagged photo, sent as a base64 string (optionally a data: URL,
    # e.g. what <input type="file"> + FileReader gives you in the browser).
    photo_base64: Optional[str] = None


VALID_DRIVER_ROLES = {"driver", "field_official"}
VALID_DRIVER_STATUSES = {"active", "stuck"}


class DriverLocationIn(BaseModel):
    session_id: str
    driver_name: str
    phone: Optional[str] = None
    role: Optional[str] = "driver"
    lat: float
    lon: float
    status: Optional[str] = "active"


class VerifyReportIn(BaseModel):
    verified: bool


VALID_ALERT_TYPES = {"blocked_road", "high_risk", "delivery_delay", "emergency"}
VALID_ALERT_SEVERITIES = {"info", "warning", "critical"}


class AlertIn(BaseModel):
    segment_id: int
    alert_type: str
    severity: str
    message: str


VALID_CARGO_TYPES = {"medicine", "food", "construction", "agriculture", "general"}
VALID_SHIPMENT_STATUSES = {"merged", "cancelled"}


class ShipmentPostIn(BaseModel):
    session_id: str
    driver_name: str
    phone: Optional[str] = None
    vehicle_reg: Optional[str] = None
    origin_text: str
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    dest_text: str
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None
    travel_date: date
    travel_time: Optional[time] = None  # optional departure time (HH:MM) -- lets urgent matches be scored by hours, not just date
    cargo_type: Optional[str] = "general"
    available_capacity_kg: Optional[int] = None
    space_notes: Optional[str] = None


class ShipmentStatusIn(BaseModel):
    session_id: str
    status: str


class NotifyIn(BaseModel):
    to_session_id: str
    from_session_id: str
    from_name: str
    from_phone: Optional[str] = None
    from_role: Optional[str] = "driver"
    message: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


class ChatSendIn(BaseModel):
    from_session_id: str
    from_name: str
    from_role: Optional[str] = "driver"
    to_session_id: str
    to_name: Optional[str] = None
    message: str


class RegisterIn(BaseModel):
    full_name: str
    phone: str
    password: str
    role: str  # 'driver' | 'field_official' | 'authority'
    # Required (and checked against config.FIELD_OFFICER_PASSKEY /
    # AUTHORITY_PASSKEY) only when role is privileged -- see auth.py.
    passkey: Optional[str] = None


class LoginIn(BaseModel):
    phone: str
    password: str



class AISessionIn(BaseModel):
    session_id: str


class AIDetectionResult(BaseModel):
    hazard: str
    confidence: float
    severity: str
    description: str
    hazard_score: float
    provider: str


class AIFrameIn(BaseModel):
    session_id: str
    lat: float
    lon: float
    captured_at: Optional[datetime] = None
    vehicle_id: Optional[int] = None


_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_account(credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme)) -> dict:
    """FastAPI dependency for routes that require a logged-in account.
    Raises 401 if there's no token, or it's missing/expired/invalid."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        return auth.decode_access_token(credentials.credentials)
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired session -- please log in again")


app = FastAPI(title="NER Logistics Platform API")

# Allows the dashboard (opened as a local HTML file, or served from
# any origin) to call this API from the browser without being blocked.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serves saved field-report photos back out at GET /uploads/<filename>.
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")



AI_EVIDENCE_DIR = os.path.join(UPLOAD_DIR, "ai")
os.makedirs(AI_EVIDENCE_DIR, exist_ok=True)


def _save_ai_frame(image_bytes: bytes) -> str:
    filename = f"ai_{uuid.uuid4().hex}.jpg"
    path = os.path.join(AI_EVIDENCE_DIR, filename)
    with open(path, "wb") as f:
        f.write(image_bytes)
    return f"/uploads/ai/{filename}"


def _risk_from_ai(detection, existing_segment_risk):
    if detection["hazard"] == "none":
        return 0.0
    score = (
        detection["hazard_score"] * 0.55
        + detection["confidence"] * 100.0 * 0.25
        + float(existing_segment_risk) * 0.20
    )
    return round(min(100.0, score), 1)


def _nearest_field_officer(lat, lon, exclude_session_id):
    """Nearest field officer currently sharing live location -- the
    SAME driver_locations proximity lookup (db.fetch_nearby_drivers)
    that powers the manual 'Notify' button on the map popup in
    LiveLocationSos.jsx, which is confirmed working. Returns None if
    no field officer is currently sharing location within
    AI_NEAREST_OFFICER_RADIUS_KM (they have to have pressed "Start
    Sharing" in Live Location & SOS -- being merely logged in isn't
    enough here, since this needs an actual position to measure
    distance from)."""
    nearby = db.fetch_nearby_drivers(
        lat, lon, exclude_session_id,
        radius_km=config.AI_NEAREST_OFFICER_RADIUS_KM,
        max_age_minutes=15,
    )
    for person in nearby:  # fetch_nearby_drivers already orders nearest-first
        if person["role"] == "field_official":
            return person
    return None


def _notify_ai_incident(
    session_id, hazard, risk_score, tier, segment_name, lat, lon, evidence_url
):
    tier_label = "HIGH RISK EMERGENCY" if tier == "emergency" else "MEDIUM RISK ALERT"
    message = (
        f"{tier_label}: AI dashcam detected {hazard.replace('_', ' ')} on "
        f"{segment_name}. Risk {risk_score:.0f}/100. "
        f"Evidence: {evidence_url}"
    )
    # No self-notification to the driver here -- they already see this
    # result live in the dashcam panel itself. Sending them an echoed
    # notification (as we used to) meant clicking "Chat" on their own
    # alert opened a chat with themselves, labeled confusingly as
    # "AI Dashcam". The real targets are whoever ISN'T already looking
    # at this result.
    targets = []

    nearest_officer = _nearest_field_officer(lat, lon, session_id)
    if nearest_officer:
        targets.append({"session_id": nearest_officer["session_id"], "role": "field_official"})

    # Authority has no location to be "nearest" to -- it's district-wide
    # oversight, not a position on the map -- so it stays on the
    # ai_sessions presence heartbeat (App.jsx) instead: broadcast to
    # whichever authority accounts currently have the app open.
    targets.extend(
        {"session_id": r["session_id"], "role": r["role"]}
        for r in db.fetch_ai_sessions_for_roles(["authority"], exclude_session_id=session_id)
    )

    sent = 0
    seen = set()
    for target in targets:
        sid = target["session_id"]
        if not sid or sid in seen:
            continue
        seen.add(sid)
        try:
            db.create_notification(
                to_session_id=sid,
                from_session_id=session_id,
                from_name="AI Dashcam",
                from_phone=None,
                from_role="ai_system",
                message=message,
                lat=lat,
                lon=lon,
            )
            sent += 1
        except Exception:
            # A stale session should never make the detection request fail.
            pass
    return sent


def _tier_rank(risk_score):
    """0 = below any alert threshold, 1 = medium ('high_risk' alert_type),
    2 = severe ('emergency' alert_type). Used to compare a NEW detection's
    tier against the highest tier already alerted recently for the same
    segment+hazard, so escalating past a higher threshold still fires even
    inside the other tier's cooldown window -- see _process_ai_frame."""
    if risk_score >= config.AI_HIGH_RISK_THRESHOLD:
        return 2
    if risk_score >= config.AI_RISK_THRESHOLD:
        return 1
    return 0


_TIER_ALERT_TYPE = {1: "high_risk", 2: "emergency"}
_TIER_SEVERITY = {1: "warning", 2: "critical"}


def _process_ai_frame(image_bytes: bytes, frame: AIFrameIn, current: dict):
    detection = ai_service.detect(image_bytes)
    evidence_url = _save_ai_frame(image_bytes)
    nearest = None
    segment = None
    conn = db.get_connection()
    try:
        # find_nearest_segment no longer applies a distance cutoff itself
        # (see its docstring) -- we apply the "close enough to alert on"
        # cutoff here, but keep `nearest` around regardless so a
        # too-far-away match is still visible in the response instead
        # of looking identical to "no road data exists at all."
        nearest = db.find_nearest_segment(conn, frame.lat, frame.lon)
        segment = nearest if nearest and float(nearest["dist_m"]) <= 20000 else None
        existing_risk = db.latest_segment_risk(conn, segment["id"]) if segment else 0.0
        segment_id = segment["id"] if segment else None
        recent_count = (
            db.count_recent_ai_detections(
                conn,
                frame.session_id,
                segment_id,
                detection["hazard"],
                seconds=30,
            )
            if segment_id and detection["hazard"] != "none"
            else 0
        )
        # Highest risk_score already alerted for this segment+hazard within
        # the cooldown window, used only to decide whether THIS detection
        # represents a genuine escalation (see tier-rank comparison below) --
        # not to blanket-suppress every new alert the way a plain
        # "was there any recent alert?" boolean used to.
        recent_alert_risk = (
            db.max_recent_ai_alert_risk(
                conn,
                segment_id,
                detection["hazard"],
                config.AI_ALERT_COOLDOWN_SEC,
            )
            if segment_id and detection["hazard"] != "none"
            else 0.0
        )
    finally:
        conn.close()

    risk_score = _risk_from_ai(detection, existing_risk)
    required_confirmations = 1 if detection["provider"] == "demo_heuristic" else config.AI_CONFIRMATIONS_REQUIRED
    confirmed = (
        detection["hazard"] != "none"
        and recent_count + 1 >= required_confirmations
    )

    new_rank = _tier_rank(risk_score)
    already_alerted_rank = _tier_rank(recent_alert_risk)
    # Fires when this detection crosses into a tier we haven't already
    # alerted for this segment+hazard recently -- so a first crossing of
    # 35 fires the medium alert, and later climbing past 70 (even a few
    # seconds later, well inside the 180s cooldown) fires the emergency
    # alert too, instead of being swallowed by the earlier alert's cooldown.
    create_incident = bool(segment) and confirmed and new_rank > 0 and new_rank > already_alerted_rank
    tier = "emergency" if new_rank == 2 else "high_risk" if new_rank == 1 else None

    # Every branch that can make create_incident False, spelled out --
    # so "why didn't this alert?" has one place to look instead of
    # needing to re-derive it from risk_score/confirmed/segment_name
    # in the UI. None means an incident WAS created.
    if create_incident:
        suppression_reason = None
    elif not segment:
        suppression_reason = "no_segment"
    elif not confirmed:
        suppression_reason = "not_confirmed"
    elif new_rank == 0:
        suppression_reason = "below_threshold"
    else:
        suppression_reason = "cooldown_same_tier"

    result = db.create_ai_detection_event(
        detection_id=str(uuid.uuid4()),
        session_id=frame.session_id,
        segment_id=segment["id"] if segment else None,
        detection_type=detection["hazard"],
        confidence=detection["confidence"],
        hazard_score=detection["hazard_score"],
        risk_score=risk_score,
        model_version=f"{detection['provider']}_hazard_v1",
        provider=detection["provider"],
        evidence_url=evidence_url,
        description=detection["description"],
        lat=frame.lat,
        lon=frame.lon,
        create_incident=create_incident,
        alert_type=_TIER_ALERT_TYPE.get(new_rank) if create_incident else None,
        severity=_TIER_SEVERITY.get(new_rank) if create_incident else None,
        reporter_name=current.get("name") or "AI Dashcam",
        reporter_role=current.get("role") or "driver",
    )

    notified = 0
    notified_officer = None
    if create_incident:
        notified_officer = _nearest_field_officer(frame.lat, frame.lon, frame.session_id)
        notified = _notify_ai_incident(
            frame.session_id,
            detection["hazard"],
            risk_score,
            tier,
            segment["name"],
            frame.lat,
            frame.lon,
            evidence_url,
        )

    return {
        "hazard": detection["hazard"],
        "confidence": detection["confidence"],
        "severity": detection["severity"],
        "description": detection["description"],
        "hazard_score": detection["hazard_score"],
        "risk_score": risk_score,
        "threshold": config.AI_RISK_THRESHOLD,
        "high_risk_threshold": config.AI_HIGH_RISK_THRESHOLD,
        "tier": tier,
        "confirmed": confirmed,
        "alert_created": bool(result["alert_id"]),
        "alert_id": result["alert_id"],
        "field_report_id": result["field_report_id"],
        # Exactly why no incident was created, when alert_created is
        # false: 'no_segment' (no monitored road within 20km of these
        # coordinates), 'not_confirmed' (needs a 2nd matching detection
        # within 30s unless using the demo_heuristic provider),
        # 'below_threshold' (risk_score hasn't crossed 35), or
        # 'cooldown_same_tier' (this segment+hazard already alerted at
        # this same tier within the last AI_ALERT_COOLDOWN_SEC seconds
        # -- an earlier test run counts too, not just this page session).
        "suppression_reason": suppression_reason,
        "recent_alert_risk": recent_alert_risk,
        # Diagnostic: the closest road_segments row and its distance,
        # even when it's too far away to actually use (segment_name
        # above will be null in that case) -- this is what tells you
        # "340km away" (wrong coordinates / no coverage there) apart
        # from "no road data exists in this DB at all."
        "nearest_segment_name": nearest["name"] if nearest else None,
        "nearest_segment_distance_km": round(float(nearest["dist_m"]) / 1000, 1) if nearest else None,
        "notified": notified,
        # Debug visibility: if this is null after an alert fires, no
        # field officer is currently within AI_NEAREST_OFFICER_RADIUS_KM
        # AND actively sharing live location (Live Location & SOS ->
        # "Start Sharing") -- that's the #1 reason nobody gets notified.
        "notified_officer": (
            {"name": notified_officer["driver_name"], "distance_km": notified_officer["distance_km"]}
            if notified_officer else None
        ),
        "provider": detection["provider"],
        "quality": detection.get("quality", "ok"),
        "inference_ms": detection.get("inference_ms"),
        "box_count": detection.get("box_count"),
        "evidence_url": evidence_url,
        "segment_id": segment["id"] if segment else None,
        "segment_name": segment["name"] if segment else None,
    }


@app.get("/")
def root():
    return {"status": "ok", "service": "NER Logistics Platform API"}


@app.post("/auth/register")
def register(body: RegisterIn):
    """Create a new account. Driver needs just a name/phone/password.
    Field official / authority additionally need the matching org
    passkey (see config.FIELD_OFFICER_PASSKEY / AUTHORITY_PASSKEY) --
    without it this returns 403, so picking a privileged role in the
    UI alone can't grant elevated access."""
    if body.role not in auth.VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {sorted(auth.VALID_ROLES)}")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not auth.check_passkey(body.role, body.passkey):
        raise HTTPException(status_code=403, detail="Missing or incorrect passkey for this role")
    if db.get_account_by_phone(body.phone):
        raise HTTPException(status_code=409, detail="An account with this phone number already exists")

    password_hash = auth.hash_password(body.password)
    try:
        account_id = db.create_account(body.full_name.strip(), body.phone.strip(), password_hash, body.role)
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="An account with this phone number already exists")

    token = auth.create_access_token(account_id, body.role, body.full_name.strip())
    return {"token": token, "role": body.role, "full_name": body.full_name.strip()}


@app.post("/auth/login")
def login(body: LoginIn):
    account = db.get_account_by_phone(body.phone.strip())
    if not account or not auth.verify_password(body.password, account["password_hash"]):
        # Same message either way -- don't reveal whether the phone
        # number itself is registered.
        raise HTTPException(status_code=401, detail="Incorrect phone number or password")
    db.touch_account_login(account["id"])
    token = auth.create_access_token(account["id"], account["role"], account["full_name"])
    return {"token": token, "role": account["role"], "full_name": account["full_name"]}


@app.get("/auth/me")
def me(current: dict = Depends(get_current_account)):
    """Lets the frontend validate a stored token on app load (e.g. to
    decide whether to bounce back to /login) without re-sending credentials."""
    return {"role": current["role"], "full_name": current["name"]}


@app.get("/segments")
def get_segments():
    """GeoJSON FeatureCollection of every road segment with current risk data."""
    return db.fetch_segments_geojson()


@app.get("/segments/forecast")
def get_segments_forecast(
    depart_at: datetime = Query(..., description="Planned departure time, IST (e.g. 2026-09-14T20:00:00)"),
    segment_ids: str = Query(..., description="Comma-separated road_segment ids in route order"),
    journey_minutes: int = Query(60, ge=1, le=1440, description="Estimated route duration in minutes"),
):
    """
    Same shape as GET /segments, but risk_score/risk_level for each
    requested segment is computed from a weather FORECAST for
    depart_at instead of the latest live risk_scores row -- lets a
    driver planning a future trip (Shipment Board) see what conditions
    are expected to look like AT their departure time, not just right
    now. Deliberately scoped to caller-supplied segment_ids (the
    handful of monitored segments near one planned route) rather than
    the whole network, so this stays cheap as the road network grows.
    """
    try:
        ids = [int(x) for x in segment_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="segment_ids must be a comma-separated list of integers.")
    if not ids:
        raise HTTPException(status_code=400, detail="segment_ids must not be empty.")

    # Treat a naive datetime as IST (this app has no timezone handling
    # anywhere else either -- travel_date/travel_time are stored plain --
    # so IST is the one sensible default given NER is the whole point of
    # this app) then convert to UTC to compare against OpenWeatherMap's
    # UTC forecast timestamps.
    depart_at_local = depart_at if depart_at.tzinfo else depart_at.replace(tzinfo=IST)
    depart_at_utc = depart_at_local.astimezone(timezone.utc)

    now_utc = datetime.now(timezone.utc)
    if depart_at_utc < now_utc - timedelta(hours=1):
        raise HTTPException(status_code=400, detail="depart_at is in the past.")
    if depart_at_utc > forecast_service.max_forecastable_at():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Forecasts only go out {config.FORECAST_MAX_HOURS_AHEAD // 24} days ahead "
                "the live forecast horizon -- this trip is further out than that, "
                "so a forecast isn't available yet. Check back closer to departure."
            ),
        )

    try:
        return trip_forecast.compute_forecast_segments(depart_at_utc, ids, journey_minutes=journey_minutes)
    except forecast_service.ForecastUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/alerts")
def get_alerts(lang: str = "en"):
    """All currently unresolved alerts. Pass lang=hi or lang=as to get
    alert_type_label/severity_label translated for that language --
    alert_type/severity themselves stay in English so existing
    filtering/logic in clients doesn't break."""
    alerts = db.fetch_active_alerts()
    for a in alerts:
        a["alert_type_label"] = i18n.localize_alert_type(a["alert_type"], lang)
        a["severity_label"] = i18n.localize_severity(a["severity"], lang)
    return alerts


@app.get("/field-reports")
def get_field_reports(limit: int = 50, include_resolved: bool = False, lang: str = "en"):
    """Most recent field reports, newest first. Resolved/cleared
    reports are excluded by default so the authority review queue
    only shows what still needs action; pass include_resolved=true
    for a full history. Pass lang=hi or lang=as for a translated
    report_type_label (report_type itself stays in English)."""
    reports = db.fetch_field_reports(limit=limit, include_resolved=include_resolved)
    for r in reports:
        r["report_type_label"] = i18n.localize_report_type(r["report_type"], lang)
    return reports


@app.get("/accommodations")
def get_accommodations(lat: float, lon: float, radius_km: float = 15, limit: int = 15):
    """Nearby overnight accommodation (hotel/guest house/motel/hostel)
    around a point -- used to suggest resting somewhere safe instead
    of pushing through a blocked or high-risk stretch after dark."""
    return accommodations.find_nearby_accommodation(lat, lon, radius_km=radius_km, limit=limit)


@app.post("/field-reports")
def post_field_report(report: FieldReportIn):
    """Submit a new crowdsourced field report (landslide, flood, road
    damage, etc). Auto-attaches to the nearest road segment (if within
    20km) and checks for corroborating reports nearby in the last 24h.

    Supports two things needed for remote/low-connectivity use:
    - photo_base64: a geo-tagged photo, saved and linked as photo_url.
    - id + captured_at: if the client generated these offline (before
      it had signal) and is now syncing, re-POSTing the same id is a
      no-op rather than creating a duplicate report.
    """
    if report.report_type not in VALID_REPORT_TYPES:
        raise HTTPException(status_code=400, detail=f"report_type must be one of {sorted(VALID_REPORT_TYPES)}")

    photo_url = None
    if report.photo_base64:
        try:
            photo_url = _save_report_photo(report.photo_base64)
        except ValueError as err:
            raise HTTPException(status_code=400, detail=str(err))

    new_id = db.create_field_report(
        lat=report.lat,
        lon=report.lon,
        report_type=report.report_type,
        description=report.description,
        reporter_name=report.reporter_name,
        reporter_role=report.reporter_role or "citizen",
        report_id=report.id,
        captured_at=report.captured_at,
        photo_url=photo_url,
    )
    return {"id": new_id, "status": "created"}


@app.post("/drivers/location")
def post_driver_location(loc: DriverLocationIn):
    """Upsert the caller's live location (one row per session_id --
    overwritten on every ping, not a history log). Used for the
    'nearby help' / stuck-driver feature."""
    role = loc.role or "driver"
    status = loc.status or "active"
    if role not in VALID_DRIVER_ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {sorted(VALID_DRIVER_ROLES)}")
    if status not in VALID_DRIVER_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(VALID_DRIVER_STATUSES)}")
    db.upsert_driver_location(loc.session_id, loc.driver_name, loc.phone, role, loc.lat, loc.lon, status)
    return {"status": "ok"}


@app.delete("/drivers/location/{session_id}")
def delete_driver_location(session_id: str):
    """Stop sharing location -- removes the row so this session no
    longer appears in anyone's 'nearby help' results."""
    db.remove_driver_location(session_id)
    return {"status": "removed"}


@app.get("/drivers/nearby")
def get_nearby_drivers(
    lat: float,
    lon: float,
    exclude: str = Query("", description="session_id to exclude (yourself)"),
    radius_km: float = 15,
):
    """Other drivers/field officers who shared their location recently
    and are within radius_km -- for the 'I'm stuck, who's nearby' flow."""
    return db.fetch_nearby_drivers(lat, lon, exclude, radius_km=radius_km)


@app.get("/districts/status")
def get_district_status():
    """District-wise connectivity rollup -- segments blocked/at-risk
    and active alerts per district. Powers the authority dashboard."""
    return db.fetch_district_status()


@app.post("/field-reports/{report_id}/verify")
def verify_field_report(report_id: str, body: VerifyReportIn):
    """Authority review action: mark a crowdsourced report verified."""
    try:
        db.set_field_report_verified(report_id, body.verified)
    except ValueError:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"id": report_id, "verified": body.verified}


@app.post("/field-reports/{report_id}/resolve")
def resolve_field_report(report_id: str):
    """Authority review action: clear a report out of the active queue
    (false alarm, duplicate, or already handled). Sets resolved_at so
    it stops showing up as pending -- distinct from /verify, which
    records whether the report was accurate."""
    try:
        db.resolve_field_report(report_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"id": report_id, "resolved": True}


@app.post("/alerts")
def post_alert(alert: AlertIn):
    """Authority-authored manual alert (as opposed to ones the risk
    model or field reports generate automatically)."""
    if alert.alert_type not in VALID_ALERT_TYPES:
        raise HTTPException(status_code=400, detail=f"alert_type must be one of {sorted(VALID_ALERT_TYPES)}")
    if alert.severity not in VALID_ALERT_SEVERITIES:
        raise HTTPException(status_code=400, detail=f"severity must be one of {sorted(VALID_ALERT_SEVERITIES)}")
    new_id = db.create_alert(alert.segment_id, alert.alert_type, alert.severity, alert.message)
    return {"id": new_id, "status": "created"}


@app.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int):
    """Marks a manual or auto-generated alert as resolved."""
    try:
        db.resolve_alert(alert_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Alert not found or already resolved")
    return {"id": alert_id, "status": "resolved"}


@app.get("/trips")
def get_trips(status: Optional[str] = Query(None, description="Filter by trip status")):
    """Vehicle/trip oversight -- active shipments, their cargo and
    current status, for the authority dashboard."""
    return db.fetch_trips(status=status)


@app.get("/shipment-board")
def get_shipment_board(
    travel_date: Optional[date] = Query(None, description="Filter to one travel date"),
    cargo_type: Optional[str] = Query(None),
    origin: Optional[str] = Query(None, description="Substring match on origin_text"),
    dest: Optional[str] = Query(None, description="Substring match on dest_text"),
):
    """Open cargo-sharing posts, soonest first -- 'who's already
    heading this way and has spare capacity'. Every field is an
    optional filter; with none set it returns all open posts from
    today onward."""
    if cargo_type and cargo_type not in VALID_CARGO_TYPES:
        raise HTTPException(status_code=400, detail=f"cargo_type must be one of {sorted(VALID_CARGO_TYPES)}")
    return db.fetch_shipment_posts(travel_date=travel_date, cargo_type=cargo_type, origin_text=origin, dest_text=dest)


@app.post("/shipment-board")
def post_shipment_board(post: ShipmentPostIn):
    """Driver posts an upcoming trip + spare cargo capacity so
    others heading the same way that day can merge loads instead of
    each running a half-empty vehicle."""
    cargo_type = post.cargo_type or "general"
    if cargo_type not in VALID_CARGO_TYPES:
        raise HTTPException(status_code=400, detail=f"cargo_type must be one of {sorted(VALID_CARGO_TYPES)}")
    new_id = db.create_shipment_post(
        session_id=post.session_id,
        driver_name=post.driver_name,
        phone=post.phone,
        vehicle_reg=post.vehicle_reg,
        origin_text=post.origin_text,
        origin_lat=post.origin_lat,
        origin_lon=post.origin_lon,
        dest_text=post.dest_text,
        dest_lat=post.dest_lat,
        dest_lon=post.dest_lon,
        travel_date=post.travel_date,
        travel_time=post.travel_time,
        cargo_type=cargo_type,
        available_capacity_kg=post.available_capacity_kg,
        space_notes=post.space_notes,
    )
    return {"id": new_id, "status": "created"}


@app.post("/shipment-board/{post_id}/status")
def update_shipment_post_status(post_id: int, body: ShipmentStatusIn):
    """Posting driver marks their own post 'merged' (a match was
    found) or 'cancelled' (plan changed) -- pulls it off the open
    board either way."""
    if body.status not in VALID_SHIPMENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(VALID_SHIPMENT_STATUSES)}")
    try:
        db.set_shipment_post_status(post_id, body.status, body.session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Post not found or not owned by this session")
    return {"id": post_id, "status": body.status}


@app.post("/notify")
def post_notify(body: NotifyIn):
    """Direct, targeted notification to one specific person -- e.g.
    clicking 'Notify' on someone's map popup. Unlike the automatic
    'anyone stuck nearby' polling, this goes to exactly the session
    the caller picked, and is delivered the next time that person's
    client polls GET /notifications/{session_id}."""
    message = (body.message or "").strip() or f"{body.from_name} wants your attention."
    new_id = db.create_notification(
        to_session_id=body.to_session_id,
        from_session_id=body.from_session_id,
        from_name=body.from_name,
        from_phone=body.from_phone,
        from_role=body.from_role or "driver",
        message=message,
        lat=body.lat,
        lon=body.lon,
    )
    return {"id": new_id, "status": "sent"}


@app.get("/notifications/{session_id}")
def get_notifications(session_id: str):
    """Polled by each active client to pick up any direct
    notifications addressed to them. Returns them once -- each
    notification is marked delivered as it's fetched."""
    return db.fetch_and_clear_notifications(session_id)


@app.post("/chat/send")
def post_chat_send(body: ChatSendIn):
    """Send one chat message from one session to another -- the
    'Chat' button next to 'Notify' on a person's profile, and the
    quick-reply / free-text box inside the chat panel it opens.
    Unlike /notify (a one-shot alert), this is a threaded, ongoing
    conversation that both sides can keep polling."""
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message cannot be empty")
    result = db.send_chat_message(
        from_session_id=body.from_session_id,
        from_name=body.from_name,
        from_role=body.from_role or "driver",
        to_session_id=body.to_session_id,
        to_name=body.to_name,
        message=message,
    )
    return {"id": result["id"], "created_at": result["created_at"], "status": "sent"}


@app.get("/chat/thread")
def get_chat_thread(
    session_id: str = Query(..., description="My session id"),
    with_session_id: str = Query(..., description="The other person's session id"),
):
    """Full conversation between me and one other person, oldest
    first. Opening this also marks their messages to me as read."""
    return db.fetch_chat_thread(session_id, with_session_id)


@app.get("/chat/inbox")
def get_chat_inbox(session_id: str = Query(..., description="My session id")):
    """My conversation list (like a WhatsApp chat list) -- one entry
    per person I've exchanged messages with, most recent first, with
    an unread count per conversation. Used by the Inbox / Messages
    section available to drivers, field officers, and authority."""
    return db.fetch_chat_inbox(session_id)



@app.post("/ai/session")
def ai_session(body: AISessionIn, current: dict = Depends(get_current_account)):
    db.register_ai_session(body.session_id, int(current["sub"]), current["role"])
    return {
        "status": "ok",
        "provider": config.AI_PROVIDER,
        "threshold": config.AI_RISK_THRESHOLD,
        "high_risk_threshold": config.AI_HIGH_RISK_THRESHOLD,
    }


@app.post("/ai/detect-frame")
async def ai_detect_frame(
    session_id: str = Query(...),
    lat: float = Query(...),
    lon: float = Query(...),
    vehicle_id: Optional[int] = Query(None),
    captured_at: Optional[datetime] = Query(None),
    image: UploadFile = File(...),
    current: dict = Depends(get_current_account),
):
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image")
    frame = AIFrameIn(
        session_id=session_id,
        lat=lat,
        lon=lon,
        vehicle_id=vehicle_id,
        captured_at=captured_at,
    )
    try:
        return _process_ai_frame(image_bytes, frame, current)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI detection failed: {exc}")


@app.post("/ai/analyze-video")
async def ai_analyze_video(
    video: UploadFile = File(...),
    lat: float = Query(25.7450),
    lon: float = Query(93.9800),
    session_id: str = Query(...),
    sample_every: float = Query(1.0, ge=0.25, le=10.0),
    current: dict = Depends(get_current_account),
):
    """Analyze a short uploaded dashcam clip by sampling frames.
    Useful for demos and model validation; live camera uses /ai/detect-frame."""
    import tempfile
    suffix = os.path.splitext(video.filename or ".mp4")[1] or ".mp4"
    data = await video.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty video")

    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    try:
        with open(path, "wb") as f:
            f.write(data)

        import cv2
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open video")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        frame_step = max(1, int(fps * sample_every))
        frame_index = 0
        results = []

        while True:
            ok, frame_img = cap.read()
            if not ok:
                break
            if frame_index % frame_step == 0:
                ok_jpg, encoded = cv2.imencode(
                    ".jpg", frame_img, [int(cv2.IMWRITE_JPEG_QUALITY), 82]
                )
                if ok_jpg:
                    captured = datetime.utcnow()
                    results.append(
                        _process_ai_frame(
                            encoded.tobytes(),
                            AIFrameIn(
                                session_id=session_id,
                                lat=lat,
                                lon=lon,
                                captured_at=captured,
                            ),
                            current,
                        )
                    )
            frame_index += 1
        cap.release()

        alerts = [r for r in results if r["alert_created"]]
        return {
            "provider": config.AI_PROVIDER,
            "threshold": config.AI_RISK_THRESHOLD,
            "frames_analyzed": len(results),
            "alerts_created": len(alerts),
            "results": results,
        }
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


@app.get("/ai/detections")
def get_ai_detections(limit: int = Query(50, ge=1, le=200), current: dict = Depends(get_current_account)):
    return db.fetch_recent_ai_detections(limit=limit)


@app.get("/route")
def get_route(
    start: int = Query(..., description="Start segment ID"),
    end: int = Query(..., description="End segment ID"),
):
    """
    Returns both the fastest route and the risk-aware safest route
    between two segments, so the dashboard can show the comparison
    in one call.
    """
    fastest = routing.compute_route(start, end, mode="fastest")
    safest = routing.compute_route(start, end, mode="safest")

    if fastest is None and safest is None:
        raise HTTPException(status_code=404, detail="No route found between these segments.")

    return {"fastest": fastest, "safest": safest}
