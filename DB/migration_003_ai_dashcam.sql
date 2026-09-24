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
