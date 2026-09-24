"""
One-time migration: adds the shipment_posts table used for the
"Shipment / Cargo-Sharing Board" -- drivers post an upcoming trip
(route + date + spare capacity) so other drivers heading the same
way on the same day can merge cargo into one vehicle instead of
running two half-empty trucks. Safe to run more than once
(CREATE TABLE IF NOT EXISTS).

This isn't in DB/schema.sql's auto-run path for the same reason
add_notifications_table.py isn't -- schema.sql only applies on a
brand-new Postgres data volume, so an already-running database needs
this applied directly.

Run with:
    python add_shipment_board_table.py
"""
import psycopg2
import config

MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS shipment_posts (
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
    travel_time             TIME,                    -- optional departure time; NULL if the driver only gave a date
    cargo_type               VARCHAR(50),             -- 'medicine','food','construction','agriculture','general'
    available_capacity_kg    INTEGER,
    space_notes              TEXT,                    -- e.g. '2 crates of space, back of pickup'
    status                   VARCHAR(20) NOT NULL DEFAULT 'open',  -- 'open','merged','expired','cancelled'
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Powers "show me open posts for this date, soonest first" -- the
-- board's main query.
CREATE INDEX IF NOT EXISTS idx_shipment_posts_open_date
    ON shipment_posts (travel_date) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_shipment_posts_session
    ON shipment_posts (session_id);

-- Safe to run again on a table that already exists from before
-- travel_time was added.
ALTER TABLE shipment_posts ADD COLUMN IF NOT EXISTS travel_time TIME;
"""


def get_connection():
    return psycopg2.connect(
        host=config.DB_HOST, port=config.DB_PORT, dbname=config.DB_NAME,
        user=config.DB_USER, password=config.DB_PASSWORD,
    )


def migrate():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(MIGRATION_SQL)
        conn.commit()
        print("Done. shipment_posts table is ready (created if it didn't already exist).")
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
