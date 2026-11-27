import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { API_BASE } from '../api.js';
import { PLANS } from '../config/plans.js';

// Holds the signed-in account's subscription plan and the usage that
// the Free plan limits (routes searched this month).
//
// Source of truth is the backend (GET/POST /billing/...) when that
// router is installed (see api/billing.py). If the backend does not
// have it yet, the plan is kept on this device per account so the
// whole flow still works in a demo.
//
// Field officers and authority accounts are provisioned by an agency
// licence, so they are treated as the Agency plan and never see locks.

const PlanContext = createContext(null);

const monthKey = () => new Date().toISOString().slice(0, 7); // 2026-11
const readJSON = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const getToken = () => localStorage.getItem('ner_token') || sessionStorage.getItem('ner_token');

async function billingFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...options,
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export function PlanProvider({ children }) {
  const { isAuthenticated, role, phone, name } = useAuth();
  const accountKey = phone || name || 'anon';
  const planKey = `ner_plan_${accountKey}`;
  const usageKey = `ner_route_usage_${accountKey}`;

  const [subscription, setSubscription] = useState(() => readJSON(planKey, { plan: 'free' }));
  const [usage, setUsage] = useState(() => readJSON(usageKey, { month: monthKey(), routes: 0 }));

  // Reload when the account changes (login / logout).
  useEffect(() => {
    setSubscription(readJSON(planKey, { plan: 'free' }));
    const u = readJSON(usageKey, { month: monthKey(), routes: 0 });
    setUsage(u.month === monthKey() ? u : { month: monthKey(), routes: 0 });
  }, [planKey, usageKey]);

  // Ask the server for the real plan if the billing router exists.
  useEffect(() => {
    if (!isAuthenticated || role !== 'driver') return;
    billingFetch('/billing/plan')
      .then((data) => {
        if (data?.plan && PLANS[data.plan]) {
          const sub = { plan: data.plan, vehicles: data.vehicles || 1, interval: data.interval || 'monthly' };
          setSubscription(sub);
          localStorage.setItem(planKey, JSON.stringify(sub));
          if (typeof data.routes_used_this_month === 'number') {
            const u = { month: monthKey(), routes: data.routes_used_this_month };
            setUsage(u);
            localStorage.setItem(usageKey, JSON.stringify(u));
          }
        }
      })
      .catch(() => { /* billing router not installed yet: keep the on-device plan */ });
  }, [isAuthenticated, role, planKey, usageKey]);

  const planId = role && role !== 'driver' ? 'agency' : (PLANS[subscription.plan] ? subscription.plan : 'free');
  const plan = PLANS[planId];
  const isManaged = role && role !== 'driver'; // agency-provisioned accounts

  const routesUsed = usage.month === monthKey() ? usage.routes : 0;
  const routeLimit = plan.limits.routesPerMonth;
  const routesLeft = Number.isFinite(routeLimit) ? Math.max(0, routeLimit - routesUsed) : Infinity;

  const can = useCallback((feature) => Boolean(plan.features[feature]), [plan]);

  // Call once per successful route search. Returns false (and does not
  // count) when the Free allowance is already used up.
  const canSearchRoute = useCallback(() => routesLeft > 0, [routesLeft]);

  const recordRoute = useCallback(() => {
    setUsage((prev) => {
      const base = prev.month === monthKey() ? prev : { month: monthKey(), routes: 0 };
      const next = { month: base.month, routes: base.routes + 1 };
      localStorage.setItem(usageKey, JSON.stringify(next));
      return next;
    });
    billingFetch('/billing/usage/route', { method: 'POST' }).catch(() => {});
  }, [usageKey]);

  const subscribe = useCallback(async ({ plan: newPlan, vehicles = 1, interval = 'monthly' }) => {
    const sub = { plan: newPlan, vehicles, interval, startedAt: new Date().toISOString() };
    try {
      await billingFetch('/billing/subscribe', { method: 'POST', body: JSON.stringify({ plan: newPlan, vehicles, interval }) });
    } catch { /* no billing router yet: store on this device */ }
    localStorage.setItem(planKey, JSON.stringify(sub));
    setSubscription(sub);
    return sub;
  }, [planKey]);

  const cancel = useCallback(async () => subscribe({ plan: 'free' }), [subscribe]);

  const value = useMemo(() => ({
    planId, plan, subscription, isManaged,
    routesUsed, routeLimit, routesLeft,
    sosLimit: plan.limits.sosPeople,
    can, canSearchRoute, recordRoute, subscribe, cancel,
  }), [planId, plan, subscription, isManaged, routesUsed, routeLimit, routesLeft, can, canSearchRoute, recordRoute, subscribe, cancel]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used inside <PlanProvider>');
  return ctx;
}
