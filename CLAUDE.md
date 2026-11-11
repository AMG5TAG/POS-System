# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

KoaPOS — an in-house Point of Sale system run for a **single business** (Koastal). It began as a multi-tenant SaaS; see "Single-business install" below for what that left behind. Clean, tablet/mobile-ready UI. A pnpm monorepo (Node 24, TypeScript 5.9) with a React/Vite frontend, an Express 5 API server, PostgreSQL + Drizzle ORM, and a contract-first OpenAPI codegen pipeline.

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
- `lib/integrations/*`, `lib/sales-documents`, `lib/shortlinks-shared`, `lib/phone-shared`, `lib/group-pricing`, `lib/object-storage-web` — shared libraries. Note that cloud-storage integrations do **not** live here: they are in `artifacts/api-server/src/lib/` (`backup-storage/`, `nextcloud.ts`, `objectStorage.ts`) and `src/services/`.
- `artifacts/print-bridge` (`@workspace/print-bridge`) — a standalone, dependency-free Node service that runs **on the merchant's till**, not on the server. It is what lets the browser print without the OS print dialog. Not part of the deployed app; built to a single `dist/index.mjs` and installed on each till. See "Printing" below and its own README.
- `scripts` (`@workspace/scripts`) — one-off migration/seed scripts wired into `db:push`.

### Auth
Session-based (not JWT): `express-session` + `bcryptjs`, signed with `SESSION_SECRET`. The frontend's custom fetch (`lib/api-client-react/src/custom-fetch.ts`) sends `credentials: 'include'` so cookies flow through the Replit proxy. CORS is `origin: true, credentials: true` — both are required for session cookies to work.

### Single-business install

