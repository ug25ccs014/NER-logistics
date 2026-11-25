# Gujarat Module — Local Setup, Migration and Verification

This guide applies to the `gujarat-module` development branch. Do not merge this branch into `main` until the regression checks pass.

## 0. Safety first

- Work on branch `gujarat-module`.
- Back up the database before applying any migration.
- Apply the migration to a local/staging database first. Do not point it at production for the first run.
- Do not run `docker compose down -v`, drop tables, reset the database, or rerun the full schema against an existing database.
- Do not share JWTs, database URLs, passwords, passkeys, or real `.env` contents in chat or commits.
- Do not inspect or commit `node_modules/`, `.venv/`, `venv/`, `__pycache__/`, `.git/`, or any real `.env` file.

## 1. Get the branch

From a terminal in your local repository:

```bash
git fetch origin
git checkout -b gujarat-module origin/gujarat-module
git pull origin gujarat-module
```

If the local branch already exists, use:

```bash
git checkout gujarat-module
git pull origin gujarat-module
```

Confirm the current branch:

```bash
git branch --show-current
```

It must print `gujarat-module`.

## 2. Back up the database

If your database provider gives you a PostgreSQL connection URL, use it from your own terminal without pasting it into chat:

```bash
pg_dump --format=custom --file=ner_logistics_before_gujarat.dump "$DATABASE_URL"
```

If you use separate PostgreSQL connection variables, use your provider's normal `pg_dump` command and enter the password through a secure prompt/environment mechanism. Do not put credentials in shell history.

Verify the backup file exists and is non-empty before continuing.

## 3. Apply the additive migration

The migration file is:

`DB/migration_005_gujarat_module.sql`

It creates only `gujarat_*` tables and does not alter existing NER tables.

With a PostgreSQL URL configured in your terminal:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f DB/migration_005_gujarat_module.sql
```

If your provider uses separate host/database/user settings, use your normal `psql` connection command and run the same file. Never paste the password into a command that will be saved in shell history.

Verify that the tables exist:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'gujarat_%'
ORDER BY table_name;
```

The migration is wrapped in a transaction. If it fails, PostgreSQL rolls back the migration transaction; capture the error and stop. Do not try to fix it by dropping existing NER tables.

## 4. Start the backend locally

Use the Python environment you normally use for this repository. From the repository root:

```bash
python -m pip install -r api/requirements.txt
cd api
uvicorn main:app --reload --port 8000
```

The existing API configuration reads its runtime environment from the API service's local configuration. Keep your existing environment setup private and unchanged. Do not add production secrets to source control.

Check the existing API health route in a browser:

`http://127.0.0.1:8000/health`

## 5. Start the frontend locally

Open a second terminal:

```bash
cd ner-frontend
npm install
npm run dev
```

The Vite configuration proxies `/api` to `http://127.0.0.1:8000` by default. If you already use a different local backend port, use your existing local proxy configuration rather than changing production deployment settings.

Open the local Vite URL printed by the terminal, sign in using your existing account, and navigate to the Gujarat module from the NER top bar or directly to:

`/gujarat`

## 6. Verify the first Gujarat milestone

With the frontend and backend running and you signed in:

1. Open `/gujarat`. It should use the same login session as NER.
2. The overview should show zero counts if no Gujarat data has been imported.
3. Open Roadways, Waterways, Airways and Shipments. Empty states are expected until data is imported.
4. Create a test shipment using non-sensitive demo information.
5. Confirm it appears in the shipment list.
6. Copy its internal UUID and open Tracking. The initial `SHIPMENT_CREATED` event should appear.
7. Sign in as a non-authority account and confirm the authority event-write endpoint is rejected with HTTP 403.
8. Sign out and confirm `/gujarat` redirects to `/login`.

The API routes are under `/gujarat` in FastAPI and are called by the frontend at `/api/gujarat/...`.

## 7. Build and regression checks

From `ner-frontend/`:

```bash
npm run build
```

Before any deployment, also test the existing NER flows:
- login and logout,
- NER dashboard and map,
- road routing,
- field reports and alerts,
- shipment board,
- offline startup and offline queue behaviour,
- chat and notifications,
- authority views.

A successful frontend build alone does not prove backend/database integration. Exercise the API against a staging database with migration 005 applied.

## 8. Current scope and known limitations

The first implementation milestone provides:
- a protected Gujarat workspace at `/gujarat`,
- a namespaced and authenticated Gujarat API router,
- a regional overview,
- Gujarat-only read endpoints for road segment records, waterways, terminals and airports,
- common Gujarat shipment creation, listing and tracking-event history,
- an additive regional schema.

It does not yet provide:
- a populated/verified Gujarat road graph or route calculation,
- live vessel schedules, waterway navigability or terminal availability,
- live airline/flight cargo capacity or airport cargo-system integration,
- a multimodal optimizer,
- production deployment or a live external data feed.

These are subsequent milestones. Do not use guessed transport data to make the empty pages look populated. Demo data must be explicitly labelled `DEMO` or `SIMULATED`.

## 9. Deployment

Do not deploy this branch directly to production yet. First complete local and staging checks, then review the branch diff and merge through the repository's normal pull-request process. After merge, the existing frontend and API deployment pipeline can publish the new module; no second app, API deployment, or database is required.
