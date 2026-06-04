---
name: tenant-isolation-child-mutations
description: KoaPOS route convention — verify parent ownership before mutating child tables keyed only on parentId
metadata:
  type: project
---

KoaPOS is multi-tenant; every row is scoped by `merchantId` from `req.session`. Several route handlers had an IDOR where a child table was deleted/overwritten using a param-derived parent id (e.g. `tierId`, `bundleId`, `groupId`, `poId`, `ruleId`) **before** confirming the parent belonged to the session merchant. The parent update/delete was scoped to `(id, merchantId)` (a no-op for foreign rows), but the child mutation keyed only on the parent id still hit another merchant's data — allowing cross-tenant deletion/overwrite via sequential integer ids.

**Why:** Authenticated cross-tenant data destruction. **How to apply:** Before any child-table delete/insert keyed on a parent id from `req.params`, first `SELECT { id } FROM parent WHERE id=:id AND merchantId=:merchantId`; return 404 if absent. Safe examples already follow this: `stock-takes.ts`, `openai.ts`, `laybys.ts`, `purchase-orders.ts /receive`. Fixed 2026-06-04 in `price-tiers.ts`, `product-bundles.ts`, `modifier-groups.ts`, `purchase-orders.ts` (PUT+DELETE), `marketing-automation.ts`.
