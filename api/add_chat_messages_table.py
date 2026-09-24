"""
One-time migration: adds the chat_messages table used for direct,
threaded chat between two sessions (driver <-> field officer <->
authority) -- the "Chat" button next to "Notify" on a person's
profile, plus the Inbox / Messages section available to all three
roles. Separate from `notifications`, which is a one-shot mailbox
for a single alert rather than a back-and-forth conversation.

Safe to run more than once (CREATE TABLE IF NOT EXISTS). Not in
DB/schema.sql's auto-run path for the same reason
add_notifications_table.py isn't -- schema.sql only applies on a
brand-new Postgres data volume, so an already-running database needs
this applied directly.

Run with:
    python add_chat_messages_table.py
"""
import psycopg2
import config

MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS chat_messages (
    id              SERIAL PRIMARY KEY,
    from_session_id VARCHAR(64) NOT NULL,
    from_name       VARCHAR(200),
    from_role       VARCHAR(30),
    to_session_id   VARCHAR(64) NOT NULL,
    to_name         VARCHAR(200),
    message         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at         TIMESTAMPTZ
);

-- Powers "give me the thread between me and this other person",
-- in either direction.
CREATE INDEX IF NOT EXISTS idx_chat_messages_from_to
    ON chat_messages (from_session_id, to_session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_to_from
    ON chat_messages (to_session_id, from_session_id, created_at);

-- Powers "how many unread do I have", used for the inbox badge.
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
    ON chat_messages (to_session_id) WHERE read_at IS NULL;
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
        print("Done. chat_messages table is ready (created if it didn't already exist).")
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
