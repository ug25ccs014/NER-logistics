"""
Inserts a handful of example field reports so the "Recent Field
Reports" feature isn't empty on first load. Tied to the original
5-segment Dimapur-Kohima demo corridor, so they'll show up regardless
of whatever else has been imported.

Safe to run more than once -- it always adds new rows rather than
duplicate-checking, so only run this once per fresh database (after
DB/seed_data.sql, before or after any OSM import).

Run with:
    python seed_field_reports.py
"""
import psycopg2
import psycopg2.extras
import config

# (name, role, trust_score)
DEMO_REPORTERS = [
    ("Field Officer Rongsen", "field_official", 90.0),
    ("Local driver - Imliba", "driver", 55.0),
    ("Local driver - Tenzing", "driver", 50.0),
    ("Kohima PWD", "local_authority", 95.0),
]

# (reporter_index, report_type, description, lat, lon, hours_ago,
#  corroborated_by, verified)
# Coordinates are picked along the real seed segment geometries so
# they land visibly on the demo corridor.
DEMO_REPORTS = [
    (0, "landslide",
     "Landslide blocking one lane after heavy overnight rain. Traffic moving slowly single-file.",
     25.745, 93.985, 2, 1, True),
    (1, "landslide",
     "Confirming the landslide near Kigwema-Zubza -- same spot, still blocked this morning.",
     25.748, 93.982, 1, 0, False),
    (2, "flood",
     "Water level rising near the Piphema-Kigwema bridge, trucks advised to wait before crossing.",
     25.800, 93.905, 4, 0, False),
    (3, "clear",
     "Dimapur Exit - Chumukedima stretch fully cleared and reopened after yesterday's repair work.",
     25.895, 93.756, 20, 0, True),
]


def get_connection():
    return psycopg2.connect(
        host=config.DB_HOST, port=config.DB_PORT, dbname=config.DB_NAME,
        user=config.DB_USER, password=config.DB_PASSWORD,
    )


def seed_field_reports():
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            reporter_ids = []
            for name, role, trust in DEMO_REPORTERS:
                cur.execute(
                    "INSERT INTO reporters (name, role, trust_score) VALUES (%s, %s, %s) RETURNING id;",
                    (name, role, trust),
                )
                reporter_ids.append(cur.fetchone()["id"])

            for reporter_idx, report_type, description, lat, lon, hours_ago, corroborated_by, verified in DEMO_REPORTS:
                # Nearest segment within 20km, same rule the live API uses.
                cur.execute(
                    """
                    SELECT id, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography) AS dist_m
                    FROM road_segments
                    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                    LIMIT 1;
                    """,
                    (lon, lat, lon, lat),
                )
                nearest = cur.fetchone()
                segment_id = nearest["id"] if nearest and nearest["dist_m"] is not None and nearest["dist_m"] <= 20000 else None

                cur.execute(
                    """
                    INSERT INTO field_reports
                        (id, segment_id, reporter_id, report_type, description, location,
                         confidence_score, corroborated_by, captured_at, verified)
                    VALUES (gen_random_uuid(), %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                            %s, %s, now() - (%s || ' hours')::interval, %s);
                    """,
                    (segment_id, reporter_ids[reporter_idx], report_type, description, lon, lat,
                     70.0 + corroborated_by * 10, corroborated_by, hours_ago, verified),
                )

        conn.commit()
        print(f"Inserted {len(DEMO_REPORTERS)} demo reporter(s) and {len(DEMO_REPORTS)} demo field report(s).")
    finally:
        conn.close()


if __name__ == "__main__":
    seed_field_reports()