KoaPOS was built as a subscription SaaS with one `merchants` row per business,
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
  API and the Modules page, the KoaPOS partner-referral program (its API, page,
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
- **PC Builder removed** (POS › PC Builder, the Management › Calculators PC
  Builder settings, the product form's Compatibility tab that tagged PC parts,
  and the `/pc-builder-settings`, `/pc-saved-builds`, `/pc-compat-rules` APIs).
  Its tables `pc_builder_settings`, `pc_saved_builds` and `pc_compat_rules` are
  left in place, RETAINED, UNUSED. Old URLs redirect. Management › Parts
  Compatibility is a different feature and stays.
- **Domain and name.** The POS is named **KoaPOS** and lives at
  **pos.koastal.com.au** (`APP_BASE_URL` in `.replit`, `DEFAULT_PUBLIC_DOMAIN`
  in both `publicUrl.ts` files); the online shop is branded Koastal, not KoaPOS.
  History: it was KoaPOS at koapos.com.au, was renamed KK POS when it moved to
  pos.koastal.com.au, and its display name went back to KoaPOS afterwards. The
  domain stayed. koapos.com.au must stay attached to the deployment:
  stickers and service sheets printed with it are still being scanned.
  `middlewares/legacyDomainRedirect.ts` 301s its GET/HEAD requests to the same
  path on the new domain (`LEGACY_DOMAINS` overrides the list), pinned by
  `legacy-domain-redirect.test.ts` — though in production it only sees `/api`
  (see "Deployment"). Only the *display* name went back: the KK-era
  `kkpos`/`KKPOS` identifiers stay, because they name things that already exist
  — new backups are `.kkpos.enc` in `KKPOS/Backups` on Nextcloud (restore
  follows stored refs, not extensions), and the Print Bridge's `kkpos-print-bridge`
  name, `KKPOS` config folder and `KKPOS_BRIDGE_*` env vars (it still reads the
  older `KoaPOS` folder and `KOAPOS_BRIDGE_*` too). Likewise the older `koapos`
  identifiers are kept because renaming them would break existing data: the
  token-vault salt `koapos-vault-v1`, the HMAC fallback secrets, the analytics
  salt, the Google Wallet `koapos-loyalty` class id, browser `localStorage`
  keys, the old `.koapos.enc` backups and the `artifacts/koapos` package path.
- **Short public addresses.** The current forms carry no business segment, and
  the older ones still route (links and QR codes already handed out):
  - customer account `koastal.com.au/shop/c/<token>` — `customerPortalUrl`. The
    customer portal moved into the shop account (see "Customer portal → shop
    account"); its old `/c/<token>` and `/b/<user>/c/<token>` addresses on the
    POS domain (and any custom portal domain) are a redirect page
    (`koapos/src/pages/portal/index.tsx`) that forwards there;
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
  `storefront_api_keys`, `product_reviews`, `marketplace_connections`
  and `payment_method_surcharges` still hold data, so their
  Drizzle definitions stay (each marked RETAINED, UNUSED) — removing them would
  make `drizzle-kit push` offer to drop the rows. No code reads them.
- **Not blocked:** public customer-facing pages of the other accounts (portal)
  and their background schedulers still run, as they did before. Only signing
  in was closed off — and the repair booking form (`public-booking.ts`), which
  now takes bookings for this business only: a booking to another account
  wrote a customer and a job into data nobody here reads.

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

**One DYMO roll for every label: S0722520** (11352 Large Return Address,
25 × 54 mm; `LABEL_SIZE_ID` in `lib/sticker-config.tsx`). `labelSizeFor`
returns it for every label type inside `buildStickersHtml`, so sale tickets,
price tags, customer, repair, return, address and shelf labels all print on it
whatever size a saved template says; the templates page shows the size fixed
rather than offering others, and the product and repair-sticker previews use it.
The rest of `DYMO_SIZES` stays only so old saved templates resolve (S0722370 is
99010, 28 × 89 mm — it was listed as 36 × 89).

**Label pages are portrait, like the roll.** `buildLabelHtml` declares `@page`
at the roll's portrait size (25 × 54) and turns a landscape design −90° onto
it. A landscape `@page` (54 × 25) matched no paper the DYMO driver offers, so
Chrome fell back to the default paper with margins — the browser's date/title
header printed and one ticket ran over two labels. The page title is blank for
the same reason. A label with more lines than fit is shrunk as a whole by an
inline script (`.lbl-body`/`.lbl-fit`, zoom down to 55%) — lines never squash
into each other. The layouts print **real values only**: they used to fall back
to sample text ("Beverages", a repair password of "1234") whenever a field was
empty, and that printed on real labels. A line prints only when its value is non-empty (`has()`), so
no bare "#", "Due:" or "Tech:". On Templates › Labels the picked product
carries across label types, and a product/price-tag/shelf label with no product
is refused rather than printed blank.

**The preview IS the print.** `LabelPreview` renders `buildLabelHtml` itself
(screen mode: no page rotation, no `@page`) in a scaled iframe — the
hand-built preview it replaced had drifted from the print and filled every
empty field with sample text, so lines showed on screen that never printed.
Sample values live in one place, `SAMPLE_LABEL_FIELDS`, and only Templates ›
Labels uses them (`withSampleFields`): with no real record picked, the preview
and the **test** print both use them; a picked product is never mixed with
samples. QR codes and the barcode print only from real values. Repair stickers
take their data from one builder, `repairStickerFields` (New Service Job and the
Service Jobs reprint used to differ: no technician on reprints, device type
before description, today's date printed as "Due:"). "Due:" is the job's own
**due date**, `service_jobs.due_date` (YYYY-MM-DD, nullable;
`scripts/src/add-service-job-due-date.ts`; `cleanDueDate` in
`routes/service-jobs.ts` stores anything else as none). Set on New Service Job,
edited in place in the job dialog, shown as a sortable **Due** column on the
Services and Archive tabs — red once it has passed on an open job.
`label-print-complete.test.ts` asserts every line of every label type reaches
the printed HTML with all options on.

**Never print while a dialog is closing.** `window.print()` halts the page's
JavaScript, and a Radix dialog still closing then never lifts its page lock
(`pointer-events: none` on <body>, `data-scroll-locked`) — the PO ticket print
froze the whole page this way. Close the dialog first and print after it has
gone (~350 ms); `releasePageLockAfterPrint` (`lib/release-page-lock.ts`, called
by both iframe print paths) frees a stranded lock afterwards, and only when no
dialog is actually open.

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

### Promo cards (Inventory › Promotions)

`/inventory/promotions` (`pages/app/inventory-promotions.tsx`) prints shelf
promo cards from three templates — the merchant's own artwork with the sample
text painted out, in `koapos/src/assets/promo-template-*.png`:
`classic` (6×4 portrait; the original 1240×1748 design was stretched to
1240×1860 inside the white panel so it is exactly 4:6), `products` and
`computers` (square, printed on square stock chosen per device: 4/5/6/8 in).
`lib/promo-card.ts` is the one renderer for both the preview iframe and the
print, laid out in the artwork's own pixels and scaled to the paper; text boxes
carry `data-fit` and an inline script shrinks them to fit. Every image is
inlined as a data URL because the Print Bridge renders from a temp file with no
session. Each paper size is its own print job (`@page` is per document);
purpose `promotion`, routed to the document printer by default.

Name, price, photo and the QR (shop product page, `shopOrigin()/product/<id>`)
are read live; only the words are saved — `product_promotions` (`template`,
`copy` jsonb; `scripts/src/add-product-promotions-table.ts`), cleaned on read
and write by `lib/product-promo.ts`. Adding a product with no saved copy drafts
it (`POST /promotions/:id/generate`): Claude via `aiJson` when the merchant has
connected one and the AI switch is on, otherwise — or when the call fails — bullets/specs/sentences
from the product itself, never invented. The warranty and condition banner
always come from the product record, not the model. `suggestTemplate` picks
`computers` for anything that reads as a laptop/desktop/PC. The K coin's
"Earn 1% Kredit back" is baked into the artwork, so it is covered unless
loyalty is on, cashback, at exactly 1%. Pinned by `product-promo.test.ts` and
`promotions.test.ts`.

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
Tech App deep link while the job is open, the customer's shop account once it is
`completed` (falling back to the Tech App when there is no account link — a
sticker that opens nothing is worse than one that opens the staff view). Never
print `techAppJobUrl` directly. Whoever scans the sticker reaches the account
*link*, not the account — the link never signs anyone in (see "Sign-in by
link" below). `customerPortalUrl` in `lib/publicUrl.ts` builds the
account link for both the resolver and the status-change SMS (admin and Tech
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

**Archive** (Service Jobs › Archive tab) parks open jobs the customer
declined or that are long-term. It is a flag — `service_jobs.archived_at` +
`archive_reason` (`declined` / `long-term` / `other`, added by
`scripts/src/add-service-job-archive.ts`) — **not a status**, so the job keeps
"Awaiting Customer" or whatever it was and Restore puts it back unchanged.
`POST /service-jobs/archive {ids, archived, reason, note}` archives or restores
one or many, skips completed/cancelled jobs (those are Service History), and
logs each change in the job's notes. Archived jobs are left out of the Services
tab, the dashboard tiles/overdue banner/jobs panel, the wall dashboard
(`dashboard-app-public.ts`) and the Tech App work list (its QR deep link still
opens them). Completing or cancelling a job clears the flag wherever it
happens — admin status change, Tech App, and `linked-work.ts` when a linked sale
or invoice is paid. Rules in `lib/service-job-archive.ts`, pinned by
`service-job-archive.test.ts`.

**Custom notes** are preset texts set under Management › Invoices & Services ›
Services (`routes/service-settings.ts`, `GET/PUT /service-settings`). They
live in `service_settings.config.customNotes` — the table the old Service
Options page wrote, whose leftover section booleans a save merges over and
keeps. Each has a title and a text; in a job's Notes section each one is a button,
labelled with its title, that drops its text into
the note box rather than appending it outright: notes are append-only, and a
preset often needs a detail added first. Pinned by `service-settings.test.ts`.

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

### Koastal Kollective website (koastal.com.au)

The business's public website, merged in from its own Replit project
("Koastal Kollective") so that one deployment serves the website at
koastal.com.au, the shop under `/shop`, and the POS at pos.koastal.com.au.
`artifacts/website` (`@workspace/website`) is a static React + Vite site — no
API, no database. It was copied across unchanged (the built bundle was verified
token-for-token against the live one), so its own conventions hold:

- **One header for both apps.** `lib/site-nav` (`@workspace/site-nav`) holds
  the whole header — `SiteHeader`: logo, site search, phone, the shop's Sign
  in/Wishlist/Cart, and the menu (HOME … CONTACT, then SHOP in the light teal
  and MAIL-IN REPAIRS last) on its own row — and
  both the website's `Navbar` and the shop's `Layout` render it. SHOP's
  drop-down is the shop's category menu (all products and the category tree,
  flyouts to any depth), fetched from `/api/shop/categories`; on
  phones SHOP opens into the same list. Change the header there, never in one
  app. The shop passes its live session/cart/wishlist and `onShopNavigate`
  (client-side routing); the website reads `/api/shop/auth/me` and the shop's
  `kkshop_cart_v1` localStorage cart itself (same origin). Every fetch there
  goes through `getJson`, which tolerates no `fetch` at all — the pre-render
  runs in jsdom, and a bare `fetch` call there blanks every page. The package
  is source-only (no build), so each app's `index.css` has an `@source` line
  for Tailwind; both load Atkinson Hyperlegible, the header's typeface. Its
  `#section` links mean the website's current page; the shop passes
  `hashBase="/"`. HOME is the current app's home page (the shop passes
  `homeHref="/shop/"`); the logo is always the website's `/`. The website's
  dark-mode and accessibility toggles go in via `extras`, last on the row, and
  on phones the website keeps its own bottom bar. The menu wraps to a second
  row rather than overflow, which a wider face (Large Text, the dyslexia
  font) needs.
- **Accessibility menu** (both apps — it is part of the shared header,
  `lib/site-nav/src/accessibility.tsx`, plus an ACCESSIBILITY section in the
  phone menu): Large Text, High Contrast, Dyslexia-Friendly Font and Reduce
  Motion, each a `kk-*` class on `<html>` saved in localStorage
  (`kk-accessibility`, merged over defaults so older saves gain new keys).
  Website and shop share an origin, so one choice holds on both. Styles are
  `lib/site-nav/src/accessibility.css`, imported by each app's `index.css`
  (the website adds only its own dark-theme contrast palette). The dyslexia
  font is OpenDyslexic (`@fontsource/opendyslexic`, OFL-1.1), self-hosted and
  imported by each app's `main.tsx`, applied with `!important` because the
  shared header sets its typeface inline.
- **Link previews are Share.png.** `Share.png` at the root of the
  object-storage bucket is served publicly by `GET /api/share-image.png`
  (`routes/share-image.ts`, read per request, 1h cache — replace the file and
  previews follow; `SHARE_IMAGE_OBJECT` names another object). Every website
  page's og:image/twitter:image is that URL (`index.html`, `useSeo`'s default),
  and so is the shop's (`artifacts/shop/index.html`, between `<!--share-->`
  markers). The one exception is a shop product page: crawlers never run the
  SPA, so `server.mjs` rewrites that block for `/shop/product/:id`
  (`artifacts/koapos/share-meta.mjs`) to lead with the product's main photo
  and keep Share.png second. It looks the product up through the API —
  `API_INTERNAL_ORIGIN` (default `http://127.0.0.1:8080`), then the public
  domain — with a 1.5s timeout and a 5-minute cache, and falls back to the
  default block. Pinned by `share-meta.test.ts` (koapos).
- **Pre-rendered.** `postbuild` runs `scripts/prerender.mjs` (jsdom, ~275
  routes, about a minute) and then `write-redirects.mjs` (legacy `/koasoft/*`
  and `/kollective/*` stubs, from `scripts/redirects.mjs`). Each route is
  `dist/public/<route>/index.html`, which `server.mjs` serves per path. The
  prerender fails the build rather than ship an unrendered site.
  `scripts/generate-sitemap.mjs` (prebuild) finds routes in `src/App.tsx`.
- **Suburb pages are the hub towns within 20 km of the workshop** (33, in
  `src/data/suburbs.ts`; coordinates and the retired list in
  `src/data/service-area.json`). The other 208 suburbs were one template with
  the name swapped — doorway pages. A retired suburb inside 20 km 301s to its
  nearest hub, which names it under "Also covering"; one beyond 20 km 301s to
  its region page (`central-coast` / `lake-macquarie`), which lists it.
  `suburbPath()` resolves a retired name the same way, so no link hops a
  redirect. Unique copy per hub
  goes in `src/data/suburb-content.ts`; never fill it by copying one suburb's
  text into another. The full 20 km list (102) is `service-area-20km.csv`.
- **The server answers 404 and 301 for the website.** `server.mjs` serves the
  pre-rendered `/404` page with a 404 status for any path with no page (it
  used to send the homepage with a 200 — soft 404s), 301s the paths in the
  build's `redirects.json` (retired suburbs, KoaSOFT/Kollective), and 301s a
  trailing slash to the canonical path.
- **Built for `/`, never a sub-path**: pages name images as `/images/...`.
  It therefore has no Replit preview path; run it on its own port in dev
  (`PORT=5000 pnpm --filter @workspace/website run dev`).
- **IndexNow** (`submit-indexnow.mjs`) pings search engines only when
  `INDEXNOW_SUBMIT=1`, which only the deploy build sets (koapos
  `artifact.toml`) — a local `pnpm run build` stays silent. The key file in
  `public/` must stay served at `koastal.com.au/<key>.txt`.
- **Hostnames matter**: `DOMAIN_ENTRY_POINTS` in `src/App.tsx` sends
  koastalkollective.com.au to `/about`, and `server.mjs`'s `WEBSITE_DOMAINS`
  must list any such host or it gets the POS. koasoft.com.au and the two
  Toukley domains are forwarded at the registrar instead and never reach the
  deployment; their `DOMAIN_ENTRY_POINTS` entries are now unused. koastal.com.au
  is canonical; `www.` 301s to it.
- GA4 (`G-4TX95M36H4`, which replaced `G-639QEPSKTL`) is configured in
  `index.html` of both the website and the shop (`send_page_view: false`);
  each app sends page views itself on route change (website
  `src/lib/analytics.ts`, shop `src/lib/track.ts`). The POS has no analytics.
- **Site search** (header box, `lib/site-nav/src/site-search.ts`): the
  website's pages and the shop's products together. Pages come from
  `/search-index.json`, which `scripts/build-search-index.mjs` (postbuild, after
  the prerender) writes from the pre-rendered HTML of every sitemap route —
  header/nav/footer stripped, suburb pages indexed on title + description only
  so 240 copies of one template don't bury the real service page. It is fetched
  on first focus and searched in the browser; products come from
  `/api/shop/products?search=`. Either may be missing (dev servers) and the
  search shows what it has. Enter or "See all results" opens `/site-search`
  (noindex, out of the sitemap); `/search` is the separate private web search.
- Pop Culture and Gaming (`/gaming`, and its section on suburb pages) are
  written in the future tense on purpose (neither range has opened; the gaming
  page's structured data deliberately carries no `offers`). Koastal Kollective is the only brand name in copy — except the private web search at `/search`, which is named **Koastal Search** by the owner's choice.

### Koastal TV Streamer (koastal.com.au/tv/<name>)

Full-screen display pages for TVs and the Android TV app. Each is an HTML
file under `artifacts/website/tv/` with its own design — `tv/<name>.html` is
`/tv/<name>`, and folders nest (`tv/pizzashed/TV1.html` is `/tv/pizzashed/TV1`;
URLs are case-sensitive). Every other file under `tv/` (an `assets/` folder of
images, CSS, fonts) is published beside the pages, so pages link them
relatively. Never reuse the website's header, fonts, styles or React for them.
The `pizzashed` boards are 1920×1080 stages scaled to fit the screen: the
photos and brush strokes are one background image per board (the original
design with its text digitally removed), and every banner, name, price and
description is HTML text styled by the shared `assets/menu.css`.
Start from `tv/_template.html`, whose header comment holds the design rules;
files starting with `_` are never published. The website's postbuild step
`scripts/build-tv-pages.mjs` (`pnpm --filter @workspace/website run build-tv` on
its own) copies each to `dist/public/tv/<name>/index.html`, which `server.mjs`
already serves per path. It **fails the build** when a name isn't
letters, digits and hyphens, the `<title>` doesn't end with `Koastal TV Streamer`, there is no
meta description, or the page is noindex. It injects a canonical, the website's site icon
(`/images/favicon.png`) and a viewport meta if missing, and the screen lock: html/body pinned to the viewport and
never scrollable, full screen on the first key or click in a browser, and the
pointer hidden when idle. The pages have their own `sitemap-tv.xml` (in
robots.txt, submitted by IndexNow), not a place in `sitemap.xml`, because
prerender and the site search read that file and the prerender would
overwrite each page with the SPA. They are framed only by our own pages
(`frame-ancestors 'self'`), so the TV app must load the URL directly in its
WebView rather than inside an iframe on another site.

### Online shop (koastal.com.au/shop)

A second front end on the SAME database, so nothing is synced: products,
prices, stock, customers and their accounts are the POS's own rows. It is being
built in stages — 1: catalogue + accounts (done); 2: checkout (Stripe cards,
Afterpay/Zip), paid order → stock, POS sale, an Online › Orders entry and a
staff alert; 3: account area (orders, all purchases, invoices, repairs, quotes,
appointment booking); 4: click & collect, flat-rate and Australia Post shipping.

- **App**: `artifacts/shop` (`@workspace/shop`, React + Vite + Tailwind, wouter),
  its own package — it shares no UI code with the POS, only the API. It is
  served under **`/shop`** on koastal.com.au (`SITE_DOMAIN`), beneath the
  Koastal Kollective website, by `artifacts/koapos/server.mjs` — see
  "Deployment" for why that server exists. Replit routes `/shop` to the shop
  artifact (its `paths`), not to koapos, so the shop artifact's production
  service runs that same `server.mjs` on its own port — without one, every
  `/shop` request was a bare 500 from Replit's router. Its Vite base is `/shop/` for both build and dev, and
  does not come from `BASE_PATH`, which the workspace sets to `/` globally.
  The catalogue is `/products`. Anything that builds a path from
  `window.location` must use the router's path instead, or it carries the base
  twice. The shop briefly lived at shop.koastal.com.au; that domain was dropped
  before any customer signed up, so nothing redirects from it. Links in emails
  come from `shopOrigin()` (`lib/publicUrl.ts`). `/api` is the same on every domain, so
  the shop calls it same-origin; production CORS must list the site domain
  (`app.ts`), or every shop POST is refused.
- **Not launched yet.** `COMING_SOON` in `artifacts/shop/src/lib/launch.ts`
  covers the shop with `ComingSoon.tsx`; `curtainCovers` holds the rules.
  Open to everyone: sign-in, forgot, set-password, `/c/<token>` account links
  and **mail-in** (a service running now). Open to any signed-in customer:
  their account pages (`/account`, `/rewards`, `/wishlist`) — customers arrive
  signed in from repair texts and QR codes, and must not see the unlaunched
  catalogue. The whole shop is open only to a **preview** shopper: `GET
  /shop/auth/me` says `preview: true` when the signed-in shop account's email
  is `SOLE_MERCHANT_EMAIL` or an active staff member's, so staff preview by
  signing in with a shop account on their own email. Sign-up stays curtained,
  or anyone could walk past it. It is a curtain, not access control — the API
  is public. Set it to `false` and publish to launch.
- **API**: `routes/shop.ts`, public and scoped to `soleMerchantId()` — no request
  can name a merchant. A product is listed when `isActive` and `showOnline`
  (`products.show_online`, default "true", added by
  `scripts/src/add-product-show-online.ts` in the `db:push` chain). Only in/out
  of stock is exposed, never the count; a product whose product type doesn't
  track stock (services) is always available. A category can be hidden too
  (`categories.show_online`, `scripts/src/add-category-show-online.ts`), which
  hides its subcategories and every product in them, including ones added
  later. `shopVisible` in `lib/shop-visibility.ts` is the one rule, used by the
  shop and by the Online Store screens' counts, so the two cannot disagree.
  **Hide out-of-stock items** (Management › Online Store, `shop_settings`,
  `scripts/src/add-shop-settings-table.ts`) narrows *listings* only —
  catalogue, search, category counts, related, "Just purchased" — through
  `shopListable`; product pages, cart, checkout and wishlist keep using
  `shopVisible`, so a link a shopper already has still opens, marked out of
  stock. In stock follows the shop's badge: untracked types and products count.
  Categories nest to any depth, so choosing one lists every category below it.
  A category's image (`categories.image_url`, set in Products › Categories,
  `scripts/src/add-category-image-url.ts`) is shown on the shop's category
  tiles and catalogue heading.
- **Product page**: Description / Specifications / Reviews tabs and a Related
  products carousel (same category, then brand, then sibling categories).
  Specifications are `products.technical_specs` ("Label: value" lines become
  table rows) plus `weight_kg` and `length_cm`/`width_cm`/`height_cm` — numbers
  in kg/cm, not text, because shipping quotes will need them — and the
  warranty. The POS product form had Weight and L/W/H inputs that never saved;
  they now do (weight converted to kg). Added by `scripts/src/add-product-specs.ts`.
- **Shop media is served by the shop, not storage.** Uploads live at
  `/api/storage/objects/…`, which needs a POS staff session, so until this was
  fixed every uploaded product photo was a 401 to shoppers and the shop showed
  its placeholder. The shop API rewrites those links to `/api/shop/media/…`
  (`shopMediaUrl`), which serves a file only while a listed product (image,
  gallery, variant) or a shown category uses it — nothing else in storage is
  exposed — and honours `Range`, without which iOS Safari won't play video.
  Any new shop response carrying an image URL must pass it through
  `shopMediaUrl`. Pinned by `shop-media.test.ts`.
- **Gallery**: `products.media` (jsonb, `scripts/src/add-product-media.ts`) holds
  images and videos after the primary `imageUrl`, in order — set in the POS
  product form's Media tab. Photos are one list (`ProductPhotosEditor`,
  multi-file upload): the first is `imageUrl`, the default, and the rest are
  `media`'s image items; videos are `ProductMediaEditor videosOnly`. Editing
  the photos rewrites `media` as images then videos. **Clone** (product detail
  panel) opens New Product pre-filled from a product — new SKU, blank barcode,
  stock 0; serials, digital codes and variants are not copied. A video is an upload
  (MP4/WebM/MOV, capped at 200 MB in the POS since it is hashed in memory) or a
  YouTube/Vimeo link, embedded via `describeVideo`. Only uploads and https links
  are stored (`cleanMedia`). The Media tab's old four image slots and video URL
  box were never saved; they are replaced by this.
