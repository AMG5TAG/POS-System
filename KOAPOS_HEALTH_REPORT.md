# KoaPOS System Health Report

_Generated: May 28, 2026_
_Scope: `artifacts/koapos/` (frontend) and `artifacts/api-server/` (backend), cross-checked against `lib/api-spec/openapi.yaml` and `lib/db/src/schema/`._

## Executive Summary

| Severity | Count | Headline |
|---|---|---|
| 🔴 **Critical Blockers** (data loss / silent integration failure) | **3** | Insecure OAuth token vault fallback; duplicate `/pos-settings` route registration; PC Builder save/load is a `no-op` mock |
| 🟠 **High Severity** (localStorage-only persistence, undocumented prod env vars) | **6** | Business profile, customer settings, sticker templates, and auth user persist only in browser; 20+ undocumented env vars; 24 Express endpoints have no OpenAPI definition (no codegen hook, no Zod validator); 10 OpenAPI paths have no Express handler |
| 🟡 **UI/UX Disconnects** (stubs, broken keys, duplicate concepts) | **5** | 5 duplicate page pairs (loyalty, cameras, referrals, social feed, inventory); "Coming Soon" placeholders inside `management-sales`, `management-import-export`, `management-integrations`; no orphan pages or broken nav keys |
| ⚪ **Optimisation Notes** | **4** | Sidebar nav has aliases pointing the same component at multiple URLs; Xero hardcoded production base URLs; `replit.md` documents only 2 of ~22 required env vars; deprecated POS settings handler in `pos-registers.ts` |

**Bottom line:** The product is **functionally compiled and routed end-to-end** (no orphan pages, no broken nav links, all route files are mounted). The two real risks are **(1) silent failure of every third-party integration in production** because client secrets are undocumented and the token vault falls back to an insecure key, and **(2) data persistence inconsistency** because four pieces of "settings" data live only in browser localStorage via shared hooks — they will reset per browser/device.

---

## 1. Data Persistence Audit (localStorage vs DB)

### Persistence is centralised, not scattered
Direct `localStorage.*` calls inside `pages/app/*.tsx` are rare. Persistence is abstracted through five shared library hooks under `artifacts/koapos/src/lib/`:

| Hook | LocalStorage key | What it stores |
|---|---|---|
| `useAuth` (`lib/auth.tsx`) | `koapos_auth_user` | Logged-in user object (session bootstrap) |
| `useBusinessProfile` (`lib/business-profile.ts`) | `koapos_business_profile` | Business name, ABN, address used on receipts/invoices/stickers |
| `useCustomerSettings` (`lib/customer-settings.ts`) | `koapos_customer_settings` | Customer-group/loyalty UI config |
| `useStickerTemplates` (`lib/sticker-config.tsx`) | `koapos_sticker_templates` | Sticker/label templates |
| Theme/Accessibility/NavLayout | `koapos-theme`, `koapos-font-size`, etc. | UI preferences (acceptable for LS) |

### Page-level usage

**(A) Pure localStorage-only business data — 🟠 HIGH**
None for **transactional** data — every product/customer/transaction/staff/inventory record is DB-backed.
However the following pieces of **configuration** data exist only in browser localStorage and **will be lost on a different device or after `localStorage.clear()`**:

| Page | Source hook | What is at risk |
|---|---|---|
| `pages/app/settings-business.tsx` | `useBusinessProfile` | Business name, ABN, address shown on receipts/invoices/PDFs |
| `pages/app/management-stickers.tsx` | `useStickerTemplates` | Sticker template definitions |
| `pages/app/service-jobs.tsx` (sticker print) | `useStickerTemplates`, `useBusinessProfile` | Falls back to placeholder text when LS is empty |
| `pages/app/customers.tsx` | `useCustomerSettings` | Customer group/loyalty UI config |

**(B) Hybrid (DB + localStorage) — acceptable but to be noted**
- `pages/app/pos.tsx` — products/sales via API; profile + session from LS (~5 LS ops).
- `pages/app/pos-invoices.tsx` — invoices from API; business header from LS (~1 op).
- `pages/app/customers.tsx` — customer list from API; group config from LS (~3 ops).
- `pages/app/service-jobs.tsx` — jobs from API; sticker defaults from LS (~4 ops).
- `pages/app/management-stickers.tsx` — merchant from API; templates from LS (~4 ops).
- `pages/app/settings-business.tsx` — updates via API; cached locally in LS (~2 ops).

