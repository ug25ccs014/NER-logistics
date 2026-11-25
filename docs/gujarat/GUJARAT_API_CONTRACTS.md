# Gujarat Module — API Contracts

All paths below are relative to the existing FastAPI API base. The existing frontend API client has a default base of `/api`, so browser calls use `/api/gujarat/...`.

All write endpoints require the existing JWT authentication. Read endpoints should also require authentication unless a documented public use case is approved. Apply role authorization server-side.

## Shared response conventions

Every externally sourced or operational entity should expose:
- `data_status`: one of `VERIFIED`, `UNVERIFIED`, `DEMO`, `SIMULATED`, `UNAVAILABLE`.
- `source_name` and `source_url` when available.
- `last_verified_at` or `observed_at` where applicable.
- `region_code`: `GUJARAT`.
- Stable identifiers; do not rely on display names as keys.

Never label manually entered or simulated data as live.

## Regional health and overview

- `GET /gujarat/health` — module readiness and database availability.
- `GET /gujarat/overview` — corridor summary, mode counts, alerts and data freshness.

## Roadways

These endpoints operate on Gujarat-specific road records and must not call the existing unscoped NER road queries.

- `GET /gujarat/roadways/segments` — Gujarat road GeoJSON with latest Gujarat risk state.
- `GET /gujarat/roadways/connections` — Gujarat segment connectivity.
- `GET /gujarat/roadways/route?start=...&end=...&mode=fastest|safest` — route comparison using the existing routing algorithm through a Gujarat-specific graph loader.
- `GET /gujarat/roadways/forecast?segment_ids=...&depart_at=...` — forecast/risk for Gujarat segment IDs only.
- `GET /gujarat/roadways/alerts` — Gujarat alerts.
- `GET /gujarat/roadways/field-reports` — Gujarat reports.
- `POST /gujarat/roadways/field-reports` — create a Gujarat road report.
- `GET /gujarat/roadways/shipment-board` and `POST /gujarat/roadways/shipment-board` — regional cargo board.
- `GET /gujarat/roadways/trips` — regional trip/vehicle view where data exists.

Do not silently proxy these to NER endpoints if doing so would return NER data. Shared algorithms are allowed; unscoped regional data access is not.

## Waterways

- `GET /gujarat/waterways`
- `GET /gujarat/waterways/{waterway_id}`
- `GET /gujarat/waterways/segments`
- `GET /gujarat/waterways/terminals`
- `GET /gujarat/waterways/terminals/nearby?lat=...&lon=...&radius_km=...`
- `GET /gujarat/waterways/routes?origin_terminal_id=...&destination_terminal_id=...`
- `GET /gujarat/waterways/vessels`
- `POST /gujarat/waterways/vessels`
- `GET /gujarat/waterways/schedules`
- `POST /gujarat/waterways/schedules`
- `GET /gujarat/waterways/cargo-board`
- `POST /gujarat/waterways/cargo-board`
- `POST /gujarat/waterways/bookings`
- `GET /gujarat/waterways/alerts`
- `POST /gujarat/waterways/field-reports`

Route response must include ordered segments, distance if computable, feasibility, restrictions, vessel/cargo constraints, data status, source and explicit reasons when unavailable. A listed National Waterway is not automatically a verified commercial service.

## Airways

- `GET /gujarat/airways/airports`
- `GET /gujarat/airways/airlines`
- `GET /gujarat/airways/flights`
- `GET /gujarat/airways/cargo-board`
- `POST /gujarat/airways/cargo-board`
- `GET /gujarat/airways/shipments`
- `POST /gujarat/airways/shipments`
- `GET /gujarat/airways/shipments/{shipment_id}`
- `GET /gujarat/airways/shipments/{shipment_id}/tracking`
- `POST /gujarat/airways/shipments/{shipment_id}/events`
- `GET /gujarat/airways/capacity`
- `POST /gujarat/airways/bookings`
- `GET /gujarat/airways/cold-chain/alerts`

Flight schedules and capacity must be sourced from an authorised integration or marked manual/demo/simulated. Do not claim direct access to an airport cargo system without an authorised documented API.

## Multimodal shipments and optimization

- `POST /gujarat/shipments` — create a common Gujarat shipment.
- `GET /gujarat/shipments` — search/list shipments accessible to caller.
- `GET /gujarat/shipments/{shipment_id}` — shipment and legs.
- `GET /gujarat/shipments/{shipment_id}/tracking` — unified event timeline.
- `POST /gujarat/shipments/{shipment_id}/events` — append authorized event.
- `POST /gujarat/multimodal/optimize` — compare feasible mode combinations.

Optimizer request fields:
- origin and destination (coordinates and/or validated place references),
- cargo_type, weight_kg, volume_m3,
- delivery_deadline,
- urgency,
- budget (optional),
- temperature_min_c / temperature_max_c (optional),
- optimization_preferences (cost, time, risk, emissions weights).

Optimizer response:
- shipment/plan identifier where persisted,
- alternatives with ordered legs,
- per-leg mode, endpoints, distance, duration, cost, risk, emissions, capacity and data status,
- total estimates,
- feasibility boolean,
- infeasibility reasons,
- recommended alternative and human-readable explanation,
- source/confidence metadata.

Never generate fabricated route metrics. If inputs or source data are insufficient, return an explicit unknown/unavailable field rather than a guessed number.

## Error conventions

Use normal HTTP status codes and FastAPI JSON detail responses:
- 400 invalid input,
- 401 missing/invalid token,
- 403 insufficient role,
- 404 unknown resource,
- 409 capacity/booking conflict,
- 422 schema validation,
- 503 external provider unavailable.

Do not change existing NER endpoint paths or response formats.