- **Reviews** reuse `product_reviews` with a new `customer_id`. Only a signed-in
  shopper who has bought the product may write one: a completed/refunded sale
  or paid invoice line naming it, across every POS customer sharing their email
  (`lib/shop-reviews.ts`). One per customer per product; posting again edits it
  and keeps its status. Shown as first name + last initial. There is no staff
  moderation screen yet — set `status = 'hidden'` to take one down. Pinned by
  `shop-reviews.test.ts`.
- **Wishlist**: `customer_wishlist_items` (`scripts/src/add-customer-wishlist-table.ts`),
  the heart on product images, rendered only for a signed-in shopper. Pinned by
  `shop-wishlist.test.ts`.
- **Loyalty on the shop.** What a sale earns is `loyaltyEarnedFor` in
  `lib/loyalty.ts`, used by the till's `POST /transactions` *and* the shop's
  `POST /shop/loyalty/estimate`, so the cart's "You've earned…" is the figure
  the sale will credit (the rule used to live inline in `transactions.ts`).
  The rewards section's name, unit and "X for every $Y spent" wording are
  generated from the POS loyalty settings by `loyaltyProgramInfo` — set the
  program name there (e.g. Koastal Koins); nothing on the site hardcodes it.
  Pinned by `loyalty-rules.test.ts`.
- **Account area** (`GET /shop/account/overview`): loyalty balance, current and
  previous repairs, and live product/repair warranties (`lib/warranty.ts`,
  shared with the staff Warranty page). A shopper may add their birthday once
  but not change it online — it triggers the birthday promotion, and moving it
  to today would pay the bonus on demand. Staff correct it in the POS. Pinned
  by `shop-account.test.ts`.
- **Accounts.** One password (`customers.portal_password_hash`) and one
  signed-in marker (`req.session.portalCustomerId`). Login is email +
  password, trying each POS customer with that email (the POS has
  duplicates). **Signing up never sets a password or signs anyone in** — for
  a new email or one the POS already knows, it emails a set-up link to that
  address (`lib/customerPasswordLinks.ts`; every link lands on the shop's
  `/account/set-password`), because knowing an email must not be enough to
  claim an account, and an account gathers every record sharing its email.
  Signing in (password or set-up link) regenerates the session id. Pinned by
  `shop-accounts.test.ts`.

