# Gujarat Module — Additive Data Model

## Principles

1. Existing NER tables remain unchanged and continue to power existing NER endpoints.
2. Gujarat operational records are stored separately and use the `gujarat_` table prefix.
3. All geometry uses PostGIS SRID 4326 with GiST indexes where spatial queries are required.
4. Every operational/external record includes provenance and data status.
5. Use foreign keys, constraints, indexes, UTC timestamps, and explicit units.
6. Migrations must be additive. No destructive edits to existing tables.

## Shared conventions

- Primary keys: UUID for shipment/event identities where appropriate; BIGSERIAL or generated identity for catalog rows.
- `created_at`, `updated_at`: TIMESTAMPTZ.
- `data_status`: VERIFIED / UNVERIFIED / DEMO / SIMULATED / UNAVAILABLE.
- `source_name`, `source_url`, `last_verified_at`: nullable provenance fields.
- `region_code`: fixed to GUJARAT for Gujarat module records where useful.
- Units must be explicit in column names (e.g. `weight_kg`, `distance_km`, `duration_min`, `temperature_c`).

## Roadways

### gujarat_road_segments
- id, external_ref, name, official_name, corridor, geom LINESTRING(4326), length_km, road_type, bridge/load constraints, seasonal_restriction, normal_travel_min, status, data_status, source metadata, timestamps.

### gujarat_segment_connections
- id, segment_a_id, segment_b_id, junction_name, unique pair constraint.

### gujarat_risk_scores
- id, segment_id, risk_score 0..100, rainfall fields, risk_level, model_version, computed_at, data_status, source metadata.

### gujarat_field_reports
- UUID id, segment_id nullable, reporter_account_id nullable, report_type, description, photo reference, location POINT(4326), captured_at, synced_at, verified, resolved_at, data_status.

### gujarat_alerts
- id, segment_id nullable, alert_type, severity, message, created_at, resolved_at, data_status.

### gujarat_districts (optional for initial corridor)
- id, name, state, geom POLYGON(4326), source metadata.

### gujarat_road_trips / gujarat_road_shipment_posts
- Regional trip and cargo-sharing data. Do not reuse the existing unscoped NER shipment rows unless a safe region discriminator is introduced and every query is region-filtered.

## Waterways

### gujarat_waterways
- id, waterway_code, name, river_name, national_waterway_number nullable, geom MULTILINESTRING(4326) nullable, designation_status, operational_status, data_status, source metadata, last_verified_at.

### gujarat_waterway_segments
- id, waterway_id, segment_code, geom LINESTRING(4326), navigability_status, depth_m nullable, required_draft_m nullable, permitted_vessel_class, seasonal_restrictions, cargo_suitability, data_status, source metadata.

### gujarat_waterway_terminals
- id, terminal_code, name, location POINT(4326), waterway_id nullable, road_access_status, facilities JSONB, cargo_types JSONB, operational_status, data_status, source metadata.

### gujarat_vessels
- id, vessel_code, operator, vessel_type, capacity_tonnes nullable, current_location POINT(4326) nullable, cargo_types JSONB, availability_status, data_status, source metadata.

### gujarat_vessel_schedules
- id, vessel_id, origin_terminal_id, destination_terminal_id, departure_at, arrival_estimate, capacity_available_tonnes nullable, booking_status, data_status, source metadata.

### gujarat_waterway_cargo_posts
- UUID id, owner_account_id, origin_terminal_id, destination_terminal_id, cargo_type, weight_kg, volume_m3, required_departure, delivery_deadline, requirements JSONB, status, data_status.

### gujarat_waterway_bookings
- UUID id, cargo_post_id, vessel_schedule_id, booked_weight_kg, booking_status, created_at, updated_at.

### gujarat_waterway_reports
- id, waterway_segment_id nullable, location POINT(4326), report_type, description, observed_at, verified, data_status, source metadata.

## Airways

### gujarat_airports
- id, iata_code, icao_code, name, location POINT(4326), cargo_facilities JSONB, operational_status, data_status, source metadata.

### gujarat_airlines
- id, airline_code, name, cargo_provider_reference, data_status, source metadata.

### gujarat_air_cargo_flights
- id, airline_id nullable, flight_number, origin_airport_id, destination_airport_id, scheduled_departure, estimated_arrival, cargo_capacity_kg nullable, available_capacity_kg nullable, schedule_status, data_status, source metadata.

### gujarat_air_cargo_shipments
- UUID id, owner_account_id, origin_airport_id, destination_airport_id, cargo_type, weight_kg, volume_m3, priority, temperature_min_c nullable, temperature_max_c nullable, awb_reference nullable, booking_status, data_status.

### gujarat_air_cargo_events
- UUID id, shipment_id, event_type, event_at, airport_id nullable, description, source metadata, data_status.

### gujarat_cold_chain_readings
- id, shipment_id, temperature_c, observed_at, sensor_reference nullable, reading_status, data_status.

## Shared multimodal shipments

### gujarat_shipments
- UUID id, public_reference, owner_account_id, origin_label, origin_location POINT(4326), destination_label, destination_location POINT(4326), cargo_type, weight_kg, volume_m3, urgency, delivery_deadline, budget nullable, temperature_min_c nullable, temperature_max_c nullable, status, created_at, updated_at.

### gujarat_shipment_legs
- UUID id, shipment_id, sequence_no, mode (ROAD/WATER/AIR), origin_label, origin_location POINT(4326), destination_label, destination_location POINT(4326), provider_reference nullable, planned_departure, estimated_arrival, actual_departure, actual_arrival, distance_km nullable, duration_min nullable, estimated_cost nullable, estimated_emissions_kg nullable, risk_score nullable, status, data_status, source metadata. Unique (shipment_id, sequence_no).

### gujarat_shipment_events
- UUID id, shipment_id, leg_id nullable, event_type, event_at, location POINT(4326) nullable, description, actor_account_id nullable, data_status, source metadata.

### gujarat_route_plans
- UUID id, shipment_id nullable, request_snapshot JSONB, alternatives JSONB, recommendation JSONB, created_at, model_version, data_status.

## Relationships and access

- Reuse the existing account identity/JWT; do not duplicate account tables.
- owner_account_id references the existing accounts table if its exact primary key and migration constraints are confirmed before migration.
- All shipment reads/writes must be ownership- or role-checked.
- Authority-level access must be explicitly authorized server-side.
- Do not store payment card data, passwords, API secrets, or unnecessary personal data in Gujarat tables.

## Migration order

1. Gujarat road tables and indexes.
2. Waterway catalog and operational tables.
3. Airport and air-cargo tables.
4. Shared shipment, leg, event and route-plan tables.
5. Seed only clearly labelled DEMO reference data in a separate opt-in seed script.

Before implementation, confirm the actual existing account table name/primary key and migration convention from the current database schema. Do not assume or silently alter it.