**(C) In-memory only — 🔴 CRITICAL for one page**
- `pages/app/pos-pc-builder.tsx` — **save/load functions are `no-op` mocks**. Anything the user configures evaporates on refresh.
- `pages/app/management-calculators-3d.tsx` — calculator, stateless, intentional.
- `pages/app/management-koapos.tsx` — static system info, intentional.

**(D) Fully DB-backed (gold standard — ~50+ pages)**
Including: `dashboard`, `transactions`, `inventory`, `inventory-wastage`, `appointments`, `service-jobs`, `service-jobs-new`, `products*`, `customers`, `customers-forms`, `staff*`, `marketing-email-*`, `marketing-landing-pages`, `marketing-qr-codes`, `marketing-shortlinks`, `marketing-referrals`, `management-cameras`, `management-discounts`, `management-floor-plan`, `management-forms`, `management-gift-cards`, `management-integrations`, `management-loyalty`, `management-marketing-*`, `management-online-store`, `management-registers`, `management-templates`, `management-xero`, `online-delivery-orders`, `online-marketplace`, `online-shipping`, `settings-*` (most), etc.

---

## 2. Backend Routes vs OpenAPI Spec

- **Express endpoints registered:** 336
- **OpenAPI paths defined:** 285
- **Route files mounted:** 72 / 72 — `src/routes/index.ts` mounts every file. No orphan route files.

### 🟠 24 Express endpoints have NO OpenAPI definition
(No generated React Query hook, no generated Zod validator — these routes are called by the frontend via raw fetch or are unused.)

| File | Endpoint |
|---|---|
| `auth.ts` | `POST /auth/change-password`, `POST /auth/change-email` |
| `social-feed.ts` | `GET /social-feed/posts`, `GET /social-feed/settings`, `PUT /social-feed/settings` |
| `purchase-orders.ts` | `POST /purchase-orders/:id/receive`, `POST /purchase-orders/:id/email` |
| `email-campaigns.ts` | `POST /email-campaigns/:id/send` |
| `marketing-automation.ts` | `POST /marketing-automation/:id/run`, `GET /marketing-automation/log` |
| `xero.ts` | `GET /xero/status`, `GET /xero/auth/start`, `GET /xero/auth/callback`, `DELETE /xero/disconnect`, `GET /xero/tenants`, `POST /xero/tenant`, `GET /xero/accounts`, `GET /xero/mappings`, `PUT /xero/mappings`, `POST /xero/sync/contacts`, `POST /xero/sync/transactions`, `POST /xero/sync/purchase-orders`, `GET /xero/sync/log` |
| `integrations.ts` | `GET /integrations/oauth/:key/start`, `GET /integrations/oauth/:key/callback` |
| `email-settings.ts` | `POST /settings/email/test` |
| `tax-settings.ts` | `POST /transactions/:id/send-receipt` (🔴 **misplaced — registered in tax-settings.ts but is a transaction concern**) |

### 🟠 10 OpenAPI paths have NO Express handler
(Codegen produces a hook that returns 404 in production.)
- `GET /plans/{id}`
- `GET|PATCH|DELETE /shipping-carriers/{carrierId}`
- `GET|DELETE /marketplace-connections/{marketplaceId}`
- `GET /delivery-orders/{id}`
- `GET /qr-codes/{id}`
- `GET /qr-saved-templates/{id}`
- `GET /shortlinks/{id}`

### 🔴 Duplicate handler registration
- `GET /pos-settings` and `PUT /pos-settings` are registered in **both** `pos-settings.ts` and `pos-registers.ts`. Whichever is mounted last wins; the other is dead code. **Risk:** silent behaviour difference between local dev and prod depending on file order.

---

## 3. Routing & Orphan Pages

- **Routes in `App.tsx`:** ~95
- **Page files in `pages/`:** every one is routed.
- **Orphan pages:** **0** ✅
- **Routes pointing to missing components:** **0** ✅

### 🟡 Duplicate functional concepts (5 pairs)
These are dual pages for the same domain. Not broken, but confusing for navigation and prone to drift:

