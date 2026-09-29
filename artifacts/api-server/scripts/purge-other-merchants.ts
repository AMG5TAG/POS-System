/**
 * purge-other-merchants — permanently delete every merchant account except the
 * one this single-business install runs (see src/lib/sole-merchant.ts), along
 * with every row those accounts own.
 *
 * NOT REVERSIBLE. Take a backup first (pg_dump, or a Neon branch/restore point
 * for production). Nothing here copies the deleted rows anywhere.
 *
 * Safety properties:
 *   1. assertExpectedEnv() — refuses to run unless EXPECTED_DB names the database
 *      DATABASE_URL points at.
 *   2. The kept account is named twice, by id AND email, and both must match the
 *      same row, so a wrong id cannot silently make the real business the victim.
 *   3. Dry-run by default: every delete runs inside one transaction, the result is
 *      verified, and the transaction is rolled back unless --commit is passed.
 *   4. Verification inside the transaction: no row anywhere may still belong to a
 *      deleted account, exactly one merchant must remain, and the delete-protection
 *      trigger must be back on. Any failure rolls everything back.
 *
 * The `no_delete_merchants` trigger (scripts/src/protect-merchant-accounts.ts)
 * forbids deleting merchants; it is disabled only inside this transaction, so a
 * rollback — or a crash — leaves it exactly as it was.
 *
 * Usage:
 *   EXPECTED_DB=development pnpm --filter @workspace/api-server run purge-other-merchants \
 *       --keep 4 --keep-email admin@koastal.com.au            # dry run
 *   ... same ... --commit                                     # really delete
 */
import { parseArgs } from "node:util";
import { getTableColumns } from "drizzle-orm";
import { pool } from "@workspace/db";
import { assertExpectedEnv, databaseFingerprint } from "../src/lib/db-env-guard";
import { getDeleteOrderedTables } from "../src/lib/backup-tables";

function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    keep: { type: "string" },
    "keep-email": { type: "string" },
    commit: { type: "boolean", default: false },
  },
});

