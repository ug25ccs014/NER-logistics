# NER Logistics Platform — Dashboard

A single self-contained HTML file — no npm, no build step, no Node.js
required. Just open it in a browser. It shows:

- A live map with every road segment color-coded by risk (green →
  yellow → orange → red)
- A sidebar listing all segments and their current risk score
- Active alerts, clickable to jump to that segment on the map
- A route planner comparing fastest vs. safest route between any two
  segments, with high-risk segments flagged

## Prerequisites

- The **API service** (`api/` folder) must be running first —
  `uvicorn main:app --reload --port 8000` — since the dashboard fetches
  all its data from `http://localhost:8000`.

## Run it

There's nothing to install. Just double-click `index.html`, or
right-click it and choose "Open with" your browser.

**If your browser blocks the API requests** (some browsers restrict
`fetch()` calls from files opened directly via `file://`), serve it
locally instead — still no build step, just a one-line command:

```bash
cd dashboard
python -m http.server 5500
```

Then open http://localhost:5500 in your browser.

## If the dashboard shows a red error banner

That means it can't reach the API. Check:
1. Is the API's terminal window still open and running
   (`uvicorn main:app --reload --port 8000`)?
2. Open http://localhost:8000/segments directly in your browser — if
   that doesn't load, the problem is the API, not the dashboard.

## Customizing

- Change `API_BASE` near the top of the `<script>` block in
  `index.html` if you deploy the API somewhere other than
  `localhost:8000`.
- The map auto-refreshes every 60 seconds, so re-running the risk
  engine or routing changes will show up automatically without
  reloading the page.

## Upgrade path

This is deliberately framework-free for reliability during setup.
Once the core demo is solid, the same API can power a proper React +
Mapbox frontend for a more polished production version — nothing on
the backend needs to change.