| Pair | URLs | Risk |
|---|---|---|
| Loyalty | `/management/loyalty` vs `/marketing/loyalty/promotions` | Two pages mutating loyalty config |
| Cameras | `/cameras` (viewer) vs `/management/cameras` (config) | Acceptable split but both have config UI |
| Referrals | `/management/marketing/referrals` vs `/marketing/referrals` | Likely redundant |
| Social Feed | `/management/marketing/social-feed` (admin) vs `/staff/social-feed` (viewer) | Conceptual overlap |
| Inventory | `/inventory`, `/management/inventory`, `/products` | High fragmentation across three pages |

### ⚪ Sidebar nav aliases (intentional but worth flagging)
- `/management/staff`, `/management/staff/timesheet`, `/management/staff/cost-summary` reuse the same components as `/staff/*` — two URLs render the same page. Fine, but breadcrumbs/active-nav state may misbehave.

---

## 4. Third-Party Integrations & Environment Configuration

### 4.1 Xero
**File:** `artifacts/api-server/src/routes/xero.ts`
- ✅ **Redirect URI is dynamic** — built from `x-forwarded-proto` and `host` headers via `buildCallbackUrl(...)`. Robust across dev/staging/prod.
- ✅ **Tokens stored in DB** (`merchantIntegrationsTable.accessToken/refreshToken/tokenExpiresAt`).
- ⚪ **Production API base URLs are hardcoded** (`https://login.xero.com/...`, `https://api.xero.com/api.xro/2.0`, etc.). Acceptable since Xero has no sandbox env that requires switching, but worth env-driving for testability.
- 🟡 **No webhook signature verification implemented** — if Xero webhooks are introduced later, signing key handling must be added.

### 4.2 Other OAuth providers (Google, Microsoft, Dropbox, Stripe Connect, QuickBooks, Meta, Twitter/X, LinkedIn, TikTok)
**File:** `artifacts/api-server/src/routes/integrations.ts`
- ✅ All callbacks use dynamic `${proto}://${host}/api/integrations/oauth/${key}/callback`.
- ⚪ All provider auth/token URLs are hardcoded to current production endpoints (acceptable).

### 4.3 🔴 CRITICAL — Insecure token vault fallback
**File:** `artifacts/api-server/src/services/tokenVault.ts` (lines 19-20)
- `VAULT_ENCRYPTION_KEY` falls back first to `SESSION_SECRET`, then to a hardcoded `"dev-insecure-fallback..."` string.
- In production this means encrypted OAuth tokens for every integration above are protected by either a session secret (wrong key for its purpose) or a hardcoded literal anyone reading the repo can decrypt.

### 4.4 🟠 Undocumented environment variables
`replit.md` lists only `DATABASE_URL` and `SESSION_SECRET`. The codebase actually reads:

