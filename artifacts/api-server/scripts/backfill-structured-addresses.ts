/**
 * backfill-structured-addresses — parse customers' legacy free-text `address`
 * into the structured billing fields (billingStreet/City/State/Postcode).
 *
 * SAFETY:
 *   - Non-destructive: only fills structured fields that are currently EMPTY, and
 *     never modifies the original free-text `address`.
 *   - Dry-run by DEFAULT (rolled back). Pass --commit to actually write.
 *   - Prints the DB host it's connected to so you can't backfill the wrong DB.
 *
 * Usage:
 *   # dry-run against dev (DATABASE_URL)
 *   pnpm exec tsx scripts/backfill-structured-addresses.ts
 *   # dry-run against production (read-only, rolled back)
 *   DATABASE_URL="$PROD_DATABASE_URL" pnpm exec tsx scripts/backfill-structured-addresses.ts
 *   # COMMIT against production
 *   DATABASE_URL="$PROD_DATABASE_URL" pnpm exec tsx scripts/backfill-structured-addresses.ts --commit
 *
 * Optional: --merchant <id> to limit to one merchant.
 */
import { parseArgs } from "node:util";
import { db, pool, customersTable } from "@workspace/db";
import { and, eq, isNotNull, ne, or, isNull, sql } from "drizzle-orm";

const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];

interface Parsed { street: string; city: string; state: string; postcode: string }

/** Best-effort parse of an Australian free-text address into structured parts. */
function parseAuAddress(raw: string): Parsed {
  const out: Parsed = { street: "", city: "", state: "", postcode: "" };
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return out;

  // Trailing 4-digit postcode ONLY — strip it by index so a house number earlier
  // in the string isn't removed, and don't grab mid-string 4-digit house numbers.
  const pc = s.match(/\b(\d{4})\b\s*$/);
  if (pc?.index !== undefined) { out.postcode = pc[1]; s = s.slice(0, pc.index).trim(); }

  // State abbreviation — UPPERCASE only, so ordinary title-case words like the
  // "Vic" in "Vic Parade" aren't mistaken for a state. Last match wins.
  const stateRe = new RegExp(`\\b(${AU_STATES.join("|")})\\b`, "g");
  const matches = [...s.matchAll(stateRe)];
  if (matches.length) {
    const m = matches[matches.length - 1];
    out.state = m[1];
    s = (s.slice(0, m.index) + " " + s.slice(m.index! + m[1].length)).replace(/\s+/g, " ").trim();
  }

  s = s.replace(/^[,\s]+|[,\s]+$/g, "").trim();
  if (s.includes(",")) {
    const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      out.city = parts[parts.length - 1];
      out.street = parts.slice(0, -1).join(", ");
    } else {
      out.street = parts[0] ?? "";
    }
  } else {
    // No comma: can't reliably separate street from suburb — keep whole as street.
    out.street = s;
  }
  return out;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { commit: { type: "boolean", default: false }, merchant: { type: "string" } },
  });
  const commit = values.commit === true;
  const merchantId = values.merchant ? Number(values.merchant) : null;

  const [{ host }] = (await db.execute(sql`SELECT inet_server_addr()::text AS host`)).rows as { host: string | null }[];
  const dbHost = process.env.DATABASE_URL?.replace(/^.*@/, "").replace(/\/.*$/, "") ?? "(unknown)";
  console.log(`DB: ${dbHost}  (server addr: ${host ?? "n/a"})`);
  console.log(commit ? "MODE: COMMIT (writes will be applied)" : "MODE: DRY-RUN (rolled back)\n");

  // Candidates: has a free-text address, but ALL structured billing fields empty.
  const emptyish = (col: typeof customersTable.billingStreet) => or(isNull(col), eq(col, ""));
  const rows = await db
    .select({
      id: customersTable.id, merchantId: customersTable.merchantId, address: customersTable.address,
    })
    .from(customersTable)
    .where(and(
      isNotNull(customersTable.address),
      ne(customersTable.address, ""),
      emptyish(customersTable.billingStreet),
      emptyish(customersTable.billingCity),
      emptyish(customersTable.billingState),
      emptyish(customersTable.billingPostcode),
      ...(merchantId ? [eq(customersTable.merchantId, merchantId)] : []),
    ));

  console.log(`Candidates (free-text address set, structured empty): ${rows.length}`);

  let full = 0, partial = 0, streetOnly = 0;
  const samples: string[] = [];
  const updates: { id: number; set: Record<string, string> }[] = [];

  for (const r of rows) {
    const p = parseAuAddress(r.address ?? "");
    const set: Record<string, string> = {};
    if (p.street) set.billingStreet = p.street;
    if (p.city) set.billingCity = p.city;
    if (p.state) set.billingState = p.state;
    if (p.postcode) set.billingPostcode = p.postcode;
    if (Object.keys(set).length === 0) continue;

    if (p.state && p.postcode && p.city) full++;
    else if (p.state || p.postcode || p.city) partial++;
    else streetOnly++;

    updates.push({ id: r.id, set });
    if (samples.length < 12) samples.push(`  #${r.id}: "${r.address}"\n     → ${JSON.stringify(set)}`);
  }

  console.log(`Parsed → will update: ${updates.length}  (full: ${full}, partial: ${partial}, street-only: ${streetOnly})\n`);
  console.log("Sample parses:\n" + samples.join("\n"));

  if (updates.length === 0) { console.log("\nNothing to do."); return; }

  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx.update(customersTable).set(u.set).where(eq(customersTable.id, u.id));
    }
    if (!commit) {
      console.log(`\nDRY-RUN: rolling back ${updates.length} updates. Re-run with --commit to apply.`);
      throw new Error("__dry_run_rollback__");
    }
    console.log(`\nCOMMITTED ${updates.length} customer address backfills.`);
  }).catch((e) => { if ((e as Error).message !== "__dry_run_rollback__") throw e; });
}

main()
  .catch((err) => { console.error("backfill failed:", err); process.exitCode = 1; })
  .finally(() => pool.end());
