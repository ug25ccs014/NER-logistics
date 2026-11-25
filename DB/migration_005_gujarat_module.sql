-- Migration 005: Gujarat Logistics Module
-- Additive only. This migration does not alter or backfill any NER tables.
-- Apply once to the existing PostgreSQL/PostGIS database.
BEGIN;

CREATE TABLE IF NOT EXISTS gujarat_road_segments (
    id BIGSERIAL PRIMARY KEY,
    external_ref VARCHAR(120) UNIQUE,
    name VARCHAR(200) NOT NULL,
    corridor VARCHAR(200) NOT NULL DEFAULT 'Gandhinagar–Ahmedabad',
    geom GEOMETRY(LINESTRING, 4326) NOT NULL,
    length_km NUMERIC(9,3),
    road_type VARCHAR(50),
    max_load_kg INTEGER,
    seasonal_restriction TEXT,
    normal_travel_min NUMERIC(8,2),
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','restricted','blocked','unknown')),
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    source_name VARCHAR(200),
    source_url TEXT,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gujarat_road_segments_geom
    ON gujarat_road_segments USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_gujarat_road_segments_status
    ON gujarat_road_segments (status);

CREATE TABLE IF NOT EXISTS gujarat_segment_connections (
    id BIGSERIAL PRIMARY KEY,
    segment_a_id BIGINT NOT NULL REFERENCES gujarat_road_segments(id) ON DELETE CASCADE,
    segment_b_id BIGINT NOT NULL REFERENCES gujarat_road_segments(id) ON DELETE CASCADE,
    junction_name VARCHAR(200),
    CHECK (segment_a_id <> segment_b_id),
    UNIQUE (segment_a_id, segment_b_id)
);

CREATE TABLE IF NOT EXISTS gujarat_risk_scores (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES gujarat_road_segments(id) ON DELETE CASCADE,
    risk_score NUMERIC(5,2) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_level VARCHAR(20),
    rainfall_24h_mm NUMERIC(8,2),
    model_version VARCHAR(80),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE'))
);
CREATE INDEX IF NOT EXISTS idx_gujarat_risk_segment_time
    ON gujarat_risk_scores (segment_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS gujarat_waterways (
    id BIGSERIAL PRIMARY KEY,
    waterway_code VARCHAR(80) UNIQUE,
    name VARCHAR(200) NOT NULL,
    river_name VARCHAR(200),
    national_waterway_number VARCHAR(30),
    geom GEOMETRY(MULTILINESTRING, 4326),
    designation_status VARCHAR(40) NOT NULL DEFAULT 'UNVERIFIED',
    operational_status VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN',
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    source_name VARCHAR(200),
    source_url TEXT,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gujarat_waterways_geom
    ON gujarat_waterways USING GIST (geom);

CREATE TABLE IF NOT EXISTS gujarat_waterway_segments (
    id BIGSERIAL PRIMARY KEY,
    waterway_id BIGINT NOT NULL REFERENCES gujarat_waterways(id) ON DELETE CASCADE,
    segment_code VARCHAR(100),
    geom GEOMETRY(LINESTRING, 4326),
    navigability_status VARCHAR(40) NOT NULL DEFAULT 'UNVERIFIED',
    depth_m NUMERIC(7,2),
    required_draft_m NUMERIC(7,2),
    permitted_vessel_class VARCHAR(120),
    seasonal_restrictions TEXT,
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    source_name VARCHAR(200),
    source_url TEXT,
    last_verified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gujarat_waterway_segments_geom
    ON gujarat_waterway_segments USING GIST (geom);

CREATE TABLE IF NOT EXISTS gujarat_waterway_terminals (
    id BIGSERIAL PRIMARY KEY,
    terminal_code VARCHAR(80) UNIQUE,
    name VARCHAR(200) NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    waterway_id BIGINT REFERENCES gujarat_waterways(id),
    road_access_status VARCHAR(40) NOT NULL DEFAULT 'UNVERIFIED',
    facilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    operational_status VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN',
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    source_name VARCHAR(200),
    source_url TEXT,
    last_verified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gujarat_terminals_location
    ON gujarat_waterway_terminals USING GIST (location);

CREATE TABLE IF NOT EXISTS gujarat_waterway_connections (
    id BIGSERIAL PRIMARY KEY,
    segment_a_id BIGINT NOT NULL REFERENCES gujarat_waterway_segments(id) ON DELETE CASCADE,
    segment_b_id BIGINT NOT NULL REFERENCES gujarat_waterway_segments(id) ON DELETE CASCADE,
    junction_name VARCHAR(200),
    CHECK (segment_a_id <> segment_b_id),
    UNIQUE (segment_a_id, segment_b_id)
);

CREATE TABLE IF NOT EXISTS gujarat_vessels (
    id BIGSERIAL PRIMARY KEY,
    vessel_code VARCHAR(80) UNIQUE,
    operator VARCHAR(200),
    vessel_type VARCHAR(100),
    capacity_tonnes NUMERIC(10,2),
    current_location GEOMETRY(POINT, 4326),
    cargo_types JSONB NOT NULL DEFAULT '[]'::jsonb,
    availability_status VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN',
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    source_name VARCHAR(200),
    source_url TEXT,
    last_verified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gujarat_vessels_location
    ON gujarat_vessels USING GIST (current_location);

CREATE TABLE IF NOT EXISTS gujarat_vessel_schedules (
    id BIGSERIAL PRIMARY KEY,
    vessel_id BIGINT REFERENCES gujarat_vessels(id),
    origin_terminal_id BIGINT NOT NULL REFERENCES gujarat_waterway_terminals(id),
    destination_terminal_id BIGINT NOT NULL REFERENCES gujarat_waterway_terminals(id),
    departure_at TIMESTAMPTZ,
    arrival_estimate TIMESTAMPTZ,
    capacity_available_tonnes NUMERIC(10,2),
    booking_status VARCHAR(40) NOT NULL DEFAULT 'UNCONFIRMED',
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    source_name VARCHAR(200),
    source_url TEXT,
    last_verified_at TIMESTAMPTZ,
    CHECK (origin_terminal_id <> destination_terminal_id)
);

CREATE TABLE IF NOT EXISTS gujarat_waterway_cargo_posts (
    id UUID PRIMARY KEY,
    owner_account_id INTEGER REFERENCES accounts(id),
    origin_terminal_id BIGINT NOT NULL REFERENCES gujarat_waterway_terminals(id),
    destination_terminal_id BIGINT NOT NULL REFERENCES gujarat_waterway_terminals(id),
    cargo_type VARCHAR(80) NOT NULL,
    weight_kg NUMERIC(12,2) NOT NULL CHECK (weight_kg > 0),
    volume_m3 NUMERIC(12,3),
    required_departure TIMESTAMPTZ,
    delivery_deadline TIMESTAMPTZ,
    requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'open',
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gujarat_waterway_bookings (
    id UUID PRIMARY KEY,
    cargo_post_id UUID NOT NULL REFERENCES gujarat_waterway_cargo_posts(id) ON DELETE CASCADE,
    vessel_schedule_id BIGINT NOT NULL REFERENCES gujarat_vessel_schedules(id),
    booked_weight_kg NUMERIC(12,2) NOT NULL CHECK (booked_weight_kg > 0),
    booking_status VARCHAR(40) NOT NULL DEFAULT 'requested',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gujarat_airports (
    id BIGSERIAL PRIMARY KEY,
    iata_code VARCHAR(3) UNIQUE,
    icao_code VARCHAR(4),
    name VARCHAR(200) NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    cargo_facilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    operational_status VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN',
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    source_name VARCHAR(200),
    source_url TEXT,
    last_verified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gujarat_airports_location
    ON gujarat_airports USING GIST (location);

CREATE TABLE IF NOT EXISTS gujarat_airlines (
    id BIGSERIAL PRIMARY KEY,
    airline_code VARCHAR(30) UNIQUE,
    name VARCHAR(200) NOT NULL,
    cargo_provider_reference TEXT,
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    source_name VARCHAR(200),
    source_url TEXT
);

CREATE TABLE IF NOT EXISTS gujarat_air_cargo_flights (
    id BIGSERIAL PRIMARY KEY,
    airline_id BIGINT REFERENCES gujarat_airlines(id),
    flight_number VARCHAR(40),
    origin_airport_id BIGINT NOT NULL REFERENCES gujarat_airports(id),
    destination_airport_id BIGINT NOT NULL REFERENCES gujarat_airports(id),
    scheduled_departure TIMESTAMPTZ,
    estimated_arrival TIMESTAMPTZ,
    cargo_capacity_kg NUMERIC(12,2),
    available_capacity_kg NUMERIC(12,2),
    schedule_status VARCHAR(40) NOT NULL DEFAULT 'UNCONFIRMED',
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    source_name VARCHAR(200),
    source_url TEXT,
    last_verified_at TIMESTAMPTZ,
    CHECK (origin_airport_id <> destination_airport_id)
);

CREATE TABLE IF NOT EXISTS gujarat_shipments (
    id UUID PRIMARY KEY,
    public_reference VARCHAR(40) UNIQUE NOT NULL,
    owner_account_id INTEGER REFERENCES accounts(id),
    origin_label VARCHAR(200) NOT NULL,
    origin_location GEOMETRY(POINT, 4326),
    destination_label VARCHAR(200) NOT NULL,
    destination_location GEOMETRY(POINT, 4326),
    cargo_type VARCHAR(80) NOT NULL,
    weight_kg NUMERIC(12,2) NOT NULL CHECK (weight_kg > 0),
    volume_m3 NUMERIC(12,3) CHECK (volume_m3 IS NULL OR volume_m3 > 0),
    urgency VARCHAR(30) NOT NULL DEFAULT 'standard',
    delivery_deadline TIMESTAMPTZ,
    temperature_min_c NUMERIC(6,2),
    temperature_max_c NUMERIC(6,2),
    status VARCHAR(40) NOT NULL DEFAULT 'created',
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (temperature_min_c IS NULL OR temperature_max_c IS NULL OR temperature_min_c <= temperature_max_c)
);
CREATE INDEX IF NOT EXISTS idx_gujarat_shipments_owner_created
    ON gujarat_shipments (owner_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gujarat_air_cargo_events (
    id UUID PRIMARY KEY,
    shipment_id UUID NOT NULL REFERENCES gujarat_shipments(id) ON DELETE CASCADE,
    airport_id BIGINT REFERENCES gujarat_airports(id),
    event_type VARCHAR(80) NOT NULL,
    event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    description TEXT,
    source_name VARCHAR(200),
    source_url TEXT,
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE'))
);

CREATE TABLE IF NOT EXISTS gujarat_cold_chain_readings (
    id BIGSERIAL PRIMARY KEY,
    shipment_id UUID NOT NULL REFERENCES gujarat_shipments(id) ON DELETE CASCADE,
    temperature_c NUMERIC(6,2) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sensor_reference VARCHAR(120),
    reading_status VARCHAR(40) NOT NULL DEFAULT 'UNVERIFIED',
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE'))
);
CREATE INDEX IF NOT EXISTS idx_gujarat_cold_chain_shipment_time
    ON gujarat_cold_chain_readings (shipment_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS gujarat_shipment_legs (
    id UUID PRIMARY KEY,
    shipment_id UUID NOT NULL REFERENCES gujarat_shipments(id) ON DELETE CASCADE,
    sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
    mode VARCHAR(10) NOT NULL CHECK (mode IN ('ROAD','WATER','AIR')),
    origin_label VARCHAR(200) NOT NULL,
    origin_location GEOMETRY(POINT, 4326),
    destination_label VARCHAR(200) NOT NULL,
    destination_location GEOMETRY(POINT, 4326),
    provider_reference VARCHAR(160),
    planned_departure TIMESTAMPTZ,
    estimated_arrival TIMESTAMPTZ,
    actual_departure TIMESTAMPTZ,
    actual_arrival TIMESTAMPTZ,
    distance_km NUMERIC(10,2),
    duration_min NUMERIC(10,2),
    estimated_cost NUMERIC(12,2),
    estimated_emissions_kg NUMERIC(12,2),
    risk_score NUMERIC(5,2) CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)),
    status VARCHAR(40) NOT NULL DEFAULT 'planned',
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    UNIQUE (shipment_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS gujarat_shipment_events (
    id UUID PRIMARY KEY,
    shipment_id UUID NOT NULL REFERENCES gujarat_shipments(id) ON DELETE CASCADE,
    leg_id UUID REFERENCES gujarat_shipment_legs(id) ON DELETE SET NULL,
    event_type VARCHAR(80) NOT NULL,
    event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    location GEOMETRY(POINT, 4326),
    description TEXT,
    actor_account_id INTEGER REFERENCES accounts(id),
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE'))
);
CREATE INDEX IF NOT EXISTS idx_gujarat_shipment_events_time
    ON gujarat_shipment_events (shipment_id, event_at DESC);

CREATE TABLE IF NOT EXISTS gujarat_route_plans (
    id UUID PRIMARY KEY,
    shipment_id UUID REFERENCES gujarat_shipments(id) ON DELETE SET NULL,
    request_snapshot JSONB NOT NULL,
    alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,
    recommendation JSONB NOT NULL DEFAULT '{}'::jsonb,
    model_version VARCHAR(80) NOT NULL,
    data_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (data_status IN ('VERIFIED','UNVERIFIED','DEMO','SIMULATED','UNAVAILABLE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
