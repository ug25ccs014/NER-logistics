# Plans saved per account (server side)

1. Copy the files from this zip over your project (same paths).
2. Open `api/main.py` and add these two lines at the very END of the file, after every route:

```python
import billing
billing.install(app)
```
3. Commit and push to `main`. Render redeploys.
4. Confirm it works: open `https://<your-render-url>/docs`. You should see `/billing/plan`, `/billing/subscribe` and `/billing/usage/route`.

Notes
- `billing.install` creates its own two tables the first time it runs. You do not need to run the SQL file (it is there only for reference).
- It reads the database from the `DATABASE_URL` environment variable on Render.
- A plan bought before this was installed is sent to the server automatically the next time that account opens the app in the same browser.
