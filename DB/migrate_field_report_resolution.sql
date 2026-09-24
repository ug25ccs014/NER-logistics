-- ============================================================
-- Migration: field report auto-resolution
-- ============================================================
-- schema.sql only runs automatically against a FRESH docker volume
-- (docker-entrypoint-initdb.d). If your DB already exists, run this
-- once against it instead:
--
--   docker exec -i ner_logistics_db psql -U ner_admin -d ner_logistics < migrate_field_report_resolution.sql
--
-- Safe to run more than once (IF NOT EXISTS / IF EXISTS guards).

ALTER TABLE field_reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE field_reports ADD COLUMN IF NOT EXISTS resolved_by_report_id UUID REFERENCES field_reports(id);

CREATE INDEX IF NOT EXISTS idx_field_reports_active ON field_reports (segment_id) WHERE resolved_at IS NULL;
