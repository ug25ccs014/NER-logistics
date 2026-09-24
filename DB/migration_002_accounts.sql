-- ============================================================
-- Migration 002: real authentication
-- Adds the `accounts` table for bcrypt-hashed login credentials.
-- Safe to run against a database that already has schema.sql applied
-- -- IF NOT EXISTS means running it twice (or against a fresh DB that
-- already has this from schema.sql) is a harmless no-op.
--
-- Run with:
--   psql -h <host> -U <user> -d <dbname> -f DB/migration_002_accounts.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS accounts (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(150) NOT NULL,
    phone           VARCHAR(20) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(30) NOT NULL,   -- 'driver', 'field_official', 'authority'
    created_at      TIMESTAMPTZ DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_accounts_phone ON accounts (phone);
