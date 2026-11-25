# Gujarat Module — Implementation Plan

## 1. Objective

Add a Gujarat Logistics workspace to the existing NER Logistics application. This is an additive regional module, not a conversion, rebrand, rewrite, or second application.

Primary pilot geography: the approximately 50 km Gandhinagar–Ahmedabad corridor. The data model must allow later extension to other Gujarat logistics gateways without treating those gateways as part of the pilot corridor.

## 2. Non-negotiable preservation rules

- Keep the existing NER landing page, login, dashboard, role workflows, road routing, risk engine, field reports, driver location, SOS, shipment board, chat, notifications, offline behaviour, and API response contracts working.
- Do not rename or globally rebrand NER Logistics.
- Do not change the default NER region or NER road graph.
- Do not put Gujarat road records into the existing unscoped `road_segments` table.
- Do not create a second frontend deployment, API service, domain, or database.
- Do not add or inspect secrets. Existing `.env` files are out of scope and must never be read or committed.
- Do not inspect or commit `node_modules/`, `.venv/`, `venv/`, `__pycache__/`, or `.git/`.
- Additive SQL migrations only. No destructive schema changes, database resets, or production seed scripts.

## 3. Verified current repository architecture

### Frontend
- React 18, Vite, React Router 6.
- Frontend root: `ner-frontend/`.
- Router: `ner-frontend/src/AppRouter.jsx`.
- Auth state: `ner-frontend/src/context/AuthContext.jsx`.
- Existing authenticated dashboard: `ner-frontend/src/App.jsx`.
- Existing dashboard tool registry: `ner-frontend/src/config/tools.js`.
- Existing navigation context: `ner-frontend/src/context/NavigationContext.jsx`.
- Existing top bar: `ner-frontend/src/components/TopBar.jsx`.
- Existing API client: `ner-frontend/src/api.js`.
- Existing map: `ner-frontend/src/components/MapView.jsx`.
- Existing styles: `ner-frontend/src/styles/theme.css`.

The current top-level routes are `/`, `/login`, and protected `/app`. The Gujarat workspace should be a separately protected route, suggested as `/gujarat/*`, using the existing AuthProvider and existing token. It must not replace or redirect the existing `/app` route.

### Backend
- FastAPI application: `api/main.py`.
- Database access and SQL helpers: `api/db.py`.
- Environment/config loading: `api/config.py`.
- Existing API road routing: `api/routing.py`.
- Existing authentication helpers: `api/auth.py`.
- Existing standalone NetworkX routing implementation: `routing_engine/`.

The frontend API client uses `VITE_API_BASE` with `/api` as its default. New endpoints should be mounted under `/gujarat` in FastAPI, and therefore called by the frontend under `/api/gujarat/...`.

### Database
- PostgreSQL + PostGIS.
- Existing schema: `DB/schema.sql`.
- Existing road network tables include `road_segments`, `segment_connections`, `risk_scores`, `districts`, reports, trips, vehicles, and related records.
- Existing routing queries load the existing road tables without a region predicate. Consequently, inserting Gujarat records into those tables would risk mixing regional graphs.

### Deployment
- Existing frontend and API have Vercel configuration files.
- Continue using the current frontend and API deployment arrangement.
- A normal update to the existing deployment is required to publish new code, but no second deployment architecture is to be created.

## 4. Regional isolation design

Create a Gujarat-specific data namespace and API namespace.

- Frontend route: `/gujarat`.
- Backend router prefix: `/gujarat`.
- API client paths: `/gujarat/...` (the existing client adds `/api`).
- New tables use the `gujarat_` prefix unless the data model document specifies a dedicated generic table with an explicit immutable `region_code`.
- Existing NER tables and queries remain unchanged.
- Existing user accounts and JWT authentication are reused.
- Gujarat data must never be returned by existing NER endpoints.

For the Gujarat road graph, use separate Gujarat road tables and a region-specific data loader. Reuse the proven NetworkX graph-weighting and path-selection logic through a generic/shared algorithm interface only after tests prove NER behaviour is unchanged. Do not alter the existing NER graph loader.

## 5. Gujarat functional modules

### Roadways
Reuse the existing road feature concepts and algorithms: route comparison (fastest/safest), road risk, weather/forecast integration where compatible, field reports, shipment/cargo board, and trip tracking. Gujarat-specific road geometry and risk records must remain in Gujarat tables. Implement region-specific adapters rather than pointing NER queries at Gujarat data.

### Waterways
Provide waterway registry, segments, terminals, vessel registry, vessel availability/schedules, cargo board, capacity matching, bookings, operational restrictions, risk/field reports, and road-to-terminal/terminal-to-road transfer planning. Every waterway segment and terminal must carry source, verification state, and last-verified timestamp. Do not infer commercial navigability from a waterway designation alone.

### Airways
Use Ahmedabad airport as the initial air-cargo gateway. Provide airport/cargo-terminal registry, airline/provider references, flight cargo board, shipment intake, handling milestones, AWB/reference field where available, cold-chain requirements and temperature events. Live flight/capacity claims require an authorised data provider; otherwise clearly label manual, demo, or simulated data.

### Multimodal
A common Gujarat shipment has one shipment identity and ordered legs (ROAD, WATER, AIR). Support transfer points, cargo compatibility, capacity checks, cost/time/risk/emissions estimates, provenance/confidence, and infeasibility explanations. Never recommend a leg that fails availability or geography checks.

## 6. Authentication and permissions

Reuse `AuthContext` and FastAPI's existing JWT dependency. Do not create new accounts, tokens, or login screens. Enforce server-side authorization for write operations. Existing application roles are driver, field_reporter (mapped to backend field_official), and authority. Define the minimum permissions for Gujarat operations in the API contract and data model.

## 7. Development sequence

1. Architecture and data contracts.
2. Additive database migrations and Gujarat backend package.
3. Gujarat frontend route and shell.
4. Roadways adapter and regional road data.
5. Waterways and airways.
6. Multimodal shipment and optimizer.
7. Integration, regression tests, demo data, and deployment notes.

## 8. Acceptance criteria

- Existing NER routes, authentication, road graph, reports, shipments, alerts, chat, and offline functionality continue to work.
- `/gujarat` is protected by the existing authentication.
- Gujarat screens are separate from the existing NER dashboard.
- Gujarat road queries read only Gujarat road tables.
- Existing NER road queries read only their current tables.
- All new APIs are namespaced under `/gujarat`.
- All migrations are additive and reversible where practical.
- Demo/simulated data is visibly labelled.
- Frontend and backend build/test successfully before deployment.
