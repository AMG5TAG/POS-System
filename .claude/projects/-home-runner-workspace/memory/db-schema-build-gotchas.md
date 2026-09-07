---
name: db-schema-build-gotchas
description: Adding a DB table/column — project-reference rebuild + migration chain + drift guard
metadata:
  type: project
---

Adding a new Drizzle table/column in `lib/db/src/schema` has three steps that are easy to miss:

1. **api-server reads built `.d.ts`, not src.** `artifacts/api-server` uses TS *project references* to `lib/db`, so a new export won't resolve until you rebuild declarations: `npx tsc --build lib/db/tsconfig.json` (regenerates `lib/db/dist`). Without it you get `'@workspace/db' has no exported member ...`. (The db package itself has no `build` script.)
2. **Boot fails on drift.** `artifacts/api-server/src/services/schemaDriftCheck.ts` aborts startup if the live DB is missing any table/column the Drizzle schema declares. So a new table needs a migration that actually creates it.
3. **Migration chain.** Add an idempotent `CREATE TABLE IF NOT EXISTS` script under `scripts/src/`, register it in `scripts/package.json`, and append it to the root `package.json` `db:push` chain (drizzle-kit push runs too, but the repo convention is a standalone script per table).

Related: per-merchant settings PUTs (e.g. qr-settings) tolerate extra JSON keys not in the table (logoSize, customCode, trackScans) — they persist only inside per-row JSON blobs, not the settings table. See [[tenant-isolation-child-mutations]].
