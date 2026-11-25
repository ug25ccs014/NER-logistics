-- Optional, idempotent reference-data seed for the Gujarat module.
-- This does NOT create vessel schedules, flight schedules, cargo capacity,
-- commercial navigability, or a route geometry.
-- Apply only after migration_005_gujarat_module.sql.
BEGIN;

-- AAI eAIP aerodrome chart (VAAH) identifies Ahmedabad airport and its
-- Cargo Terminal Building T3. Coordinates below are the published ARP
-- (23°04'16.301"N, 072°37'35.179"E), not a cargo-gate coordinate.
INSERT INTO gujarat_airports
    (iata_code, icao_code, name, location, cargo_facilities,
     operational_status, data_status, source_name, source_url, last_verified_at)
VALUES
    ('AMD', 'VAAH', 'Sardar Vallabhbhai Patel International Airport',
     ST_SetSRID(ST_MakePoint(72.6264386, 23.0711947), 4326),
     '{"aip_reference":"Cargo Terminal Building T3","live_capacity_available":false,"cargo_handling_integration":"NOT_CONNECTED"}'::jsonb,
     'ACTIVE_AERODROME', 'VERIFIED',
     'Airports Authority of India eAIP',
     'https://aim-india.aai.aero/eaip/eaip-v2-04-2026/eAIP/VAAH-PDC-APN-I.pdf',
     now())
ON CONFLICT (iata_code) DO UPDATE SET
    icao_code = EXCLUDED.icao_code,
    name = EXCLUDED.name,
    location = EXCLUDED.location,
    cargo_facilities = EXCLUDED.cargo_facilities,
    operational_status = EXCLUDED.operational_status,
    data_status = EXCLUDED.data_status,
    source_name = EXCLUDED.source_name,
    source_url = EXCLUDED.source_url,
    last_verified_at = EXCLUDED.last_verified_at;

-- IWAI's Sabarmati NW-87 feasibility/DPR material describes a 212 km
-- river stretch from a barrage near Sadoliya to the Gulf of Khambhat.
-- A designation/study reference is NOT proof of a current commercial
-- service, continuous navigability, terminals, vessel capacity, or schedule.
INSERT INTO gujarat_waterways
    (waterway_code, name, river_name, national_waterway_number,
     designation_status, operational_status, data_status,
     source_name, source_url, last_verified_at)
VALUES
    ('NW-87', 'Sabarmati National Waterway (NW-87)', 'Sabarmati', 'NW-87',
     'DESIGNATED_NATIONAL_WATERWAY', 'STUDY_REFERENCE_ONLY', 'UNVERIFIED',
     'Inland Waterways Authority of India — Sabarmati feasibility study',
     'https://iwai.nic.in/sites/default/files/1814791015NW-87%20Sabarmati%20Final%20FSR_0.pdf',
     now())
ON CONFLICT (waterway_code) DO UPDATE SET
    name = EXCLUDED.name,
    river_name = EXCLUDED.river_name,
    national_waterway_number = EXCLUDED.national_waterway_number,
    designation_status = EXCLUDED.designation_status,
    operational_status = EXCLUDED.operational_status,
    data_status = EXCLUDED.data_status,
    source_name = EXCLUDED.source_name,
    source_url = EXCLUDED.source_url,
    last_verified_at = EXCLUDED.last_verified_at;

COMMIT;