const keep = Number(values.keep);
if (!Number.isInteger(keep) || keep <= 0) fail("--keep <merchantId> is required");
const keepEmail = (values["keep-email"] ?? "").trim().toLowerCase();
if (!keepEmail) fail("--keep-email <email> is required (must match the --keep row)");
const commit = values.commit;

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function main() {
  const env = assertExpectedEnv();
  const host = new URL(process.env.DATABASE_URL!).host;
  console.log(`Database: ${env} — ${host} (fingerprint ${databaseFingerprint()})`);
  console.log(commit ? "MODE: COMMIT — rows will be permanently deleted\n" : "MODE: dry run — everything is rolled back\n");

  const client = await pool.connect();
  const removed: Array<[string, number]> = [];
  const note = (what: string, n: number | null) => { if (n) removed.push([what, n]); };

  try {
    await client.query("BEGIN");

    const { rows: kept } = await client.query<{ id: number; email: string; business_name: string }>(
      "SELECT id, email, business_name FROM merchants WHERE id = $1", [keep],
    );
    if (kept.length !== 1 || kept[0].email.trim().toLowerCase() !== keepEmail) {
      throw new Error(`merchant ${keep} is not ${keepEmail} — refusing to touch anything`);
    }
    console.log(`KEEPING  #${kept[0].id}  ${kept[0].email}  (${kept[0].business_name})`);

    const { rows: doomed } = await client.query<{ id: number; email: string; business_name: string }>(
      "SELECT id, email, business_name FROM merchants WHERE id <> $1 ORDER BY id", [keep],
    );
    for (const m of doomed) console.log(`DELETING #${m.id}  ${m.email}  (${m.business_name})`);
    if (doomed.length === 0) {
      console.log("\nNothing to delete.");
      await client.query("ROLLBACK");
      return;
    }
    const doomedEmails = doomed.map((m) => m.email.trim().toLowerCase());
    console.log("");

    // Every table carrying an owning merchant column, straight from the database
    // (not the Drizzle schema), so nothing created outside Drizzle is missed.
    const { rows: ownedCols } = await client.query<{ table_name: string; column_name: string }>(`
      SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
       WHERE c.table_schema = 'public' AND c.column_name IN ('merchant_id', 'referrer_merchant_id')`);
    const owned = new Map(ownedCols.map((r) => [r.table_name, r.column_name]));

    // 1. Child tables with no merchant column of their own (purchase_order_items,
    //    layby_payments, …): delete the rows whose parent belongs to a doomed account.
    const { rows: childFks } = await client.query<{ child: string; ccol: string; parent: string; pcol: string }>(`
      SELECT con.conrelid::regclass::text AS child,
             (SELECT attname FROM pg_attribute WHERE attrelid = con.conrelid  AND attnum = con.conkey[1])  AS ccol,
             con.confrelid::regclass::text AS parent,
             (SELECT attname FROM pg_attribute WHERE attrelid = con.confrelid AND attnum = con.confkey[1]) AS pcol
        FROM pg_constraint con
       WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
         AND array_length(con.conkey, 1) = 1`);
    for (const fk of childFks) {
      if (owned.has(fk.child) || fk.child === "merchants") continue;
      const pOwner = owned.get(fk.parent);
      if (!pOwner) continue;
      const r = await client.query(
        `DELETE FROM ${ident(fk.child)} x USING ${ident(fk.parent)} p
          WHERE x.${ident(fk.ccol)} = p.${ident(fk.pcol)} AND p.${ident(pOwner)} <> $1`, [keep],
      );
      note(`${fk.child} (via ${fk.parent})`, r.rowCount);
    }

    // 2. Merchant-owned tables, child-first (the order account deletion and
    //    restore already use), then anything that order does not know about.
    const done = new Set<string>();
    for (const t of getDeleteOrderedTables()) {
      const col = (getTableColumns(t.table) as Record<string, { name: string }>)[t.merchantColKey].name;
      const r = await client.query(`DELETE FROM ${ident(t.name)} WHERE ${ident(col)} <> $1`, [keep]);
      note(t.name, r.rowCount);
      done.add(t.name);
    }
    for (const [table, col] of owned) {
      if (done.has(table)) continue;
      const r = await client.query(`DELETE FROM ${ident(table)} WHERE ${ident(col)} <> $1`, [keep]);
      note(table, r.rowCount);
    }

    // 3. Login sessions and lockout counters of the deleted accounts.
    const s = await client.query(
      `DELETE FROM session
        WHERE COALESCE(sess->>'merchantId', sess->'tech'->>'merchantId', sess->'mpos'->>'merchantId') <> $1::text`,
      [keep],
    );
    note("session", s.rowCount);
    const la = await client.query("DELETE FROM login_attempts WHERE lower(email) = ANY($1::text[])", [doomedEmails]);
    note("login_attempts", la.rowCount);

    // 4. The merchant rows themselves, past the delete-protection trigger.
    const { rows: trig } = await client.query(
      "SELECT 1 FROM pg_trigger WHERE tgrelid = 'merchants'::regclass AND tgname = 'no_delete_merchants'",
    );
    if (trig.length) await client.query("ALTER TABLE merchants DISABLE TRIGGER no_delete_merchants");
    const m = await client.query("DELETE FROM merchants WHERE id <> $1", [keep]);
    note("merchants", m.rowCount);
    if (trig.length) await client.query("ALTER TABLE merchants ENABLE TRIGGER no_delete_merchants");

    // 5. Verify before deciding anything.
    for (const [table, col] of owned) {
      const r = await client.query(`SELECT count(*)::int AS n FROM ${ident(table)} WHERE ${ident(col)} <> $1`, [keep]);
      if (r.rows[0].n !== 0) throw new Error(`verification failed: ${table} still has ${r.rows[0].n} row(s) of other accounts`);
    }
    const left = await client.query("SELECT id FROM merchants");
    if (left.rows.length !== 1 || left.rows[0].id !== keep) throw new Error("verification failed: merchants table is not exactly the kept account");
    if (trig.length) {
      const t = await client.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'merchants'::regclass AND tgname = 'no_delete_merchants'");
      if (t.rows[0]?.tgenabled !== "O") throw new Error("verification failed: delete-protection trigger is not re-enabled");
    }

    removed.sort((a, b) => b[1] - a[1]);
    console.log("Rows removed:");
    for (const [what, n] of removed) console.log(`  ${String(n).padStart(6)}  ${what}`);
    console.log(`  ${String(removed.reduce((a, [, n]) => a + n, 0)).padStart(6)}  TOTAL`);
    console.log("\nVerified: no rows of other accounts remain; 1 merchant left; delete protection back on.");

    if (commit) {
      await client.query("COMMIT");
      console.log("\nCOMMITTED.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDry run — rolled back. Nothing was changed. Re-run with --commit to delete.");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(`\nABORTED (rolled back): ${(e as Error).message}`); process.exit(1); });
