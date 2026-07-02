# KoaPOS Full Code Audit — 2 July 2026

Scope: entire monorepo (API server, frontend, shared libs, DB schema, migrations,
schedulers, dependencies). Method: four parallel deep scans (security, backend
correctness, frontend, DB/perf/infra) plus direct verification (typecheck, both
test suites, dependency audit, live health checks).

## Health snapshot (verified, after fixes below)

| Check | Result |
|---|---|
| TypeScript (all packages) | ✅ pass |
| API tests | ✅ 176/176 (23 files) |
| Frontend tests | ✅ 73/73 (3 files) |
| `pnpm audit --prod` | ✅ **0 vulnerabilities** (was 11: 3 high, 6 moderate, 2 low) |
| Server boot / `/api/healthz` | ✅ `{"status":"ok"}` |
| PDF renderer `/api/health/pdf` | ✅ Chromium path active |
| `pnpm run db:push` | ✅ passes (was **broken** — see fix #3) |
| TODO/FIXME comments | 0 in the codebase |

## Fixed during this audit

1. **Dependency vulnerabilities → zero.** Bumped `nodemailer` 8→9 (HIGH: raw-option
   file read/SSRF), `multer` →2.2 (HIGH: DoS), `dompurify` →3.4.11 (sanitizer
   bypasses); added pnpm overrides for transitive `form-data` (HIGH: CRLF injection),
   `js-yaml`, `uuid`. All tests pass on the new versions.
2. **`service-jobs.ts` oversized query.** `GET /service-jobs` fetched **every**
   customer of the merchant; now fetches only the referenced ids via `inArray`.
3. **`db:push` was broken (latent, would hit the next schema change).**
   `view_daily_surcharge_cost` was missing from the `.existing()` view declarations
   in `lib/db/src/schema/report-views.ts`, so drizzle-kit emitted a `DROP VIEW` that
   fails on the dependency chain. Declared it; `db:push` verified working end-to-end.
   Also corrected the stale view list in `setup-report-views.ts`'s log line.
4. **Missing index on `shortlinks.slug`.** The public redirect resolver queries by
   slug alone, which the `(merchantId, slug)` unique couldn't serve → sequential scan
   on every branded link click. Added `shortlinks_slug_idx`; pushed to the DB.
5. **Australian timezone bug in Sales reports** (`management-sales.tsx`). Date
   presets used `toISOString()` (UTC), so "Today" queried **yesterday** until
   ~10–11 am AEST and "Month" started on the last day of the prior month. Now built
   from local date components. Also fixed the day-bucketing helper (`_groupByDay`)
   that mixed UTC keys with record dates, dropping near-midnight events from charts.
6. **P1 #1 — Refund/void now reverse their side effects.** Added
   `reverseSaleEffects()` in `transactions.ts` (mirrors the invoice un-paid
   reversal): restocks inventory-tracked lines, subtracts the sale total + one
   visit from the customer, and undoes loyalty movement (restores redeemed points
   on a loyalty-tendered sale, claws back earned points otherwise). Both handlers
   now run inside a `db.transaction` with a `FOR UPDATE` lock, and **refund guards
   on `status === "completed"`** so it can't double-reverse or refund a void.
7. **P1 #2 — Layby payments are now idempotent + cent-rounded.** Added an
   `idempotencyKey` to `AddLaybyPaymentBody` (regenerated zod + react client),
   a nullable `layby_payments.idempotency_key` column with a unique
   `(layby_id, idempotency_key)` index, a dedupe check under the row lock, and
   `round2()` on all amounts + an epsilon completion check (matches invoices). POS
   (`pos-laybuys.tsx`) now sends one key per attempt, reused on retry.
8. **Codegen regression from fix #1 fixed.** The `js-yaml` pnpm override forced
   js-yaml to 5.x, which dropped the default export orval imports → `pnpm codegen`
   crashed. Removed the override; `pnpm audit --prod` is still 0 vulnerabilities
   (js-yaml only reaches prod transitively via puppeteer→cosmiconfig, unaffected).
9. **KPI history prune query was always failing** (`kpiResetScheduler.ts`). The
   retention `CASE` was bound as untyped params resolving to `text`, so
   `rn (bigint) > text` had no operator and every hourly prune threw
   (`operator does not exist: bigint > text`) — the table grew unbounded. Cast
   the `CASE` result to `::int`. Verified: no prune error on boot.

## Outstanding findings (prioritised)

### P1 — correctness & money

| # | Finding | Where |
|---|---|---|
| 1 | ✅ **FIXED** — Refund/void now reverse stock, loyalty and lifetime-spend (see Fixed #6). | `routes/transactions.ts` |
| 2 | ✅ **FIXED** — Layby payments now idempotent + cent-rounded (see Fixed #7). | `routes/laybys.ts` |
| 3 | ✅ **FIXED** — Duplicate scan came back clean (0 rows across all 6 columns); added per-merchant unique indexes on job/invoice/quote/PO/layby/receipt numbers, converted the three count-based generators to max+1 (so deletes don't reuse numbers), and wrapped every generator in `withUniqueRetry` (`lib/document-numbers.ts`). Sale finalisation retries the whole transaction on a receipt collision. | `service-jobs.ts`, `invoices.ts`, `quotes.ts`, `purchase-orders.ts`, `laybys.ts`, `transactions.ts` |
| 4 | ✅ **FIXED** — `alreadySent` now only dedupes on `status = "sent"`, so a prior `"failed"` row no longer blocks a retry; a transient SMS/email failure is retried on the next tick within the window. | `marketingAutomationScheduler.ts` |
| 5 | **Afterpay & Klarna refunds send no idempotency key** (their charge paths do; Zip's refund does) → a retried refund double-refunds. Afterpay refund also hardcodes AUD. | `payments/afterpay.ts:132`, `payments/klarna.ts:133` |
| 6 | **Non-atomic ledger writes**: gift-card balance adjustments, trade-in accept (store credit), trade-in list-as-stock each do 2 writes without `db.transaction`; store-credit redeem has a TOCTOU balance check. | `gift-cards.ts:275`, `trade-ins.ts:84,114`, `store-credit.ts:78` |

### P2 — security (no criticals found)

| # | Finding | Where |
|---|---|---|
| 7 | ✅ **FIXED** — Added `stripManagedFields()` (`lib/settings-body.ts`, mirrors `normalizeBody`) and applied it to all 9 vulnerable upserts (`id`/`merchantId`/`createdAt`/`updatedAt` stripped before `.set()`/`.values()`), closing the cross-tenant write. | `layby-settings.ts`, `qr.ts`, `pos-code-prefixes.ts`, `regional-ext-settings.ts`, `pos-receipt-settings.ts`, `inventory-settings.ts`, `staff-rostering-settings.ts`, `online-store.ts` (×2) |
| 8 | ✅ **FIXED** — Staff PINs are now bcrypt-hashed at rest (`lib/staff-pin.ts`: `hashPin` on create/update, `matchStaffByPin`/`pinMatches` for verification, with a plaintext fallback so no one is locked out mid-transition). Lookup-by-PIN sites (staff verify-pin, mobile-pos, tech, staff-timesheets ×3) load-and-compare instead of `WHERE pin = ?`. One-off `hash-staff-pins` backfill (idempotent, wired into `db:push`) hashed the 6 existing PINs. Verified end-to-end: create→hash→verify(correct/incorrect). | `staff.ts`, `tech.ts`, `mobile-pos.ts`, `staff-timesheets.ts`, `lib/staff-pin.ts`, `scripts/hash-staff-pins.ts` |
| 9 | ✅ **FIXED** — Public dashboard is now addressed by an unguessable 48-char token (`dashboard_app_settings.public_token`, unique-indexed) at `/d/:token` instead of the guessable username. Admin link + send-link emit the token URL; the old `/public/b/:username/dashboard` route is removed. Backfill script `add-dashboard-public-token` (idempotent, in `db:push`) tokenised the existing row. Verified: valid token→200, bad token→403, old URL no longer serves data. ⚠️ Breaking: previously-shared username links must be re-copied from Management. | `dashboard-app-public.ts`, `dashboard-app-admin.ts`, `App.tsx`, `dashboard-app/index.tsx`, schema + backfill |
| 10 | ✅ **FIXED** — Added `helmet` (CSP off for this JSON API, CORP cross-origin so the SPA can load API PDFs/QR); verified headers on `/api/healthz`. Added SIGTERM/SIGINT graceful shutdown: `trackedInterval` registry (`lib/shutdown.ts`) clears all 12 scheduler intervals, `server.close()` drains connections, `closePdfBrowser()` releases Chromium, hard-timeout force-exit. Verified live. | `app.ts`, `index.ts`, `services/*Scheduler.ts` |
| 11 | Low: service-job email interpolates notes/business name unescaped (HTML-escape like `invoice-html.ts` does); mobile-POS `/sale` trusts client prices despite "server-authoritative" comment; time-card FK refs unvalidated. | `service-jobs.ts:407-448`, `mobile-pos.ts:388`, `time-card-sessions.ts:46` |

### P3 — unfinished features

| # | Finding | Where |
|---|---|---|
| 12 | ✅ **FIXED (wired up)** — New `scheduledReportsScheduler` (hourly `trackedInterval`) finds due reports by frequency, builds the artifact (PDF via `htmlToPdf`, CSV fallback if Chromium absent) via the extracted `runReport` helper (`lib/report-run.ts`, shared with `POST /reports/run`), emails it to the recipient, and stamps `lastRunAt`. Registered in `index.ts`. **Verified end-to-end**: a due report ran on boot → "sent" + `lastRunAt` stamped. | `services/scheduledReportsScheduler.ts`, `lib/report-run.ts`, `index.ts` |
| 13 | ✅ **FIXED (wired up)** — `publishTwitter` posts text/link via X API v2 `/2/tweets` with automatic OAuth2 token refresh; `publishLinkedin` posts as the connected organization page via `/v2/ugcPosts`. Both read the live vault token (`twitter_x`/`linkedin_business`), never throw, and return structured `PublishResult`s. `/social/accounts/sync` now discovers X + LinkedIn destinations from the vault so `runPublish` finds them. (Image upload for X/LinkedIn is a documented follow-up; text/link posting works.) | `services/socialPublisher.ts`, `routes/social-media.ts` |
| 14 | KPI metric `upsell_rate` always computes `null`; social-feed page is a stub (documented); dead `ComingSoonCard` + `comingSoon` branches in import-export; 12 unused shadcn/ui components (incl. dead `toaster.tsx` — app uses sonner). | `kpi-calc.ts:534`, `management-marketing-social-feed.tsx`, `management-import-export.tsx:1393`, `components/ui/*` |
| 15 | Hardcoded one-merchant data patch runs on every boot (bounded/idempotent, but belongs in a migration). | `recurringInvoiceScheduler.ts:249-303` |

### P4 — performance

| # | Finding | Where |
|---|---|---|
| 16 | ✅ **FIXED** — Added a reusable `useDebounce` hook (`hooks/use-debounce.ts`, 250 ms) and applied it to Products, Customers, and both POS searches (product + customer), so the list query fires on pause instead of per keystroke. | `products.tsx`, `pos.tsx`, `customers.tsx` |
| 17 | **Partially fixed** — POS grid images are now `loading="lazy"` (was `eager`). Still open: virtualising the up-to-1000-row Products & Transactions tables and memoising POS tiles. | `products.tsx:2046`, `transactions.tsx:278`, `pos.tsx:3116-3129` |
| 18 | ✅ **Mostly fixed** — Warranty-expiring now bounds the transaction scan to sales at most `maxWarranty` old (was ALL history). Birthday now pushes today's MM-DD match into SQL (exact string match on the text DOB column). Anniversary still filters in JS (createdAt is a timestamp; a safe SQL bound would need explicit UTC handling — left as-is). | `marketingAutomationScheduler.ts` |
| 19 | **N+1 in schedulers**: KPI reset runs ~11 queries per KPI per hour across all merchants; new-product automation queries per product×customer pair. | `kpiResetScheduler.ts:85-132`, `marketingAutomationScheduler.ts:298` |
| 20 | Dashboard calendar fetches all customers (all columns) to match birthdays in JS; missing indexes: `time_card_sessions.merchantId`, partial index for the payment-attempts expiry sweep; all 12 schedulers fire simultaneously at boot with no jitter. | `dashboard.ts:839`, schema files, `services/*Scheduler.ts` |

## Verified clean (worth knowing)

- **Money core is solid**: POS sale finalisation is atomic + idempotent (row locks,
  `FOR UPDATE SKIP LOCKED`, unique idempotency index); invoice payments are the
  reference implementation; restore wraps wipe+repopulate in one transaction.
- **Webhook crypto correct** (Zip/Afterpay/Klarna): per-merchant vault secrets,
  `crypto.timingSafeEqual`, HMAC verified before any state change.
- **Token vault**: AES-256-GCM + PBKDF2, guarded dev fallback, safe key rotation.
- **Staff password auth**: bcrypt, `session.regenerate`, hashed single-use reset
  tokens with expiry, rate limits, no user enumeration.
- **Tenant isolation**: every checked route scopes by `merchantId`; tech app adds a
  cross-tenant privacy wall; `accountSync` even guards SSRF on pagination links.
- **Sessions**: Postgres-backed (not MemoryStore), correct `trust proxy`, secure
  cookies in prod, CORS allow-list, fail-fast boot guards, schema-drift check.
- **Boolean-as-text convention**: no truthy-`"false"` bugs found on money paths.
- **No dangling references** to removed QuickBooks/MYOB code. No dead routes.
- All schedulers guard their intervals against unhandled rejections.

## Suggested fix order — progress

1. ✅ Refund/void reversal + layby idempotency (money drift, real merchant impact).
2. ✅ Unique indexes on document numbers (duplicate scan clean) + retry-on-conflict.
3. ✅ Mass-assignment strip (`stripManagedFields` applied to all 9 upserts).
4. ✅ Search debounce + POS image lazy-loading. (Table virtualisation from #17 still open.)
5. ✅ helmet + graceful shutdown; PIN hashing; public-dashboard token — all done + migrated.
6. ✅ Marketing scheduler query bounds (warranty + birthday) + failed-send retry semantics.
7. ✅ Wired up scheduled reports (#12, verified e2e) and X/LinkedIn text/link
   posting (#13). Remaining follow-up: image/video upload for X + LinkedIn.

### Still open (not in the fix order above)
- #11 low-severity hardening (unescaped service-job email interpolation, mobile-POS
  `/sale` trusting client prices, time-card FK validation).
- #14 dead code / unused components / `upsell_rate` always null.
- #15 hardcoded one-merchant boot patch → migration.
- #17 remainder: virtualise the 1000-row Products/Transactions tables, memoise POS tiles.
- #19, #20 scheduler N+1s, dashboard calendar all-customers fetch, missing indexes,
  scheduler boot jitter.
