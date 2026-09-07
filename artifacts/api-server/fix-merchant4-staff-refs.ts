/**
 * Repairs staff references the merchant-4 restore left behind.
 *
 * restore-merchant4.ts / restore-merchant4-prod.ts shift merchant 4's primary
 * keys and foreign keys by +1,000,000. The shift follows DECLARED foreign keys,
 * and `staff_id` carries no FK constraint on any table — so merchant 4's staff
 * rows landed at 1000007/1000008 while every row referencing them kept the
 * pre-restore ids 7/8, which belong to no staff member at all. The effect is a
 * blank staff name on those bookings and sales, and staff-scoped reports and
 * filters silently missing them.
 *
 * The repair is `staff_id += 1,000,000`, scoped to merchant 4, applied only to
 * values below the offset. It rewrites nothing but those broken pointers: no
 * row is inserted or deleted, and no other column is read or written. Every
 * target is checked to exist in `staff` for merchant 4 before anything is
 * written, and the whole thing runs in one transaction that rolls back unless
 * DO_COMMIT=1 — so a dry run is the default and shows exactly what would change.
 *
 *   pnpm --filter @workspace/api-server exec tsx fix-merchant4-staff-refs.ts
 *   DO_COMMIT=1 pnpm --filter @workspace/api-server exec tsx fix-merchant4-staff-refs.ts
 */
import { pool } from "@workspace/db";

const MERCHANT_ID = 4;
const OFFSET = 1_000_000;
const DO_COMMIT = process.env.DO_COMMIT === "1";

/** Tables that reference staff and are scoped to a merchant. */
const TABLES = [
  "appointments",
  "transactions",
  "pos_staff_sessions",
  "tech_app_events",
  "void_audit_log",
] as const;

async function main(): Promise<void> {
  const client = await pool.connect();
  let changed = 0;

  try {
    await client.query("BEGIN");

    // Which staff ids exist for this merchant — every repaired pointer must
    // land on one of these, or the mapping assumption is wrong and we stop.
    const { rows: staffRows } = await client.query<{ id: number; name: string }>(
      `SELECT id, name FROM staff WHERE merchant_id = $1 ORDER BY id`,
      [MERCHANT_ID],
    );
    const staffIds = new Set(staffRows.map((s) => s.id));
    console.log(`Staff for merchant ${MERCHANT_ID}:`);
    for (const s of staffRows) console.log(`  ${s.id}  ${s.name}`);
    console.log("");

    for (const table of TABLES) {
      const { rows: broken } = await client.query<{ staff_id: number; n: string }>(
        `SELECT staff_id, count(*)::text AS n
           FROM ${table}
          WHERE merchant_id = $1 AND staff_id IS NOT NULL AND staff_id < $2
          GROUP BY staff_id ORDER BY staff_id`,
        [MERCHANT_ID, OFFSET],
      );

      if (broken.length === 0) {
        console.log(`${table}: nothing to repair`);
        continue;
      }

      for (const b of broken) {
        const target = b.staff_id + OFFSET;
        if (!staffIds.has(target)) {
          throw new Error(
            `${table}: staff_id ${b.staff_id} would map to ${target}, which is not a staff row ` +
            `for merchant ${MERCHANT_ID}. Refusing to write — the mapping needs checking by hand.`,
          );
        }
        console.log(`${table}: ${b.n} row(s)  staff_id ${b.staff_id} -> ${target}`);
      }

      const res = await client.query(
        `UPDATE ${table} SET staff_id = staff_id + $2
          WHERE merchant_id = $1 AND staff_id IS NOT NULL AND staff_id < $2`,
        [MERCHANT_ID, OFFSET],
      );
      changed += res.rowCount ?? 0;
    }

    // Verify: no merchant-4 row may still point at a missing staff member.
    console.log("");
    for (const table of TABLES) {
      const { rows: [{ n }] } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${table} x
          WHERE x.merchant_id = $1 AND x.staff_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = x.staff_id)`,
        [MERCHANT_ID],
      );
      if (Number(n) > 0) throw new Error(`${table}: ${n} dangling staff_id remain after repair`);
      console.log(`${table}: verified — no dangling staff_id`);
    }

    if (DO_COMMIT) {
      await client.query("COMMIT");
      console.log(`\nCOMMITTED — ${changed} row(s) repaired.`);
    } else {
      await client.query("ROLLBACK");
      console.log(`\nDry run — ${changed} row(s) would be repaired. Nothing was written.`);
      console.log("Re-run with DO_COMMIT=1 to apply.");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\nRolled back — nothing was written.");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
