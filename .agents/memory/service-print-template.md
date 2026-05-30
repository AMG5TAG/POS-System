---
name: Service job sheet print template
description: The single shared print component for service job sheets and the rule against re-forking it.
---

# Service job sheet printing

There is ONE canonical printed/reprinted service-sheet renderer: `ServiceJobSheet`
(`artifacts/koapos/src/components/printing/ServiceJobSheet.tsx`). Both the
"New Service" flow (`service-jobs-new.tsx`) and the "Reprint" flow
(`service-jobs.tsx`) render it, and both feed it template options from
`useSalesTemplate("Service_Ticket")` (never hardcoded opts).

**Why:** These two paths had each grown their own divergent inline print JSX, and
the reprint path used a hardcoded `serviceOpts` object, so the same job printed
differently depending on where you printed it from, and neither respected the
saved template in Management > Templates.

**How to apply:** When changing the printed service sheet, edit the shared
component only. Do not add inline print JSX to the page files or reintroduce
hardcoded template options. The visual design is intended to mirror
`ServiceSheetPreview` in `management-templates.tsx` (the live template preview) —
keep the two in sync. Print-area element IDs (`svc-job-sheet-print-area`,
`sj-sheet-print-area`) are load-bearing: the `@media print` CSS selects on them,
so pass them via the component's `id` prop and never rename without updating the CSS.