- **POS side.** Management › Online Store holds the shop's settings: Overview,
  Products (`show_online` per product, `routes/online-store.ts`) and Customer
  Accounts (the invites below). Online › Orders (`pages/app/online-orders.tsx`)
  lists the store's orders — the `delivery_orders` rows, whose table and
  `/delivery-orders` API keep their old name. It replaced the Deliveries page.
  Tracking is `tracking_carrier` + `tracking_number` (carrier ids and tracking
  links in `lib/order-tracking.ts`); `shipped_at` / `delivered_at` are stamped
  by the server the first time the status reaches them. The dashboard's
  Online Orders tile counts `OPEN_ORDER_STATUSES` (the page's Open tab; there
  is no "completed" status, delivered/cancelled are the finished ones), with
  the `new` count in its corner. Marking an order paid
  books it as a sale (`services/deliveryOrderSale.ts`). Pinned by
  `online-orders.test.ts`.
- **Invites** (`routes/shop-invites.ts`, Management › Online Store › Customer
  Accounts): emails a 14-day set-password link to customers with an
  email and no password, once per address, skipping anyone invited in the last
  14 days; email only, never SMS. It needs the exact count typed back and sends
  in the background, paced for the email provider. Pinned by `shop-invites.test.ts`.

### Shopping channels (product feed)

Management › Online Store › Shopping Channels publishes one product feed at
`koastal.com.au/api/shop/feed/<token>.xml` (`routes/shop-feed.ts`) in Google
Merchant Center's RSS format — the one format Google Shopping, Meta (Facebook
& Instagram), Pinterest, TikTok and Microsoft Merchant Center all accept, so a
new channel is a row in the page's `CHANNELS`, not server code. The token is
`shop_settings.feed_token` (null = off; "Replace link" mints a new one and kills
the old; `scripts/src/add-shop-product-feed.ts`). The rules are in
`lib/product-feed.ts`, away from `db`, pinned by `product-feed.test.ts`: the
feed is `shopVisible` (out-of-stock items stay in, marked out_of_stock);
services, ePay, $0 and photo-less products are left out and counted by reason;
images go through `shopMediaUrl` made absolute; a barcode is a GTIN only with a
valid check digit; variants are items sharing `item_group_id`. Channels reject
products whose link lands on the shop's coming-soon curtain, so submit after
launch.

### Shop statistics

Management › Online Store › Statistics (`routes/shop-stats.ts`, rules in
`lib/shop-stats.ts`, pinned by `shop-stats.test.ts`). The shop reports page
views, product views, link clicks (every `<a>`), catalogue searches and
add-to-carts from `artifacts/shop/src/lib/track.ts` to the public
`POST /shop/track` (batched, `keepalive`, always 204) into `shop_events`
(`scripts/src/add-shop-events-table.ts`). **No IP address is stored**: `ip_hash`
is an HMAC under `SESSION_SECRET`, enough to count unique IPs. "Visitors" are
browsers (`kk-visitor` in localStorage); crawlers and preview bots are dropped
by user agent; referrers keep only another site's host. Live counters
(`/online-store/stats/live`, polled every 15s) are all-time, today and "on the
shop now" (last 5 minutes); the period report adds the chart, most viewed,
most clicked, searches, referrers, devices, best sellers online (shop orders)
and in store (till sales of listed products, excluding sales booked from
online orders), most wishlisted and reviews. Days are Sydney days. There is no
pruning yet — the table grows by one row per event.

### Australia-only shipping

The online store delivers within Australia only — `lib/shipping-region.ts`
(`checkDeliveryAddress`), pinned by `shipping-region.test.ts`. Applied to the
shop account's delivery address (country fixed to Australia, state normalised
to its code; an overseas *home* address is still allowed, and "same as my
address" then saves no delivery address) and to online orders
(`/delivery-orders` POST, and PATCH when the address changes — older orders are
left alone until edited). An order with no address (click & collect) passes.
Mail-in return addresses already took only AU states and 4-digit postcodes.

### Shop dark mode

The shop follows the website's theme: `kk-theme` in localStorage (light / dark /
system), the `ThemeToggle` in `lib/site-nav/src/theme.tsx` shared by both
headers, and a pre-paint script in `artifacts/shop/index.html`. The shop's
`dark:` variant is the `.dark` class (`@custom-variant` in its `index.css`),
never `prefers-color-scheme` — that mismatch once made the shared menu white on
white. Its dark palette inverts the `--color-stone-*`/`--color-gray-*` scales and
overrides white *surfaces* only (`--color-white` stays white for text on teal
buttons); product photos keep a white ground via `.kk-photo`.

### Customer files in the shop account

`customer_files.visible_to_customer` (`scripts/src/add-customer-file-visibility.ts`,
default `'false'`, so every file uploaded before the option stays staff only).
POS › Customers › Files asks "Staff only / Customer can see" on upload, and
each file toggles with `PATCH /customers/:id/files/:fileId`. The shop account's
"Your files" (`GET /shop/account/files`, `routes/shop-account.ts`) lists only
visible files on the shopper's own records (`buyerCustomerIds`) and serves them
itself — uploads otherwise need a staff session — at `/shop/account/files/:id`,
never exposing the storage key. Only images, PDF and plain text open in the
browser (`lib/customer-files-shop.ts`); everything else, HTML and SVG included,
is always a download, so an uploaded page can't run as koastal.com.au. Pinned
by `shop-files.test.ts` and `shop-portal.test.ts`.

### Shop account Orders

`GET /shop/account/orders` (`lib/shop-orders.ts`, `shop-orders.test.ts`): an
In-Store tab (completed/refunded till sales across `buyerCustomerIds`) and an
Online tab (shop orders by email, with status and carrier tracking link). A
paid online order is also a till transaction (`delivery-order:<id>` key), so
it is shown under Online only. Lines carry name, quantity and total — never
cost price.

### Customer portal → shop account

The customer portal (a POS-domain page at `/c/<token>`) was merged into the
shop account; nothing of it is left in the POS but a redirect. What moved:

- **Sign-in by link.** The token says whose account it is and **never signs
  anyone in** — the same link is on a sticker that stays on the device.
  `POST /shop/auth/token` (`routes/shop-account.ts`) answers 401
  `password_required` (customer has a password: sign in with it) or
  `setup_required` (none yet: `POST /shop/auth/token/setup` sends a set-up link
  to the contact on file, email else SMS — never to an address the request
  names). Only a shopper already signed in as that customer goes through.
  Never another business's customer. This was the POS's "Password protection"
  option until it became the only behaviour; `merchants.require_portal_password`
  is left in the table, unread. The shop's `/c/:token` page shows the sign-in
  or set-up card; `/c/:token/set-password` forwards to `/account/set-password`.
  Staff wallet-pass downloads by token (`routes/portal.ts`) still admit a
  customer with no password (`resolvePortalAccess`).
- **Quotes** (sent/accepted/declined; a sent one past expiry shows expired):
  approve/decline while sent and unexpired; accepting calls
  `applyEstimateApprovalToJob(…, "portal")`, as the portal did.
- **Appointments**: list, and a request form (future, ≤12 months, 30 min,
  status `scheduled`) — a request, not a checked slot, as before.
- **Your card**: a QR of the account link, copy/save, and Apple/Google Wallet
  passes (`lib/wallet-pass.ts`, shared with the staff copy in `routes/portal.ts`,
  which is all that file still holds).
- **Repairs** now carry the work description and estimate. The portal also
  showed the job's `notes` as "Notes from the workshop" — that is the staff's
  internal log (calls, remarks), so it is deliberately **not** carried over.
- **Profile = the POS record.** The customer edits everything the POS asks a
  customer for — names, email, mobile (+ WhatsApp flag), birthday, company,
  ABN, address, postal/delivery address (the shipping columns; "same as my
  address" stores a copy), marketing consent and "how did you hear about us"
  (by name, from `customer_settings.heard_from_sources`). Staff-only fields
  (notes, warning, group, loyalty) are not exposed. The POS's **required
  fields** setting applies here too (`lib/customer-profile-rules.ts`, served to
  the form by `GET /shop/account/fields` and re-checked on save); a field the
  request omits is judged by what is stored, and omitted fields are left alone.
- **Customer group** shows on the account (read-only; staff set it).
- **Referrals** — see "Referral programme" below. The account shows the
  customer's link (`/shop/r/<code>`), everyone they referred with progress,
  and rewards paid. "Heard from: Friend" on the profile takes the friend's
  name and an optional code, linked once and never to the customer themself.
- **Email** can be changed on the profile (the portal allowed it), but never to
  an address another customer record holds: the account gathers records from
  every record sharing its email (`buyerCustomerIds`), so that would hand over
  someone else's history. Nor until the new address is proved: saving mails a
  signed 24-hour link to it (`lib/shop-email-change.ts`, nothing stored) and
  `GET /shop/auth/confirm-email` applies the change, re-checking it is still
  free and that the record hasn't been saved since the link was sent (so
  asking for a second address voids the first link), then redirects to `/account?email=changed|taken|link-expired`. The birthday keeps the shop's set-once rule.
- Everything is gathered across same-email records (`buyerCustomerIds`), like
  the rest of the account.
- The service job dialog's **Portal** button (email/SMS the link) called a
  route that never existed; it is `POST /service-jobs/:id/portal-link` now,
  sending only to the contact on file.
- Management › Customers › Portal describes the account link; the custom
  portal domain no longer builds links (old links on it still forward, while
  the domain stays pointed at the deployment).

