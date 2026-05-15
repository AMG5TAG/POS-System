# KoaPOS

A subscription-based Point of Sale system for Australian retail merchants. Clean, tablet/mobile-ready UI with a modular add-on marketplace.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080 dev, proxied at /api)
- `pnpm --filter @workspace/koapos run dev` — run the React frontend (port from env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build composite libs (run after changing lib/* code)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS v4 + shadcn/ui, wouter routing, TanStack Query
- API: Express 5 (artifact: `artifacts/api-server`, port 8080)
- Auth: Custom session auth using `express-session` + `bcryptjs`
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`, generated Zod schemas from OpenAPI
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle for API)

## Where things live

- `lib/db/src/schema/` — Drizzle schema (merchants, products, customers, transactions, staff)
- `lib/api-spec/openapi.yaml` — Source of truth for API contract
- `lib/api-client-react/src/` — Generated React Query hooks (do not edit)
- `lib/api-zod/src/` — Generated Zod schemas for server-side validation (do not edit)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, merchants, plans, products, customers, transactions, staff, inventory, dashboard)
- `artifacts/api-server/src/middlewares/requireAuth.ts` — Session auth middleware
- `artifacts/koapos/src/pages/` — React pages (marketing + authenticated app pages)
- `artifacts/koapos/src/lib/auth.tsx` — AuthProvider and useAuth hook

## Architecture decisions

- Session-based auth (not JWT): express-session with `SESSION_SECRET` env var. Cookies use `credentials: 'include'` in the custom fetch.
- Contract-first API: OpenAPI spec → Orval codegen → React Query hooks + Zod validators. Route handlers import Zod validators from `@workspace/api-zod`.
- All numeric DB fields (price, total, etc.) stored as `numeric` in Postgres and returned as `parseFloat()` in route handlers.
- Boolean fields stored as text `"true"/"false"` in Postgres (Drizzle limitation with text columns used for booleans).
- `credentials: 'include'` added to `lib/api-client-react/src/custom-fetch.ts` so session cookies flow through the Replit proxy.

## Product

- **Landing / Pricing / Register / Login** — public marketing pages
- **Dashboard** — analytics with sales chart, top products, summary KPIs
- **POS Register** — product grid + cart + payment modal (card/cash/split)
- **Products** — CRUD with categories, inventory tracking, SKU, pricing
- **Customers** — CRM with loyalty points, total spent, visit count
- **Transactions** — history with receipt viewer and refund capability
- **Inventory** — stock level management with low-stock alerts
- **Staff** — team management with roles and PIN support
- **Modules** — enable/disable add-on modules (11 available)
- **Settings** — business details, regional settings

## Seeded demo data

- Merchant: `demo@koapos.com` / `password123` (Growth plan)
- Products: 7 items across 3 categories (Beverages, Snacks, Electronics)
- Customers: 2 (Sarah Johnson, Mike Chen)
- Staff: 2 (Alex Taylor - owner, Jamie Nguyen - cashier)
- Transactions: 5 completed sales

## Gotchas

- Always run `pnpm run typecheck:libs` after changing any file in `lib/` before running the API server typecheck.
- Do NOT run `pnpm dev` at the workspace root — use `restart_workflow` instead.
- CORS is configured with `origin: true, credentials: true` — both are required for session cookies to work.
- After changing `lib/api-client-react/src/custom-fetch.ts`, rebuild libs with `pnpm run typecheck:libs`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
