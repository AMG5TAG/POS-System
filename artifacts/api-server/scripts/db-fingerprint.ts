/**
 * db-fingerprint — print the fingerprint of the database DATABASE_URL points at.
 *
 * The fingerprint locks an environment to one database: set it as
 * DB_FINGERPRINT_DEVELOPMENT / DB_FINGERPRINT_PRODUCTION and transfer-merchant
 * refuses to run if DATABASE_URL ever points somewhere else (see db-env-guard).
 *
 * Without this the only thing that prints a fingerprint is transfer-merchant
 * itself — a destructive tool needing BK_PASS and a target merchant — so the
 * value you need in order to make the guard strict was only obtainable by
 * running the thing the guard exists to protect you from.
 *
 * Read-only and offline: the fingerprint is a hash of the connection's host and
 * database name, so this never opens a connection and never prints a secret.
 *
 *   pnpm --filter @workspace/api-server run db-fingerprint
 */
import { databaseFingerprint } from "../src/lib/db-env-guard";

function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set — nothing to fingerprint.");
    process.exit(1);
  }

  const fp = databaseFingerprint(url);
  // Host and database name only: the rest of the URL carries the credential.
  const { host, pathname } = new URL(url);

  console.log(`database   : ${host}${pathname}`);
  console.log(`fingerprint: ${fp}`);
  console.log("");
  console.log("Lock this environment to that database by setting ONE of:");
  console.log(`  DB_FINGERPRINT_DEVELOPMENT=${fp}`);
  console.log(`  DB_FINGERPRINT_PRODUCTION=${fp}`);
}

main();
