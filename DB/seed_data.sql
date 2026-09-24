-- ============================================================
-- Seed data: Dimapur - Kohima corridor (NH-29), Nagaland
-- Real-world approximate coordinates, used for the demo build.
-- Run after schema.sql
-- ============================================================

-- Districts
INSERT INTO districts (name, state, geom, is_remote) VALUES
('Dimapur', 'Nagaland', ST_GeomFromText(
    'POLYGON((93.70 25.85, 93.90 25.85, 93.90 25.98, 93.70 25.98, 93.70 25.85))', 4326), FALSE),
('Kohima', 'Nagaland', ST_GeomFromText(
    'POLYGON((94.05 25.60, 94.20 25.60, 94.20 25.75, 94.05 25.75, 94.05 25.60))', 4326), TRUE);

-- Road segments along NH-29, Dimapur (25.9091, 93.7278) to Kohima (25.6751, 94.1086)
-- Broken into 5 segments for demo purposes, roughly following the highway.
INSERT INTO road_segments
(name, corridor, district_id, geom, length_km, road_type, has_bridge, max_load_kg, seasonal_restriction, avg_slope_deg, normal_travel_min, status)
VALUES
('NH-29 Dimapur Exit - Chumukedima', 'Dimapur-Kohima', 1,
    ST_GeomFromText('LINESTRING(93.7278 25.9091, 93.7850 25.8800)', 4326),
    9.5, 'NH', FALSE, NULL, NULL, 4.2, 15, 'open'),

('NH-29 Chumukedima - Piphema', 'Dimapur-Kohima', 1,
    ST_GeomFromText('LINESTRING(93.7850 25.8800, 93.8600 25.8300)', 4326),
    11.2, 'NH', TRUE, 12000, NULL, 9.8, 20, 'open'),

('NH-29 Piphema - Kigwema Bridge', 'Dimapur-Kohima', 2,
    ST_GeomFromText('LINESTRING(93.8600 25.8300, 93.9500 25.7700)', 4326),
    14.8, 'NH', TRUE, 8000, 'Bailey bridge, single-lane, weight-restricted', 18.5, 30, 'open'),

('NH-29 Kigwema - Zubza (landslide-prone stretch)', 'Dimapur-Kohima', 2,
    ST_GeomFromText('LINESTRING(93.9500 25.7700, 94.0200 25.7200)', 4326),
    10.4, 'NH', FALSE, NULL, 'Frequent landslides during monsoon (Jun-Sep)', 27.3, 25, 'open'),

('NH-29 Zubza - Kohima Town', 'Dimapur-Kohima', 2,
    ST_GeomFromText('LINESTRING(94.0200 25.7200, 94.1086 25.6751)', 4326),
    8.9, 'NH', FALSE, NULL, NULL, 15.1, 18, 'open');

-- Connect the segments into a routable chain
INSERT INTO segment_connections (segment_a_id, segment_b_id, junction_name) VALUES
(1, 2, 'Chumukedima Junction'),
(2, 3, 'Piphema'),
(3, 4, 'Kigwema Bridge'),
(4, 5, 'Zubza');

-- Sample reporters
INSERT INTO reporters (name, phone, role, trust_score) VALUES
('Field Officer - Kohima PWD', '+919000000001', 'field_official', 85.0),
('Local Truck Driver', '+919000000002', 'driver', 60.0);

-- Sample risk scores (segment 4 is the landslide-prone stretch — flagged high)
INSERT INTO risk_scores (segment_id, risk_score, rainfall_24h_mm, rainfall_72h_mm, risk_level, model_version) VALUES
(1, 12.0, 5.0, 20.0, 'low', 'rule_v1'),
(2, 28.0, 10.0, 35.0, 'moderate', 'rule_v1'),
(3, 35.0, 15.0, 48.0, 'moderate', 'rule_v1'),
(4, 78.0, 62.0, 140.0, 'severe', 'rule_v1'),
(5, 22.0, 8.0, 30.0, 'low', 'rule_v1');

-- Sample active alert on the high-risk segment
INSERT INTO alerts (segment_id, alert_type, severity, message, source) VALUES
(4, 'high_risk', 'critical', 'Segment Kigwema-Zubza flagged severe landslide risk after 62mm rainfall in 24h.', 'risk_model');

-- Sample field report corroborating it
INSERT INTO field_reports (id, segment_id, reporter_id, report_type, description, location, confidence_score, corroborated_by, captured_at, verified) VALUES
(gen_random_uuid(), 4, 1, 'landslide', 'Small landslide debris on shoulder near Km 34, one lane passable.',
    ST_GeomFromText('POINT(93.9800 25.7450)', 4326), 82.0, 1, now(), TRUE);
