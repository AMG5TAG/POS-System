---
name: Sales template cache invalidation
description: Why saved receipt/invoice template style changes don't show up in prints unless caches are invalidated.
---

# Sales template style not reflected in prints

`useSalesTemplate` reads `useGetActiveSalesTemplates` under query key
`["sales-templates-active"]` with `staleTime: 60_000`. The real print flows
(POS, Customers) consume it via `useDocumentTemplate` → `printA4Receipt` etc.
The Management Templates page list uses `["sales-templates"]`.

**Rule:** any mutation that saves a template (style/opts) MUST invalidate BOTH
`["sales-templates"]` and `["sales-templates-active"]` in its `onSuccess`, or the
saved style keeps printing the previously cached layout (looks like "nothing
changed / still generic") for up to the staleTime / until a full reload.

**Why:** the generated Orval upsert hook does not auto-invalidate anything;
invalidation is the caller's responsibility. Without it, the management preview
(local state) updates but real receipts read stale cache.

**How to apply:** in `useTplOpts.save()` (management-templates.tsx) the upsert
`onSuccess` invalidates both keys. Style-card click also auto-saves (persists
`selectedStyle` immediately) so a picked style applies to real prints without a
separate Save click. The print layout itself is correct: `printA4Receipt`
branches on `styleVariant` (professional=no band, modern=brand band,
minimal=monospace) via `normalizeReceiptStyle` (suffix `*minimal`→minimal,
`*modern`/`*bold`→modern, else professional).
