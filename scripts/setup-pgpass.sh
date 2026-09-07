#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-pgpass.sh — store the claude_ro password in ~/.pgpass so prod-query.sh
# can connect. Run once per machine; ~/.pgpass does not survive a rebuilt home
# directory, so expect to run it again after one.
#
#   scripts/setup-pgpass.sh                            # prompts, input hidden
#   CLAUDE_RO_PASSWORD=... scripts/setup-pgpass.sh     # non-interactive
#
# The password is never taken as an argument: argv is readable from /proc and
# lands in shell history. This script only stores it — creating the role stays a
# manual operator task, because it needs the owner credential. That SQL is:
#
#   CREATE ROLE claude_ro LOGIN PASSWORD '<pw>';
#   ALTER ROLE claude_ro SET default_transaction_read_only = on;
#   ALTER ROLE claude_ro SET statement_timeout = '30s';
#   ALTER ROLE claude_ro SET idle_in_transaction_session_timeout = '60s';
#   GRANT CONNECT ON DATABASE neondb TO claude_ro;
#   GRANT USAGE ON SCHEMA public TO claude_ro;
#   GRANT SELECT ON ALL TABLES IN SCHEMA public TO claude_ro;
#   ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
#     GRANT SELECT ON TABLES TO claude_ro;
#
# That last statement is not optional: without it every db:push that adds a
# table leaves claude_ro unable to see it, which surfaces much later as a
# permission error on one table and reads like a broken script.
# ---------------------------------------------------------------------------
set -euo pipefail

RO_USER=claude_ro
RO_HOST=ep-purple-brook-aqu9hzmd.c-8.us-east-1.aws.neon.tech
RO_PORT=5432
RO_DB=neondb

if [ -n "${CLAUDE_RO_PASSWORD:-}" ]; then
  pw="$CLAUDE_RO_PASSWORD"
else
  [ -t 0 ] || { echo "no terminal to prompt on; set CLAUDE_RO_PASSWORD instead" >&2; exit 2; }
  read -r -s -p "password for ${RO_USER}@${RO_HOST}: " pw
  echo
fi
[ -n "$pw" ] || { echo "empty password — aborting" >&2; exit 2; }

umask 077
touch "$HOME/.pgpass"

# Replace only our own entry. A .pgpass may hold credentials for other hosts,
# and rewriting the whole file would silently drop them.
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
grep -v "^${RO_HOST}:${RO_PORT}:${RO_DB}:${RO_USER}:" "$HOME/.pgpass" > "$tmp" || true
printf '%s:%s:%s:%s:%s\n' "$RO_HOST" "$RO_PORT" "$RO_DB" "$RO_USER" "$pw" >> "$tmp"
cat "$tmp" > "$HOME/.pgpass"
chmod 600 "$HOME/.pgpass"

echo "~/.pgpass updated for ${RO_USER}@${RO_HOST}/${RO_DB}"
echo "verifying with prod-query.sh ..."
exec "$(dirname "$0")/prod-query.sh" "SELECT 'connected as ' || current_user"
