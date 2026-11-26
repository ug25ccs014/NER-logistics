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
from gujarat.services.roadways import compare_routes
from gujarat.services.terrain import get_cached_terrain_profile

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


@router.get("/roadways/connections")
def gujarat_road_connections(current: dict = Depends(current_account)):
    return _fetch_all("""
        SELECT id, segment_a_id, segment_b_id, junction_name
        FROM gujarat_segment_connections ORDER BY id
    """)


@router.get("/roadways/route")
def gujarat_road_route(
    start: int = Query(..., ge=1, description="Gujarat road segment ID"),
    end: int = Query(..., ge=1, description="Gujarat road segment ID"),
    current: dict = Depends(current_account),
):
    result = compare_routes(start, end)
    if result.get("fastest") is None and result.get("safest") is None:
        raise HTTPException(status_code=404, detail=result.get("reason", "No Gujarat route found"))
    return result



class RoutePointIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class RouteIntelligenceIn(BaseModel):
    points: list[RoutePointIn] = Field(min_length=1, max_length=80)


class TerrainProfileIn(BaseModel):
    points: list[RoutePointIn] = Field(min_length=2, max_length=80)


@router.post("/roadways/terrain-profile")
def gujarat_route_terrain_profile(body: TerrainProfileIn, current: dict = Depends(current_account)):
    """Return an indicative elevation/slope profile for a supplied route."""
    try:
        return {
            "region": "GUJARAT",
            **get_cached_terrain_profile([point.dict() for point in body.points]),
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        # Do not turn a provider outage into zero elevation or zero slope.
        raise HTTPException(status_code=503, detail=f"Terrain profile unavailable: {str(exc)[:220]}")


@router.post("/roadways/route-intelligence")
def gujarat_route_intelligence(body: RouteIntelligenceIn, current: dict = Depends(current_account)):
    """Match an externally calculated route to Gujarat's own road inventory.

    This is deliberately read-only. Missing road/risk data is returned as
    unavailable rather than being converted into a zero-risk score.
    """
    matched = []
    seen = set()
    conn = db.get_connection()
    try:
        with conn.cursor() as cur:
            for index, point in enumerate(body.points):
                cur.execute("""
                    SELECT s.id, s.name, s.corridor, s.status, s.data_status,
                           s.source_name, s.last_verified_at,
                           ST_Distance(
                               s.geom::geography,
                               ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
                           ) AS distance_m,
                           r.risk_score, r.risk_level, r.computed_at
                    FROM gujarat_road_segments s
                    LEFT JOIN LATERAL (
                        SELECT risk_score, risk_level, computed_at
                        FROM gujarat_risk_scores
                        WHERE segment_id = s.id
                        ORDER BY computed_at DESC
                        LIMIT 1
                    ) r ON TRUE
                    WHERE ST_DWithin(
                        s.geom::geography,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                        300
                    )
                    ORDER BY s.geom <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                    LIMIT 1
                """, (point.lon, point.lat, point.lon, point.lat, point.lon, point.lat))
                row = cur.fetchone()
                if not row:
                    matched.append({"point_index": index, "matched": False, "reason": "No Gujarat road segment within 300 m."})
                    continue
                (segment_id, name, corridor, status, data_status, source_name,
                 last_verified_at, distance_m, risk_score, risk_level, computed_at) = row
                sid = int(segment_id)
                item = {
                    "point_index": index, "matched": True, "segment_id": sid,
                    "name": name, "corridor": corridor, "status": status,
                    "data_status": data_status, "source_name": source_name,
                    "last_verified_at": last_verified_at,
                    "distance_m": round(float(distance_m), 1) if distance_m is not None else None,
                    "risk_score": float(risk_score) if risk_score is not None else None,
                    "risk_level": risk_level, "risk_computed_at": computed_at,
                }
                matched.append(item)
                seen.add(sid)
    finally:
        conn.close()

    inventory_row = _fetch_one("SELECT COUNT(*) AS total_segments FROM gujarat_road_segments")
    total_segments = int((inventory_row or {}).get("total_segments") or 0)

    unique = {}
    for item in matched:
        if item.get("matched"):
            unique[item["segment_id"]] = item
    scored = [x for x in unique.values() if x["risk_score"] is not None]
    verified = [x for x in unique.values() if x["data_status"] == "VERIFIED"]
    blocked = [x for x in unique.values() if str(x["status"] or "").lower() == "blocked"]
    return {
        "region": "GUJARAT",
        "total_inventory_segments": total_segments,
        "points_checked": len(body.points),
        "points_matched": sum(1 for x in matched if x.get("matched")),
        "unique_segments_matched": len(unique),
        "segments_with_risk_scores": len(scored),
        "verified_segments_matched": len(verified),
        "blocked_segments_matched": len(blocked),
        "segments": list(unique.values()),
        "point_matches": matched,
        "risk_coverage": "AVAILABLE" if scored else "UNAVAILABLE",
        "hazard_coverage": "NOT_CONNECTED",
        "note": "This endpoint reports only Gujarat road-inventory matches and stored Gujarat risk scores. It does not infer missing risk, terrain, or field-hazard data.",
    }


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


@router.get("/waterways/segments")
def gujarat_waterway_segments(current: dict = Depends(current_account)):
    return _fetch_all("""
        SELECT s.id, s.waterway_id, w.name AS waterway_name, s.segment_code,
               s.navigability_status, s.depth_m, s.required_draft_m,
               s.permitted_vessel_class, s.seasonal_restrictions,
               s.data_status, s.source_name, s.source_url, s.last_verified_at
        FROM gujarat_waterway_segments s
        JOIN gujarat_waterways w ON w.id = s.waterway_id
        ORDER BY w.name, s.id
    """)


@router.get("/waterways/vessels")
def gujarat_waterway_vessels(current: dict = Depends(current_account)):
    return _fetch_all("""
        SELECT id, vessel_code, operator, vessel_type, capacity_tonnes,
               availability_status, cargo_types, data_status,
               source_name, source_url, last_verified_at
        FROM gujarat_vessels ORDER BY vessel_code
    """)


@router.get("/waterways/schedules")
def gujarat_waterway_schedules(current: dict = Depends(current_account)):
    return _fetch_all("""
        SELECT s.id, s.departure_at, s.arrival_estimate,
               s.capacity_available_tonnes, s.booking_status, s.data_status,
               o.name AS origin_terminal, d.name AS destination_terminal,
               v.vessel_code, s.source_name, s.source_url, s.last_verified_at
        FROM gujarat_vessel_schedules s
        JOIN gujarat_waterway_terminals o ON o.id = s.origin_terminal_id
        JOIN gujarat_waterway_terminals d ON d.id = s.destination_terminal_id
        LEFT JOIN gujarat_vessels v ON v.id = s.vessel_id
        ORDER BY s.departure_at NULLS LAST
    """)


@router.get("/airways/airports")
def gujarat_airports(current: dict = Depends(current_account)):
    return _fetch_all("""
        SELECT id, iata_code, icao_code, name, operational_status, data_status,
               source_name, source_url, last_verified_at,
               ST_Y(location) AS latitude, ST_X(location) AS longitude
        FROM gujarat_airports ORDER BY name
    """)


@router.get("/airways/airlines")
def gujarat_airlines(current: dict = Depends(current_account)):
    return _fetch_all("""
        SELECT id, airline_code, name, cargo_provider_reference,
               data_status, source_name, source_url
        FROM gujarat_airlines ORDER BY name
    """)


@router.get("/airways/flights")
def gujarat_air_cargo_flights(current: dict = Depends(current_account)):
    return _fetch_all("""
        SELECT f.id, f.flight_number, f.scheduled_departure, f.estimated_arrival,
               f.cargo_capacity_kg, f.available_capacity_kg, f.schedule_status,
               f.data_status, f.source_name, f.source_url, f.last_verified_at,
               o.iata_code AS origin_iata, o.name AS origin_airport,
               d.iata_code AS destination_iata, d.name AS destination_airport,
               a.name AS airline
        FROM gujarat_air_cargo_flights f
        JOIN gujarat_airports o ON o.id = f.origin_airport_id
        JOIN gujarat_airports d ON d.id = f.destination_airport_id
        LEFT JOIN gujarat_airlines a ON a.id = f.airline_id
        ORDER BY f.scheduled_departure NULLS LAST
    """)


@router.get("/multimodal/status")
def gujarat_multimodal_status(current: dict = Depends(current_account)):
    counts = _fetch_one("""
        SELECT
          (SELECT COUNT(*) FROM gujarat_road_segments WHERE data_status = 'VERIFIED') AS verified_road_segments,
          (SELECT COUNT(*) FROM gujarat_waterway_segments WHERE data_status = 'VERIFIED' AND navigability_status = 'VERIFIED') AS verified_navigable_waterway_segments,
          (SELECT COUNT(*) FROM gujarat_vessel_schedules WHERE data_status = 'VERIFIED' AND booking_status = 'CONFIRMED') AS confirmed_vessel_schedules,
          (SELECT COUNT(*) FROM gujarat_air_cargo_flights WHERE data_status = 'VERIFIED' AND schedule_status = 'CONFIRMED') AS confirmed_air_cargo_flights
    """)
    return {
        "region": "GUJARAT",
        "readiness": counts,
        "optimizer_status": "NOT_READY",
        "reason": "The optimizer will only recommend modes after regional road connectivity, verified waterway navigability/capacity, and authorised air-cargo schedule data are available.",
    }


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
