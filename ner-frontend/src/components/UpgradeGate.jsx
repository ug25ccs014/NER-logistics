import React from 'react';
import { Link } from 'react-router-dom';
import { PLANS, FEATURE_PLAN_HINT } from '../config/plans.js';

const COPY = {
  shipments: 'Post spare capacity, find another driver to merge cargo with, and preview trip risk for your departure time.',
  dashcam: 'Detect landslides, floods and road hazards from live camera frames and alert the nearest field officer automatically.',
};

// Shown inside the workspace instead of a tool the current plan does not include.
export default function UpgradeGate({ feature, toolLabel }) {
  const needed = PLANS[FEATURE_PLAN_HINT[feature]];
  return (
    <div className="upgrade-gate">
      <h3>{toolLabel} is available on {needed.name}</h3>
      <p>{COPY[feature]}</p>
      <Link className="plan-strip-btn" to={`/plans?feature=${feature}`}>See plans</Link>
    </div>
  );
}
