import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { usePlan } from '../context/PlanContext.jsx';
import {
  PLANS, PLAN_ORDER, ENTERPRISE_OFFERS, YEARLY_DISCOUNT,
  formatINR, perVehiclePrice, FEATURE_PLAN_HINT,
} from '../config/plans.js';

const FEATURE_LABEL = { shipments: 'Shipment Board', dashcam: 'Live Dashcam AI' };

function PriceBlock({ plan, interval }) {
  if (plan.id === 'free') {
    return (
      <div className="plan-price">
        <span className="plan-amount">₹0</span>
        <span className="plan-per">{plan.priceNote}</span>
      </div>
    );
  }
  if (plan.flatYearly) {
    return (
      <div className="plan-price">
        <span className="plan-amount">{formatINR(plan.flatYearly)}</span>
        <span className="plan-per">{plan.priceNote}<br />billed yearly</span>
      </div>
    );
  }
  const price = perVehiclePrice(plan, interval);
  return (
    <div className="plan-price">
      <span className="plan-amount">{formatINR(price)}</span>
      <span className="plan-per">
        {plan.priceNote}<br />
        {interval === 'yearly' ? `billed yearly, ${formatINR(price * 12)} per vehicle` : 'billed monthly'}
      </span>
    </div>
  );
}

