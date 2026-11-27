// Single source of truth for subscription plans.
// Prices follow the "Commercial model - pricing hypotheses" slide
// (subject to customer and procurement validation).

export const YEARLY_DISCOUNT = 0.17; // "Save 17%" on yearly billing
export const FREE_ROUTES_PER_MONTH = 10;
export const FREE_SOS_PEOPLE = 5;

// feature keys used by PlanContext.can()
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Try EZ Logistics on your own trips',
    perVehicleMonthly: 0,
    priceNote: 'Free forever',
    limits: { routesPerMonth: FREE_ROUTES_PER_MONTH, sosPeople: FREE_SOS_PEOPLE },
    features: { shipments: false, dashcam: false },
    highlights: [
      `Up to ${FREE_ROUTES_PER_MONTH} routes a month`,
      'Route & Ride with live risk',
      `Live location & SOS for up to ${FREE_SOS_PEOPLE} people`,
      'Field reports, alerts, messages, nearby stays',
    ],
    missing: ['Shipment Board', 'Live Dashcam AI'],
  },
  fleet: {
    id: 'fleet',
    name: 'Fleet',
    tagline: 'For transporters running a few trucks',
    perVehicleMonthly: 1000,
    priceNote: 'per vehicle / month',
    limits: { routesPerMonth: Infinity, sosPeople: Infinity },
    features: { shipments: true, dashcam: false },
    highlights: [
      'Everything in Free, with no route limit',
      'Live location & SOS for unlimited people',
      'Shipment Board with trip risk forecast',
      'Fleet onboarding and basic analytics',
    ],
    missing: ['Live Dashcam AI'],
  },
  fleet_pro: {
    id: 'fleet_pro',
    name: 'Fleet Pro',
    tagline: 'For fleets that need hazard detection on the road',
    perVehicleMonthly: 2000,
    priceNote: 'per vehicle / month',
    featured: true,
    limits: { routesPerMonth: Infinity, sosPeople: Infinity },
    features: { shipments: true, dashcam: true },
    highlights: [
      'Everything in Fleet',
      'Live Dashcam AI with two-tier auto-alerts to field officers',
      'Full fleet analytics',
      'Integration support and API access (usage-based)',
    ],
    missing: [],
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    tagline: 'For state agencies and district administrations',
    flatYearly: 800000, // Rs 8 lakh / year
    priceNote: 'per agency or district / year',
    limits: { routesPerMonth: Infinity, sosPeople: Infinity },
    features: { shipments: true, dashcam: true },
    highlights: [
      'Everything in Fleet Pro',
      'Authority tools: Network Overview, Review Queue, Alert Management, Trips Oversight',
      'Field officer seats across the district',
      'District-wide analytics and data services',
    ],
    missing: [],
  },
};

export const PLAN_ORDER = ['free', 'fleet', 'fleet_pro', 'agency'];

export const ENTERPRISE_OFFERS = [
  { title: 'Funded pilot', price: '₹6 lakh', text: 'A supported pilot for a state, district or large fleet.' },
  { title: 'One-time integration', price: '₹6 lakh', text: 'Connect with your existing fleet or government systems.' },
  { title: 'API and data services', price: 'Usage-based', text: 'Risk scores and road data through the API, billed on use.' },
];

// Which tool ids need which feature. Anything not listed is open to every plan.
export const TOOL_FEATURE = {
  shipments: 'shipments',
  'ai-dashcam': 'dashcam',
};

export const FEATURE_PLAN_HINT = {
  shipments: 'fleet',
  dashcam: 'fleet_pro',
};

export function formatINR(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

// Monthly-equivalent price per vehicle for a given billing interval.
export function perVehiclePrice(plan, interval) {
  const base = plan.perVehicleMonthly || 0;
  return interval === 'yearly' ? Math.round(base * (1 - YEARLY_DISCOUNT)) : base;
}
