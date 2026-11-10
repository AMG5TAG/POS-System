/**
 * repair-po-received-stock — put a purchase order's received units into stock
 * when the order was CREATED already received.
 *
 * Until the fix in routes/purchase-orders.ts, creating a PO with status
 * "Fully Received" and the received counts typed in recorded `received` on
 * each line but moved no stock. Re-saving the PO can't repair it (an edit moves
 * stock only by the change in received), so this adds each tracked product's
 * received units to its stock, once.
 *
 * SAFETY:
 *   - Targets ONE purchase order, by number (--po KP00020). Nothing else is read
 *     for writing.
 *   - Dry-run by DEFAULT: prints what it would change and rolls back.
 *     Pass --commit to write.
 *   - Prints the DB host it connected to, so the wrong database is obvious.
 *   - Refuses an order that went through the Receive worksheet (it has receipt
 *     rows — that path already moved stock) unless --force.
 *   - Not idempotent by itself: running --commit twice adds the units twice.
 *     It stamps a note on the PO and refuses a PO already stamped.
 *   - Only products with inventory tracking on are changed, as the app does.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server exec tsx scripts/repair-po-received-stock.ts --po KP00020
 *   DATABASE_URL="$PROD_DATABASE_URL" pnpm --filter @workspace/api-server exec tsx scripts/repair-po-received-stock.ts --po KP00020
 *   DATABASE_URL="$PROD_DATABASE_URL" pnpm --filter @workspace/api-server exec tsx scripts/repair-po-received-stock.ts --po KP00020 --commit
 */
import { parseArgs } from "node:util";
import { db, pool, purchaseOrdersTable, purchaseOrderItemsTable, purchaseOrderReceiptsTable, productsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { reconcileOversellLedger } from "../src/lib/oversellLedger";

const STAMP = "[stock repaired: received units added to stock]";

class Rollback extends Error {}

async function main() {
  const { values } = parseArgs({
    options: {
      po: { type: "string" },
      commit: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
  });
  if (!values.po) throw new Error("Pass --po <PO number>, e.g. --po KP00020");

  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").host; } catch { return "(unparseable DATABASE_URL)"; } })();
  console.log(`Database: ${host}`);
  console.log(values.commit ? "MODE: COMMIT — changes will be written" : "MODE: dry run — nothing will be written");

  const rows = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.poNumber, values.po));
  if (rows.length !== 1) throw new Error(`Expected exactly one purchase order numbered ${values.po}, found ${rows.length}`);
  const po = rows[0]!;
  console.log(`PO ${po.poNumber} (id ${po.id}, merchant ${po.merchantId}) — status "${po.status}", created ${po.createdAt.toISOString()}`);

  if ((po.notes ?? "").includes(STAMP)) throw new Error("This PO has already been repaired (its notes carry the stamp). Not running twice.");
  const receipts = await db.select({ id: purchaseOrderReceiptsTable.id }).from(purchaseOrderReceiptsTable)
    .where(eq(purchaseOrderReceiptsTable.poId, po.id));
  if (receipts.length && !values.force) {
    throw new Error(`This PO has ${receipts.length} receipt(s) from the Receive worksheet, which already moved stock. Re-run with --force only if you're sure.`);
  }

  const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, po.id));
  const perProduct = new Map<number, number>();
  for (const i of items) {
    if (i.productId && (i.received ?? 0) > 0) perProduct.set(i.productId, (perProduct.get(i.productId) ?? 0) + (i.received ?? 0));
    if (!i.productId && (i.received ?? 0) > 0) console.log(`  skip  "${i.productName}" × ${i.received} — free-text line, no product`);
  }

  try {
    await db.transaction(async (tx) => {
      for (const [productId, qty] of perProduct) {
        const [p] = await tx.select({ name: productsTable.name, track: productsTable.trackInventory, stock: productsTable.stockQuantity })
          .from(productsTable)
          .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, po.merchantId)))
          .for("update");
        if (!p) { console.log(`  skip  product ${productId} × ${qty} — not found for this business`); continue; }
        if (p.track !== "true") { console.log(`  skip  "${p.name}" × ${qty} — inventory tracking is off`); continue; }
        const next = p.stock + qty;
        console.log(`  stock "${p.name}" (id ${productId}): ${p.stock} → ${next}  (+${qty})`);
        await tx.update(productsTable).set({ stockQuantity: next })
          .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, po.merchantId)));
        await reconcileOversellLedger(tx, { merchantId: po.merchantId, productId, prevStock: p.stock, newStock: next });
      }
      await tx.update(purchaseOrdersTable)
        .set({ notes: `${po.notes ? `${po.notes}\n` : ""}${STAMP} ${new Date().toISOString().slice(0, 10)}` })
        .where(eq(purchaseOrdersTable.id, po.id));
      if (!values.commit) throw new Rollback();
    });
    console.log("Committed.");
  } catch (e) {
    if (e instanceof Rollback) console.log("Dry run — rolled back. Re-run with --commit to apply.");
    else throw e;
  }
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => pool.end());
