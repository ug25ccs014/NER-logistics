"""
Removes road segments from the OLD 8-state import (Assam, Arunachal
Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Tripura, Sikkim) so
you can start fresh with the new, tightly-scoped corridor import.

This does NOT touch:
  - Your original 5-segment demo corridor (tagged "Dimapur-Kohima")
  - Any new corridor you've already imported with the updated
    import_roads.py (tagged "Dimapur-Kohima-Imphal Corridor" by default)

Run with:
    python clear_old_state_import.py
"""
import psycopg2
import config

OLD_STATE_LABELS = [
    "Assam", "Arunachal Pradesh", "Manipur", "Meghalaya",
    "Mizoram", "Nagaland", "Tripura", "Sikkim",
]


def get_connection():
    return psycopg2.connect(
        host=config.DB_HOST, port=config.DB_PORT, dbname=config.DB_NAME,
        user=config.DB_USER, password=config.DB_PASSWORD,
    )


def clear_old_import():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM road_segments WHERE corridor = ANY(%s);",
                (OLD_STATE_LABELS,),
            )
            ids = [row[0] for row in cur.fetchall()]

            if not ids:
                print("No segments found from the old 8-state import -- nothing to clear.")
                return

            print(f"Found {len(ids)} segment(s) from the old 8-state import. Deleting...")

            cur.execute("DELETE FROM risk_scores WHERE segment_id = ANY(%s);", (ids,))
            cur.execute("DELETE FROM alerts WHERE segment_id = ANY(%s);", (ids,))
            cur.execute(
                "DELETE FROM segment_connections WHERE segment_a_id = ANY(%s) OR segment_b_id = ANY(%s);",
                (ids, ids),
            )
            cur.execute("DELETE FROM road_segments WHERE id = ANY(%s);", (ids,))

        conn.commit()
        print(f"Cleared {len(ids)} segment(s) from the old import.")
        print("Your original demo corridor and any new corridor import are untouched.")
    finally:
        conn.close()


if __name__ == "__main__":
    clear_old_import()
