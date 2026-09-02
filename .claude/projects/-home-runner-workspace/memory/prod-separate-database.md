---
name: prod-separate-database
description: The published production app uses a DIFFERENT database than the dev workspace
metadata:
  type: project
---

The deployed production app (koapos.com.au) runs against a **different database** than the dev workspace. The workspace `DATABASE_URL` points to `heliumdb`; the Replit deployment has its own `DATABASE_URL`.

**Why it matters:** querying the workspace DB (via `DATABASE_URL` in the shell) does NOT reflect production data. During Xero debugging, workspace queries kept showing "0 rows" for a connection the user had genuinely made in production — because the row was in production's DB, not `heliumdb`.

**How it was proven:** a login to koapos.com.au (HTTP 200) did not add a row to `heliumdb`'s `session` table (connect-pg-simple session store), while a login to the local dev server did. So production writes sessions/data elsewhere.

**How to apply:** to inspect real production state, go through the production API (authenticated), not workspace DB queries. Note the user may still *say* "we are working in the production database" — they mean the deployment uses a production DB, which is separate from the dev workspace DB. Secrets like `XERO_CLIENT_ID` are shared (production reported `configured: true`), but the databases are not.
