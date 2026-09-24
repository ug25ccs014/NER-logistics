# NER Logistics Intelligence — React Frontend

This replaces `api/index.html` from the original project. It talks to
the **same FastAPI backend** (`api/main.py`) you already have — nothing
on the backend needs to change.

```
npm install
cp .env.example .env      # edit if your backend isn't on localhost:8000
npm run dev
```

Then start your FastAPI backend separately, as you already do
(`uvicorn main:app --reload --port 8000` from the `api/` folder).

## Feature map (where each old feature now lives)

| Old feature                                    | New location                                                 |
|-------------------------------------------------|----------------------------------------------------------------|
| Role picker overlay                              | `src/components/RoleLogin.jsx` + `src/context/AuthContext.jsx` |
| "Driver / Field Official" dropdown (the bug)    | Removed. Role comes from `AuthContext`, mapped automatically |
| Search a Route + risk breakdown                  | `src/features/RouteSearch.jsx`                                |
| Start Ride (Live GPS) / Simulate Ride            | `src/features/RidePanel.jsx`, `src/context/ActiveRouteContext.jsx` |
| Report a Road Issue / Recent Field Reports       | `src/features/FieldReportForm.jsx`, `FieldReportsList.jsx`    |
| Nearby Help (Live Location) / SOS                | `src/features/LiveLocationSos.jsx`                             |
| "Someone nearby is stuck" auto-alert             | Also in `LiveLocationSos.jsx`                                  |
| 💬 Chat (threaded messages) + Inbox              | `src/context/ChatContext.jsx`, `src/components/ChatPanel.jsx`, `src/features/Inbox.jsx` |
| "New message" chat toast                         | `src/components/ChatMessageNotifyToast.jsx`                    |
| Shipment Board                                   | `src/features/ShipmentBoard.jsx`, `ShipmentMatchesForRoute.jsx` |
| Nearby Accommodations                            | `src/features/NearbyAccommodations.jsx`                        |
| Active Alerts (driver/field view)                | `src/features/AlertsList.jsx`                                  |
| Direct notification toast (🔔 Notify)            | `src/components/NotificationsWatcher.jsx`                      |
| District Connectivity (authority)                | `src/features/authority/DistrictStatus.jsx`                    |
| Field Report Review Queue (authority)            | `src/features/authority/ReviewQueue.jsx`                       |
| Alert Management (authority)                     | `src/features/authority/AlertManagement.jsx`                   |
| Trip / Vehicle Oversight (authority)             | `src/features/authority/TripsOversight.jsx`                    |
| Full risk-colored network map (authority)        | `src/features/authority/AllSegmentsLayer.jsx`                  |
| Map legend                                       | `src/components/MapLegend.jsx`                                 |

Every sidebar section from the original `index.html` is now ported,
including the 💬 Messages/Chat system shared by all three roles.

## Not ported: the `/route` (segment-to-segment) endpoint

Your backend has a `GET /route?start=...&end=...` endpoint (fastest vs.
safest route between two predefined segment IDs). Checked the current
`index.html` — it's not called from the UI anywhere anymore (the
free-text route search using OSRM replaced it). Left it alone since
nothing in the app uses it; flag it if you want it exposed somewhere.

## Local API connection

The frontend uses `/api` and Vite proxies it to FastAPI at `http://127.0.0.1:8000`.
Start FastAPI first:

```bash
cd ../api
uvicorn main:app --reload --port 8000
```

Then start the frontend in a second terminal:

```bash
npm install
npm run dev
```

If FastAPI runs on another host/port, change `VITE_API_PROXY_TARGET` in `.env`.

