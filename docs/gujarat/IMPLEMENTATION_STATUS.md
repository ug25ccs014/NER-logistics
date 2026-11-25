# Gujarat Module — Implementation Status

Last updated: 25 November 2026

## Committed to `gujarat-module`

### Repository safety
- [x] Created a dedicated development branch from `main`.
- [x] Kept all implementation commits on `gujarat-module`.
- [x] Did not inspect or modify excluded directories or real `.env` files.
- [x] Existing NER road tables and route endpoints were not changed.

### Database foundation
- [x] Added additive migration `DB/migration_005_gujarat_module.sql`.
- [x] Added isolated Gujarat road graph, risk, waterway, terminal, vessel, schedule, airport, airline, flight, shipment, leg, event, booking and cold-chain tables.
- [x] Added optional sourced reference seed `DB/seed_gujarat_reference_data.sql`.
- [ ] Migration has not yet been applied to the user's local/staging/production database.
- [ ] Migration has not yet been executed in a confirmed CI run.

### Backend foundation
- [x] Added `api/gujarat/router.py` and the regional service package.
- [x] Mounted the new router under `/gujarat` without changing existing NER route paths.
- [x] Added JWT-protected overview and regional registry endpoints.
- [x] Added Gujarat-only road graph route comparison (fastest and risk-aware safest).
- [x] Added shipment creation, ownership-filtered listing, tracking and authority-only event creation.
- [ ] Runtime API tests are pending a successful CI run and local/staging execution.

### Frontend foundation
- [x] Added a protected `/gujarat/*` route using the existing AuthContext.
- [x] Added a separate Gujarat workspace shell and navigation.
- [x] Added overview, roadways, waterways, airways, multimodal readiness, shipments, tracking and authority sections.
- [x] Added a Gujarat route comparison form and shipment creation form.
- [ ] Frontend build and browser regression checks are pending.

### Regional data
- [x] Added AAI-sourced Ahmedabad airport reference data with Cargo Terminal Building T3 label.
- [x] Added Sabarmati NW-87 as a study/registry reference, explicitly UNVERIFIED for operational service.
- [x] Added a Gujarat-only OSM road importer that writes only to `gujarat_road_segments` and `gujarat_segment_connections`.
- [ ] Road import has not been run against the user's database.
- [ ] OSM road data remains UNVERIFIED and road status UNKNOWN until reviewed.
- [ ] No vessel service, navigability, flight schedule, cargo capacity, or booking integration is currently asserted.

### Validation
- [x] Added `.github/workflows/gujarat-validation.yml` for frontend build, schema migration, reference seed and authenticated API smoke tests.
- [ ] Workflow run result has not yet been confirmed.
- [ ] No production deployment has been performed.

## Next implementation milestones

1. Confirm CI build and migration checks.
2. Complete local/staging test with the user.
3. Add regional road data validation, map display and route visualisation.
4. Add authority workflows for maintaining verified waterway/terminal/vessel and airport/air-cargo reference records.
5. Add shipment legs, mode-specific events, capacity validation and transfer-point handling.
6. Implement a multimodal optimizer that ranks only feasible, sufficiently sourced options.
7. Run NER regression checks and create a reviewable pull request before merging.

## Explicit non-goals

- No second frontend app, backend deployment, or database.
- No modification of the existing NER graph or existing NER shipment data.
- No unlabelled synthetic schedules or capacity values.
- No claim of a live GALAXY/airport cargo API integration without authorised documentation and access.
- No merge to `main` or production deployment before validation.
