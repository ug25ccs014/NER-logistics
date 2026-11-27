import React from 'react';
import { Link } from 'react-router-dom';
import { usePlan } from '../context/PlanContext.jsx';

// Home-screen strip: current plan, free usage meter and the Upgrade button.
export default function PlanStrip() {
  const { plan, planId, isManaged, routesUsed, routeLimit, sosLimit, subscription, synced } = usePlan();

  if (isManaged) {
    return (
      <div className="plan-strip">
        <div className="plan-strip-text">
          <span className="plan-strip-title">Agency plan</span>
          <span className="plan-strip-sub">Every tool is included in your agency licence.</span>
        </div>
      </div>
    );
  }

  const limited = Number.isFinite(routeLimit);
  const pct = limited ? Math.min(100, (routesUsed / routeLimit) * 100) : 0;
  return (
    <div className="plan-strip">
      <div className="plan-strip-text">
        <span className="plan-strip-title">{plan.name} plan</span>
        {limited ? (
          <>
            <span className="plan-strip-sub">{routesUsed} of {routeLimit} routes used this month · SOS for up to {sosLimit} people</span>
            <div className={`plan-strip-meter ${pct >= 80 ? 'warn' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={routeLimit} aria-valuenow={routesUsed} aria-label="Routes used this month">
              <span style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <span className="plan-strip-sub">
            Unlimited routes and SOS contacts{planId !== 'agency' && subscription.vehicles ? ` · ${subscription.vehicles} vehicle${subscription.vehicles > 1 ? 's' : ''}` : ''}.
          </span>
        )}
        {!synced && planId !== 'free' && (
          <span className="plan-strip-sub" style={{ color: '#B5472F' }}>This plan is saved on this device only. It is not linked to your account yet.</span>
        )}
      </div>
      <Link to="/plans" className="plan-strip-btn">{planId === 'free' ? 'Upgrade plan' : 'Manage plan'}</Link>
    </div>
  );
}
