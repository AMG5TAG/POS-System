# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

KK POS — an in-house Point of Sale system run for a **single business** (Koastal). It began as a multi-tenant SaaS; see "Single-business install" below for what that left behind. Clean, tablet/mobile-ready UI. A pnpm monorepo (Node 24, TypeScript 5.9) with a React/Vite frontend, an Express 5 API server, PostgreSQL + Drizzle ORM, and a contract-first OpenAPI codegen pipeline.

## Run & Operate

Package manager is **pnpm** (enforced — `npm`/`yarn` are blocked by a preinstall hook). Always target packages with `--filter`; do not run `pnpm dev` at the workspace root (use `restart_workflow` in the Replit environment instead).

- `pnpm --filter @workspace/api-server run dev` — build + run the API server (port 8080 dev, proxied at `/api`)
- `pnpm --filter @workspace/koapos run dev` — run the React frontend (port from env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build composite libs (`tsc --build`); **run this after editing anything in `lib/`** before typechecking the API server or frontend
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate React Query hooks + Zod schemas from the OpenAPI spec (run after editing `lib/api-spec/openapi.yaml`)
- `pnpm run db:push` — push DB schema changes **and** run the ordered chain of one-off migration/seed scripts; use this instead of `pnpm --filter @workspace/db run push` directly

### Tests

Tests use **vitest**. Both `@workspace/api-server` and `@workspace/koapos` have a `test` script.

- `pnpm --filter @workspace/api-server run test` — run all API tests (this is the Replit validation workflow)
- Single file: `pnpm --filter @workspace/api-server exec vitest run src/__tests__/gift-cards.test.ts`
- Single test by name: append `-t "partial substring"`

API tests live in `artifacts/api-server/src/__tests__/*.test.ts` and are contract/integration tests (supertest against the Express app).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS v4 + shadcn/ui, wouter routing, TanStack Query
- API: Express 5 (`artifacts/api-server`, port 8080)
- Auth: custom session auth using `express-session` + `bcryptjs`
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`, generated Zod schemas from OpenAPI
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle for API)

## Architecture

### Contract-first API pipeline
`lib/api-spec/openapi.yaml` is the source of truth. Orval codegen produces two **generated, do-not-edit** packages:
- `lib/api-client-react/src/` — TanStack Query hooks consumed by the frontend
- `lib/api-zod/src/` — Zod validators imported by route handlers for request validation

Workflow to change an endpoint: edit `openapi.yaml` → run codegen → implement/adjust the route handler in `artifacts/api-server/src/routes/` → the handler validates with the regenerated `@workspace/api-zod` schema.

### Packages
- `artifacts/api-server` — Express 5 API. `src/app.ts` builds the app; `src/routes/index.ts` mounts ~139 feature routers; `src/services/` holds background schedulers and cross-cutting logic (email, SMS, backups, payments, token vault); `src/lib/` holds shared helpers; `src/middlewares/requireAuth.ts` is the session auth middleware.
- `artifacts/koapos` — React 19 frontend. Pages in `src/pages/` (marketing + authenticated app), auth in `src/lib/auth.tsx` (AuthProvider + `useAuth`). **`<AppLayout>` is rendered by each page, not above the router**, so every navigation unmounts and remounts the entire chrome — nav, sidebar and all. Nothing in the layout survives a route change by itself: the collapsible sections re-derive their open state from the URL, and the sidebar's scroll offset is carried across in `sessionStorage` by `lib/use-persistent-scroll.ts` (restored in a layout effect, before paint, so the menu never visibly snaps to the top). Anything else that needs to outlive a navigation needs the same treatment, or hoisting out of the layout.
- `lib/db` — Drizzle schema, one file per domain in `src/schema/` (merchants, products, customers, transactions, staff, …).
- `lib/integrations/*`, `lib/sales-documents`, `lib/shortlinks-shared`, `lib/phone-shared`, `lib/object-storage-web` — shared libraries. Note that cloud-storage integrations do **not** live here: they are in `artifacts/api-server/src/lib/` (`backup-storage/`, `nextcloud.ts`, `objectStorage.ts`) and `src/services/`.
- `artifacts/print-bridge` (`@workspace/print-bridge`) — a standalone, dependency-free Node service that runs **on the merchant's till**, not on the server. It is what lets the browser print without the OS print dialog. Not part of the deployed app; built to a single `dist/index.mjs` and installed on each till. See "Printing" below and its own README.
- `scripts` (`@workspace/scripts`) — one-off migration/seed scripts wired into `db:push`.

### Auth
Session-based (not JWT): `express-session` + `bcryptjs`, signed with `SESSION_SECRET`. The frontend's custom fetch (`lib/api-client-react/src/custom-fetch.ts`) sends `credentials: 'include'` so cookies flow through the Replit proxy. CORS is `origin: true, credentials: true` — both are required for session cookies to work.

### Single-business install

KK POS was built as a subscription SaaS with one `merchants` row per business,
and every table is still scoped by `merchantId`. It now runs for one business,
and the change was made **in code only — no rows were deleted or rewritten**.
The other merchant accounts (the seeded demo, a second Koastal account, test
accounts) and all of their data are still in the database.

- **Who can sign in** is `SOLE_MERCHANT_EMAIL` (default `admin@koastal.com.au`),
  checked by `isSoleMerchantEmail` in `api-server/src/lib/sole-merchant.ts`.
  It is matched on email because row ids differ between dev and production.
  The check is in every login route: owner login (`/auth/login`), staff email
  login (`/staff-auth/login`), and the Tech App and Mobile POS PIN logins
  (`findMerchantByUsername`). It is also in the session gates (`requireAuth`,
  `requireTech`, `requireMpos`, via the cached `isMerchantActive`), so a session
  opened before the switch dies too. Any other account answers exactly like an
  unknown email. `sole-merchant.test.ts` pins this.
- **The login email is fixed.** `/auth/change-email` refuses any address that is
  not `SOLE_MERCHANT_EMAIL`, since changing it would lock the owner out on the
  next request. To change it, update the row and the env var together.
- **Staff are unaffected.** Staff PINs, owner/manager/cashier roles, staff email
  logins and multi-location all still work *within* the one business.
- **Removed:** sign-up (`/auth/register`), the landing and pricing pages (`/`
  now redirects to `/dashboard` or `/login`), the plans/modules/subscriptions
  API and the Modules page, the KK POS partner-referral program (its API, page,
  template quick codes and the "platform referral link" document block), and
  self-serve account deletion. None of it was enforced: billing never gated a
  feature, so everything was and remains unlocked.
- **Tables left in place, unused:** `plans`, `modules`, `subscriptions`,
  `merchant_modules`, `partner_referrals`. Dropping them would be data loss for
  no gain. Backup/restore still knows about them.
- **Removed providers.** Square, Tyro (its `/tyro-settings` API, setup page and
  `tyro_settings` Drizzle schema), WeChat Pay/Alipay, OpenAI (the AI fallback and
  the `integrations-openai-ai-*` libs), and Google Workspace/Drive, OneDrive and
  Dropbox (backup destination, customer-file mirror, OAuth flows) are gone from
  the code, not just hidden. Data was left alone: the empty `tyro_settings`
  table still exists in the database (so `drizzle-kit push` would now offer to
  drop it), and production backups taken while OneDrive was a destination still
  list `onedrive` among their locations — which is why `BackupLocation.type`
  keeps it as a historical value. Those backups also have a `server` copy.
- **Also removed:** the Online Store (builder, public store and checkout, AI
  store designer, Storefront Data API, product reviews) and Online › Marketplace;
  payment-method Surcharges (never charged — every rule was disabled; past
  sales keep their `surcharge_amount` columns); SendGrid; Google/Microsoft
  account sync (Apple iCloud is the only contacts/calendar sync); S3 and Google
  Cloud Storage backup destinations (Nextcloud, SFTP and local remain, plus the
  always-on `server` copy); the Feedback form; Service Options (see "Service job
  quotes"); the onboarding wizard; Clear Demo Data; and the tax labels for other
  countries — tax is Australian GST with an ABN. The overdue-invoice surcharge
  under Invoice Settings is a different feature and stays.
- **Domain and name.** The app is **KK POS** at **pos.koastal.com.au**
  (`APP_BASE_URL` in `.replit`, `DEFAULT_PUBLIC_DOMAIN` in both `publicUrl.ts`
  files). It was KoaPOS at koapos.com.au, and that domain must stay attached to
  the deployment: stickers and service sheets printed with it are still being
  scanned. `middlewares/legacyDomainRedirect.ts` 301s its GET/HEAD requests to
  the same path on the new domain (`LEGACY_DOMAINS` overrides the list), pinned
  by `legacy-domain-redirect.test.ts`. A few `koapos` identifiers are kept on
  purpose because renaming them would break existing data: the token-vault salt
  `koapos-vault-v1`, the HMAC fallback secrets, the analytics salt, the Google
  Wallet `koapos-loyalty` class id, browser `localStorage` keys, the old
  `.koapos.enc` backups (new ones are `.kkpos.enc`; restore follows stored refs,
  not extensions), and the `artifacts/koapos` package path. The Print Bridge
  reads a pre-rename `KoaPOS` config folder and `KOAPOS_BRIDGE_*` env vars.
- **Short public addresses.** The current forms carry no business segment, and
  the older ones still route (links and QR codes already handed out):
  - customer portal `/c/<token>` (was `/b/<user>/c/<token>`) — `customerPortalUrl`;
    `/portal/resolve-domain` answers the one business for any host that is not a
    merchant's own custom portal domain;
  - landing pages `/l/<name>` (was `/b/<user>/l/<name>`) — API
    `/landing-pages/public/l/:customName`;
  - Tech App `/a/tech`, Mobile POS `/a/mobile` (were `/b/<user>/t/techapp|posapp`)
    — the apps still address their APIs by username, read from
    `GET /public/business` (`lib/sole-business.ts`);
  - dashboard `/d/dashboard/<access code>` (was `/d/<token>`). The code is the only
    credential, so the owner may set their own (`PUT /dashboard-app/access-code`)
    and the public route rate-limits wrong codes (20 / 15 min / IP).
  `short-app-routes.test.ts`, `portal-url.test.ts` and `legacy-domain-redirect.test.ts`
  pin these.
- **Business username is fixed** at `koastal` (`/b/koastal/...` for the portal,
  Tech App, Mobile POS, booking and product QR pages). `PATCH /merchants/me`
  rejects a username change, because every printed sticker and sent portal
  link carries it.
- **Retained tables.** `online_store_settings`, `online_store_thirdparty`,
  `storefront_api_keys`, `product_reviews`, `marketplace_connections`,
  `service_settings` and `payment_method_surcharges` still hold data, so their
  Drizzle definitions stay (each marked RETAINED, UNUSED) — removing them would
  make `drizzle-kit push` offer to drop the rows. No code reads them.
- **Not blocked:** public customer-facing pages of the other accounts (portal,
  booking) and their background schedulers
  still run, as they did before. Only signing in was closed off.

### Printing

A browser can only print silently over WebUSB/Web Serial (raw ESC/POS to a thermal
printer) — everything else hits the OS print dialog, and nothing in a browser can
route two documents to two different printers. So printing is split across three
layers:

1. **`lib/escpos.ts` + `lib/escpos-service-job.ts`** — encode a document to raw
   ESC/POS bytes (receipts, 80mm service dockets, drawer kicks, native QR).
2. **Transports** — `lib/escpos-transport.ts` (WebUSB / Web Serial, browser-native)
   and `lib/print-bridge.ts` (HTTP client for the local Print Bridge).
3. **`lib/print-router.ts`** — `printDocument({ purpose, hw, escpos, html, browserFallback })`
   is the single entry point. It resolves the printer profile the merchant routed
   that *purpose* to and degrades through the transports in order: WebUSB/Serial →
   bridge raw → bridge HTML → the caller's existing `window.print()` path. A print
   is therefore never blocked; the worst case is the dialog merchants see today.

**Adding a printable document**: add a member to `PrintPurpose` + `PRINT_PURPOSES` +
`DEFAULT_ROUTING` in `lib/hardware-config.ts`, then call `printDocument()` at the
print site passing the existing print flow as `browserFallback`. Only report
success to the operator when `printDocument` returns something other than
`"browser"` — the browser path just opens a dialog they can still cancel.

Three hazards worth knowing, all learned the hard way:
- **WebUSB and a Windows print queue are mutually exclusive for the same device.**
  A printer installed as a Windows printer has usbprint.sys bound to it, so
  `USBDevice.open()` fails with `Access denied`. There is no code fix — the
  merchant either replaces the driver with WinUSB (losing the queue) or uses the
  Print Bridge, which prints raw ESC/POS *through* the queue. The bridge exists
  largely for this reason.

- A `bridge` profile with **no queue name** prints to the machine's *default*
  printer. Never seed a profile that way; a merchant pairing the bridge for one
  document would silently redirect another (labels onto the A4 laser). Seed new
  profiles as `system`.
- Print effects keyed on props rebuilt each render (`hw`, an inline `onDone`)
  re-run on any parent re-render. A `window.print()` closed that window in
  milliseconds; a bridge print takes seconds, which is long enough to fire a
  second job. Guard with a ref — see `POPrintArea`.

**Paper size is the printer profile's, not a setting of its own.** A document's
paper comes from the profile its purpose is routed to — `paperFor` and
`thermalWidth` in `print-router.ts` — so 58mm vs 80mm vs A4 is set once, on the
printer, under Staff & Operations › POS Registers › Printers & Routing. Sales
Templates used to carry its own "Receipt & Print Settings" paper picker writing
`regional_ext_settings.receipt_paper_size`; no print path ever read that field,
so it silently did nothing. The tile is now a signpost to the real control and
the column is gone (`scripts/src/drop-receipt-paper-size.ts`) — if paper ever
needs a second home, it belongs on the printer profile, not on a settings row.

Config lives in two places for a reason:
- **Merchant-level** (`pos_settings.hardwareConfig` JSON): printer *profiles*
  (`printers`) and the purpose→profile map (`routing`). Shared by every till.
  Purely additive — `parseHardwareConfig` synthesises profiles from the legacy
  single `printer` field, so **no migration and no data loss** for existing merchants.
- **Device-level** (localStorage, `lib/print-bridge.ts`): bridge URL, pairing token,
  and per-till queue-name overrides — because Windows print-queue names differ
  between machines.

Two generations of printer config coexist: the legacy `hardwareConfig.printer`
(still the master switch for the WebUSB/Serial device and the auto-print toggles)
and the newer `printers`/`routing`. The Hardware settings UI keeps them in step —
`patchPR` in `management-registers.tsx` mirrors edits into the `receipt-printer`
profile. Don't let them drift.

**QR alignment** is set per code — `serviceQrAlign` for the job QR and
`serviceCustomQrAlign` for the custom QR — because they are separate blocks and
a merchant may well want them on opposite sides. Both are resolved by
`serviceQrAlign()` in `lib/service-sheet-fields.ts`, the shared module, because
five surfaces draw those blocks (the A4 report HTML in `print-receipt.ts`,
`ServiceJobSheet`, `ServiceJobDocket`, the ESC/POS encoder, and the template
preview panel) and five copies of a layout rule is five chances for one of them
to quietly ignore the setting — which is exactly what happened first time round.
`service-qr-align.test.tsx` therefore asserts the **rendered markup** of each
surface, not the helper.

Unset is deliberately **not** "left": the A4 sheet has always cornered its code
bottom-left and the 80mm roll has always centred it, so each renderer passes its
own historical default and only an explicit choice overrides it. On the roll the
printer justifies each code itself (ESC a takes the same three positions, and is
re-issued between the two codes), and the encoder returns to centre afterwards
so the option moves the codes and not the footer under them.

Two layout traps here, both pinned by tests. `text-align` cannot move a
block-level image, so the docket's custom QR needs `QR_BLOCK_MARGIN`'s auto
margins. And a QR whose caption sits beside it as a flex sibling can fill a
narrow column outright, leaving `justify-content` no slack to distribute — which
looks exactly like a setting that does nothing. The preview wraps each QR and its
caption in a shrink-to-fit `inline-flex` for that reason.

The frontend vitest config sets `esbuild: { jsx: "automatic" }` so a test can
render a print component at all; tsconfig says `"jsx": "preserve"` (Vite's React
plugin does the transform in the app build) and the test runner does not load
that plugin.

Service jobs print in two shapes from the same data: the A4 `ServiceJobSheet` and
the 80mm `ServiceJobDocket` (+ its ESC/POS encoder). `lib/service-job-print.ts`
owns the choice. The Service Ticket template catalogue carries both papers —
`ss-standard`/`ss-compact` (A4) and `ss-thermal`/`ss-thermal-compact` (80mm) — so
the saved `selectedStyle` sets the default paper *and* the docket's density
(`serviceDocketDensity` in `lib/service-sheet-fields.ts`, read by both docket
renderers). The `serviceSheetPaper` template option still decides when the saved
style is an A4 one, which is what keeps pre-existing 80mm merchants unchanged;
picking a thermal style writes it to `80mm` so the two can't disagree. Compact is
a *density*, never a smaller field set — a job prints the same content on either.

Labels/stickers (`lib/sticker-config.tsx`) route through the same router but are
**never** ESC/POS — DYMO-class printers use their own driver protocol, so they take
the bridge's HTML path with `paper: "auto"`, which preserves the exact die-cut
`@page` size the label markup declares. The label printer is expected to be shared
on the LAN: the bridge addresses printers by Windows *queue name*, so LAN printing
works via the OS, but a queue **shared from another PC** is a per-user connection
and is invisible when the bridge runs as a service (`SYSTEM`). Install such printers
machine-wide on a TCP/IP port. `/v1/health` reports `runningAsService` and the
Hardware settings surface a warning. The `network` transport on a profile (IP + port
9100) is *not* this — it's a raw socket the browser can't open and the cloud API
server can't reach, and still falls back to the print dialog.

### QR codes

`lib/qr-render.ts` is the only QR renderer: settings, the payload each QR *type*
encodes (`buildQRDataString`), the styled-dot options, and the framed SVG → PNG
export. Marketing › QR Codes designs codes with it; Management › Templates lets a
merchant pick one for a document's Custom QR (`SavedQrPicker`).

Picking a code stores three things on the template: a **rendered PNG data URL**
(`customQrImage`), the **saved code's id** (`customQrCodeId`, so a redesign can be
pulled through with Refresh), and **what it encodes** (`customQrData`). The image
is a snapshot on purpose — invoice PDFs render on the server, which can't run the
browser-only renderer — and it is the field every document already draws, so a
picked code needed no new plumbing in any renderer. `customQrData` exists for the
one path that can't draw an image: the ESC/POS receipt encodes the payload as a
native QR instead. A tracked code encodes `/api/qr/r/:id`, so re-render through
`qrEntryData` rather than reading `entry.url`.

The **service job QR** (A4 sheet, 80mm docket, repair sticker) is a second
resolver, `/api/qr/j/:jobId` — `serviceJobQrUrl` on the frontend, the route in
`routes/qr.ts`. A sticker is printed once and then lives on the device for
weeks, so the ink can never be re-encoded; it therefore carries a url that is
stable for the life of the job and the destination is chosen at scan time: the
Tech App deep link while the job is open, the customer's portal once it is
`completed` (falling back to the Tech App when there is no portal to open — a
sticker that opens nothing is worse than one that opens the staff view). Never
print `techAppJobUrl` directly. That resolver hands the portal to whoever scans
the sticker, since the portal token *is* the credential; `merchants.requirePortalPassword`
is the intended control. `customerPortalUrl` in `lib/publicUrl.ts` builds the
portal address for both the resolver and the status-change SMS (admin and Tech
App) so the three cannot drift.

Custom QR reaches every document: the thermal receipt (HTML + ESC/POS), A4
receipt, invoice, quote, the A4 service sheet, the 80mm service docket (HTML +
ESC/POS), the Customer PDF, the server-rendered invoice/quote PDFs, and the
invoice/quote **email bodies** (`lib/custom-qr-email.ts`). The invoice email body
takes its QR from the **Email** row (the template that owns the body), the
attached PDF from the **Invoice** row; the seed script below starts them
identical. Quote emails take both from the Quote row.

Every template category now reaches a renderer. Two were inert until recently:

- **Email** drives the invoice email body. `lib/email-template.ts` resolves the
  saved row server-side (`savedEmailTemplate`) and layers the caller's payload
  over it (`mergeEmailTemplate`), which is what makes a *background* send —
  auto-send, the reminder/overdue scheduler, neither of which passes a template —
  carry the merchant's wording. A caller's empty string means "nothing typed",
  never "clear the saved value", so blanks are dropped before the merge. The
  Email row also picks the email layout via its style id (`e-pro`/`e-casual`/
  `e-minimal`). The client payload comes from `invoiceEmailTemplate()` on
  `useDocumentTemplate` — one builder for all three send call sites.
  Invoice emails previously took their wording from the *Invoice* template, so
  `scripts/seed-email-template-from-invoice.ts` (in the `db:push` chain) copies it
  across: it creates a missing Email row, and otherwise fills only blank/absent
  keys. It never overwrites, and is idempotent.
- **Customer PDF**: `useDocumentTemplate` exposes `customerPdfTemplate` (branding,
  font, header/footer, section toggles, custom QR) and `customers.tsx` passes it
  to `exportCustomerPDF`. The whole template was inert before, so merchants who
  saved one will see their export change to match it — logo included.

Which template owns which document: the email **body** is the Email template's;
the **attached PDF** is the Invoice (or Quote) template's. They are separate
documents with separate custom QRs — the seed above starts them identical.

### Service job quotes → the till

A repair job carries two different money documents, and confusing them is the
main hazard in this area:

- **Parts & Labour** (`service_job_lines`, `ServiceJobLinesPanel`) is what was
  actually *consumed*. Adding a part moves stock; the rows drive job cost and
  profit.
- **Quote** (`ServiceJobQuotePanel`) is what the customer was *offered*. It
  touches no stock and may be a fixed price unrelated to what the parts cost —
  a shop quotes "$370 screen repair" while Parts & Labour tracks the $180 panel.

The Quote section needed **no new table**: it writes an ordinary `quotes` row
carrying `serviceJobId`, so a job's quote prints, emails, expires, approves and
converts exactly like one raised from the Quotes page. Lines may come from the
product catalogue (carrying `productId`, so a converted line snapshots cost
price) or be free-text charges.

**The till is the point.** Linking a service job in the POS looks up that job's
quotes (`GET /quotes?serviceJobId=`) and offers to import one into the cart, so
the cashier rings up what was agreed instead of re-keying it. Four rules hold
that safe:

- Only `draft`/`sent`/`accepted` quotes are offered (`IMPORTABLE_QUOTE_STATUSES`
  in `pos.tsx`). A **converted** quote has already been paid — offering it again
  is a double charge — and a declined/expired one was never agreed.
- An imported line sets `customPrice` to the quoted unit price. That override
  beats catalogue price *and* customer group pricing, which is the point: a price
  rise after quoting is not the customer's problem.
- **The server has to be told the sale came from a quote, or it reprices it.**
  `finalizeSale` recomputes every line from `product.price`, so a quoted price
  that is not the catalogue price (the whole reason a quote exists) came back as
  a 409 "Sale total does not match current product pricing". The sale therefore
  carries `quoteId`, and the server re-reads that quote — scoped to the merchant,
  and only while it is still draft/sent/accepted — and accepts its unit prices
  for the products it named. The quote row is the authorisation, so the client is
  trusted for nothing but *which* quote: a price matching no line on it is still
  repriced, and `QUOTE_PRICING_STATUSES` (mirroring `IMPORTABLE_QUOTE_STATUSES`)
  stops a converted quote licensing a second sale. `transactions-quote-price.test.ts`
  pins it.
- **A quote's own discount comes across with its lines.** A quote may carry a
  discount off the whole job, and importing the lines alone rings up more than
  the customer accepted. `distributeQuoteDiscount` (`lib/quote-import.ts`,
  pinned by `quote-import.test.ts`) spreads it over the imported lines as line
  discounts — not as the cart's overall discount, because the cart may hold
  items that were never on the quote, and a line discount is both what survives
  parking and what the server already honours per line. The last line absorbs
  the rounding remainder so the parts sum to the whole.
- **A parked cart keeps what it was built from.** `parked_sales.quote_id` /
  `service_job_id` (added by `scripts/src/add-parked-sale-links.ts`) are what let
  a retrieved sale still charge the quoted price and still close its job; both
  leave the live cart when it is parked, or they would settle that quote and
  close that job against whatever the till rings up next. The same two ride in
  the localStorage recovery draft and the unload beacon. Note the line fields
  they depend on — `itemDiscount`, `customPrice`, `itemNote` — were being
  stripped by the request validator until they were declared on
  `ParkedSaleItem`: a parked line silently came back at catalogue price.
  `parked-sale-fields.test.ts` pins the contract.
- **Importing is not committing.** The quote is marked converted in
  `completeSaleUi`, once the sale is actually paid, with the transaction id — so
  a cashier who abandons the sale leaves the quote open for the next attempt.
  This is deliberately unlike the Quotes page's "convert", which marks the quote
  before the sale exists.
- The prompt never silently discards a cart: when the cart is non-empty, "Add to
  cart" is the default and the replace button spells out what it destroys.

The `serviceJobId` filter is load-bearing, not cosmetic — if it were ignored the
list would return every quote the merchant has and the POS would offer a
different customer's quote against this job. `quotes-by-service-job.test.ts`
pins that.

Which service-job sections show is fixed in `SERVICE_JOB_SECTIONS`
(`ServiceJobDetailDialog.tsx`): the layout the business had chosen on the former
Service Options page — Quote, Warranty and Notes on; Parts & Labour, Approval &
Deposit, Diagnostics, Technician Time, Sign-off and Shipping off. Warranty
windows are `SERVICE_WARRANTY_DEFAULTS` (14 days) and Print always opens the
chooser.

The jobs list shows what each job was quoted (`quoteTotal`, beside the
quoted/not-quoted tick) and totals the column in a footer row. Both come from
`GET /service-jobs` only — one query for every job, rather than a per-job query
on responses nothing reads. The rule is in `lib/service-job-quotes.ts`, away
from `db` like the End of Week money rules, and pinned by
`service-job-quotes.test.ts`: the figure is the **most recent** quote's total,
never the sum of the job's quotes. The panel revises a job's quote in place and
only raises a new row once the last is converted or declined, so summing them
would add a superseded price to the one that replaced it. The footer sums the
rows actually on screen, so it follows the tab and the filters.

### Online shop (shop.koastal.com.au)

A second front end on the SAME database, so nothing is synced: products,
prices, stock, customers and their accounts are the POS's own rows. It is being
built in stages — 1: catalogue + accounts (done); 2: checkout (Stripe cards,
Afterpay/Zip), paid order → stock, POS sale, a Deliveries entry and a staff
alert; 3: account area (orders, all purchases, invoices, repairs, quotes,
appointment booking); 4: click & collect, flat-rate and Australia Post shipping.

- **App**: `artifacts/shop` (`@workspace/shop`, React + Vite + Tailwind, wouter),
  its own package — it shares no UI code with the POS, only the API. In
  production `app.ts` serves its build for requests on `shopDomain()`
  (`SHOP_DOMAIN`, default shop.koastal.com.au) and the POS build for every other
  host; `/api` is the same on both, so the shop calls it same-origin and its
  session cookie is its own. In development it runs behind `/shop-preview`
  (its `artifact.toml`, `BASE_PATH`), and wouter's `base` follows `BASE_URL`.
- **API**: `routes/shop.ts`, public and scoped to `soleMerchantId()` — no request
  can name a merchant. A product is listed when `isActive` and `showOnline`
  (`products.show_online`, default "true", added by
  `scripts/src/add-product-show-online.ts` in the `db:push` chain). Only in/out
  of stock is exposed, never the count; a product whose product type doesn't
  track stock (services) is always available.
- **Accounts are the portal's.** One password (`customers.portal_password_hash`)
  and one signed-in marker (`req.session.portalCustomerId`) for shop and portal.
  Login is email + password, trying each POS customer with that email (the POS
  has duplicates). **Signing up with an email the POS already knows never sets
  a password** — it emails a set-up link to that address
  (`lib/customerPasswordLinks.ts`, `destination: "shop"`), because knowing an
  email must not be enough to claim an account. Pinned by `shop-accounts.test.ts`.
- **Invites** (`routes/shop-invites.ts`, the "Online shop accounts" card on
  Customers settings): emails a 14-day set-password link to customers with an
  email and no password, once per address, skipping anyone invited in the last
  14 days; email only, never SMS. It needs the exact count typed back and sends
  in the background, paced for the email provider. Pinned by `shop-invites.test.ts`.

### Linking a job or appointment to an invoice

In the invoice editor, linking a service job or appointment also sets the
invoice's customer and offers that customer's quote: the job's own quote, or for
an appointment (quotes have no appointment link) the customer's latest one. Only
`draft`/`sent`/`accepted` quotes are offered, as at the till. The prompt shows
the lines and never replaces existing lines by default. Importing is not
committing: the quote is marked converted only when the invoice saves.

### Default customer image

Customers with no photo show `customer_settings.defaultCustomerImageUrl`.
"Apply to existing customers" (`POST /customer-settings/apply-default-image`)
stamps it onto customers with no photo or still carrying the previous default —
never over a photo set for one customer. iCloud contact sync sends each
customer's photo, else the default, as the vCard PHOTO (skipped over 512 KB).

### Phone numbers

Phone numbers are stored in **E.164** — `+61412345678` — whatever was typed.
A counter staff member types `0412 345 678` because that is what the customer
reads out; every machine that later has to *use* the number (an SMS gateway, a
`tel:` link, a vCard QR, an exported contact) needs the country code, and asking
the operator for `+61` every time is how a third of the numbers end up
un-textable.

`lib/phone-shared` (`@workspace/phone-shared`) holds the whole rule — the country
table (dial code, trunk prefix, plausible national lengths) and `normalisePhone`
— so the browser and the API server cannot disagree about what a saved number
looks like. It is deliberately **not** libphonenumber: nothing here rejects a
number, it only writes the country code onto one.

**The guarantee is server-side.** `middlewares/normalisePhoneFields.ts` runs
between the body parsers and the routers, so every handler sees a number that
already carries its country code. It is a middleware and not a call per handler
because a phone number is written by a dozen of ~140 routers, and a per-handler
habit is one the next router won't have. Three things keep that safe:

- It matches on **field name**, from a fixed list, never on the shape of a value
  — a note or a search term that reads like a number is not a phone number.
- `normalisePhone` returns anything it can't confidently read as a bare national
  or international number **exactly as given**: "0400 000 000 ext 12", "ask for
  Dave", too short, too long, already `+`. A number left as typed is an
  annoyance; a mangled one is a customer the shop can no longer reach.
- It runs only for a request with a merchant session, since that is what says
  which country to assume. The public write paths — `public-booking.ts` and the
  portal's profile update — know their merchant another
  way and call `normalisePhoneFor` in the handler. **A new public write path that
  takes a phone number must do the same.**

The frontend half is the base `Input`, which rewrites a phone field **on blur**
(not while typing — turning "04" into "+614" under the cursor fights the
typist). Detection is in `lib/phone-format.ts`: `type="tel"`, a tel-ish
`name`/`id`, or a placeholder that is an *example number* — most phone fields in
this app are a bare `<Input>` whose `placeholder="0400 000 000"` is the only clue.
`NOT_PHONE_NAME_RE` is what stops an ABN, IMEI or BSB field being caught by that
last rule, and the placeholder test is strict enough to exclude
"Search by name, email or phone…" — rewriting a search query turns a lookup into
a miss. Opt out with `noPhoneFormat`.

**Storage and display are separate settings.** `merchants.phoneDisplay`
(`international` / `national`) decides only how a number *reads on screen* —
`formatPhoneDisplay` in the shared lib, `formatPhoneForDisplay` in the frontend.
Storage is always E.164, so the toggle rewrites nothing and can be flipped back
and forth freely; `phone-normalise.test.ts` pins the round trip (saving what is
on screen stores the same string either way). Two rules in it are load-bearing:
only the merchant's *own* country code is ever dropped — an overseas number shown
without its code can't be dialled — and a `tel:`/`sms:`/`wa.me` href always gets
the **stored** value, never the display one. The base `Input` shows the
normalised number in the merchant's display format on blur, which is why the
field can read `0412345678` while the database holds `+61412345678`.

Printed and emailed documents follow it too, which is why the server needs the
setting as well: `phoneFormatterFor(merchantId)` in `api-server/src/lib/phone.ts`
resolves it once per document (not per field — a merchant's setting cannot change
halfway down a page). It is applied in `buildInvoicePdf`, which is why
`InvoicePdfData` carries `merchantId`, and to the `{{business.phone}}` /
`{{customer.phone}}` quick codes. On the browser side: the thermal and A4
receipts, the ESC/POS header, service job sheet and docket, printed forms, the
customer PDF and sticker shortcodes.

The country comes from `merchants.defaultPhoneCountry` (Settings › Regional ›
Phone Numbers), and **every merchant who has not set one gets Australia** —
`resolvePhoneCountry`, whose only fallback is `FALLBACK_PHONE_COUNTRY`. It
deliberately does *not* read `merchants.country`: KK POS sells to Australian
retail, so +61 is right for all but a handful of accounts, and a default that
varied per merchant would be one nobody could predict from the settings screen.
`""` is what every merchant stores until they choose, and an unrecognised code
resolves the same way. The server caches the resolved country for 60s, so
changing the setting calls `invalidatePhoneCountryCache`; the browser gets it
from `/auth/me`, pushed into `phone-format.ts` by `AuthProvider` (the base
`Input` also renders on the login and marketing pages, where a settings query
would be a guaranteed 401).

Two things that are *not* affected: `lib/phone-match.ts` compares the last 9
digits, so a legacy `0400 000 000` and a new `+61400000000` are still the same
customer — which is what makes a partial migration safe. And numbers already in
the database are only rewritten by `scripts/backfill-phone-e164.ts`
(dry-run by default, `--commit` to write, idempotent) — **not reversible**, the
pre-backfill string is kept nowhere.

### End of Week (banking & budgeting)

Management › Marketing & Reports › End of Week is the weekly banking sheet:
what was sold, what has to go to the bank, and what the week's staff cost.
Default window is **Friday → Thursday**, and it is the last week that has
*finished* — a merchant banking on Friday morning wants last week, not the
half-week they are standing in. The range is editable (capped at 62 days).

The computed half reads the **same report views the rest of Management does**
(`view_daily_sales_summary`, `view_payment_method_breakdown`,
`view_product_performance_ledger`), so a week here can never disagree with the
Sales Overview or a Z-report over the same days — those views already span POS
sales + paid invoices + completed laybys.

`artifacts/api-server/src/lib/end-of-week.ts` holds the money rules with no `db`
or `req` in sight, and `src/__tests__/end-of-week.test.ts` pins them. The route
queries; the lib decides what the numbers mean. Four of those rules are
load-bearing:

- **The deposit is `cash counted − float`, and the count wins.** A counted drawer
  is a fact; the ledger figure is a prediction of it. With no count the ledger
  figure stands in and `countVariance` stays **null** — a `0` there would read as
  "counted, and it balanced", which is a lie about a drawer nobody opened.
- **Till purchases are deducted from the *expected* figure only.** Cash already
  taken out of the drawer is cash the count will not see, so subtracting it from
  a counted total would deduct it twice.
- **`split` is never a banking bucket.** The POS records a split sale's legs
  individually, so bucketing the parent as well banks the same money twice. Gift
  cards, vouchers, store credit and loyalty are grouped as `nonBanking` — they
  redeem a liability that was already paid for and move no new money.
- **PAYG is shown but not added, unless the merchant says otherwise.** It is
  withheld from wages, not paid on top, so counting it by default would inflate
  the wage bill by the withheld amount every week. `staffCostTotal(row,
  includeTax)` / `sumStaffCosts(rows, includeTax)` take the merchant's
  convention from `sales_settings.eowIncludeTaxInStaffCost` (default `"false"` —
  what the report did before the option existed), toggled on the Employee Costs
  card. It is a **merchant** setting, not a field on the week: an accounting
  convention that varied week to week would make weeks incomparable. The tax
  column is reported either way; the option only moves whether it lands in
  `total`. A finalised week keeps the total frozen in its snapshot, so flipping
  it cannot restate anything already banked — reopening the week picks up the
  new convention.

Employee costs pre-fill from timesheet hours × the staff member's pay rate
(with `loadingRate` on top), super at their own `superRate`, and dollar-value
KPI rewards from `kpi_history` periods that **closed inside the week and were
hit** — a KPI still running is not earned yet. Every cell is then editable, and
`mergeStaffCosts` lets a saved row win outright over a later recompute; only
`hours` refreshes, since it is read-only timesheet information. A saved row for
a since-deactivated employee is kept — their wage was still a cost of that week.

`end_of_week_reports` stores **only** the merchant-entered half (float retained,
cash purchases, employee costs, counted/banked amounts, notes). The computed
half is deliberately not stored: a stored copy would drift the moment a refund
or backdated invoice landed. **Finalising** is the exception and the whole point
— it writes a `snapshot` once, and a finalised week renders that instead of live
figures, so a refund processed next Tuesday cannot change a week whose cash is
already at the bank. Reopening drops the snapshot and keeps every input.

Two subtleties worth keeping:

- Drawer `cash_out` entries are pulled in as purchase lines **only on the first
  open of a week** (`mergeCashPurchases`), because after that the saved row is
  the record of what the merchant chose to keep — re-pulling would resurrect
  deletions on every page load. The first save of *any* field is what creates
  that row, so `PUT /end-of-week` seeds `cashPurchases` with the merged list
  when the caller did not send one; otherwise editing the float would silently
  drop the lines the page was already showing.
- The float defaults to the **last** session opened per register in the week
  (`DISTINCT ON (register_id) … ORDER BY opened_at DESC`), not the sum of every
  session — the same physical float is counted into the drawer again each
  morning, and summing it would inflate the float by a factor of the days traded.

Adding the table is the standalone idempotent script
`scripts/src/add-end-of-week-reports-table.ts` in the `db:push` chain, not
`drizzle-kit push`, for the same reason every other `add-*-table` script exists:
push would try to reconcile (and drop) the report views.

### Data conventions (important, non-obvious)
- Numeric DB columns (price, total, …) are Postgres `numeric`; route handlers return them via `parseFloat()`.
- Boolean fields are stored as text `"true"`/`"false"` (a Drizzle text-column limitation) — compare/serialize accordingly.
- OAuth tokens are encrypted at rest in the `oauth_token_vault` table via `services/tokenVault.ts` using `VAULT_ENCRYPTION_KEY` (AES-256-GCM `v2:<iv>:<tag>:<ct>`; legacy CBC `<iv>:<ct>` still readable and upgraded on re-encrypt). See "Rotating VAULT_ENCRYPTION_KEY" below.
- Money-moving endpoints (`POST /transactions`, `POST /invoices/:id/payment`) are **atomic and idempotent**: the client sends `giftCardPayment {cardId, amount}`, and the server locks the card row (`FOR UPDATE`), validates, debits it, and writes the redemption ledger entry inside the SAME DB transaction that records the sale/payment — so the card can never be charged without the sale landing (or vice-versa). An `idempotencyKey` dedupes retries (`transactions` has a unique index on `(merchantId, idempotencyKey)`; invoice payments dedupe via a key recorded in the invoice's events). The POS generates one key per checkout attempt (reused across manual retries, reset on success/clear-cart). Do **not** introduce client-side debit + compensation patterns.

## Environment

Required env: `DATABASE_URL`, `SESSION_SECRET`, `VAULT_ENCRYPTION_KEY` (the last required in production). Template in `.env.example`.

### Deployment (Replit autoscale)

`[deployment]` in `.replit` carries **`build`** and **`run`**. They belong in the
repo, not only in the Replit UI: when they went missing there, publishing failed
with `Could not find run command` and nothing in git said what they should be.

    build = pnpm run build     # typecheck, then every package
    run   = pnpm --filter @workspace/api-server run start

**One process serves both halves of the app.** `app.ts` mounts the API at `/api`
and, when `artifacts/koapos/dist/public/index.html` exists, serves the built SPA
at every other path with a history fallback for client-side routes. That is a
requirement, not a convenience — the frontend calls the API on *relative* paths
(`custom-fetch.ts` sets no base URL), so splitting the two across origins makes
every request cross-origin and the session cookie stops flowing.

Details worth keeping:

- The static block is **skipped when there is no frontend build on disk**, which
  is why `pnpm dev` (Vite on its own port) and the test suite are unaffected.
  `SPA_DIST_DIR` overrides the location.
- It is mounted **after** the API router so `/api/*` still 404s as JSON instead
  of being answered with `index.html`, and **before** `errorHandler` so that
  stays last. The fallback is GET-only: a stray POST to an SPA path is a bug, so
  it 404s rather than returning HTML.
- Caching is split three ways because only `/assets` is content-hashed by Vite:
  `assets/*` is `immutable, 1y`; the rest of the build root (icons, manifest,
  logo, robots.txt) keeps its filename across deploys and gets 1h; `index.html`
  is always `no-cache`, since caching it is what would pin a till to the previous
  deploy.

**`NODE_ENV` must be `production` in the deployment.** The `start` script does
not set it, and a great deal hangs off it — the fail-fast guards for
`SESSION_SECRET` and `VAULT_ENCRYPTION_KEY`, the CORS allowlist (otherwise
`origin: true`), and whether the dev fallbacks for the vault key and
`ANTHROPIC_API_KEY` are honoured. Running the deployment without it would fall
back to the hardcoded session secret, which is public in this repo.

### Required production environment variables
These MUST be set when the API server is started with `NODE_ENV=production`. Missing any causes the process to fail fast on boot.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Drizzle ORM). |
| `SESSION_SECRET` | `express-session` cookie signing secret. |
| `VAULT_ENCRYPTION_KEY` | Key used to encrypt OAuth access/refresh tokens in `oauth_token_vault`. GCM verifies an auth tag, so a wrong/tampered value fails loudly instead of returning garbage. The server throws `"Fatal: VAULT_ENCRYPTION_KEY environment variable is required in production mode."` on startup if missing under `NODE_ENV=production`. The insecure hardcoded dev fallback is only honoured when `NODE_ENV` is `development` or blank — never in production/staging/test. Generate with e.g. `openssl rand -hex 32`. On startup the server re-encrypts any tokens under `VAULT_ENCRYPTION_KEY_PREVIOUS`, then invalidates rows still undecryptable with the current key (affected merchants must reconnect). |
| `VAULT_ENCRYPTION_KEY_PREVIOUS` | Optional. Set to the **old** key value when rotating. See below. |

#### AI provider keys (none required — merchants bring their own)
AI is **bring-your-own-key**: each merchant connects their own Anthropic account
under Management › Integrations › AI Providers and is billed for their own
usage. There is no platform AI key in production. `ANTHROPIC_MODEL` optionally
pins the model (default `claude-opus-5`); `ANTHROPIC_API_KEY` is a **development
convenience only**, ignored when `NODE_ENV` is production/staging/test. See
"AI providers" below.

#### Rotating `VAULT_ENCRYPTION_KEY`
To rotate without forcing every merchant to reconnect:
1. Set `VAULT_ENCRYPTION_KEY_PREVIOUS` to the current (soon-to-be-old) key.
2. Set `VAULT_ENCRYPTION_KEY` to the new key.
3. Restart the API server. On boot it runs a one-shot migration (`reEncryptVaultEntries`) that decrypts any token readable under the previous key and re-encrypts under the new key. `decryptToken` also transparently falls back to the previous key during the transition.
4. Once you see `"Re-encrypted OAuth vault entries under rotated key"` in the logs, remove `VAULT_ENCRYPTION_KEY_PREVIOUS` and restart again.

Rows undecryptable under **either** key are invalidated on startup (`disconnectedReason: "key_rotated"`); those merchants must reconnect the affected integrations.

### Reading the production database

Production is Neon, and `PROD_DATABASE_URL` authenticates as `neondb_owner` —
the database **owner**, with full read/write/DDL over live merchant data. There
is no "just SELECT" version of that credential, so it is not the one to reach
for when you only need to look.

Use **`scripts/prod-query.sh`** instead:

```bash
scripts/prod-query.sh "SELECT count(*) FROM merchants"
scripts/prod-query.sh --csv "SELECT id, name FROM merchants LIMIT 5"
```

It connects as `claude_ro`, a role holding `SELECT` and nothing else. The role's
absent write grants are the actual security boundary — everything else is
defence in depth: the script aborts unless `SELECT current_user` returns
`claude_ro`, forces `default_transaction_read_only=on`, and caps statement and
idle-in-transaction time. The password is never an argument; it comes from
`~/.pgpass`, so it appears in no env var, no argv and no connection string.

The wrapper unsets `PGPASSWORD`/`PGUSER`/`PGHOST`/`PGDATABASE` before connecting,
and must keep doing so. Replit sets those for a *different* Neon database, and
libpq reads `PGPASSWORD` **in preference to** `~/.pgpass` — so leaving them set
sends the wrong password and fails as `password authentication failed for user
claude_ro`, which looks like a broken `~/.pgpass` and is not.

Because it is one fixed entry point it can be allowlisted alone
(`Bash(scripts/prod-query.sh:*)`) without allowlisting bare `psql`, which would
expose the owner credential.

**Production holds real customer PII** — names, emails, phone numbers, purchase
history. Prefer aggregates over row dumps and select only the columns you need;
anything read enters the agent transcript.

Two things this setup does *not* cover:

- **Writes.** For a migration, backfill or bug repro against real data, create a
  Neon **branch** — copy-on-write, near-instant, and it cannot affect
  production. Keep the existing script convention for actual changes:
  dry-run by default, `--commit` to write, printing the DB host it connected to
  (see `artifacts/api-server/scripts/backfill-structured-addresses.ts`).
- **One-off operator setup.** Creating the `claude_ro` role stays manual and
  deliberately unscripted, because it needs the owner credential. The SQL is in
  the header of `scripts/setup-pgpass.sh`. The role needs
  `ALTER DEFAULT PRIVILEGES ... GRANT SELECT` for the owner, or every `db:push`
  that adds a table leaves it unable to see the new one. To revoke:
  `DROP OWNED BY claude_ro; DROP ROLE claude_ro;`.

  Storing the password *is* scripted: `scripts/setup-pgpass.sh` writes the
  `~/.pgpass` entry (prompting, or from `CLAUDE_RO_PASSWORD`), never taking it
  as an argument, replacing only its own line so other credentials in the file
  survive, and verifying through `prod-query.sh`. Run it once per machine —
  `~/.pgpass` does not survive a rebuilt home directory.

### System email env vars
Platform-level fallback when a merchant has no email provider configured in Management → Email. Essential for auth emails (password reset, login alerts). Set **one** option:

**Option A — Resend (recommended):**
- `SYSTEM_RESEND_API_KEY` — Resend API key; platform default sender.
- `SYSTEM_FROM_EMAIL` — Required sender address when using Resend (e.g. `noreply@koastal.com.au`).
- `SYSTEM_FROM_NAME` — Display name (optional, defaults to `KK POS`).

**Option B — SMTP:**
- `SYSTEM_SMTP_HOST` / `SYSTEM_SMTP_PORT` (default `587`) / `SYSTEM_SMTP_USER` / `SYSTEM_SMTP_PASS`
- `SYSTEM_SMTP_SECURE` — `"true"` for SSL/TLS on port 465; defaults to `"false"`.
- `SYSTEM_FROM_EMAIL` (optional, falls back to SMTP user) / `SYSTEM_FROM_NAME` (optional, defaults to `KK POS`).

If neither is configured, auth emails are silently dropped and a warning is logged.

### Integration env vars
Each integration is "feature disabled if missing" — the API hides the connect button and the OAuth callback returns an error. Set client id and secret together.

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Ads and Google Business Profile.
- `GOOGLE_ADS_DEVELOPER_TOKEN` — Google Ads account listing; discovery disabled if missing.
- `STRIPE_CONNECT_CLIENT_ID` / `STRIPE_SECRET_KEY` — Stripe Connect onboarding & charges.
- `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` — Xero accounting sync.
- `APPLE_WALLET_CERT_PEM` / `APPLE_WALLET_KEY_PEM` / `APPLE_WALLET_TEAM_ID` / `APPLE_WALLET_PASS_TYPE_ID` — Apple Wallet loyalty passes.
- `GOOGLE_WALLET_ISSUER_ID` / `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_WALLET_PRIVATE_KEY` — Google Wallet loyalty passes.
- Sign In with Apple: `APPLE_CLIENT_ID` (Service ID, e.g. `com.yourapp.signin`), `APPLE_TEAM_ID` (10-char), `APPLE_KEY_ID` (10-char), `APPLE_PRIVATE_KEY` (full `.p8` contents incl. BEGIN/END headers). These are server-side config secrets and are **not** stored in `oauth_token_vault`; per-merchant Apple tokens issued after the flow are stored in the vault.
- **Nextcloud needs no env vars.** It is self-hosted per merchant, so there is no platform-registered app — see below.

### Nextcloud (self-hosted storage & backups)

Nextcloud is the one cloud-storage integration with no platform OAuth app: each merchant points at their own server, which issues the credential itself. That gives it a third `authType`, `"loginflow"`, alongside `oauth` and `credentials` in the `INTEGRATIONS` catalogue.

- **Auth — Login Flow v2** (`services/nextcloudAuth.ts`, `routes/nextcloud.ts`). `POST /integrations/nextcloud/login-flow/start` opens a login session on the merchant's server and returns a `loginUrl`; the browser polls `.../poll` until the merchant approves, and the poll that succeeds is what stores the issued **app password** in `oauth_token_vault` under provider key `nextcloud`. The poll token is held in `req.session.nextcloudLoginFlow` and never sent to the browser. Flows expire after 20 minutes. App passwords do not expire, so unlike Google/Microsoft there is **no token refresher**.
- **Transport — WebDAV** (`lib/nextcloud.ts`), HTTP Basic over `remote.php/dav/files/<user>`. Files over 50 MB use chunked upload v2 (MKCOL a transfer dir → PUT chunks → MOVE `.file` onto the destination), because a single large PUT hits whatever body limit fronts the merchant's server.
- **SSRF guard**: the server URL is merchant-supplied, so `assertSafeNextcloudUrl` resolves the host and rejects loopback/RFC1918/link-local/CGNAT/multicast answers before every request. Do not add a Nextcloud request path that skips it. `normaliseServerUrl` rejects non-http(s) schemes and rejects plain http under `NODE_ENV=production`. Covered by `src/__tests__/nextcloud-url.test.ts`.
- **Surfaces**: a backup destination (`lib/backup-storage/nextcloud.ts`, folder defaults to `KKPOS/Backups`), a customer-file mirror target (`services/cloudFileMirror.ts`), and a restore/download source — `retrieveArchive` in `lib/backup-storage/index.ts` tries the platform `server` copy first, then Nextcloud.

Nextcloud is now the **only** cloud storage provider (backup destination and
customer-file mirror) — Google Drive/Workspace, OneDrive and Dropbox were
removed; see "Removed providers" under Single-business install. Adding one back means touching the same five places `StorageType` is declared: `lib/backup-storage/types.ts`, `BackupStorageDestination` + `BackupLocation` in `lib/db/src/schema/merchant-backups.ts`, both enums in `openapi.yaml`, and `StorageType`/`STORAGE_META` in `management-backup.tsx`. The `destinations`/`locations` columns are JSONB with TypeScript-only typing, so **no SQL migration is needed** to widen them.

### AI providers (bring-your-own-key, Claude preferred)

KK POS runs AI on the **merchant's own** API key. A merchant connects their
Anthropic account under Management › Integrations › AI Providers, the key is
encrypted at rest in the OAuth token vault, and their usage is billed to them.
**The platform holds no production AI key**, so a merchant who has connected
nothing has no AI features rather than a bill on someone else's account.

Every AI feature goes through `artifacts/api-server/src/services/ai.ts` — no
route talks to a vendor SDK directly, and nothing but that module names a model.

- `aiText` / `aiStream` / `aiJson` are the three shapes, and **each takes a
  `merchantId` first**. There is no such thing here as an AI request that is not
  on behalf of a merchant; that signature is what makes tenancy impossible to
  forget.
- `providersFor(merchantId)` resolves the merchant's connected Claude account.
  **Claude is the only provider** — the OpenAI fallback was removed (see
  "Removed providers" under Single-business install); a leftover `openai` vault entry is ignored, which
  `ai-provider.test.ts` pins. Credentials are read per request:
  the HTTP clients are pooled by key inside the integration libs, but the
  *merchant → key* mapping is not, so disconnecting takes effect immediately.
- **The AI integration is `useVault: true`.** An API key is a bearer
  credential with a live billing account behind it.
  `artifacts/api-server/scripts/migrate-ai-keys-to-vault.ts` moves any plaintext
  key rows into the vault — dry-run by default, `--commit` to write.
- **`ANTHROPIC_API_KEY` is a dev convenience only.** It stands in for a
  merchant's key when `NODE_ENV` is `development` or blank, and is ignored in
  production/staging/test — same rule as the token vault's dev fallback, for the
  same reason: a platform key quietly serving production is a bill nobody agreed
  to. It never displaces a key a merchant actually connected.
- **Streams fail before the first byte where they can.** `aiStream` primes the
  first event, so an open failure (revoked key, rate limit) surfaces before
  `routes/openai.ts` writes SSE headers. `withFallback` is kept so a second
  provider could slot back in; once a delta has reached the client the provider
  is committed, since retrying elsewhere would splice two completions together.
- **`aiJson` returns `unknown` on purpose.** Claude enforces the JSON Schema
  server-side, but model output is untrusted until checked. Every caller validates
  with Zod before the value goes anywhere — the schema is guidance, Zod is the
  guarantee.
- Claude uses `thinking: {type: "adaptive"}` and `output_config.effort`. Effort
  is the cost/latency dial (`"low"` for the in-checkout upsell coach), *not* a
  cheaper model. `budget_tokens` is removed on current models — do not add it.
- `routes/openai.ts` keeps its `/openai/...` paths for compatibility with the
  frontend and the OpenAPI spec. The name is historical; the provider is not.

## Product surface

Login; Dashboard (analytics, sales chart, KPIs); POS Register (product grid + cart + payment modal card/cash/split); Products (CRUD, categories, inventory, SKU, pricing); Customers (CRM, loyalty, spend, visits); Transactions (history, receipts, refunds); Inventory (stock levels, low-stock alerts); Staff (roles, PIN); Settings (business + regional).

## Accounts

The only account is `admin@koastal.com.au` (Koastal Kollective, username
`koastal`) in both databases; the seeded demo merchant and every test account
were deleted from dev. Sign in to dev with that account.

## User preferences (follow these)

- **Full-width layouts**: all app pages must use the full window width — never add `max-w-*` to page-level containers. Where a page has multiple cards/sections, place them in a responsive grid (`grid-cols-1 lg:grid-cols-2 gap-6 items-start`) so they sit side by side on large screens and stack on mobile. Dialog widths (`max-w-md`, `max-w-lg`, etc.) are fine.
- **Data-loss warning required**: before actioning any feature addition or fix that could destroy, overwrite, or permanently alter existing data (DB migrations, seeding, schema changes, file deletions, data backfills), stop and explain in full what data will be lost and why, then wait for explicit confirmation before proceeding.
