"""
Removes road segments that were imported by import_roads.py, WITHOUT
touching the original demo seed data (the 5 Dimapur-Kohima segments
from DB/seed_data.sql, corridor = "Dimapur-Kohima").

Any segment whose corridor is anything other than "Dimapur-Kohima" is
considered an OSM import and gets deleted, along with everything that
references it (connections, risk scores, field reports, alerts) --
this is what lets you re-run import_roads.py against a smaller test
region without duplicating or mixing in a previous larger import.

Run with:
    python reset_imported_roads.py
"""
import psycopg2
import config

SEED_CORRIDOR = "Dimapur-Kohima"  # matches DB/seed_data.sql -- never deleted


def get_connection():
    return psycopg2.connect(
        host=config.DB_HOST, port=config.DB_PORT, dbname=config.DB_NAME,
        user=config.DB_USER, password=config.DB_PASSWORD,
    )


def reset_imported_roads():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM road_segments WHERE corridor != %s;", (SEED_CORRIDOR,))
            ids = [row[0] for row in cur.fetchall()]

            if not ids:
                print(f"Nothing to reset -- only the original '{SEED_CORRIDOR}' seed segments exist.")
                return

            print(f"Found {len(ids)} imported segment(s) to remove (keeping '{SEED_CORRIDOR}' seed data intact).")

            cur.execute(
                "DELETE FROM segment_connections WHERE segment_a_id = ANY(%s) OR segment_b_id = ANY(%s);",
                (ids, ids),
            )
            print(f"  Removed {cur.rowcount} segment connection(s).")

            cur.execute("DELETE FROM risk_scores WHERE segment_id = ANY(%s);", (ids,))
            print(f"  Removed {cur.rowcount} risk score(s).")

            cur.execute("DELETE FROM field_reports WHERE segment_id = ANY(%s);", (ids,))
            print(f"  Removed {cur.rowcount} field report(s).")

            cur.execute("DELETE FROM alerts WHERE segment_id = ANY(%s);", (ids,))
            print(f"  Removed {cur.rowcount} alert(s).")

            cur.execute("DELETE FROM road_segments WHERE id = ANY(%s);", (ids,))
            print(f"  Removed {cur.rowcount} road segment(s).")

        conn.commit()
        print(f"\nDone. Only the original '{SEED_CORRIDOR}' demo segments remain.")
        print("You can now run import_roads.py again for the new (smaller) BOUNDING_BOX region.")
    finally:
        conn.close()


if __name__ == "__main__":
    reset_imported_roads()
