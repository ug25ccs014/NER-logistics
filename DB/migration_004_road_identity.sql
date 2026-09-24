-- Migration 004: NER Road Identity & Community Naming
-- Adds persistent road codes/names, naming submissions, and road-pass
-- observations used to discover unnamed roads from normal logistics trips.

ALTER TABLE road_segments
    ADD COLUMN IF NOT EXISTS road_code VARCHAR(40),
    ADD COLUMN IF NOT EXISTS official_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS local_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS suggested_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS name_status VARCHAR(40) NOT NULL DEFAULT 'named',
    ADD COLUMN IF NOT EXISTS name_source VARCHAR(80),
    ADD COLUMN IF NOT EXISTS name_verified_by INTEGER REFERENCES accounts(id),
    ADD COLUMN IF NOT EXISTS name_verified_at TIMESTAMPTZ;

-- Existing segments already have names in the original schema. Preserve those
-- names while assigning a stable machine-readable code. New imported unnamed
-- segments should use name = 'Unnamed Road' and name_status = 'unnamed'.
UPDATE road_segments
SET road_code = 'NER-SEG-' || id
WHERE road_code IS NULL;

UPDATE road_segments
SET name_status = 'named',
    official_name = CASE WHEN official_name IS NULL THEN name ELSE official_name END,
    name_source = CASE WHEN name_source IS NULL THEN 'existing_dataset' ELSE name_source END
WHERE name IS NOT NULL
  AND lower(trim(name)) NOT LIKE 'unnamed road%'
  AND lower(trim(name)) NOT IN ('', 'unnamed', 'unknown road');

UPDATE road_segments
SET name_status = 'unnamed',
    name_source = COALESCE(name_source, 'dataset_unnamed')
WHERE name IS NULL
   OR lower(trim(name)) LIKE 'unnamed road%'
   OR lower(trim(name)) IN ('', 'unnamed', 'unknown road');

ALTER TABLE road_segments
    DROP CONSTRAINT IF EXISTS road_segments_road_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_road_segments_road_code ON road_segments(road_code);
CREATE INDEX IF NOT EXISTS idx_road_segments_name_status ON road_segments(name_status);

CREATE TABLE IF NOT EXISTS road_name_submissions (
    id                  SERIAL PRIMARY KEY,
    road_segment_id     INTEGER NOT NULL REFERENCES road_segments(id) ON DELETE CASCADE,
    account_id          INTEGER REFERENCES accounts(id),
    submitted_name      VARCHAR(200) NOT NULL,
    language            VARCHAR(12) NOT NULL DEFAULT 'en',
    note                TEXT,
    source              VARCHAR(40) NOT NULL DEFAULT 'driver_pass',
    status              VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by         INTEGER REFERENCES accounts(id),
    reviewed_at         TIMESTAMPTZ,
    UNIQUE (road_segment_id, account_id, submitted_name)
);
CREATE INDEX IF NOT EXISTS idx_road_name_submissions_segment
    ON road_name_submissions(road_segment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_road_name_submissions_status
    ON road_name_submissions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS road_segment_passes (
    session_id          VARCHAR(64) NOT NULL,
    account_id          INTEGER REFERENCES accounts(id),
    road_segment_id     INTEGER NOT NULL REFERENCES road_segments(id) ON DELETE CASCADE,
    pass_count          INTEGER NOT NULL DEFAULT 1,
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_prompted_at    TIMESTAMPTZ,
    PRIMARY KEY (session_id, road_segment_id)
);
CREATE INDEX IF NOT EXISTS idx_road_segment_passes_segment
    ON road_segment_passes(road_segment_id, last_seen_at DESC);

-- Keep the code available to fresh installs as well as migrations.
COMMENT ON TABLE road_name_submissions IS 'Community/local submissions for naming NER road segments.';
COMMENT ON TABLE road_segment_passes IS 'Anonymous-to-other-users trip observations showing which sessions actually travelled a road segment.';
