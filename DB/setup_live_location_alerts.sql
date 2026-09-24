-- Run this once against an existing PostgreSQL database if desired.
-- The API also runs the same idempotent setup automatically on startup.

CREATE EXTENSION IF NOT EXISTS postgis;

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

CREATE TABLE IF NOT EXISTS notifications (
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
CREATE INDEX IF NOT EXISTS idx_notifications_pending
    ON notifications (to_session_id) WHERE delivered = FALSE;
