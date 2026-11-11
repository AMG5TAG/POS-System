#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# prod-db-push.sh — run the `db:push` chain against PRODUCTION, guarded.
#
#   scripts/prod-db-push.sh            # preview only: lists what drizzle-kit
#                                      # push would change, writes nothing
#   scripts/prod-db-push.sh --commit   # preview, then run the full chain
#
# `pnpm run db:push` has one step that can destroy data: `drizzle-kit push`,
# which reconciles the live schema to lib/db and will offer to DROP tables and
# columns the code no longer declares (CLAUDE.md: tyro_settings and the other
# RETAINED tables). It also needs a TTY to ask, so it cannot run from an agent.
#
# This script previews that step first (`--strict --verbose` prints every
# statement, then stops at the approval prompt because there is no TTY, so the
# preview executes nothing) and refuses to continue if any statement could lose
# rows or columns. Only when the list is clean does it run the chain with that
# one step as `push-force`, i.e. applying exactly the statements it just showed.
# Every other step is the project's own idempotent add-*/seed/backfill scripts.
#
# Dropping an index or a constraint is allowed: no data is lost, and the
# add-* scripts later in the chain recreate the indexes they own.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMIT=0
[ "${1:-}" = "--commit" ] && COMMIT=1

[ -n "${PROD_DATABASE_URL:-}" ] || { echo "PROD_DATABASE_URL is not set" >&2; exit 2; }
HOST="$(node -e 'console.log(new URL(process.argv[1]).host)' "$PROD_DATABASE_URL")"
echo "Target database: $HOST"

# Replit sets PG* for a different database, and libpq prefers PGPASSWORD.
unset PGHOST PGUSER PGPASSWORD PGDATABASE PGPORT
export DATABASE_URL="$PROD_DATABASE_URL"

# ── 1. Preview the drizzle-kit push step ───────────────────────────────────
PREVIEW="$(cd "$ROOT/lib/db" && timeout 180 npx drizzle-kit push --config ./drizzle.config.ts --strict --verbose < /dev/null 2>&1 || true)"
PREVIEW="$(printf '%s\n' "$PREVIEW" | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' | grep -v 'Pulling schema')"

if printf '%s\n' "$PREVIEW" | grep -qi "no changes detected"; then
  STATEMENTS=""
  echo "drizzle-kit push: no schema changes."
elif printf '%s\n' "$PREVIEW" | grep -q "You are about to execute"; then
  STATEMENTS="$(printf '%s\n' "$PREVIEW" | sed -n '/You are about to execute/,$p' | grep -E ';\s*$' || true)"
  echo "drizzle-kit push would run:"
  printf '%s\n' "$STATEMENTS" | sed 's/^/  /'
else
  echo "Could not read the drizzle-kit preview — refusing to continue. Output:" >&2
  printf '%s\n' "$PREVIEW" | tail -40 >&2
  exit 1
fi

# ── 2. Refuse anything that can lose data ──────────────────────────────────
DANGER='DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|DROP SCHEMA|DROP VIEW|DROP TYPE|ALTER COLUMN [^ ]+ (SET DATA )?TYPE|RENAME (TO|COLUMN)'
if printf '%s\n' "$STATEMENTS" | grep -Eiq "$DANGER" \
   || printf '%s\n' "$PREVIEW" | grep -Eiq 'data loss|truncate'; then
  echo >&2
  echo "REFUSED: the push would drop, truncate, retype or rename existing data:" >&2
  printf '%s\n' "$STATEMENTS" | grep -Ei "$DANGER" | sed 's/^/  /' >&2 || true
  echo "Nothing was changed. Resolve this by hand (see CLAUDE.md on RETAINED tables)." >&2
  exit 1
fi

if [ "$COMMIT" -ne 1 ]; then
  echo
  echo "Preview only — nothing was changed. Re-run with --commit to apply."
  exit 0
fi

# ── 3. Run the full chain, with the push step non-interactive ──────────────
CHAIN="$(node -e 'console.log(require(process.argv[1]).scripts["db:push"])' "$ROOT/package.json")"
case "$CHAIN" in
  *"pnpm --filter @workspace/db run push "*) ;;
  *) echo "db:push no longer contains the expected push step — refusing." >&2; exit 1 ;;
esac
CHAIN="${CHAIN/pnpm --filter @workspace\/db run push /pnpm --filter @workspace/db run push-force }"

echo
echo "Running db:push against $HOST …"
cd "$ROOT"
sh -c "$CHAIN"
echo "db:push finished against $HOST."
