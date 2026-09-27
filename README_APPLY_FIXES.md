# NER Logistics — bug-fix package

This zip mirrors your repo's folder structure exactly. Extract it at the
ROOT of your local repo (the folder that contains `api/` and
`ner-frontend/`) and let it overwrite the matching files. No renaming
needed.

## Files in this package (11 total)

Backend:
- api/risk_model.py        (live forecasting fix)
- api/main.py              (Road Identity endpoints + location-ping wiring)
- api/db.py                (Road Identity DB functions + segments fix)

Frontend:
- ner-frontend/src/features/NearbyAccommodations.jsx  (t() bug + timeout + location dot)
- ner-frontend/src/features/RidePanel.jsx             (GPS alert-spam fix)
- ner-frontend/src/features/LiveLocationSos.jsx       (location dot)
- ner-frontend/src/features/RoadIdentity.jsx          (location dot)
- ner-frontend/src/hooks/useGeolocation.js            (shared GPS timeout fix)
- ner-frontend/src/utils/mapIcons.js                  (shared blinking-dot helper)
- ner-frontend/src/styles/theme.css                   (blinking-dot CSS, was missing)
- ner-frontend/src/api.js                             (4 new Road Identity API calls)

## How to apply

### Option A — unzip straight into your repo (fastest)

```bash
cd /path/to/your/local/repo        # the folder with api/ and ner-frontend/ in it
unzip -o ~/Downloads/ner_fixes.zip -x "README_APPLY_FIXES.md"
```
`-o` overwrites existing files without asking.

### Option B — copy files by hand
If you'd rather not unzip over the repo, just copy each file from this
package into the identical path in your repo, overwriting the old one.

## Push to GitHub (Vercel auto-deploys on push)

```bash
cd /path/to/your/local/repo
git status                          # sanity check: should show the 11 files above as modified
git add api/risk_model.py api/main.py api/db.py \
        ner-frontend/src/features/NearbyAccommodations.jsx \
        ner-frontend/src/features/RidePanel.jsx \
        ner-frontend/src/features/LiveLocationSos.jsx \
        ner-frontend/src/features/RoadIdentity.jsx \
        ner-frontend/src/hooks/useGeolocation.js \
        ner-frontend/src/utils/mapIcons.js \
        ner-frontend/src/styles/theme.css \
        ner-frontend/src/api.js
git commit -m "Fix live forecasting, accommodations, ride GPS alerts; add Road Identity backend + current-location dot"
git push
```

(Or just `git add -A && git commit -m "..." && git push` if you're
sure there's nothing else uncommitted lying around.)

Vercel will pick up the push automatically and redeploy the frontend.

## One thing this does NOT do for you

Road Identity's database tables (`road_name_submissions`,
`road_segment_passes`, plus new columns on `road_segments`) come from
`DB/migration_004_road_identity.sql`, which you said already ran
against your database. If you're pointing at a *different* Postgres
instance in production than the one you tested against, run that
migration against production first — the new endpoints will 500 on
every call otherwise (relations won't exist).

If your backend is deployed as Vercel serverless functions, redeploying
the API is also just `git push` (Vercel builds `api/` the same way as
before) — no separate step, as long as your `vercel.json` /
`api/index.py` entrypoint hasn't changed. If your API is instead on a
separate host (Railway/Render/etc.) not tied to this git push, you'll
need to redeploy that service too — since only that one is what
actually runs `api/main.py` and `api/db.py`.
