#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/scripts run backfill-cost-prices
pnpm --filter db push
pnpm --filter @workspace/scripts run setup-report-views
pnpm --filter @workspace/scripts run seed-product-types
