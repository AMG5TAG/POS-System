---
name: Drizzle JSON snapshot restore (date revival)
description: Reinserting JSON-serialized rows into Drizzle date-mode timestamp columns needs Date objects, not ISO strings.
---

# Reviving dates when restoring JSON snapshots into Drizzle

When a row snapshot is round-tripped through JSON (backup/restore, export/import),
`Date` values become ISO strings. Inserting those strings back into Drizzle
timestamp columns (mode `date`) crashes with `value.toISOString is not a function`
— Drizzle calls `.toISOString()` on the value and expects a real `Date`.

**Rule:** before `tx.insert(table).values(rows)` with snapshot data, convert
date-typed columns back to `Date`. Detect them generically via
`getTableColumns(table)` and the column's `dataType === "date"` — do not hardcode
column names. Wrap with `new Date(v)` when the stored value is a string or number.

**Why:** the backup/restore feature wipes-and-reinserts merchant-scoped tables from
a decrypted JSON snapshot; without date revival every table with a timestamp
(createdAt/updatedAt/etc.) fails on insert.

**How to apply:** see `artifacts/api-server/src/services/restoreService.ts`. The
same pattern applies to any future JSON-snapshot import path.
