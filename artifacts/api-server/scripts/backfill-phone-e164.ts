/**
 * backfill-phone-e164 — rewrite phone numbers already in the database into
 * E.164, so historic records match what the app now stores on every save.
 *
 * "0412 345 678" becomes "+61412345678", using each merchant's own default
 * phone country (merchants.defaultPhoneCountry, Australia when unset) — the
 * same resolution the API uses at write time.
 *
 * WHAT IT CHANGES — this one overwrites values a merchant typed:
 *   customers.phone, staff.phone, suppliers.phone, locations.phone,
 *   delivery_orders.phone, merchants.phone
 *
 * SAFETY:
 *   - Dry-run by DEFAULT: every write happens inside a transaction that is
 *     rolled back unless --commit is passed.
 *   - Only rewrites a value `normalisePhone` is confident about. Anything with
 *     words in it ("0412 345 678 ext 12", "ask for Dave"), anything too short or
 *     too long, and anything already in E.164 is left exactly as it is.
 *   - Idempotent: a second run finds nothing to do.
 *   - Prints the DB host it's connected to so you can't backfill the wrong DB.
 *
 * NOT REVERSIBLE. The pre-backfill string is kept nowhere, so take a backup of
 * the tables above before a --commit run against production.
 *
 * Usage:
 *   # dry-run against dev (DATABASE_URL)
 *   pnpm exec tsx scripts/backfill-phone-e164.ts
 *   # dry-run against production (rolled back)
 *   DATABASE_URL="$PROD_DATABASE_URL" pnpm exec tsx scripts/backfill-phone-e164.ts
 *   # COMMIT against production
 *   DATABASE_URL="$PROD_DATABASE_URL" pnpm exec tsx scripts/backfill-phone-e164.ts --commit
 *
 * Optional: --merchant <id> to limit to one merchant.
 */
import { parseArgs } from "node:util";
import {
  db, pool, merchantsTable, customersTable, staffTable, suppliersTable,
  locationsTable, deliveryOrdersTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  normalisePhone, resolvePhoneCountry, type PhoneCountry,
} from "@workspace/phone-shared";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Every table holding a number a person typed. Each entry carries its own read
 * and its own write, so both stay typed against that table — and so the write
 * runs on the transaction handle rather than on `db`, which is what makes the
 * dry-run rollback real rather than decorative.
 */
const TARGETS = [
  {
    name: "customers",
    read: () => db.select({ id: customersTable.id, merchantId: customersTable.merchantId, phone: customersTable.phone }).from(customersTable),
    write: (tx: Tx, id: number, phone: string) => tx.update(customersTable).set({ phone }).where(eq(customersTable.id, id)),
  },
  {
    name: "staff",
    read: () => db.select({ id: staffTable.id, merchantId: staffTable.merchantId, phone: staffTable.phone }).from(staffTable),
    write: (tx: Tx, id: number, phone: string) => tx.update(staffTable).set({ phone }).where(eq(staffTable.id, id)),
  },
  {
    name: "suppliers",
    read: () => db.select({ id: suppliersTable.id, merchantId: suppliersTable.merchantId, phone: suppliersTable.phone }).from(suppliersTable),
    write: (tx: Tx, id: number, phone: string) => tx.update(suppliersTable).set({ phone }).where(eq(suppliersTable.id, id)),
  },
  {
    name: "locations",
    read: () => db.select({ id: locationsTable.id, merchantId: locationsTable.merchantId, phone: locationsTable.phone }).from(locationsTable),
    write: (tx: Tx, id: number, phone: string) => tx.update(locationsTable).set({ phone }).where(eq(locationsTable.id, id)),
  },
  {
    name: "delivery_orders",
    read: () => db.select({ id: deliveryOrdersTable.id, merchantId: deliveryOrdersTable.merchantId, phone: deliveryOrdersTable.phone }).from(deliveryOrdersTable),
    write: (tx: Tx, id: number, phone: string) => tx.update(deliveryOrdersTable).set({ phone }).where(eq(deliveryOrdersTable.id, id)),
  },
  {
    name: "merchants",
    read: () => db.select({ id: merchantsTable.id, merchantId: merchantsTable.id, phone: merchantsTable.phone }).from(merchantsTable),
    write: (tx: Tx, id: number, phone: string) => tx.update(merchantsTable).set({ phone }).where(eq(merchantsTable.id, id)),
  },
];

/**
 * A one-line description of how a number was typed — "10 digits, leading 0" —
 * so a thousand rewrites collapse into the few shapes actually present. Two rows
 * share a shape only if the same reasoning converts them, which is what makes
 * the grouped output a real review rather than a spot check.
 */
