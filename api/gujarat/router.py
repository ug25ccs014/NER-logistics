"""Gujarat-only API endpoints.

All queries in this module touch only gujarat_* tables. Existing NER
queries and API response contracts remain unchanged.
"""
from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Optional

import auth
import db

router = APIRouter(tags=["Gujarat Logistics"])
_bearer = HTTPBearer(auto_error=False)
_ALLOWED_DATA_STATUS = {"VERIFIED", "UNVERIFIED", "DEMO", "SIMULATED", "UNAVAILABLE"}


def current_account(credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        return auth.decode_access_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")


def authority_account(current: dict = Depends(current_account)) -> dict:
    if current.get("role") != "authority":
        raise HTTPException(status_code=403, detail="Authority role required")
    return current


def _fetch_all(sql: str, params=()):
    conn = db.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            columns = [d[0] for d in cur.description] if cur.description else []
            return [dict(zip(columns, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def _fetch_one(sql: str, params=()):
    rows = _fetch_all(sql, params)
    return rows[0] if rows else None


class ShipmentCreate(BaseModel):
    origin_label: str = Field(min_length=2, max_length=200)
    destination_label: str = Field(min_length=2, max_length=200)
    cargo_type: str = Field(min_length=2, max_length=80)
    weight_kg: float = Field(gt=0, le=1000000)
    volume_m3: Optional[float] = Field(default=None, gt=0, le=100000)
    urgency: str = Field(default="standard", max_length=30)
    delivery_deadline: Optional[datetime] = None
    temperature_min_c: Optional[float] = None
    temperature_max_c: Optional[float] = None


class ShipmentEventCreate(BaseModel):
    event_type: str = Field(min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, max_length=2000)
    data_status: str = "UNVERIFIED"


@router.get("/health")
def gujarat_health(current: dict = Depends(current_account)):
    row = _fetch_one("SELECT current_database() AS database_name, now() AS checked_at")
    return {"status": "ok", "module": "gujarat", "database": row["database_name"], "checked_at": row["checked_at"]}


@router.get("/overview")
def gujarat_overview(current: dict = Depends(current_account)):
    row = _fetch_one("""
        SELECT
          (SELECT COUNT(*) FROM gujarat_road_segments) AS road_segments,
          (SELECT COUNT(*) FROM gujarat_waterways) AS waterways,
          (SELECT COUNT(*) FROM gujarat_waterway_terminals) AS waterway_terminals,
          (SELECT COUNT(*) FROM gujarat_airports) AS airports,
          (SELECT COUNT(*) FROM gujarat_shipments) AS shipments,
          (SELECT COUNT(*) FROM gujarat_shipment_events e
             JOIN gujarat_shipments s ON s.id = e.shipment_id
             WHERE e.event_at >= now() - interval '24 hours') AS events_last_24h
    """)
    return {
        "region": "GUJARAT",
        "pilot_corridor": "Gandhinagar–Ahmedabad",
        "counts": row,
        "data_status": "UNVERIFIED",
        "message": "Regional workspace is ready. Transport data will appear after verified imports or clearly labelled demo seeding.",
    }


@router.get("/roadways/segments")
def gujarat_road_segments(current: dict = Depends(current_account), limit: int = Query(500, ge=1, le=2000)):
    rows = _fetch_all("""
        SELECT id, name, corridor, length_km, road_type, status, data_status,
               source_name, source_url, last_verified_at,
               ST_AsGeoJSON(geom)::json AS geometry
        FROM gujarat_road_segments
        ORDER BY id LIMIT %s
    """, (limit,))
    features = [{
        "type": "Feature",
        "geometry": row.pop("geometry"),
        "properties": row,
    } for row in rows]
    return {"type": "FeatureCollection", "features": features, "region": "GUJARAT"}


@router.get("/waterways")
def gujarat_waterways(current: dict = Depends(current_account)):
    return _fetch_all("""
        SELECT id, waterway_code, name, river_name, national_waterway_number,
               designation_status, operational_status, data_status,
               source_name, source_url, last_verified_at
        FROM gujarat_waterways ORDER BY name
    """)


@router.get("/waterways/terminals")
def gujarat_waterway_terminals(current: dict = Depends(current_account)):
    return _fetch_all("""
        SELECT id, terminal_code, name, road_access_status, operational_status,
               data_status, source_name, source_url, last_verified_at,
               ST_Y(location) AS latitude, ST_X(location) AS longitude
        FROM gujarat_waterway_terminals ORDER BY name
    """)


@router.get("/airways/airports")
def gujarat_airports(current: dict = Depends(current_account)):
    return _fetch_all("""
        SELECT id, iata_code, icao_code, name, operational_status, data_status,
               source_name, source_url, last_verified_at,
               ST_Y(location) AS latitude, ST_X(location) AS longitude
        FROM gujarat_airports ORDER BY name
    """)


@router.get("/shipments")
def gujarat_shipments(current: dict = Depends(current_account), limit: int = Query(100, ge=1, le=500)):
    if current.get("role") == "authority":
        return _fetch_all("""
            SELECT id, public_reference, owner_account_id, origin_label, destination_label,
                   cargo_type, weight_kg, volume_m3, urgency, status, data_status, created_at
            FROM gujarat_shipments ORDER BY created_at DESC LIMIT %s
        """, (limit,))
    return _fetch_all("""
        SELECT id, public_reference, origin_label, destination_label, cargo_type,
               weight_kg, volume_m3, urgency, status, data_status, created_at
        FROM gujarat_shipments
        WHERE owner_account_id = %s
        ORDER BY created_at DESC LIMIT %s
    """, (int(current["sub"]), limit))


@router.post("/shipments", status_code=201)
def create_gujarat_shipment(body: ShipmentCreate, current: dict = Depends(current_account)):
    if body.temperature_min_c is not None and body.temperature_max_c is not None and body.temperature_min_c > body.temperature_max_c:
        raise HTTPException(status_code=400, detail="temperature_min_c cannot exceed temperature_max_c")
    shipment_id = uuid.uuid4()
    reference = "GJ-" + shipment_id.hex[:10].upper()
    conn = db.get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO gujarat_shipments
                    (id, public_reference, owner_account_id, origin_label, destination_label,
                     cargo_type, weight_kg, volume_m3, urgency, delivery_deadline,
                     temperature_min_c, temperature_max_c, status, data_status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'created','UNVERIFIED')
                    RETURNING id, public_reference, origin_label, destination_label,
                              cargo_type, weight_kg, status, data_status, created_at
                """, (
                    str(shipment_id), reference, int(current["sub"]), body.origin_label.strip(),
                    body.destination_label.strip(), body.cargo_type.strip(), body.weight_kg,
                    body.volume_m3, body.urgency, body.delivery_deadline,
                    body.temperature_min_c, body.temperature_max_c,
                ))
                row = cur.fetchone()
                columns = [d[0] for d in cur.description]
                result = dict(zip(columns, row))
                cur.execute("""
                    INSERT INTO gujarat_shipment_events
                    (id, shipment_id, event_type, description, actor_account_id, data_status)
                    VALUES (%s,%s,'SHIPMENT_CREATED','Shipment created',%s,'UNVERIFIED')
                """, (str(uuid.uuid4()), str(shipment_id), int(current["sub"])))
        return result
    finally:
        conn.close()


@router.get("/shipments/{shipment_id}/tracking")
def gujarat_shipment_tracking(shipment_id: str, current: dict = Depends(current_account)):
    try:
        parsed_id = str(uuid.UUID(shipment_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid shipment ID")
    shipment = _fetch_one("""
        SELECT id, public_reference, owner_account_id, origin_label, destination_label,
               cargo_type, weight_kg, status, data_status, created_at
        FROM gujarat_shipments WHERE id = %s
    """, (parsed_id,))
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    if current.get("role") != "authority" and shipment["owner_account_id"] != int(current["sub"]):
        raise HTTPException(status_code=403, detail="You cannot view this shipment")
    events = _fetch_all("""
        SELECT id, event_type, event_at, description, data_status
        FROM gujarat_shipment_events
        WHERE shipment_id = %s ORDER BY event_at ASC
    """, (parsed_id,))
    return {"shipment": shipment, "events": events}


@router.post("/shipments/{shipment_id}/events", status_code=201)
def add_gujarat_shipment_event(shipment_id: str, body: ShipmentEventCreate, current: dict = Depends(authority_account)):
    try:
        parsed_id = str(uuid.UUID(shipment_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid shipment ID")
    if body.data_status not in _ALLOWED_DATA_STATUS:
        raise HTTPException(status_code=400, detail="Invalid data_status")
    event_id = str(uuid.uuid4())
    conn = db.get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM gujarat_shipments WHERE id = %s", (parsed_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Shipment not found")
                cur.execute("""
                    INSERT INTO gujarat_shipment_events
                    (id, shipment_id, event_type, description, actor_account_id, data_status)
                    VALUES (%s,%s,%s,%s,%s,%s)
                    RETURNING id, event_type, event_at, description, data_status
                """, (event_id, parsed_id, body.event_type.strip(), body.description, int(current["sub"]), body.data_status))
                row = cur.fetchone()
                columns = [d[0] for d in cur.description]
                return dict(zip(columns, row))
    finally:
        conn.close()
