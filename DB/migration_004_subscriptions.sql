-- Subscription plan per account + monthly route usage (Free plan limit).
-- account_key is the account id (or phone) as text, so it works whatever type accounts.id is.
CREATE TABLE IF NOT EXISTS subscriptions (
    account_key  TEXT PRIMARY KEY,
    plan         TEXT    NOT NULL DEFAULT 'free' CHECK (plan IN ('free','fleet','fleet_pro','agency')),
    vehicles     INTEGER NOT NULL DEFAULT 1 CHECK (vehicles >= 1),
    billing_interval TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly','yearly')),
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_usage (
    account_key  TEXT    NOT NULL,
    month        TEXT    NOT NULL,              -- 'YYYY-MM'
    routes       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_key, month)
);
