-- ============================================================
-- NER Logistics Accessibility Intelligence Platform
-- PostGIS Database Schema
-- ============================================================
-- Run this against a PostgreSQL DB that has the PostGIS extension.
-- See docker-compose.yml in this folder for a one-command local setup.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ------------------------------------------------------------
-- 1. DISTRICTS
-- District boundaries, used for the "district-wise connectivity
-- status" dashboard view.
-- ------------------------------------------------------------
CREATE TABLE districts (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    state           VARCHAR(100) NOT NULL,          -- e.g. 'Nagaland', 'Assam'
    geom            GEOMETRY(POLYGON, 4326) NOT NULL, -- district boundary
    population      INTEGER,
    is_remote       BOOLEAN DEFAULT FALSE,           -- flags hard-to-reach districts
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_districts_geom ON districts USING GIST (geom);

-- ------------------------------------------------------------
-- 2. ROAD SEGMENTS
-- The core network graph. Each row is one stretch of road between
-- two nodes (junctions, towns, or bridge endpoints). Alternate-route
-- computation (NetworkX / pgRouting) runs over this table.
-- ------------------------------------------------------------
CREATE TABLE road_segments (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(200) NOT NULL,         -- display name; use 'Unnamed Road' until verified
    road_code           VARCHAR(40) UNIQUE,              -- stable NER identity, independent of display name
    official_name       VARCHAR(200),
    local_name          VARCHAR(200),
    suggested_name      VARCHAR(200),
    name_status         VARCHAR(40) NOT NULL DEFAULT 'named',
    name_source         VARCHAR(80),
    name_verified_by    INTEGER,
    name_verified_at    TIMESTAMPTZ,
    corridor            VARCHAR(200),                  -- groups segments into a named route
    district_id         INTEGER REFERENCES districts(id),
    geom                GEOMETRY(LINESTRING, 4326) NOT NULL,
    length_km           NUMERIC(6,2),
    road_type           VARCHAR(50),                   -- 'NH', 'state_highway', 'rural', 'bailey_bridge'
    has_bridge          BOOLEAN DEFAULT FALSE,
    max_load_kg         INTEGER,                       -- bridge/road load restriction, NULL = no limit
    seasonal_restriction TEXT,                         -- e.g. 'Impassable Jun-Sep (river fording point)'
    avg_slope_deg       NUMERIC(5,2),                   -- from DEM, feeds the risk model
    normal_travel_min   INTEGER,                        -- baseline travel time in good conditions
    status              VARCHAR(20) DEFAULT 'open',     -- 'open', 'restricted', 'blocked'
    updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_road_segments_geom ON road_segments USING GIST (geom);
CREATE INDEX idx_road_segments_status ON road_segments (status);

-- Segment connectivity graph (which segments join which, for routing).
-- Kept explicit rather than inferred from geometry so routing logic
-- stays simple and fast.
CREATE TABLE segment_connections (
    id                  SERIAL PRIMARY KEY,
    segment_a_id        INTEGER NOT NULL REFERENCES road_segments(id),
    segment_b_id        INTEGER NOT NULL REFERENCES road_segments(id),
    junction_name       VARCHAR(200),
    UNIQUE (segment_a_id, segment_b_id)
);

-- ------------------------------------------------------------
-- 3. RISK SCORES
-- Time-series of computed risk per segment. New row each time the
-- model re-scores (e.g. every 3 hours or on new rainfall data).
-- Keeping history (not just current score) lets the dashboard show
-- trend lines and lets the ML model be retrained later.
-- ------------------------------------------------------------
CREATE TABLE risk_scores (
    id                  SERIAL PRIMARY KEY,
    segment_id          INTEGER NOT NULL REFERENCES road_segments(id),
    risk_score          NUMERIC(5,2) NOT NULL,   -- 0-100
    rainfall_24h_mm     NUMERIC(6,2),
    rainfall_72h_mm     NUMERIC(6,2),
    risk_level          VARCHAR(20),             -- 'low', 'moderate', 'high', 'severe'
    model_version       VARCHAR(50),             -- e.g. 'rule_v1', 'rf_v1'
    computed_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_risk_scores_segment_time ON risk_scores (segment_id, computed_at DESC);

-- ------------------------------------------------------------
-- 4. REPORTERS
-- Field officials, drivers, local authorities who submit ground
-- reports. Trust score powers the crowdsource-verification logic.
-- ------------------------------------------------------------
CREATE TABLE reporters (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(150),
    phone               VARCHAR(20) UNIQUE,
    role                VARCHAR(50),             -- 'field_official', 'driver', 'local_authority', 'citizen'
    trust_score         NUMERIC(4,2) DEFAULT 50.0, -- 0-100, rises with corroborated reports
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 5. FIELD REPORTS
-- Geo-tagged incident reports uploaded from remote locations.
-- Designed to survive offline capture: client generates a UUID
-- locally and syncs whenever connectivity is available.
-- ------------------------------------------------------------
CREATE TABLE field_reports (
    id                  UUID PRIMARY KEY,        -- client-generated, supports offline creation
    segment_id          INTEGER REFERENCES road_segments(id),
    reporter_id         INTEGER REFERENCES reporters(id),
    report_type         VARCHAR(50) NOT NULL,    -- 'landslide', 'flood', 'road_damage', 'bridge_damage', 'congestion', 'clear'
    description         TEXT,
    photo_url            TEXT,
    location            GEOMETRY(POINT, 4326) NOT NULL,
    confidence_score    NUMERIC(5,2),            -- computed: reporter trust + corroboration + recency
    corroborated_by     INTEGER DEFAULT 0,        -- count of independent matching reports
    captured_at         TIMESTAMPTZ NOT NULL,     -- when the phone captured it (may be offline)
    synced_at           TIMESTAMPTZ DEFAULT now(),-- when it reached the server
    verified            BOOLEAN DEFAULT FALSE,
    resolved_at         TIMESTAMPTZ,              -- set automatically when a later 'clear' report
                                                    -- (or expiry) resolves this one -- NULL = still active
    resolved_by_report_id UUID REFERENCES field_reports(id) -- the 'clear' report that resolved this, if any
);
CREATE INDEX idx_field_reports_location ON field_reports USING GIST (location);
CREATE INDEX idx_field_reports_segment ON field_reports (segment_id);
-- Powers "only show active reports" queries -- the common case, since
-- resolved reports vanish from the live dashboard once the road reopens.
CREATE INDEX idx_field_reports_active ON field_reports (segment_id) WHERE resolved_at IS NULL;

-- ------------------------------------------------------------
-- 6. VEHICLES & TRIPS
-- GPS tracking of vehicles carrying essential commodities.
-- ------------------------------------------------------------
CREATE TABLE vehicles (
    id                  SERIAL PRIMARY KEY,
    registration_no     VARCHAR(30) UNIQUE NOT NULL,
    vehicle_type        VARCHAR(50),             -- 'medicine', 'food', 'construction', 'agriculture'
    driver_phone        VARCHAR(20),
    current_location    GEOMETRY(POINT, 4326),
    last_ping_at        TIMESTAMPTZ
);
CREATE INDEX idx_vehicles_location ON vehicles USING GIST (current_location);

CREATE TABLE trips (
    id                  SERIAL PRIMARY KEY,
    vehicle_id          INTEGER REFERENCES vehicles(id),
    cargo_type          VARCHAR(50),
    origin_district_id  INTEGER REFERENCES districts(id),
    dest_district_id    INTEGER REFERENCES districts(id),
    planned_route        JSONB,                   -- ordered list of segment_ids
    status              VARCHAR(20) DEFAULT 'in_transit', -- 'planned','in_transit','delayed','completed'
    started_at          TIMESTAMPTZ,
    eta                 TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- 7. ALERTS
-- Generated automatically from risk scores + verified field reports.
-- This is what feeds push notifications / SMS.
-- ------------------------------------------------------------
CREATE TABLE alerts (
    id                  SERIAL PRIMARY KEY,
    segment_id          INTEGER REFERENCES road_segments(id),
    alert_type          VARCHAR(50) NOT NULL,    -- 'blocked_road','high_risk','delivery_delay','emergency'
    severity            VARCHAR(20) NOT NULL,    -- 'info','warning','critical'
    message             TEXT NOT NULL,
    source              VARCHAR(20),             -- 'risk_model','field_report','manual'
    created_at          TIMESTAMPTZ DEFAULT now(),
    resolved_at         TIMESTAMPTZ
);
CREATE INDEX idx_alerts_segment ON alerts (segment_id);
CREATE INDEX idx_alerts_active ON alerts (resolved_at) WHERE resolved_at IS NULL;

-- ------------------------------------------------------------
-- 8. LIVE DRIVER / FIELD-OFFICER LOCATIONS
-- One current position per active session for Nearby Help and for
-- choosing the nearest field officer for an automatic hazard alert.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_locations (
    session_id      VARCHAR(64) PRIMARY KEY,
    driver_name     VARCHAR(200) NOT NULL,
    phone           VARCHAR(20),
    role            VARCHAR(30) NOT NULL DEFAULT 'driver',
    location        GEOGRAPHY(POINT, 4326) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_locations_location
    ON driver_locations USING GIST (location);

-- ------------------------------------------------------------
-- 9. NOTIFICATIONS
-- Direct, targeted notifications between two people who've seen
-- each other via the "nearby help" feature -- e.g. clicking Notify
-- on someone's map popup. A simple one-shot mailbox: each row is
-- read once (by the recipient's client polling GET /notifications/
-- {session_id}) and marked delivered, rather than kept as a log.
-- ------------------------------------------------------------
CREATE TABLE notifications (
    id              SERIAL PRIMARY KEY,
    to_session_id   VARCHAR(64) NOT NULL,
    from_session_id VARCHAR(64),
    from_name       VARCHAR(200),
    from_phone      VARCHAR(20),
    from_role       VARCHAR(30),
    message         TEXT,
    lat             DOUBLE PRECISION,
    lon             DOUBLE PRECISION,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_notifications_pending ON notifications (to_session_id) WHERE delivered = FALSE;

-- ------------------------------------------------------------
-- 10. SHIPMENT BOARD
-- Drivers post an upcoming trip (route + date + spare capacity) so
-- other drivers heading the same way on the same day can merge
-- cargo into one vehicle instead of running two half-empty trucks.
-- Visible to everyone in real time (plain GET, no auth) -- posting
-- and browsing work the same way driver_locations/notifications do.
-- ------------------------------------------------------------
CREATE TABLE shipment_posts (
    id                      SERIAL PRIMARY KEY,
    session_id              VARCHAR(64) NOT NULL,   -- same session_id as driver_locations
    driver_name             VARCHAR(200) NOT NULL,
    phone                   VARCHAR(20),
    vehicle_reg             VARCHAR(30),
    origin_text             VARCHAR(200) NOT NULL,
    origin_lat              DOUBLE PRECISION,
    origin_lon              DOUBLE PRECISION,
    dest_text               VARCHAR(200) NOT NULL,
    dest_lat                DOUBLE PRECISION,
    dest_lon                DOUBLE PRECISION,
    travel_date             DATE NOT NULL,
    travel_time             TIME,                    -- optional departure time; NULL if only a date was given
    cargo_type               VARCHAR(50),             -- 'medicine','food','construction','agriculture','general'
    available_capacity_kg    INTEGER,
    space_notes              TEXT,                    -- e.g. '2 crates of space, back of pickup'
    status                   VARCHAR(20) NOT NULL DEFAULT 'open',  -- 'open','merged','expired','cancelled'
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shipment_posts_open_date ON shipment_posts (travel_date) WHERE status = 'open';
CREATE INDEX idx_shipment_posts_session ON shipment_posts (session_id);

-- ------------------------------------------------------------
-- 10. ACCOUNTS
-- Real login credentials (bcrypt-hashed passwords). Separate from
-- REPORTERS on purpose: a "reporter" row is created automatically
-- the first time anyone (even anonymous/no-login) submits a field
-- report, while an ACCOUNT only exists for someone who registered
-- through /auth/register. role is the account's permanent access
-- level, checked against a shared passkey at registration time for
-- 'field_official'/'authority' -- see api/auth.py.
-- ------------------------------------------------------------
CREATE TABLE accounts (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(150) NOT NULL,
    phone           VARCHAR(20) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(30) NOT NULL,   -- 'driver', 'field_official', 'authority'
    created_at      TIMESTAMPTZ DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);
CREATE INDEX idx_accounts_phone ON accounts (phone);

ALTER TABLE road_segments
    ADD CONSTRAINT fk_road_segments_name_verified_by
    FOREIGN KEY (name_verified_by) REFERENCES accounts(id);

CREATE TABLE road_name_submissions (
    id                  SERIAL PRIMARY KEY,
    road_segment_id     INTEGER NOT NULL REFERENCES road_segments(id) ON DELETE CASCADE,
    account_id          INTEGER REFERENCES accounts(id),
    submitted_name      VARCHAR(200) NOT NULL,
    language            VARCHAR(12) NOT NULL DEFAULT 'en',
    note                TEXT,
    source              VARCHAR(40) NOT NULL DEFAULT 'driver_pass',
    status              VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by         INTEGER REFERENCES accounts(id),
    reviewed_at         TIMESTAMPTZ,
    UNIQUE (road_segment_id, account_id, submitted_name)
);
CREATE INDEX idx_road_name_submissions_segment ON road_name_submissions(road_segment_id, created_at DESC);
CREATE INDEX idx_road_name_submissions_status ON road_name_submissions(status, created_at DESC);

CREATE TABLE road_segment_passes (
    session_id          VARCHAR(64) NOT NULL,
    account_id          INTEGER REFERENCES accounts(id),
    road_segment_id     INTEGER NOT NULL REFERENCES road_segments(id) ON DELETE CASCADE,
    pass_count          INTEGER NOT NULL DEFAULT 1,
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_prompted_at    TIMESTAMPTZ,
    PRIMARY KEY (session_id, road_segment_id)
);
CREATE INDEX idx_road_segment_passes_segment ON road_segment_passes(road_segment_id, last_seen_at DESC);

-- ------------------------------------------------------------
-- Handy view: current status per segment (latest risk score +
-- any unresolved alerts). This is what the dashboard map queries.
-- ------------------------------------------------------------
CREATE VIEW segment_current_status AS
SELECT
    rs.id AS segment_id,
    rs.name,
    rs.corridor,
    rs.status,
    rs.geom,
    latest_risk.risk_score,
    latest_risk.risk_level,
    (SELECT COUNT(*) FROM alerts a WHERE a.segment_id = rs.id AND a.resolved_at IS NULL) AS active_alerts
FROM road_segments rs
LEFT JOIN LATERAL (
    SELECT risk_score, risk_level
    FROM risk_scores
    WHERE segment_id = rs.id
    ORDER BY computed_at DESC
    LIMIT 1
) latest_risk ON TRUE;


-- AI live dashcam detection tables
-- AI live dashcam hazard detection
CREATE TABLE IF NOT EXISTS ai_sessions (
    session_id VARCHAR(64) PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id),
    role VARCHAR(30) NOT NULL,
    last_seen_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_role_seen
ON ai_sessions (role, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS ai_detections (
    id UUID PRIMARY KEY,
    session_id VARCHAR(64),
    vehicle_id INTEGER REFERENCES vehicles(id),
    segment_id INTEGER REFERENCES road_segments(id),
    detection_type VARCHAR(50) NOT NULL,
    confidence NUMERIC(5,2) NOT NULL,
    hazard_score NUMERIC(5,2) NOT NULL,
    risk_score NUMERIC(5,2) NOT NULL,
    model_version VARCHAR(80) NOT NULL,
    provider VARCHAR(30) NOT NULL,
    evidence_url TEXT,
    description TEXT,
    location GEOMETRY(POINT, 4326) NOT NULL,
    detected_at TIMESTAMPTZ DEFAULT now(),
    alert_id INTEGER REFERENCES alerts(id),
    field_report_id UUID REFERENCES field_reports(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_detections_location
ON ai_detections USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_ai_detections_segment_time
ON ai_detections (segment_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_detections_time
ON ai_detections (detected_at DESC);
