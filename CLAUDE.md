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
- `lib/integrations/*`, `lib/sales-documents`, `lib/shortlinks-shared`, `lib/object-storage-web` — shared libraries.
- `scripts` (`@workspace/scripts`) — one-off migration/seed scripts wired into `db:push`.

### Auth
Session-based (not JWT): `express-session` + `bcryptjs`, signed with `SESSION_SECRET`. The frontend's custom fetch (`lib/api-client-react/src/custom-fetch.ts`) sends `credentials: 'include'` so cookies flow through the Replit proxy. CORS is `origin: true, credentials: true` — both are required for session cookies to work.

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
- `META_APP_ID` / `META_APP_SECRET` — Meta (Facebook/Instagram) marketing.
- `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` — Twitter/X posting.
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` — LinkedIn posting.
- `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` — TikTok Business.
- `APPLE_WALLET_CERT_PEM` / `APPLE_WALLET_KEY_PEM` / `APPLE_WALLET_TEAM_ID` / `APPLE_WALLET_PASS_TYPE_ID` — Apple Wallet loyalty passes.
- `GOOGLE_WALLET_ISSUER_ID` / `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_WALLET_PRIVATE_KEY` — Google Wallet loyalty passes.
- Sign In with Apple: `APPLE_CLIENT_ID` (Service ID, e.g. `com.yourapp.signin`), `APPLE_TEAM_ID` (10-char), `APPLE_KEY_ID` (10-char), `APPLE_PRIVATE_KEY` (full `.p8` contents incl. BEGIN/END headers). These are server-side config secrets and are **not** stored in `oauth_token_vault`; per-merchant Apple tokens issued after the flow are stored in the vault.

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
