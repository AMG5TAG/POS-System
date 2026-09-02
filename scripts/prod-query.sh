#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# prod-query.sh — run a READ-ONLY query against the production Neon database.
#
# This is the only sanctioned path for an agent to read production. It cannot
# reach the owner credential: the role, host and database are fixed below, and
# the password is never accepted as an argument — it comes from ~/.pgpass (or
# PROD_DATABASE_URL_RO). `claude_ro` holds SELECT and nothing else, so a write
# is refused by the server, not merely discouraged here.
#
#   scripts/prod-query.sh "SELECT count(*) FROM merchants"
#   scripts/prod-query.sh --csv "SELECT id, name FROM merchants LIMIT 5"
#   echo "SELECT now()" | scripts/prod-query.sh
#
# Production holds real customer PII. Prefer aggregates over row dumps, and
# select only the columns you actually need.
# ---------------------------------------------------------------------------
set -euo pipefail

RO_USER=claude_ro
RO_HOST=ep-purple-brook-aqu9hzmd.c-8.us-east-1.aws.neon.tech
RO_PORT=5432
RO_DB=neondb

fmt=(); if [ "${1:-}" = "--csv" ]; then fmt=(--csv); shift; fi

if [ $# -gt 0 ]; then sql="$*"; else sql="$(cat)"; fi
[ -n "${sql//[[:space:]]/}" ] || { echo "usage: prod-query.sh [--csv] \"SELECT ...\"" >&2; exit 2; }

# Belt and braces on top of the role's own grants.
export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=30s -c idle_in_transaction_session_timeout=60s"
export PGCONNECT_TIMEOUT=15

url="postgresql://${RO_USER}@${RO_HOST}:${RO_PORT}/${RO_DB}?sslmode=require"

# Refuse to proceed if we are not who we expect to be.
who="$(psql "$url" -Atc 'SELECT current_user' 2>/dev/null || true)"
if [ "$who" != "$RO_USER" ]; then
  echo "refusing to run: connected as '${who:-<failed>}', expected '$RO_USER'" >&2
  echo "(is ~/.pgpass set up? run setup-pgpass.sh)" >&2
  exit 1
fi

exec psql "$url" -v ON_ERROR_STOP=1 "${fmt[@]}" -c "$sql"