Pinned by `shop-portal.test.ts`, `service-job-portal-link.test.ts`,
`portal-url.test.ts` and `service-job-qr.test.ts`.

### Client IPs, trusted sign-in IPs, Dashboard screen approval

- **`trust proxy` is 2, not 1.** Replit forwards `X-Forwarded-For` as
  `<client>, <replit proxy>` with the socket on loopback; with one hop trusted
  `req.ip` was the proxy (a Google Cloud `34.x`/`35.x` address that changes per
  request), so every owner login was flagged "new location", distinct-IP
  account holds could trip on one person's typos, and rate limits were shared
  per proxy. The edge replaces a client-sent XFF, so hop 2 isn't spoofable.
  `TRUST_PROXY_HOPS` overrides. Sign-ins recorded before the fix carry proxy IPs.
- **Trusted IPs** (`trusted_ips`, `/auth/trusted-ips`, owner only): a trusted IP
  is never flagged `new_ip`; trusting one acknowledges its existing flags. The
  flagged-count banner counts the same 7 days Recent Sign-ins shows.
- **Dashboard screen approval** (`dashboard_app_settings.require_approval`,
  default on; `dashboard_app_devices`; `lib/dashboard-devices.ts`): the access
  code says which dashboard, the approval says which screen. A browser sends a
  localStorage secret in `X-Dashboard-Device` (only its SHA-256 is stored); an
  unknown one gets **202** + a 4-digit pairing code — 202 so its polling isn't
  counted by the wrong-code limiter — and appears in `DashboardAccessBanner`
  (every POS page, owner/manager) until approved or denied. Approval lasts until
  revoked. Pinned by `dashboard-screen-approval.test.ts`.

### Shop "Just purchased" pop-up

`GET /shop/recent-purchases` lists shop-visible, non-service products sold in
the last 24h (completed transactions, so till sales and paid online orders),
newest first. It names the product and time only — never the buyer, price or
quantity (`shop-recent-purchases.test.ts`). `JustPurchased.tsx` shows one at a
time bottom-left, not on cart/checkout/account, closable for the visit.

### Mail-in repairs

Open to everyone, signed in or not and while the shop is curtained — it is a
service running now. Every suburb, region and repair/promotional page on the
website carries `components/MailInRepairs.tsx` linking to it (not the media
pages or Funeral Slideshows, where it doesn't fit).

Shop `/mail-in` (packing guide, address + hours from Business Details, form,
four required terms) → `mail_in_requests` (`scripts/src/add-mail-in-tables.ts`).
Status `awaiting_postage → in_transit → received | cancelled`. The customer adds
tracking at `/mail-in/track/<token>` (emailed; only the token's SHA-256 is
stored). **A request is not a service job until the parcel arrives**: POS
Online › Mail-In "Parcel received" (`POST /mail-in/:id/receive`) claims the row
first (so a double click can't make two jobs), matches the customer (the
submitting shopper → newest POS customer with that email → a new one) and
creates a `KS####` job with `isMailIn`, inbound tracking and return address.
`received` is reachable no other way (`canStaffSetStatus`). Rules in
`lib/mail-in.ts`, pinned by `mail-in.test.ts`.

### Customer group pricing

A product's per-group prices are `products.group_prices` (jsonb, group id →
price); the rules (Customers › Discounts & Pricing) are
`customer_settings.group_pricing`. The formula lives in
**`lib/group-pricing`** (`@workspace/group-pricing`), shared by the POS (its
`lib/group-pricing.ts` re-exports it) and the API, so the till and the server
agree on a group price to the cent:

- **What a group pays**: `groupPriceFor` — the stored group price, else the
  group's rule, else the sell price. The till's `unitPriceFor` uses it, and so
  does `finalizeSale`, which accepts **exactly** that price for the sale's own
  customer (`resolveCustomerGroupId`, group by id or name). Before this every
  group-priced sale was repriced to the sell price and refused with a 409.
- **Group prices follow the sell price** at the same share (`followPrice`:
  Trade $65 on $130 → $70 on $140). `PATCH /products/:id` applies it whenever
  the price changes (`reconcileGroupPrices`: a group re-sent unchanged follows,
  a group edited in the same save keeps the edit), which covers the product
  form, CSV import and any other caller; the bulk % / flat price changes apply
  it per product. The product form shows it live (`followGroupsRef`) until a
  group's price is typed over. A product whose old price was $0 has nothing to
  scale from and keeps its group prices.
- Cost changes (PO receiving) don't move group prices — only a cost-based
  *rule* would, and rules are worked out live at the till anyway.

Pinned by `group-prices-follow.test.ts` and `transactions-group-price.test.ts`.

### Referral programme

One programme, counted the same way in the POS, the shop and on documents.
`lib/referrals.ts` holds the rules; settings are Management › Referrals
(`customer_settings.referral_settings`, defaults 50 spend / 2 visits / 90
days, rewards 200 friend / 500 referrer in the loyalty unit).

- **Codes.** Every customer has a `referral_code` (format `SL-AB12`, unique
  per business): minted on create in the POS, CSV import, shop sign-up, public
  booking and mail-in (`ensureReferralCode`), and backfilled by
  `scripts/src/add-referral-rewards.ts`. The shareable link is
  `koastal.com.au/shop/r/<code>` — the shop account shows it, and invoice and
  quote PDFs print it in their referral footer (`referralFieldsFor`).
- **Who referred whom.** A referred customer carries the referrer's **code** in
  `referred_by` (what the POS has always matched on) and, when known, their id
  in `referred_by_customer_id`. The shop sets both (sign-up from a `/r/` link,
  remembered in localStorage `kk-referral` for 90 days; or "Heard from:
  Friend" + code on the profile).
- **Qualifying.** The referred customer spends `minSpend` over `minVisits`
  visits within `qualifyDays` of joining (`refereeProgress`).
- **Automatic rewards** (`services/referralRewards.ts`). On qualifying, the
  referrer and the friend are both credited onto their loyalty balances — at
  qualification, not at sign-up, so a fake account earns nothing. A
  `referral_rewards` row per referred customer (unique) is inserted in the same
  DB transaction as the credits, so nothing is paid twice. Checked right after
  every sale for its customer (`finalizeSale` → `checkReferralAfterSale`) and
  by a daily sweep (spend from invoices, laybys). Paid only while both the
  referral and the loyalty programme are on. Referrals that had already
  qualified when automation began were recorded `pre_automation` by the
  script and are never paid (staff may have rewarded them by hand).
- **Reports.** POS › Marketing › Referrals reads the saved settings and the
  recorded rewards from `GET /referrals/summary`; the shop account shows paid
  rewards from the same table. The referrer sees a friend's first name + last
  initial and whether the spend was reached, never the amount.

Pinned by `shop-referrals.test.ts` and `referral-rewards.test.ts`.

### Marketing › Google (Search Console, Analytics, Business Profile)

`/marketing/google` (`pages/app/marketing-google.tsx`) shows Search Console,
GA4 and Business Profile (Maps) figures and Google reviews, with replies.
One Google sign-in covers all three: the `google_insights` integration
(scopes in `GOOGLE_INSIGHTS_SCOPES`, `lib/google-insights.ts`), which replaced
a `google_business` entry that connected but never read anything. It needs
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`; the redirect URI is
`https://<host>/api/integrations/oauth/google_insights/callback`, and the
callback lands on `/marketing/google`. Tokens live in the vault;
`services/googleApi.ts` refreshes the hourly access token (one refresh per
merchant at a time) and marks the row `google_revoked` when Google refuses
(revoked, or a "Testing" OAuth app's 7-day refresh token expiring — keep the
consent screen In production). The only thing stored is the choice of site,
property and listing, as JSON in the integration row's `credentials`
(cleared on disconnect). Figures are fetched on demand and cached 10 minutes.
Every failure carries a `code` (`classifyGoogleError`) that the page turns
into one action: enable the API, reconnect with every box ticked, or wait for
Google to approve Business Profile API access (quota 0 until then). Replies
post publicly on Google. Pinned by `google-insights.test.ts`.

### Importing a supplier invoice (Purchase Orders › Create via Import)

The supplier's PDF tax invoice is read **in the browser** with pdf.js
(`koapos/src/lib/supplier-invoice-parse.ts`, pure, pinned against the text of
a real Leader invoice in `supplier-invoice-parse.test.ts`). It reads by column
heading (Stock Code / Manuf Code / Description / Qty / Unit Price Excl. /
Gross / GST / Total), not fixed positions: rows without numbers continue the
line above (Leader wraps descriptions and stock codes), `SN:` rows are that
line's serials, and the footer totals are checked against the lines. Header
fields: the invoice number ("Our Ref", under the barcode) becomes the **PO
number**, "Customer Code" is our account with the supplier. A scanned PDF has
no text and is refused with that reason.

Matching is the server's (`lib/supplier-invoice.ts`, `supplier-invoice.test.ts`):
supplier by account code (`suppliers.account_number`), then by name with
company suffixes stripped; product by stock code = SKU, then = supplier code,
then manufacturer code = SKU. An ambiguous match matches nothing.
`POST /purchase-orders/import/match` is read-only; `POST /purchase-orders/import`
creates the supplier (if new), basic products for unmatched lines (name, SKU =
stock code, supplier code, cost, "Manufacturer code:" spec line; **no sell price
→ created inactive**, so nothing sells at $0) and the PO as Ordered, in one
transaction; the invoice number already in use is a 409. Picking an existing
supplier saves the invoice's account code onto it when its account number is
empty, so the next invoice matches by it. Serials go on each PO line's notes.
Receiving is then the ordinary `/:id/receive` call (stock, serials for
serial-tracked products, pre-orders, sale-ticket prompt). The PDF is attached
to the PO.

**Leader's datafeed fills in new products.** `LEADER_DATAFEED_URL` (a secret;
per-dealer link from the Leader portal, Resources › Datafeed, stock CSV with
headings and long description) is downloaded by `services/leaderFeed.ts` —
Leader builds it on request and takes ~35s, so it is fetched at boot and every
6 hours and a stale copy is served while a fresh one downloads. Rows are mapped
by `lib/leader-feed.ts` (`leader-feed.test.ts`, fixture of real rows): name cut
from the short description, long description as plain text, barcode, brand,
manufacturer code, image, weight (kg), dimensions (mm → cm), warranty (months →
years when whole), RRP, category. It is consulted **only for a Leader
invoice** (`isLeaderSupplier`), since another supplier's stock code could
collide. In the review the sell price starts at the RRP; the feed's category is
matched to an existing one by name in the browser (subcategory, then category);
the brand is matched or created. Every new product has a category picker
(`TreeCategorySelect`, which can create one), and a new product the feed files
under a category you don't have offers **Create "<subcategory>"** — nested
under the feed's category when you have it, else creating category › subcategory
— applied to every new line waiting on the same one. Nothing is created
without that click. Photos are copied into our own storage: the browser
fetches `GET /purchase-orders/import/feed-image/:stockCode` (the server fetches
only the URL the feed names, only on leadersystems.com.au — Leader sends no
CORS) and uploads it through `uploadFile`; the import refuses an `imageUrl`
outside the business's own storage.

