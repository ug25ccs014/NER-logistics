"""Subscription plans for the NER web app.

Endpoints (all need a logged-in account):
  GET  /billing/plan             -> {plan, vehicles, interval, routes_used_this_month}
  POST /billing/subscribe        -> body {plan, vehicles, interval}   (test mode, no real payment)
  POST /billing/usage/route      -> counts one route search for the Free plan

The frontend (ner-frontend/src/context/PlanContext.jsx) already calls these and
falls back to an on-device plan while they are missing, so installing this file
is what moves the plan from "this browser" to "this account".

This file does not import your existing modules. main.py passes in two things it
already has (see BILLING_SETUP.md):
  get_current_account : the FastAPI dependency your /auth/me route uses
  get_conn            : a function returning a DB-API connection (psycopg2 / psycopg)
"""
from datetime import datetime
from typing import Callable, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

Plan = Literal["free", "fleet", "fleet_pro", "agency"]
FREE_ROUTES_PER_MONTH = 10


class SubscribeBody(BaseModel):
    plan: Plan
    vehicles: int = Field(1, ge=1, le=500)
    interval: Literal["monthly", "yearly"] = "monthly"


def _month() -> str:
    return datetime.utcnow().strftime("%Y-%m")


def build_billing_router(get_current_account: Callable, get_conn: Callable) -> APIRouter:
    router = APIRouter(prefix="/billing", tags=["billing"])

    def _account_id(account) -> int:
        # Works whether your dependency returns a dict or an object.
        if isinstance(account, dict):
            return account.get("id") or account["account_id"]
        return getattr(account, "id", None) or getattr(account, "account_id")

    def _role(account) -> str:
        return account.get("role") if isinstance(account, dict) else getattr(account, "role", "")

    def _read(account_id: int) -> dict:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT plan, vehicles, billing_interval FROM subscriptions WHERE account_id = %s",
                    (account_id,),
                )
                row = cur.fetchone()
                cur.execute(
                    "SELECT routes FROM route_usage WHERE account_id = %s AND month = %s",
                    (account_id, _month()),
                )
                used = cur.fetchone()
            plan, vehicles, interval = row if row else ("free", 1, "monthly")
            return {
                "plan": plan,
                "vehicles": vehicles,
                "interval": interval,
                "routes_used_this_month": used[0] if used else 0,
            }
        finally:
            conn.close()

    @router.get("/plan")
    def get_plan(account=Depends(get_current_account)):
        return _read(_account_id(account))

    @router.post("/subscribe")
    def subscribe(body: SubscribeBody, account=Depends(get_current_account)):
        # Test mode: switches the plan immediately. Put the payment gateway
        # (Razorpay) confirmation check here before the INSERT when going live.
        account_id = _account_id(account)
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO subscriptions (account_id, plan, vehicles, billing_interval, started_at)
                    VALUES (%s, %s, %s, %s, now())
                    ON CONFLICT (account_id) DO UPDATE
                      SET plan = EXCLUDED.plan, vehicles = EXCLUDED.vehicles,
                          billing_interval = EXCLUDED.billing_interval, started_at = now()
                    """,
                    (account_id, body.plan, body.vehicles, body.interval),
                )
            conn.commit()
        finally:
            conn.close()
        return _read(account_id)

    @router.post("/usage/route")
    def count_route(account=Depends(get_current_account)):
        account_id = _account_id(account)
        state = _read(account_id)
        if state["plan"] == "free" and _role(account) == "driver" \
                and state["routes_used_this_month"] >= FREE_ROUTES_PER_MONTH:
            raise HTTPException(status_code=402, detail="Free plan route limit reached. Upgrade to continue.")
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO route_usage (account_id, month, routes) VALUES (%s, %s, 1)
                    ON CONFLICT (account_id, month) DO UPDATE SET routes = route_usage.routes + 1
                    """,
                    (account_id, _month()),
                )
            conn.commit()
        finally:
            conn.close()
        return _read(account_id)

    return router
