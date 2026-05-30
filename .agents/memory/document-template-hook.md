---
name: Centralized document print/email hook
description: useDocumentTemplate is the single entry point for customer-document print/email; never call print-receipt utils directly from pages.
---

# Customer-document print/email must go through useDocumentTemplate

Any page that prints or emails a *customer document* (thermal receipt, A4
invoice, A4 service report) must use the `useDocumentTemplate()` hook, NOT the
low-level `print-receipt.ts` utilities (`printReceipt`/`printA4Invoice`/
`printA4ServiceJob`) directly.

The hook composes the saved Sales Templates (`useSalesTemplate` for
Thermal_Receipt / Invoice / Service_Ticket) + business profile + merchant, and
returns ready-bound `printReceipt/printInvoice/printServiceJob` plus `isLoading`
and a shared `businessInfo`. It maps the saved `TplOpts` onto the utils'
`ReceiptTemplateOpts` so layout/fonts/field-visibility toggles all flow from
Management > Sales Templates.

**Why:** `customers.tsx` and `pos-history.tsx` previously called the print utils
directly with only business-profile fields (and no saved template opts, and a
missing business name → "Your Store"), so customer-history reprints ignored the
configured template and diverged from the POS/invoice paths that already read
templates. Centralizing prevents that drift and gives every future doc type one
wiring point.

**How to apply:**
- New print/email feature for a customer doc → call `useDocumentTemplate()`, gate
  the trigger on `isLoading` (disable menu item / toast), call the bound fn.
- New document type → add it to `useSalesTemplate`'s `SalesTemplateType` and to
  `useDocumentTemplate` (plus a util in `print-receipt.ts`).
- The already-template-driven inline renderers (`pos.tsx` thermal, `pos-invoices.tsx`
  A4 invoice/quote, `service-jobs*.tsx` via shared `ServiceJobSheet`) read
  `useSalesTemplate` themselves and are intentionally NOT routed through the hook —
  their rich inline HTML/jsPDF generators aren't replicated by the print-receipt utils.
- Out-of-scope for Sales Templates (own systems): product labels (sticker config),
  EOD/Z/cash-movement reports, purchase orders, server-side email HTML.
