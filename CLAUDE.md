# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

KoaPOS — a subscription-based Point of Sale system for Australian retail merchants. Clean, tablet/mobile-ready UI with a modular add-on marketplace. A pnpm monorepo (Node 24, TypeScript 5.9) with a React/Vite frontend, an Express 5 API server, PostgreSQL + Drizzle ORM, and a contract-first OpenAPI codegen pipeline.

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
- `artifacts/koapos` — React 19 frontend. Pages in `src/pages/` (marketing + authenticated app), auth in `src/lib/auth.tsx` (AuthProvider + `useAuth`).
- `lib/db` — Drizzle schema, one file per domain in `src/schema/` (merchants, products, customers, transactions, staff, …).
- `lib/integrations/*`, `lib/sales-documents`, `lib/shortlinks-shared`, `lib/object-storage-web` — shared libraries. Note that cloud-storage integrations do **not** live here: they are in `artifacts/api-server/src/lib/` (`backup-storage/`, `nextcloud.ts`, `objectStorage.ts`) and `src/services/`.
- `artifacts/print-bridge` (`@workspace/print-bridge`) — a standalone, dependency-free Node service that runs **on the merchant's till**, not on the server. It is what lets the browser print without the OS print dialog. Not part of the deployed app; built to a single `dist/index.mjs` and installed on each till. See "Printing" below and its own README.
- `scripts` (`@workspace/scripts`) — one-off migration/seed scripts wired into `db:push`.

### Auth
Session-based (not JWT): `express-session` + `bcryptjs`, signed with `SESSION_SECRET`. The frontend's custom fetch (`lib/api-client-react/src/custom-fetch.ts`) sends `credentials: 'include'` so cookies flow through the Replit proxy. CORS is `origin: true, credentials: true` — both are required for session cookies to work.

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

### Data conventions (important, non-obvious)
- Numeric DB columns (price, total, …) are Postgres `numeric`; route handlers return them via `parseFloat()`.
- Boolean fields are stored as text `"true"`/`"false"` (a Drizzle text-column limitation) — compare/serialize accordingly.
- OAuth tokens are encrypted at rest in the `oauth_token_vault` table via `services/tokenVault.ts` using `VAULT_ENCRYPTION_KEY` (AES-256-GCM `v2:<iv>:<tag>:<ct>`; legacy CBC `<iv>:<ct>` still readable and upgraded on re-encrypt). See "Rotating VAULT_ENCRYPTION_KEY" below.
- Money-moving endpoints (`POST /transactions`, `POST /invoices/:id/payment`) are **atomic and idempotent**: the client sends `giftCardPayment {cardId, amount}`, and the server locks the card row (`FOR UPDATE`), validates, debits it, and writes the redemption ledger entry inside the SAME DB transaction that records the sale/payment — so the card can never be charged without the sale landing (or vice-versa). An `idempotencyKey` dedupes retries (`transactions` has a unique index on `(merchantId, idempotencyKey)`; invoice payments dedupe via a key recorded in the invoice's events). The POS generates one key per checkout attempt (reused across manual retries, reset on success/clear-cart). Do **not** introduce client-side debit + compensation patterns.

## Environment

Required env: `DATABASE_URL`, `SESSION_SECRET`, `VAULT_ENCRYPTION_KEY` (the last required in production). Template in `.env.example`.

### Required production environment variables
These MUST be set when the API server is started with `NODE_ENV=production`. Missing any causes the process to fail fast on boot.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Drizzle ORM). |
| `SESSION_SECRET` | `express-session` cookie signing secret. |
| `VAULT_ENCRYPTION_KEY` | Key used to encrypt OAuth access/refresh tokens in `oauth_token_vault`. GCM verifies an auth tag, so a wrong/tampered value fails loudly instead of returning garbage. The server throws `"Fatal: VAULT_ENCRYPTION_KEY environment variable is required in production mode."` on startup if missing under `NODE_ENV=production`. The insecure hardcoded dev fallback is only honoured when `NODE_ENV` is `development` or blank — never in production/staging/test. Generate with e.g. `openssl rand -hex 32`. On startup the server re-encrypts any tokens under `VAULT_ENCRYPTION_KEY_PREVIOUS`, then invalidates rows still undecryptable with the current key (affected merchants must reconnect). |
| `VAULT_ENCRYPTION_KEY_PREVIOUS` | Optional. Set to the **old** key value when rotating. See below. |