function Checkout({ plan, interval, onClose, onDone }) {
  const { subscribe, subscription } = usePlan();
  const [vehicles, setVehicles] = useState(subscription.plan === plan.id ? subscription.vehicles || 1 : 1);
  const [savedOnServer, setSavedOnServer] = useState(true);
  const [stage, setStage] = useState('review'); // review | paying | done
  const isFlat = Boolean(plan.flatYearly);
  const unit = perVehiclePrice(plan, interval);
  const total = isFlat ? plan.flatYearly : unit * vehicles * (interval === 'yearly' ? 12 : 1);

  const pay = async () => {
    setStage('paying');
    await new Promise((r) => setTimeout(r, 1100)); // test-mode payment
    const result = await subscribe({ plan: plan.id, vehicles: isFlat ? 1 : vehicles, interval: isFlat ? 'yearly' : interval });
    setSavedOnServer(result.savedOnServer);
    setStage('done');
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && stage !== 'paying') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, stage]);

  return (
    <div className="plans-modal-backdrop" onClick={() => stage !== 'paying' && onClose()}>
      <div className="plans-modal" role="dialog" aria-modal="true" aria-label={`Subscribe to ${plan.name}`} onClick={(e) => e.stopPropagation()}>
        {stage === 'done' ? (
          <>
            <h2>You are on {plan.name}</h2>
            <p className="plans-modal-sub">Your plan is active. New tools are unlocked on your dashboard.</p>
            {!savedOnServer && (
              <p className="plans-gst" style={{ color: '#B5472F' }}>
                Could not reach the server, so this plan is saved on this device only. It will be linked to your account the next time you open the app with a connection.
              </p>
            )}
            <button type="button" className="plans-btn plans-btn-solid" onClick={onDone}>Go to dashboard</button>
          </>
        ) : (
          <>
            <h2>Subscribe to {plan.name}</h2>
            <p className="plans-modal-sub">Test mode: no real payment is taken.</p>
            {!isFlat && (
              <div className="plans-qty">
                <span>Vehicles</span>
                <div className="plans-qty-ctl">
                  <button type="button" aria-label="Fewer vehicles" onClick={() => setVehicles((v) => Math.max(1, v - 1))}>−</button>
                  <input aria-label="Number of vehicles" type="number" min="1" max="500" value={vehicles}
                    onChange={(e) => setVehicles(Math.min(500, Math.max(1, Number(e.target.value) || 1)))} />
                  <button type="button" aria-label="More vehicles" onClick={() => setVehicles((v) => Math.min(500, v + 1))}>+</button>
                </div>
              </div>
            )}
            <dl className="plans-summary">
              <div><dt>Plan</dt><dd>{plan.name}</dd></div>
              <div><dt>Billing</dt><dd>{isFlat || interval === 'yearly' ? 'Yearly' : 'Monthly'}</dd></div>
              {!isFlat && <div><dt>Price per vehicle</dt><dd>{formatINR(unit)} / month</dd></div>}
              <div className="plans-total"><dt>{isFlat || interval === 'yearly' ? 'Total per year' : 'Total per month'}</dt><dd>{formatINR(total)}</dd></div>
            </dl>
            <p className="plans-gst">Prices are pricing hypotheses and may change after customer validation.</p>
            <div className="plans-modal-actions">
              <button type="button" className="plans-btn" onClick={onClose} disabled={stage === 'paying'}>Cancel</button>
              <button type="button" className="plans-btn plans-btn-solid" onClick={pay} disabled={stage === 'paying'}>
                {stage === 'paying' ? 'Processing...' : `Pay ${formatINR(total)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PlansPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { planId, isManaged, routesUsed, routeLimit, cancel, subscription } = usePlan();
  const [interval, setInterval] = useState('monthly');
  const [checkoutPlan, setCheckoutPlan] = useState(null);

  const wanted = params.get('feature');
  const suggested = wanted ? FEATURE_PLAN_HINT[wanted] : null;
  const goBack = () => navigate('/app');

  return (
    <div className="plans-page">
      <header className="plans-top">
        <button type="button" className="plans-back" onClick={goBack} aria-label="Back to dashboard">← Dashboard</button>
        <Link to="/app" className="plans-brand">EZ Logistics</Link>
      </header>

      <main className="plans-main">
        <h1>Plans that grow with your fleet</h1>
        {wanted && FEATURE_LABEL[wanted] && (
          <p className="plans-notice">{FEATURE_LABEL[wanted]} is not part of your current plan. {PLANS[suggested]?.name} and above include it.</p>
        )}
        {isManaged && (
          <p className="plans-notice">Your account is covered by an Agency licence, so every tool is already unlocked.</p>
        )}

        <div className="plans-toggle" role="group" aria-label="Billing interval">
          <button type="button" className={interval === 'monthly' ? 'on' : ''} aria-pressed={interval === 'monthly'} onClick={() => setInterval('monthly')}>Monthly</button>
          <button type="button" className={interval === 'yearly' ? 'on' : ''} aria-pressed={interval === 'yearly'} onClick={() => setInterval('yearly')}>
            Yearly <span className="plans-save">Save {Math.round(YEARLY_DISCOUNT * 100)}%</span>
          </button>
        </div>

        <div className="plans-grid">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const current = planId === id;
            return (
              <section key={id} className={`plan-card ${plan.featured ? 'plan-card--featured' : ''} ${current ? 'plan-card--current' : ''}`} aria-label={`${plan.name} plan`}>
                {plan.featured && <span className="plan-flag">Most complete for fleets</span>}
                <h2>{plan.name}</h2>
                <p className="plan-tagline">{plan.tagline}</p>
                <PriceBlock plan={plan} interval={interval} />

                {current ? (
                  <>
                    <button type="button" className="plans-btn plans-btn-current" disabled>Your current plan</button>
                    {id !== 'free' && !isManaged && (
                      <button type="button" className="plans-btn" style={{ marginTop: 8 }} onClick={() => setCheckoutPlan(plan)}>
                        {plan.flatYearly ? 'Renew plan' : `Change vehicles (${subscription.vehicles || 1} now)`}
                      </button>
                    )}
                  </>
                ) : id === 'free' ? (
                  <button type="button" className="plans-btn" disabled={isManaged} onClick={() => { if (window.confirm('Switch to the Free plan? Shipment Board and Live Dashcam AI will be locked.')) cancel(); }}>Switch to Free</button>
                ) : (
                  <button type="button" className="plans-btn plans-btn-solid" disabled={isManaged} onClick={() => setCheckoutPlan(plan)}>
                    {PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(planId) ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                  </button>
                )}
                <p className="plan-fineprint">No commitment. Cancel anytime.</p>

                <ul className="plan-list">
                  {plan.highlights.map((h) => <li key={h}><span className="tick" aria-hidden="true">✓</span>{h}</li>)}
                  {plan.missing.map((m) => <li key={m} className="plan-missing"><span className="tick" aria-hidden="true">–</span>No {m}</li>)}
                </ul>
              </section>
            );
          })}
        </div>

        {planId === 'free' && Number.isFinite(routeLimit) && !isManaged && (
          <p className="plans-usage">You have used {routesUsed} of {routeLimit} free routes this month.</p>
        )}

        <section className="plans-enterprise" aria-label="Pilots and integration">
          <h2>Pilots, integration and data services</h2>
          <div className="plans-ent-grid">
            {ENTERPRISE_OFFERS.map((o) => (
              <a key={o.title} className="plans-ent-card" href={`mailto:?subject=${encodeURIComponent('EZ Logistics: ' + o.title)}`}>
                <strong>{o.price}</strong>
                <span className="plans-ent-title">{o.title}</span>
                <span className="plans-ent-text">{o.text}</span>
              </a>
            ))}
          </div>
          <p className="plans-hypo">Commercial model: pricing hypotheses, subject to customer and procurement validation.</p>
        </section>
      </main>

      {checkoutPlan && (
        <Checkout
          plan={checkoutPlan}
          interval={interval}
          onClose={() => setCheckoutPlan(null)}
          onDone={() => { setCheckoutPlan(null); goBack(); }}
        />
      )}
    </div>
  );
}
