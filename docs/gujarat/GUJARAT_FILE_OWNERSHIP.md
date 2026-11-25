# Gujarat Module — File Ownership and Change Boundaries

## Existing files that are protected by default

Do not rewrite or broadly refactor:
- `ner-frontend/src/App.jsx`
- `ner-frontend/src/config/tools.js`
- `ner-frontend/src/context/NavigationContext.jsx`
- `ner-frontend/src/context/AuthContext.jsx`
- `ner-frontend/src/components/Workspace.jsx`
- `ner-frontend/src/components/MapView.jsx`
- `api/routing.py`
- `api/db.py`
- `api/auth.py`
- `DB/schema.sql`
- `routing_engine/*`
- Existing NER feature components and existing migrations.

A narrowly scoped integration change may be needed in `ner-frontend/src/AppRouter.jsx`, `ner-frontend/src/components/TopBar.jsx`, and `api/main.py`. Keep those changes minimal and reviewable.

## New backend package

Create an isolated package under `api/gujarat/`:
- `__init__.py`
- `router.py`
- `dependencies.py` (reuse existing JWT helpers; do not duplicate auth)
- `schemas.py`
- `db.py` or repository modules
- `services/roadways.py`
- `services/waterways.py`
- `services/airways.py`
- `services/multimodal.py`
- `services/provenance.py`

The package may reuse the existing `api.db.get_connection()` function after confirming import/deployment behaviour. Do not modify the existing NER SQL helpers to make Gujarat work.

## New frontend package

Create an isolated feature area under `ner-frontend/src/gujarat/`:
- `GujaratModule.jsx` (workspace shell)
- `GujaratOverview.jsx`
- `GujaratRoadways.jsx`
- `GujaratWaterways.jsx`
- `GujaratAirways.jsx`
- `GujaratMultimodal.jsx`
- `GujaratShipments.jsx`
- `GujaratTracking.jsx`
- `GujaratAuthority.jsx`
- `components/`
- `gujaratApi.js`
- `gujarat.css`

Reuse the existing React, React Router, Leaflet, React-Leaflet and Framer Motion dependencies. Do not introduce a new frontend framework or a second app.

## Shared integration files

Allowed only for minimal additive changes with regression tests:
- `ner-frontend/src/AppRouter.jsx`: add a protected `/gujarat/*` route using existing auth.
- `ner-frontend/src/components/TopBar.jsx` or a similarly small existing navigation surface: add a clear link to the Gujarat module without removing NER navigation.
- `api/main.py`: include the Gujarat router under `/gujarat`.
- Existing frontend API client should preferably remain unchanged; the Gujarat client can wrap fetch using the same token key and API base, or a minimal exported request helper can be added only if justified.
- Add new SQL migrations under `DB/` using a unique numbered filename consistent with the repository's migration convention.

## Do not touch

- `node_modules/`
- `.venv/`, `venv/`
- `__pycache__/`
- `.git/`
- `.env` or nested environment-secret files

Do not read, copy, commit, print, or modify these paths.

## Commit and branch policy

- Work on branch `gujarat-module`, not `main`.
- Keep each commit focused.
- Do not force-push.
- Do not merge into `main` until regression tests and owner review pass.
- Before editing any protected shared file, state the exact change and why it is required.
