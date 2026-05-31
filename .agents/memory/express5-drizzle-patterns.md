---
name: Express 5 + Drizzle patterns
description: Two recurring TS errors in this codebase — Express 5 params typing and Drizzle partial update typing
---

## Express 5 route params

`req.params` values are typed as `string | string[]` in Express 5. `parseInt(req.params.id, 10)` causes TS2345.

**Fix:** always wrap with `String()`:
```ts
const id = parseInt(String(req.params.id), 10);
```

**Why:** Express 5 changed the `ParamsDictionary` type from `Record<string, string>` to `Record<string, string | string[]>`.

## Drizzle partial update (PATCH routes)

Do NOT cast `Record<string, unknown>` into the `.set()` call — TS rejects it.

**Fix:** use conditional spread directly:
```ts
await db.update(myTable).set({
  ...(d.name    !== undefined && { name: d.name }),
  ...(d.isActive !== undefined && { isActive: d.isActive ? "true" : "false" }),
  updatedAt: new Date(),
}).where(...);
```

**Why:** Drizzle's `.set()` accepts `Partial<$inferInsert>` — casting bypasses type checks and causes silent failures. Conditional spread preserves type safety without a cast.
