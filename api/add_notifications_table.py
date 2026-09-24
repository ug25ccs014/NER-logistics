"""
One-time migration: adds the notifications table used for direct,
targeted notifications (the "Notify" button on a specific person's
map popup -- as opposed to the broad "anyone stuck nearby" polling,
which isn't targeted and can be slow/inaccurate). Safe to run more
than once (CREATE TABLE IF NOT EXISTS).

This isn't in DB/schema.sql's auto-run path for the same reason
add_driver_locations_table.py isn't -- schema.sql only applies on a
brand-new Postgres data volume, so an already-running database needs
this applied directly.

Run with:
    python add_notifications_table.py
"""
import psycopg2
import config

MIGRATION_SQL = """
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

-- Powers "give me my pending notifications" -- the common poll query.
CREATE INDEX IF NOT EXISTS idx_notifications_pending
    ON notifications (to_session_id) WHERE delivered = FALSE;
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
        print("Done. notifications table is ready (created if it didn't already exist).")
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
