"""
One-time migration: adds the driver_locations table used for live
location sharing ("nearby help" / stuck-driver feature). Safe to run
more than once (CREATE TABLE IF NOT EXISTS).

This isn't in DB/schema.sql because schema.sql only runs automatically
the FIRST time the Postgres container is created (docker-entrypoint-initdb.d
scripts don't re-run against an existing data volume) -- so an already-running
database needs this applied directly.

Run with:
    python add_driver_locations_table.py
"""
import psycopg2
import config

MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS driver_locations (
    session_id      VARCHAR(64) PRIMARY KEY,
    driver_name     VARCHAR(200) NOT NULL,
    phone           VARCHAR(20),
    role            VARCHAR(30) NOT NULL DEFAULT 'driver',  -- 'driver' or 'field_official'
    location        GEOGRAPHY(POINT, 4326) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' or 'stuck'
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_location
    ON driver_locations USING GIST (location);
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
        print("Done. driver_locations table is ready (created if it didn't already exist).")
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
