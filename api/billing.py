"""Subscription plans for the NER web app (server-side storage).

Install with two lines at the very END of api/main.py (after every route is defined):

    import billing
    billing.install(app)

It finds your existing /auth/me route and reuses it to know who is logged in, and it
creates its own two tables on first use, so nothing else needs to be wired up.
Database: uses the DATABASE_URL environment variable (psycopg2 or psycopg).

Endpoints (logged-in account required):
  GET  /billing/plan         -> {plan, vehicles, interval, routes_used_this_month}
  POST /billing/subscribe    -> body {plan, vehicles, interval}   (test mode, no real payment)
  POST /billing/usage/route  -> counts one route search for the Free plan
"""
import os
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

FREE_ROUTES_PER_MONTH = 10

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS subscriptions (
    account_key TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'free',
    vehicles INTEGER NOT NULL DEFAULT 1,
    billing_interval TEXT NOT NULL DEFAULT 'monthly',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS route_usage (
    account_key TEXT NOT NULL,
    month TEXT NOT NULL,
    routes INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_key, month)
);
"""


class SubscribeBody(BaseModel):
    plan: Literal["free", "fleet", "fleet_pro", "agency"]
    vehicles: int = Field(1, ge=1, le=500)
    interval: Literal["monthly", "yearly"] = "monthly"


def _month() -> str:
    return datetime.utcnow().strftime("%Y-%m")


def _connect():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        # Fall back to a connection helper in your db.py if DATABASE_URL is not set.
        import db  # type: ignore
        for name in ("get_conn", "get_connection", "connect", "get_db_connection"):
            fn = getattr(db, name, None)
            if callable(fn):
                return fn()
        raise RuntimeError("billing: set DATABASE_URL or expose get_conn() in db.py")
    try:
        import psycopg2 as driver  # type: ignore
    except ImportError:
        import psycopg as driver  # type: ignore
    return driver.connect(dsn)


def _as_dict(obj):
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    for attr in ("model_dump", "dict"):
        fn = getattr(obj, attr, None)
        if callable(fn):
            try:
                return fn()
            except Exception:
                pass
    return {k: v for k, v in vars(obj).items() if not k.startswith("_")} if hasattr(obj, "__dict__") else {}


def _get(obj, *names):
    """Find the first of `names` at the top level or one level down (e.g. {"account": {...}})."""
    data = _as_dict(obj)
    for n in names:
        if data.get(n) is not None:
            return data[n]
    for v in data.values():
        inner = _as_dict(v) if not isinstance(v, (str, int, float, bool, list)) else {}
        for n in names:
            if inner.get(n) is not None:
                return inner[n]
    return None


def _account_key(account) -> str:
    key = _get(account, "id", "account_id", "user_id", "phone")
    if key is None:
        seen = sorted(_as_dict(account).keys())
        raise HTTPException(
            status_code=401,
            detail=f"billing: could not find an account id/phone in the /auth/me result (keys: {seen})",
        )
    return str(key)


def _read(key: str) -> dict:
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
            cur.execute("SELECT plan, vehicles, billing_interval FROM subscriptions WHERE account_key = %s", (key,))
            row = cur.fetchone()
            cur.execute("SELECT routes FROM route_usage WHERE account_key = %s AND month = %s", (key, _month()))
            used = cur.fetchone()
        conn.commit()
        plan, vehicles, interval = row if row else ("free", 1, "monthly")
        return {"plan": plan, "vehicles": vehicles, "interval": interval,
                "routes_used_this_month": used[0] if used else 0}
    finally:
        conn.close()


def install(app: FastAPI) -> None:
    # Reuse the existing /auth/me route to learn who is logged in.
    me = next((r for r in app.routes if getattr(r, "path", "") in ("/auth/me", "/auth/me/")), None)
    if me is None:
        raise RuntimeError("billing.install: no /auth/me route found; call install(app) after your routes are defined")
    current_account = me.endpoint

    router = APIRouter(prefix="/billing", tags=["billing"])

    @router.get("/plan")
    def get_plan(account=Depends(current_account)):
        return _read(_account_key(account))

    @router.post("/subscribe")
    def subscribe(body: SubscribeBody, account=Depends(current_account)):
        # Test mode. Check the payment gateway's confirmation here before saving when going live.
        key = _account_key(account)
        conn = _connect()
        try:
            with conn.cursor() as cur:
                cur.execute(SCHEMA_SQL)
                cur.execute(
                    """
                    INSERT INTO subscriptions (account_key, plan, vehicles, billing_interval, started_at)
                    VALUES (%s, %s, %s, %s, now())
                    ON CONFLICT (account_key) DO UPDATE
                      SET plan = EXCLUDED.plan, vehicles = EXCLUDED.vehicles,
                          billing_interval = EXCLUDED.billing_interval, started_at = now()
                    """,
                    (key, body.plan, body.vehicles, body.interval),
                )
            conn.commit()
        finally:
            conn.close()
        return _read(key)

    @router.post("/usage/route")
    def count_route(account=Depends(current_account)):
        key = _account_key(account)
        state = _read(key)
        role = _get(account, "role")
        if state["plan"] == "free" and role in (None, "driver") \
                and state["routes_used_this_month"] >= FREE_ROUTES_PER_MONTH:
            raise HTTPException(status_code=402, detail="Free plan route limit reached. Upgrade to continue.")
        conn = _connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO route_usage (account_key, month, routes) VALUES (%s, %s, 1)
                    ON CONFLICT (account_key, month) DO UPDATE SET routes = route_usage.routes + 1
                    """,
                    (key, _month()),
                )
            conn.commit()
        finally:
            conn.close()
        return _read(key)

    app.include_router(router)
