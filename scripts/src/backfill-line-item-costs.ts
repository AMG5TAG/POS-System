/**
 * Historical cost-price backfill.
 *
 * Stamps a `costPrice` snapshot onto product-linked line items in existing
 * transactions, paid/any invoices and laybys that don't already have one, using
 * the product's CURRENT cost price (the best available value for historical
 * rows). This "freezes" cost onto past sales so report COGS/margin stays correct
 * even if a product's cost later changes or the product is deleted.
 *
 * Safe & idempotent:
 *   - Only fills lines that have a real productId AND no existing costPrice
 *     (never overwrites an at-sale snapshot).
 *   - Cross-merchant safe: a product's cost is only applied to its own
 *     merchant's rows.
 *   - Re-running is a no-op once every line is stamped.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run backfill-line-item-costs            # apply
 *   pnpm --filter @workspace/scripts run backfill-line-item-costs --dry-run  # report only
 */
import { pool } from "@workspace/db";

// Infer the client type from a no-arg call (pool.connect has a void-returning
// callback overload that ReturnType would otherwise pick).
const connectClient = () => pool.connect();
type PoolClient = Awaited<ReturnType<typeof connectClient>>;

const DRY_RUN = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

interface ProductCost { merchantId: number; cost: number }

async function loadProductCosts(client: PoolClient): Promise<Map<number, ProductCost>> {
  const r = await client.query<{ id: number; merchant_id: number; cost: number }>(
    `SELECT id, merchant_id, COALESCE(cost_price::numeric, 0)::float AS cost FROM products`,
  );
  const m = new Map<number, ProductCost>();
  for (const row of r.rows) m.set(row.id, { merchantId: row.merchant_id, cost: row.cost });
  return m;
}

/** Fill missing costPrice on product-linked lines. Returns the (possibly new)
 *  items array and whether anything changed. */
function fillItems(items: unknown, merchantId: number, costs: Map<number, ProductCost>): { changed: boolean; items: unknown } {
  if (!Array.isArray(items)) return { changed: false, items };
  let changed = false;
  const out = items.map((raw) => {
    if (raw == null || typeof raw !== "object") return raw;
    const it = raw as Record<string, unknown>;
    const pid = it.productId;
    const hasCost = it.costPrice != null && Number.isFinite(Number(it.costPrice));
    if (typeof pid === "number" && Number.isInteger(pid) && pid > 0 && !hasCost) {
      const p = costs.get(pid);
      if (p && p.merchantId === merchantId && Number.isFinite(p.cost)) {
        changed = true;
        return { ...it, costPrice: p.cost };
      }
    }
    return it;
  });
  return { changed, items: out };
}

async function backfillTable(client: PoolClient, table: string, jsonType: "jsonb" | "json", costs: Map<number, ProductCost>): Promise<{ scanned: number; updated: number }> {
  const res = await client.query<{ id: number; merchant_id: number; items: unknown }>(
    `SELECT id, merchant_id, items FROM ${table} WHERE items IS NOT NULL`,
  );
  let scanned = 0;
  let updated = 0;
  for (const row of res.rows) {
    scanned++;
    const items = typeof row.items === "string" ? JSON.parse(row.items) : row.items;
    const { changed, items: next } = fillItems(items, row.merchant_id, costs);
    if (changed) {
      updated++;
      if (!DRY_RUN) {
        await client.query(`UPDATE ${table} SET items = $1::${jsonType} WHERE id = $2`, [JSON.stringify(next), row.id]);
      }
    }
  }
  return { scanned, updated };
}

async function main() {
  const client = await connectClient();
  try {
    if (!DRY_RUN) await client.query("BEGIN");
    const costs = await loadProductCosts(client);
    console.log(`Loaded ${costs.size} product cost prices.`);

    const targets: Array<{ table: string; jsonType: "jsonb" | "json" }> = [
      { table: "transactions", jsonType: "jsonb" },
      { table: "invoices",     jsonType: "json" },
      { table: "laybys",       jsonType: "jsonb" },
    ];
    for (const t of targets) {
      const { scanned, updated } = await backfillTable(client, t.table, t.jsonType, costs);
      console.log(`${DRY_RUN ? "[dry-run] " : ""}${t.table}: ${updated} of ${scanned} rows ${DRY_RUN ? "would be" : ""} updated with cost snapshots.`);
    }

    if (!DRY_RUN) await client.query("COMMIT");
    console.log(DRY_RUN ? "Dry run complete — no changes written." : "Backfill committed.");
  } catch (err) {
    if (!DRY_RUN) await client.query("ROLLBACK").catch(() => {});
    console.error("backfill-line-item-costs failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