function describeShape(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const parts: string[] = [`${digits.length} digits`];
  if (raw.trim().startsWith("+")) parts.push("leading +");
  else if (digits.startsWith("00")) parts.push("00 intl prefix");
  else if (digits.startsWith("0")) parts.push("leading 0");
  else parts.push("no trunk prefix");
  if (/[()\s.-]/.test(raw.trim())) parts.push("separators");
  if (raw !== raw.trim()) parts.push("whitespace");
  return parts.join(", ");
}

function tally(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { commit: { type: "boolean", default: false }, merchant: { type: "string" } },
  });
  const commit = values.commit === true;
  const onlyMerchant = values.merchant ? Number(values.merchant) : null;

  const [{ host }] = (await db.execute(sql`SELECT inet_server_addr()::text AS host`)).rows as { host: string | null }[];
  const dbHost = process.env.DATABASE_URL?.replace(/^.*@/, "").replace(/\/.*$/, "") ?? "(unknown)";
  console.log(`DB: ${dbHost}  (server addr: ${host ?? "n/a"})`);
  console.log(commit ? "MODE: COMMIT (writes will be applied)" : "MODE: DRY-RUN (rolled back)\n");

  // Each merchant's own default, resolved once — the same way the API resolves
  // it on a save, so the backfill can't produce numbers the app wouldn't.
  const merchants = await db
    .select({ id: merchantsTable.id, defaultPhoneCountry: merchantsTable.defaultPhoneCountry })
    .from(merchantsTable);

  const countryOf = new Map<number, PhoneCountry>(
    merchants.map((m) => [m.id, resolvePhoneCountry(m.defaultPhoneCountry)]),
  );
  console.log(`Merchants: ${merchants.length}`);
  for (const [label, n] of tally([...countryOf.values()].map((c) => `${c.code} (+${c.dial})`))) {
    console.log(`  ${label}: ${n}`);
  }
  console.log();

  const planned: { target: (typeof TARGETS)[number]; id: number; next: string }[] = [];
  const samples: string[] = [];
  const shapes = new Map<string, { count: number; example: { from: string; to: string } }>();
  let untouched = 0;

  for (const t of TARGETS) {
    const rows = await t.read();
    let changed = 0;
    for (const r of rows) {
      if (onlyMerchant && r.merchantId !== onlyMerchant) continue;
      const country = countryOf.get(r.merchantId);
      if (!country || !r.phone || !r.phone.trim()) continue;

      const next = normalisePhone(r.phone, country);
      if (next === r.phone) { untouched++; continue; }

      changed++;
      if (samples.length < 25) samples.push(`  ${t.name} #${r.id}: "${r.phone}" → "${next}"`);
      const shape = describeShape(r.phone);
      const g = shapes.get(shape);
      if (g) g.count++;
      else shapes.set(shape, { count: 1, example: { from: r.phone, to: next } });
      planned.push({ target: t, id: r.id, next });
    }
    console.log(`${t.name}: ${rows.length} rows, ${changed} to rewrite`);
  }

  console.log(`\nTo rewrite: ${planned.length}   Already correct or deliberately left alone: ${untouched}`);

  /* A sample of 25 out of a thousand tells you the common case looks right and
     nothing about the unusual ones, which are the whole risk. Group every
     rewrite by the *shape* of what was typed instead, so a run can be reviewed
     in full: a handful of lines covers every row, and anything strange shows up
     as its own line with a real example rather than hiding in the tail. */
  if (shapes.size) {
    console.log("\nEvery rewrite, grouped by the shape of what was typed:");
    for (const [shape, g] of [...shapes.entries()].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`  ${String(g.count).padStart(5)} ×  ${shape.padEnd(34)} e.g. "${g.example.from}" → "${g.example.to}"`);
    }
  }
  if (samples.length) console.log("\nSample rewrites:\n" + samples.join("\n"));

  if (planned.length === 0) { console.log("\nNothing to do."); return; }

  await db.transaction(async (tx) => {
    for (const p of planned) await p.target.write(tx, p.id, p.next);
    if (!commit) {
      console.log(`\nDRY-RUN: rolling back ${planned.length} updates. Re-run with --commit to apply.`);
      throw new Error("__dry_run_rollback__");
    }
    console.log(`\nCOMMITTED ${planned.length} phone number rewrites.`);
  }).catch((e) => { if ((e as Error).message !== "__dry_run_rollback__") throw e; });
}

main()
  .catch((err) => { console.error("backfill failed:", err); process.exitCode = 1; })
  .finally(() => pool.end());