**Paid / unpaid and History.** The PO list has a Payment column (Paid /
Part paid / Unpaid). An unpaid row has a **Mark Paid** button (also in the
detail dialog) that asks how (Card, Direct Deposit — stored as
`bank_transfer` — or Cash) and the date paid; clicking a Paid badge asks to
confirm Mark Unpaid. Both call `POST /purchase-orders/:id/payment {paid,
paymentMethod, paidDate}` — paid settles `amount_paid` at the stored
`total_cost` and stores `paid_at` as that day (midday UTC, so it reads as the
same day in Australia; no future dates), unpaid clears all four payment
columns.
**Payment receipts** (proof the supplier was paid) are
`purchase_orders.receipt_urls`, a JSON array of storage URLs kept apart from
the supplier's `invoice_urls` (`scripts/src/add-po-receipt-urls.ts`, in the
`db:push` chain). Added from the list's Receipt column, the Mark Paid form or
the detail dialog (which can remove them) via `PUT
/purchase-orders/:id/receipt-files {receiptUrls}`, which accepts only this
business's own uploads (`/api/storage/objects/merchants/<id>/…`), up to 10. An order moves to the **History** tab only when it is
fully received **and** paid (`isClosed` in `products-purchase-orders.tsx`), so
a received order still owing the supplier stays on the working list. Pinned by
`purchase-orders-mark-paid.test.ts`.

### Import Details (product form)

The product form's **Import Details** button (`ImportProductDetailsDialog`)
reads a product page link into the form. `POST /products/import-from-url`
(`routes/product-url-import.ts`) fetches it through `lib/safe-fetch.ts` —
public addresses only, every redirect hop re-checked with the Nextcloud SSRF
guard's `isBlockedAddress`, size-capped — and `lib/product-page-import.ts`
reads schema.org Product JSON-LD, then product meta tags, then two-column spec
tables / `<dl>`s; a barcode is kept only with a valid GTIN check digit. When
the AI switch is on and Claude is connected, Claude fills **only fields the
page left empty** (`aiFilled`, marked ✨ in the dialog). Nothing is saved: each
field is shown ticked, editable, or "Not on page" for staff to type in; a field
the form already holds starts unticked. Brand matches an existing one by name
or is created on apply. Category is picked in the dialog from the category
tree (`TreeCategorySelect`, with its New button), preselected when the page's
category name matches one. **The site is the supplier**: the response's
`site.supplier` is the supplier whose saved `website` is the page's host
(`matchSupplierBySite` — same host or subdomain, `www.` ignored, two matches
= none); with no match the dialog offers a new supplier named from
`og:site_name`, created with the site as its website so the next import
matches. The page's SKU is the supplier's own code, so it fills Supplier code
and the SKU row starts unticked.
**Tags**: once the page is read, and again whenever the dialog's category
changes, `POST /products/import-from-url/tags` asks Claude for exactly 5 tags,
given the tags the chosen category and its subcategories already use (with
counts, recursive CTE) and the shop's most-used others, told to reuse those
spellings and invent only when nothing fits. `cleanSuggestedTags` caps at 5,
dedupes, and snaps a case/space variant onto the existing spelling, so the
catalogue doesn't grow "laptop" beside "Laptop". Without Claude it offers only
the category's tags whose words appear in the product (`fallbackTags`) —
never invented. Chips start on (off if the product already has it), staff may
add their own, and applying **adds** to the product's tags, never replaces. Photos are copied into our own storage through
`GET /products/import-from-url/image` (images only, 15 MB) and appended after
existing photos. Pages built in the browser (JB Hi-Fi) carry no product data
in their HTML — the maker's own page usually does. Pinned by
`product-page-import.test.ts` and koapos `product-url-import.test.ts`.

### Merging brands and suppliers

`POST /brands/merge` and `/suppliers/merge` (`{targetId, sourceIds, dryRun}`)
move everything to the kept record in one transaction and delete the rest; the
UI always shows the `dryRun` counts first. **Products name their supplier as
text** (`products.supplier`), not by id, so a supplier merge renames that text
(matched case/space-insensitively) as well as repointing
`purchase_orders.supplier_id` and `product_return_auths.supplier_id`. A return
keeps the supplier name printed on it; price history's `supplier_name` is left
as history.

**Don't count a capped list.** Inventory › Overview once counted the first 500
products from `useListProducts({ limit: 500 })`; its figures now come from
`GET /inventory/overview`. Pickers that must see every product load the full
list, as Purchase Orders does.

### Campaign audiences

Who an email/SMS campaign reaches is `audienceWhere` in
`api-server/src/lib/campaign-audience.ts` — used by both `/…-campaigns/:id/send`
and `/…-campaigns/audience-count` (what the page shows), so the count is what
is sent. Every audience requires `agreedToMarketing` and the channel's contact.
The send routes used to know only "all"/"single" while the pages save
"specific", "loyalty", "new", "inactive", "layby", "high_value": a campaign to
one customer, or to any segment, went to **every** opted-in customer. An
unknown audience is now refused (400), never widened; "specific" with no
customer reaches no one. Pinned by `campaign-audience.test.ts`.

### Pre-orders

A product with `pre_order` on is a pre-order product until its
`pre_order_release_date` (merchant-local YYYY-MM-DD) — then it sells normally
with nobody switching it off (`isPreOrderActive`, `lib/pre-orders.ts`, mirrored
in koapos `lib/pre-order.ts`). `pre_order_eta_date` is shown at the till and on
the shop. Columns and the sale links on `product_pre_orders` come from
`scripts/src/add-pre-order-sales.ts`.

