# Plans and upgrade page: setup

## Frontend (works on its own)
1. Copy the files in `ner-frontend/src/` over your project (same paths).
2. `npm run dev`. Log in as a driver: the dashboard now has the plan strip, an Upgrade button, lock badges on Shipment Board and Live Dashcam AI, and a `/plans` page.
Until the backend part below is installed, the chosen plan and the route count are kept in this browser, per account.

## Backend (optional, makes the plan per account on the server)
1. Run `DB/migration_004_subscriptions.sql` on your database.
2. Copy `api/billing.py` into `api/`.
3. In `api/main.py`, after `app = FastAPI(...)`, add:

```python
from billing import build_billing_router
app.include_router(build_billing_router(get_current_account=<your auth dependency>, get_conn=<your db connection function>))
```
`<your auth dependency>` is the `Depends(...)` function your `/auth/me` route uses, and `<your db connection function>` is the function in `db.py` that returns a new connection.
4. Redeploy Render. Check `GET /billing/plan` with a logged-in token.

## Rules in this version
- Free: 10 routes per month, SOS lists the 5 nearest people, no Shipment Board, no Live Dashcam AI.
- Fleet: Rs 1,000 per vehicle per month, adds Shipment Board.
- Fleet Pro: Rs 2,000 per vehicle per month, adds Live Dashcam AI.
- Agency: Rs 8 lakh per year. Field officer and authority accounts are treated as Agency, so their tools are never locked.
- Yearly billing is 17% off. Checkout is test mode (no real payment).
- To change a limit, edit `src/config/plans.js` (and `FREE_ROUTES_PER_MONTH` in `api/billing.py`).