#### Rotating `VAULT_ENCRYPTION_KEY`
To rotate without forcing every merchant to reconnect:
1. Set `VAULT_ENCRYPTION_KEY_PREVIOUS` to the current (soon-to-be-old) key.
2. Set `VAULT_ENCRYPTION_KEY` to the new key.
3. Restart the API server. On boot it runs a one-shot migration (`reEncryptVaultEntries`) that decrypts any token readable under the previous key and re-encrypts under the new key. `decryptToken` also transparently falls back to the previous key during the transition.
4. Once you see `"Re-encrypted OAuth vault entries under rotated key"` in the logs, remove `VAULT_ENCRYPTION_KEY_PREVIOUS` and restart again.

Rows undecryptable under **either** key are invalidated on startup (`disconnectedReason: "key_rotated"`); those merchants must reconnect the affected integrations.

### System email env vars
Platform-level fallback when a merchant has no email provider configured in Management → Email. Essential for auth emails (password reset, login alerts). Set **one** option:

**Option A — Resend (recommended):**
- `SYSTEM_RESEND_API_KEY` — Resend API key; platform default sender.
- `SYSTEM_FROM_EMAIL` — Required sender address when using Resend (e.g. `noreply@koapos.com`).
- `SYSTEM_FROM_NAME` — Display name (optional, defaults to `KoaPOS`).

**Option B — SMTP:**
- `SYSTEM_SMTP_HOST` / `SYSTEM_SMTP_PORT` (default `587`) / `SYSTEM_SMTP_USER` / `SYSTEM_SMTP_PASS`
- `SYSTEM_SMTP_SECURE` — `"true"` for SSL/TLS on port 465; defaults to `"false"`.
- `SYSTEM_FROM_EMAIL` (optional, falls back to SMTP user) / `SYSTEM_FROM_NAME` (optional, defaults to `KoaPOS`).

If neither is configured, auth emails are silently dropped and a warning is logged.

### Integration env vars
Each integration is "feature disabled if missing" — the API hides the connect button and the OAuth callback returns an error. Set client id and secret together.

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google (Ads, Calendar, etc.).
- `GOOGLE_ADS_DEVELOPER_TOKEN` — Google Ads account listing; discovery disabled if missing.
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` — Microsoft 365 / Outlook.
- `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` — Dropbox file sync.
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
- **Surfaces**: a backup destination (`lib/backup-storage/nextcloud.ts`, folder defaults to `KoaPOS/Backups`), a customer-file mirror target (`services/cloudFileMirror.ts`), and a restore/download source — `retrieveArchive` in `lib/backup-storage/index.ts` tries the platform `server` copy first, then Nextcloud.

Adding another storage provider means touching the same five places `StorageType` is declared: `lib/backup-storage/types.ts`, `BackupStorageDestination` + `BackupLocation` in `lib/db/src/schema/merchant-backups.ts`, both enums in `openapi.yaml`, and `StorageType`/`STORAGE_META` in `management-backup.tsx`. The `destinations`/`locations` columns are JSONB with TypeScript-only typing, so **no SQL migration is needed** to widen them.

## Product surface

Public marketing (Landing / Pricing / Register / Login); Dashboard (analytics, sales chart, KPIs); POS Register (product grid + cart + payment modal card/cash/split); Products (CRUD, categories, inventory, SKU, pricing); Customers (CRM, loyalty, spend, visits); Transactions (history, receipts, refunds); Inventory (stock levels, low-stock alerts); Staff (roles, PIN); Modules (enable/disable add-ons); Settings (business + regional).

## Seeded demo data

- Merchant: `demo@koapos.com` / `password123` (Growth plan)
- Products: 7 across 3 categories (Beverages, Snacks, Electronics)
- Customers: 2 (Sarah Johnson, Mike Chen)
- Staff: 2 (Alex Taylor — owner, Jamie Nguyen — cashier)
- Transactions: 5 completed sales

## User preferences (follow these)

- **Full-width layouts**: all app pages must use the full window width — never add `max-w-*` to page-level containers. Where a page has multiple cards/sections, place them in a responsive grid (`grid-cols-1 lg:grid-cols-2 gap-6 items-start`) so they sit side by side on large screens and stack on mobile. Dialog widths (`max-w-md`, `max-w-lg`, etc.) are fine.
- **Data-loss warning required**: before actioning any feature addition or fix that could destroy, overwrite, or permanently alter existing data (DB migrations, seeding, schema changes, file deletions, data backfills), stop and explain in full what data will be lost and why, then wait for explicit confirmation before proceeding.