- **Till.** A pre-order line is sold either at full price (an ordinary product
  line; stock goes below zero like any oversell) or as a deposit ("Take
  deposit" swaps the line for a one-off line carrying `preOrderDeposit
  {productId, quantity}`, which moves no stock). `finalizeSale` plans the
  pre-orders before its DB transaction and records them inside it
  (`lib/pre-order-sales.ts`), so a sale and its pre-orders commit together;
  a sale with pre-orders and no customer is refused — the POS checks this
  before the payment screen opens, so no card is charged for it. Numbers are
  `PRE-<id>` (from the row's own id, not max+1).
- **Collection.** Pre-Orders › "Collect at till" opens
  `/pos/sell?collectPreOrder=<id>`: the product at full price less what was
  paid, for its customer. The sale carries `preOrderId`; the server marks the
  pre-order Collected in the same transaction and does not open a new one for
  that product. A collecting sale can't be parked (the link wouldn't survive).
- **Receiving.** `POST /purchase-orders/:id/receive` allocates received units
  to waiting pre-orders oldest first, inside the receive's transaction with the
  rows locked (`allocateArrivals`); a fully covered one becomes Arrived. The
  response's `preOrderArrivals` drives the pop-up (customer + PRE number) before
  the print choice; customers are SMS'd/emailed only after commit
  (`notifyArrivals`, which stamps `notified_at`).
- **Refund/void** cancels the sale's still-open pre-orders.
- **Shop.** Products carry `preOrder {releaseDate, etaDate}`; pre-order products
  count as in stock for listings and the in-stock filter. They can't be added to
  the cart yet — online pre-purchase waits for checkout (stage 2).
- **Known gap:** units allocated to a *deposit* pre-order are back in
  `stock_quantity` until collection, so the till could sell them to someone
  else; staff set them aside physically from the pop-up.

Pinned by `pre-orders.test.ts`.

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
  shop's profile update — know their merchant another
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

**Desktop browsers never follow a `tel:`/`sms:` link.** Chrome on Windows hands
it to the OS (Phone Link, Teams, the "pick an app" prompt) and can hang or crash
doing it — opening it in place rather than a new tab was not enough. A single
capture-phase listener, `installPhoneLinkGuard` (`lib/phone-link-guard.ts`,
installed in `main.tsx`), copies the number and shows a toast instead, on every
page. Android, iPhone and iPad dial normally. Keep building links with
`telHref`; the guard is what makes them safe on a desktop.

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
deliberately does *not* read `merchants.country`: KoaPOS sells to Australian
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

**Weekly budget comes from the KPIs.** End of Week doesn't keep its own
budget: it reads the business's **Net Profit** KPI (Staff & Operations ›
KPIs & Targets) — active, no staff assigned, preferring one named "Budget";
among several, the one whose dated window covers the week, then an undated
one, then the latest window that started before the week (flagged on the page
as outside its window). The target is spread by the KPI's own period (monthly
× 12 ÷ 52, quarterly × 4 ÷ 52, annual ÷ 52, weekly as is), pro rata per day for
a custom range, and the week is measured on **profit after staff**
(`weekBudget`/`pickBudgetKpi` in `lib/end-of-week.ts`, pinned in
`end-of-week.test.ts`). `budget` is part of the assembled report, so a
finalised week's snapshot keeps the budget it was judged against.
`sales_settings.eow_monthly_budgets` held a short-lived separate budget and is
RETAINED, UNUSED.

**The default week is the shop's own date.** `defaultWeekRange` takes a date;
the route now gives it `localDate(merchant.timezone)`, not `new Date()` — on a
Friday morning in Sydney the UTC date is still Thursday, which opened the page
on the week before the one that had just closed.

**Friday prompt.** Opening a register (the till's Open Register dialog in
`pos.tsx`, and `pos-eod.tsx`) bumps `FridayEndOfWeekPrompt`
(`components/end-of-week/`), which asks `GET /end-of-week/status` (any staff;
no figures) for the shop's weekday and the just-finished week's status. On a
Friday, unless that week is finalised or this device was already prompted
today (localStorage `kk-eow-prompted-<date>`), it asks for End of Week —
managers/owners get a button to the page, cashiers are told to tell a manager.
It waits for the float-slip prompt to close first.

Adding the table is the standalone idempotent script
`scripts/src/add-end-of-week-reports-table.ts` in the `db:push` chain, not
`drizzle-kit push`, for the same reason every other `add-*-table` script exists:
push would try to reconcile (and drop) the report views.

### Security guards (from the 2026-10 audit)

- **Staff PINs** go through `lib/pin-guard.ts` (`reservePinAttempt`), never an
  in-memory counter: each attempt is reserved in `login_attempts` *before* the
  bcrypt compare (so parallel bursts are counted), a correct PIN releases it.
  Scope `public` (Tech App / Mobile POS: per IP, then per business) and
  `session` (verify-pin, timesheet clock-in/out/status: per business) are
  separate so the internet can't lock out the till. A new PIN check must use it.
- **OAuth `state`** is `createOAuthState(purpose, merchantId)` /
  `verifyOAuthState` (`lib/oauth-state.ts`), signed and expiring. The callbacks
  have no session (SameSite=Strict), and a bare merchant id let anyone attach
  their own Xero/payroll/Google account.
- **Anything rendered as HTML is escaped.** Print popups are `about:blank`
  windows on the POS origin, so they use `escHtml` (`koapos/src/lib/html-escape.ts`);
  API HTML uses `escapeHtml` and gets a no-script CSP from
  `middlewares/htmlResponseCsp.ts`. Shop customers can write names, appointment
  titles and notes, so those fields are attacker-controlled.
- **Stored files are served by type allowlist** (`lib/safe-content-type.ts`):
  anything a browser could run (HTML, SVG, XML) is an `application/octet-stream`
  download, because the upload URL does not pin the type. Customer-file keys
  must be the business's own (`lib/object-keys.ts`).
- **CORS**: `koastal.com.au` is accepted only on its own host, never on the POS
  host (same *site*, so the staff cookie would ride along); refused origins
  get 403 before any handler runs. `server.mjs` sends `frame-ancestors 'self'`,
  Referrer-Policy and HSTS on every page.
- **Print Bridge** trusts only the POS origins (the old `*.replit.app` /
  `*.replit.dev` defaults are stripped from stored configs) and answers only
  requests whose Host is loopback (DNS rebinding).

Pinned by `security-hardening.test.ts`, `xero-oauth-redirect.test.ts` and the
bridge's `origin.test.ts`.

**Money integrity** (phase 3). Every way to get value without paying is closed
inside the DB transaction that records the money, never by a pre-check:
- **Store credit is a real tender.** A `store_credit` sale debits its total, a
  split sale its `storeCreditPayment` leg, an invoice payment its store-credit
  legs — each under a `FOR UPDATE` lock on the customer, re-reading the ledger
  balance, refused when short. A store-credit payment needs the customer on the
  sale. Every ledger write (manual adjust, trade-in payout) takes the same lock.
- **Refund and void reverse everything**: stock, spend, loyalty, store credit
  spent (returned to the customer), and gift cards sold on the sale (put
  `on_hold`; a card already spent from blocks the reversal). Void used to only
  relabel the row.
- **Store credit spent on an invoice comes back** when that payment is
  reversed, the invoice is set back to unpaid, or it is deleted. Each
  store-credit payment event names the customer debited
  (`storeCreditCustomerId`); every return is an event carrying `reverses`, so
  toggling paid ↔ unpaid returns it once. Gift cards likewise: a gift-card
  payment is its own `gift-card-redeemed` event (not `payment`, which the report
  views count by method), un-paying or deleting puts it back on the card, and a
  partial reversal puts back whatever it takes below the gift-card spend.
- **Loyalty redemption** is conditional on the row update (`loyalty_points >=
  redeemed`), so two tills can't spend one balance. Taking loyalty back is all
  or nothing: a refund, void, invoice un-pay/reversal or delete that would take
  back points the customer has already spent is refused (409,
  `loyaltySpentMessage` in `lib/loyalty.ts`) until staff adjust the balance —
  clamping at zero used to let them keep what they had spent. Invoice loyalty follows the
  paid state both ways (un-paying or deleting takes it back); flipping an
  invoice in or out of paid by hand needs a manager or manager PIN.
- **Trade-in accept** claims the row (`status = 'quoted'` in the update) before
  paying out, so a double-click pays once; valuations are 0–100,000.
- **Quotes price only their own customer's sale**; laybys are checked against
  catalogue price (below it needs manager approval) and their lines must sum to
  the total. A till can't send a `delivery-order:` idempotency key. Xero sync
  calls loopback, never the request's Host header.
- Foreign-id checks: quotes, laybys, trade-ins, modifier links, pre-order
  delete, discounts; settings bodies go through `stripManagedFields`. New code
  uses `foreignIdError` (`lib/owned-ids.ts`, pinned by `owned-ids.test.ts`) —
  appointments, service jobs, service plans, products (category, brand) and
  purchase orders (supplier) do. A stored foreign id is what let the calendar,
  follow-ups, invoices and the reminder schedulers show or message another
  business's customer, so check on write. Readers are scoped too, so a row
  saved before the checks can't leak: every `customersTable` join on a row's
  `customerId` also requires `customersTable.merchantId` to equal that row's
  `merchantId` (invoices, laybys, follow-ups, products, mobile POS and the
  invoice/marketing schedulers and account sync), as do the calendar's customer
  lookup and the staff, supplier, category, product-type and brand lookups that
  echo names. `owned-ids.test.ts` pins the invoice case. Its test borrows an
  existing other business rather than creating one: `prevent_merchant_delete`
  refuses to delete a merchant row (suspend it instead).
- **Public routes mount before the blanket guard.** A router with a pathless
  `router.use(requireAuth)` (customer-files-cloud) guards every router mounted
  after it in `routes/index.ts`. The unsubscribe link sat after it and 401'd
  every recipient; `public-mounts.test.ts` now requests public routes through
  the real index with no session — add new public routes to it.
- **Smaller public-surface rules.** Shop sign-in answers every failure the same
  way (the page offers the set-up link after any failed attempt — it no longer
  says which emails are in-store customers). `/shop/track` is 300 requests / 10
  min per IP and stores at most 1,500 events per IP per hour
  (`takeEventBudget`), dropping the rest silently. The product QR page
  (`/public/b/:username/products/:id`) is 60 / 10 min per IP — it still serves
  products hidden from the online shop, on purpose, since they carry shelf
  stickers. Tech App and Mobile POS PIN logins rotate the session id with
  `rotateSessionKeeping` (`lib/session-rotate.ts`), which keeps the session's
  contents: a plain regenerate would sign the POS out in the same browser.

- **Part payments on EFTPOS / card / direct deposit.** The till pre-fills the
  exact total for these, but a cashier can key less. That is a part payment:
  the button becomes "Take remaining $X", which switches to Split with the
  keyed leg filled in, and keying more than the total is refused. The server
  refuses any of the three with `amountTendered` below the total (400
  `underpaid`, `PART_PAYABLE_EXACT_METHODS` in `routes/transactions.ts`) —
  before this the keyed amount was ignored and the sale recorded as paid in
  full (KR67799). No amount sent still means the total. Pinned by
  `transactions-part-payment.test.ts`.
- **Part paid = layby.** A short payment on the till (cash or an exact
  tender) shows "Take remaining now" (split) and "Layby — hold goods". The
  layby is the business's choice for part payment: goods stay in the shop
  (stock comes off at completion) and the payment is the deposit
  (`startLaybyFromCart` in `pos.tsx`). Needs a saved customer, catalogue
  products only (no gift cards / pre-order deposits / one-offs), and no
  whole-sale discount, since layby lines must sum to the layby total.
  **Layby payments count in takings on the day taken** —
  `view_layby_payment_legs` emits every `layby_payments` row at its own
  `created_at`, any status (its `completed_at` column now means "when the
  money moved"; a view can't rename a column). Revenue/GST still recognise the
  layby at completion. Cancelling takes an optional `refundAmount` +
  `refundMethod`, written as a negative layby payment in the same locked
  transaction. Before 2026-11 layby money counted only at completion and a
  cancelled layby's deposit never counted. Pinned by `layby-takings.test.ts`.
- **Deleting a sale** (POS › History, owner only) needs the sale **voided or
  refunded first** (409 `void_before_delete`): the delete removes only the row
  and reverses nothing, so a live sale would leave stock, loyalty, store credit
  and gift cards wrong. `payment_attempts`, `quotes.converted_transaction_id`
  and `product_oversell_ledger` reference the sale with no cascade — the
  database refused the delete whenever one did — so their links are set to
  NULL (rows kept) in the same DB transaction. Pinned by
  `transaction-delete.test.ts` (real DB).
- **Returns & swaps** (Customer › History › Return / swap, `ReturnSaleDialog`).
  A return is its own **completed** transaction with
  `return_of_transaction_id` = the sale (`scripts/src/add-transaction-returns.ts`):
  returned items are **negative** lines (`quantity`/`totalPrice`/`taxAmount` < 0,
  `returnOfLine` = the original line's index, original `costPrice`, `restocked`),
  swap items positive lines at today's (group) price, `total` = the net (< 0 =
  money back). That shape is what makes the report views net it off with no
  change — revenue, GST, COGS, product performance and the payment-method
  breakdown (cash out of the drawer); it does count as a transaction in "number
  of sales". `POST /transactions/:id/return` (manager or manager PIN, like a
  refund) locks the sale, refunds what each line was actually paid pro rata (the
  last unit takes the line's remainder, so a line refunds exactly its
  `totalPrice` however it's split), restocks ticked lines, takes swap items out
  of stock, takes back loyalty in proportion to the refund (refused if already
  spent, as for refunds) and earns on swap items, adjusts lifetime spend, and
  credits/debits store credit when that's the method — cash and card are
  recorded, not moved (EFTPOS refunds are done on the terminal). Gift cards,
  pre-order deposits, digital codes and custom lines can't be returned this way.
  A sale with returns can't then be refunded or voided whole, and a return
  can't be refunded or voided. `idempotencyKey` (stored as `return:<key>`) makes
  retries safe. Returns are left out of the Xero sale sync (a negative invoice
  is refused; they need credit notes, not written yet). Rules in
  `lib/sale-returns.ts`, pinned by `sale-returns.test.ts`.

Pinned by `money-integrity.test.ts` (real DB; skipped without `DATABASE_URL`)
and `discount-limits.test.ts`.

**Staff roles are enforced on the server** (`middlewares/requireManagerOrOwner.ts`).
`session.staffRole` is the *effective* role and every check reads it:
- Owner login → `owner`; staff email login → that staff member's role
  (`authKind`, `loginStaffId` record who signed in). A till's day sign-in
  (`verify-pin` + `establishDaySession`) sets the role to the PIN's owner;
  ending the day drops an owner-opened till to `cashier` until someone PINs in.
  `requireAuth` re-reads the session's staff row (30s cache): deactivation ends
  an email-login session, a role change applies on the next request.
- Gates: `requireOwner` (credentials, integrations, payroll, backups, security,
  business identity, deleting a sale), `requireManagerOrOwner` (settings,
  staff, marketing sends, catalogue structure), `requireManagerOrApproval`
  (till actions: refund, void, modify, store credit issue/adjust, trade-in
  accept, layby complete/status, stock overwrite, deletes). Approval = a
  manager/owner PIN at that till in the last 2 minutes (`managerApproval`);
  the 403 carries `code: "manager_approval_required"`, and the POS answers it
  with a PIN prompt and a retry (`koapos/src/lib/manager-approval.tsx` wraps
  `window.fetch`). Field-level: `managerOnlyFields` (pos-settings) and
  `allowSensitiveChanges` (product price/cost/group prices, customer loyalty/
  group/tier — compared with the stored value, since edit forms resend all).
- Only the owner may create, edit or delete an owner/manager or grant those
  roles; nobody changes their own role. Cashiers get colleagues without pay,
  contact or address fields. Owner password change/reset ends every other
  owner-password session (`destroyOwnerSessions`); a staff reset or
  deactivation ends their email logins.
- **Role discount limits** (`roleDiscountLimits`) are enforced on the server
  by allowance (`lib/discount-limits.ts`, loaded by `lib/discount-authority.ts`):
  every discount arrives as a line `discount`, so the server subtracts what it
  can account for itself — a pricing rule live within 30 minutes of now in
  business time, the customer's loyalty tier, the imported quote's discount —
  and judges only the rest against the lower of the role's threshold and cap.
  Over it is a 403 `manager_approval_required`, never a refusal. The till runs
  `POST /transactions/discount-check` when Charge opens payment, so the PIN is
  asked for before any card is charged; the approval comes back as a token
  bound to that cart (lines, customer, quote) for 30 minutes and rides on the
  sale as `discountApproval`. Checked in `POST /transactions` and
  `POST /payments/:provider/create` (a terminal/BNPL sale is finalised later
  without a session). Owners are never limited.
- If `forceStaffLogin` is off, a till opened with the owner's password stays an
  owner session — keep it on.

Pinned by `staff-roles.test.ts`.

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

**Replit routes the deployment by path, per artifact, and `.replit`'s `run`
is ignored** — each `artifact.toml`'s `[services.production]` decides what
serves its paths. `/api` is the API server; every other path, on every domain,
is the koapos artifact, which runs `artifacts/koapos/server.mjs`: a small
dependency-free static server that picks a build by host: the Koastal
Kollective website (`artifacts/website`) at koastal.com.au's root and its other
domains, the shop under `/shop` there, a 301 for `www.`,
and the POS for everything else (the header comment lists the rules). It exists
because the host is the only thing that can tell those apart, and only that
process sees `/`. Consequence:
the Express code below that serves the SPA and `legacyDomainRedirect` only ever
see `/api` in production (koapos.com.au page paths are served the POS, not
301'd). The rest of this section describes the Express side.

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
- `SYSTEM_FROM_NAME` — Display name (optional, defaults to `KoaPOS`).

**Option B — SMTP:**
- `SYSTEM_SMTP_HOST` / `SYSTEM_SMTP_PORT` (default `587`) / `SYSTEM_SMTP_USER` / `SYSTEM_SMTP_PASS`
- `SYSTEM_SMTP_SECURE` — `"true"` for SSL/TLS on port 465; defaults to `"false"`.
- `SYSTEM_FROM_EMAIL` (optional, falls back to SMTP user) / `SYSTEM_FROM_NAME` (optional, defaults to `KoaPOS`).

If neither is configured, auth emails are silently dropped and a warning is logged.

### Integration env vars
Each integration is "feature disabled if missing" — the API hides the connect button and the OAuth callback returns an error. Set client id and secret together.

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Ads and Google Business Profile.
- `GOOGLE_ADS_DEVELOPER_TOKEN` — Google Ads account listing; discovery disabled if missing.
- `STRIPE_CONNECT_CLIENT_ID` / `STRIPE_SECRET_KEY` — Stripe Connect onboarding & charges.
- `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` — Xero accounting sync.
- `LEADER_DATAFEED_URL` — Leader Computers' per-dealer product datafeed; fills new products made by a supplier-invoice import. Treat as a secret.
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

KoaPOS runs AI on the **merchant's own** API key. A merchant connects their
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
  `routes/ai-assistant.ts` writes SSE headers. `withFallback` is kept so a second
  provider could slot back in; once a delta has reached the client the provider
  is committed, since retrying elsewhere would splice two completions together.
- **`aiJson` returns `unknown` on purpose.** Claude enforces the JSON Schema
  server-side, but model output is untrusted until checked. Every caller validates
  with Zod before the value goes anywhere — the schema is guidance, Zod is the
  guarantee.
- Claude uses `thinking: {type: "adaptive"}` and `output_config.effort`. Effort
  is the cost/latency dial (`"low"` for the in-checkout upsell coach), *not* a
  cheaper model. `budget_tokens` is removed on current models — do not add it.
- The AI Assistant and upsell coach are `routes/ai-assistant.ts`, at
  `/ai/conversations…` and `/ai/upsell-suggestions` (operation ids and schemas
  `…AiConversation…`). They were `/openai/...` until 2026-11; nothing in the
  code names OpenAI now except `ai-provider.test.ts` (a leftover key must stay
  ignored) and the already-run `migrate-ai-keys-to-vault.ts`.
- **What uses Claude:** the AI Assistant, the till's upsell coach, promo card
  copy (`/promotions/:id/generate`) and product Import Details. Each falls back
  to non-AI behaviour (or says AI isn't connected) when the merchant has no key
  or has switched AI off in `ai_settings`.

## Product surface

Login; Dashboard (analytics, sales chart, KPIs); POS Register (product grid + cart + payment modal card/cash/split); Products (CRUD, categories, inventory, SKU, pricing); Customers (CRM, loyalty, spend, visits); Transactions (history, receipts, refunds); Inventory (stock levels, low-stock alerts); Staff (roles, PIN); Settings (business + regional).

## Accounts

The only account is `admin@koastal.com.au` (Koastal Kollective, username
`koastal`) in both databases; the seeded demo merchant and every test account
were deleted from dev. Sign in to dev with that account.

## User preferences (follow these)

- **Full-width layouts**: all app pages must use the full window width — never add `max-w-*` to page-level containers. Where a page has multiple cards/sections, place them in a responsive grid (`grid-cols-1 lg:grid-cols-2 gap-6 items-start`) so they sit side by side on large screens and stack on mobile. Dialog widths (`max-w-md`, `max-w-lg`, etc.) are fine.
- **Data-loss warning required**: before actioning any feature addition or fix that could destroy, overwrite, or permanently alter existing data (DB migrations, seeding, schema changes, file deletions, data backfills), stop and explain in full what data will be lost and why, then wait for explicit confirmation before proceeding.