| Variable | Purpose | Missing impact |
|---|---|---|
| `VAULT_ENCRYPTION_KEY` | Token vault encryption | 🔴 Falls back to insecure key |
| `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` | Xero OAuth | Xero integration silently unusable |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth | Google Drive/Sheets integration disabled |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | MS Graph / OneDrive | Disabled |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | Dropbox | Disabled |
| `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_SECRET_KEY` | Stripe Connect | Payment marketplace disabled |
| `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` | Intuit | Disabled |
| `META_APP_ID`, `META_APP_SECRET` | Facebook/Instagram | Disabled |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` | X | Disabled |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | LinkedIn | Disabled |
| `TIKTOK_CLIENT_KEY` | TikTok Business | Disabled |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads | Disabled |
| `LOG_LEVEL` | Logging verbosity | Defaults to info |

---

## 5. Sidebar Stubs & "Coming Soon" Placeholders

### Confirmed placeholder sections inside otherwise-real pages
| Page | Stub area |
|---|---|
| `pages/app/management-sales.tsx` | "New Schedule" tile shows `Coming Soon` badge |
| `pages/app/management-import-export.tsx` | Several import targets marked `Coming Soon` |
| `pages/app/management-integrations.tsx` | Several provider tiles marked `Coming Soon` (line ~213) |

### Broken sidebar nav keys
**None.** Every nav `href` resolves to a registered route. The earlier suspected `Reports → /management/sales-overview` mismatch is actually fine — the route does exist and renders `ManagementSalesPage`.

---

## Detailed Component Inventory (failing-file table)

| File | Severity | Issue | LS ops / count | Root cause |
|---|---|---|---|---|
| `artifacts/api-server/src/services/tokenVault.ts` | 🔴 | Insecure encryption-key fallback | n/a | Hardcoded dev fallback literal in prod path |
| `artifacts/api-server/src/routes/pos-registers.ts` + `pos-settings.ts` | 🔴 | Duplicate `GET/PUT /pos-settings` registration | n/a | Two files mount overlapping routes |
| `artifacts/koapos/src/pages/app/pos-pc-builder.tsx` | 🔴 | Save/load are no-op mocks | 0 (no LS, no API) | Builder state lives only in component state |
| `artifacts/koapos/src/lib/business-profile.ts` (used in 4+ pages) | 🟠 | Business profile only in localStorage | 4+ pages read | No DB persistence; relies on `koapos_business_profile` LS key |
| `artifacts/koapos/src/lib/customer-settings.ts` | 🟠 | Customer-group settings only in LS | 1 page | LS-only hook |
| `artifacts/koapos/src/lib/sticker-config.tsx` | 🟠 | Sticker templates only in LS | 2 pages | LS-only hook |
| `artifacts/koapos/src/lib/auth.tsx` | 🟠 | Auth user cached in LS (acceptable for boot, but no server re-validation on every mount) | 1 hook, 50+ pages depend on it | LS bootstrap pattern |
| `artifacts/api-server/src/routes/xero.ts` | 🟠 | 13 endpoints missing from OpenAPI spec | n/a | Routes added without updating `lib/api-spec/openapi.yaml` |
| `artifacts/api-server/src/routes/integrations.ts` | 🟠 | 2 OAuth callback endpoints missing from OpenAPI spec | n/a | Same as above |
| `artifacts/api-server/src/routes/tax-settings.ts` | 🟠 | Registers `POST /transactions/:id/send-receipt` (wrong file) | n/a | Misplaced handler |
| `artifacts/api-server/src/routes/auth.ts` | 🟠 | `change-password`, `change-email` missing from OpenAPI | n/a | Routes added without spec update |
| `artifacts/api-server/src/routes/social-feed.ts` | 🟠 | 3 endpoints missing from OpenAPI | n/a | Same |
| `artifacts/api-server/src/routes/email-campaigns.ts` | 🟠 | `POST /:id/send` missing from OpenAPI | n/a | Same |
| `artifacts/api-server/src/routes/marketing-automation.ts` | 🟠 | 2 endpoints missing from OpenAPI | n/a | Same |
| `artifacts/api-server/src/routes/purchase-orders.ts` | 🟠 | `receive`, `email` actions missing from OpenAPI | n/a | Same |
| `artifacts/api-server/src/routes/email-settings.ts` | 🟠 | `/settings/email/test` missing from OpenAPI | n/a | Same |
| OpenAPI spec | 🟠 | 10 paths with no Express handler (`shipping-carriers/{id}`, `marketplace-connections/{id}`, `qr-codes/{id}`, etc.) | n/a | Spec drifted ahead of implementation |
| `replit.md` | 🟠 | Documents 2/22+ required env vars | n/a | Outdated docs |
| `pages/app/management-loyalty.tsx` + `marketing-loyalty-promotions.tsx` | 🟡 | Duplicate concept | n/a | Two pages mutate loyalty config |
| `pages/app/cameras.tsx` + `management-cameras.tsx` | 🟡 | Duplicate concept | n/a | Viewer vs configurator overlap |
| `pages/app/management-marketing-referrals.tsx` + `marketing-referrals.tsx` | 🟡 | Duplicate concept | n/a | Unclear split |
| `pages/app/management-marketing-social-feed.tsx` + `staff-social-feed.tsx` | 🟡 | Duplicate concept | n/a | Same data, two surfaces |
| `pages/app/inventory.tsx` + `management-inventory.tsx` + `products.tsx` | 🟡 | Triplicate inventory surface | n/a | Three pages, overlapping responsibilities |
| `pages/app/management-sales.tsx` | 🟡 | "Coming Soon" badge inside live page | n/a | Stub tile |
| `pages/app/management-import-export.tsx` | 🟡 | "Coming Soon" stubs | n/a | Partial feature |
| `pages/app/management-integrations.tsx` | 🟡 | "Coming Soon" stubs (~line 213) | n/a | Partial feature |
| `App.tsx` (staff alias routes) | ⚪ | Two URLs render same component (`/management/staff*` aliases) | n/a | Intentional alias; may break breadcrumbs |
| `routes/xero.ts` | ⚪ | Hardcoded production Xero API base URLs | n/a | Not env-driven |

---

## Prioritized Remediation Roadmap

The roadmap below is ordered to **stabilize data integrity and production safety first**, then close contract drift, then clean up UX. Each phase can be merged independently without breaking compilation.

### Phase 1 — Production safety (🔴 do first, ~1 day)
1. **Document and require `VAULT_ENCRYPTION_KEY`** in `replit.md`, and change `tokenVault.ts` to **throw on boot** when the env var is missing in production (`NODE_ENV === 'production'`). Keep the dev fallback only for local development.
2. **Fix duplicate `/pos-settings` registration** — pick one owner (`pos-settings.ts`) and delete the handler from `pos-registers.ts`. Run typecheck.
3. **Move `POST /transactions/:id/send-receipt`** out of `tax-settings.ts` into `transactions.ts`.
4. **Document all 20+ env vars** in `replit.md` under a new "Optional integration env vars" subsection, each with a one-line "feature disabled if missing" note.

### Phase 2 — Data persistence (🟠, ~2–3 days)
1. **Fix `pos-pc-builder.tsx`** — wire the save/load to the existing API (or create a `pc_builder_drafts` table + endpoint). This is the only true data-loss-on-refresh bug.
2. **Promote `business_profile` from localStorage to DB** — there is already a `merchants` table; persist the profile fields there and remove the `useBusinessProfile` LS bootstrap. Keep a thin in-memory cache via React Query.
3. **Promote `customer_settings` to DB** — same pattern, attach to merchant.
4. **Promote `sticker_templates` to DB** — create `sticker_templates` table, migrate `useStickerTemplates`.
5. **Keep auth user in LS only as a boot hint** — re-validate via `/auth/me` on every mount of `AuthProvider`.

### Phase 3 — API contract reconciliation (🟠, ~1–2 days)
1. **Add the 24 missing endpoints to `lib/api-spec/openapi.yaml`** so codegen produces React Query hooks and Zod validators for them. Focus on Xero (13), auth password/email (2), social-feed (3), purchase-order actions (2), marketing automation (2), email-campaign send (1), email-settings test (1).
2. **Decide on the 10 orphan OpenAPI paths** — either implement the handlers or delete the paths from the spec. Don't ship a hook that returns 404.
3. After spec edits run `pnpm --filter @workspace/api-spec run codegen` and `pnpm run typecheck`.

### Phase 4 — UX consolidation (🟡, ~2 days)
1. **Inventory consolidation** — merge `/inventory`, `/management/inventory`, and the inventory portions of `/products` into a single canonical inventory hub; redirect the other URLs.
2. **Loyalty consolidation** — pick one canonical page for loyalty config; the other becomes a redirect.
3. **Referrals consolidation** — same pattern.
4. **Social-feed split** — keep both pages but extract the shared data hooks into a single source-of-truth lib.
5. **Replace "Coming Soon" stubs** in `management-sales`, `management-import-export`, `management-integrations` with either real features or remove the tiles entirely.

### Phase 5 — Optimisations (⚪, opportunistic)
1. **Env-drive Xero base URLs** behind defaults to make integration testable.
2. **Add webhook signature verification** scaffolding for Xero in preparation for future webhooks.
3. **Audit staff URL aliases** — decide if `/management/staff*` mirrors should be removed or kept as 301 redirects to `/staff/*`.
4. **Add OpenAPI lint to CI** — fail the build when a route file registers an endpoint that is not in the spec (prevents future drift).

### Compilation safety note
None of the phase 1–3 changes are breaking to the build:
- Phase 1 only touches env handling and route registration order.
- Phase 2 requires new schemas + endpoints **before** removing LS hooks; the migration order is _add DB_ → _dual-write_ → _switch reads_ → _remove LS_, so the app keeps compiling at every step.
- Phase 3 only adds to the spec — codegen output grows, nothing is removed.

Phase 4 consolidation is the only place that risks breaking deep-linked URLs; mitigate with wouter redirects from the old paths to the canonical one.

---

_End of report._