/* Single source of truth for keeping the backorder (oversell) ledger in step
 * with a product's stockQuantity. Every code path that mutates an
 * inventory-tracked product's stock should route through reconcileOversellLedger
 * with the pre- and post-mutation stock values, so the ledger's outstanding
 * `remaining` always mirrors how far below zero the product currently sits.
 *
 *   negBefore = max(0, -prevStock)   negAfter = max(0, -newStock)
 *   more negative → a NEW oversell row is written (naming the sale)
 *   less negative → outstanding rows are resolved FIFO (oldest sale first)
 *
 * Invariant: SUM(remaining) over unresolved rows === max(0, -stockQuantity). */
import { productOversellLedgerTable } from "@workspace/db";
import { and, eq, sql, asc } from "drizzle-orm";
import type { db } from "@workspace/db";

// Accepts either the base db handle or a transaction handle. All meaningful
// callers pass a transaction so the ledger write commits atomically with the
// stock change.
type DbOrTx =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ReconcileOversellArgs {
  merchantId: number;
  productId: number;
  prevStock: number;
  newStock: number;
  /** Only supplied on the sale path — the sale that caused the oversell. */
  receiptNumber?: string | null;
  transactionId?: number | null;
  /** When the sale happened (defaults to now); shown in the PO-receipt warning. */
  saleAt?: Date;
}

export async function reconcileOversellLedger(tx: DbOrTx, args: ReconcileOversellArgs): Promise<void> {
  const { merchantId, productId, prevStock, newStock } = args;
  const negBefore = Math.max(0, -prevStock);
  const negAfter = Math.max(0, -newStock);
  if (negAfter === negBefore) return;

  if (negAfter > negBefore) {
    // Stock went further into the red — record the newly oversold units.
    const added = negAfter - negBefore;
    await tx.insert(productOversellLedgerTable).values({
      merchantId,
      productId,
      transactionId: args.transactionId ?? null,
      receiptNumber: args.receiptNumber ?? null,
      quantity: added,
      remaining: added,
      saleAt: args.saleAt ?? new Date(),
    });
    return;
  }

  // Stock was replenished — cover outstanding backorders oldest-first.
  let toResolve = negBefore - negAfter;
  const open = await tx
    .select()
    .from(productOversellLedgerTable)
    .where(and(
      eq(productOversellLedgerTable.merchantId, merchantId),
      eq(productOversellLedgerTable.productId, productId),
      sql`${productOversellLedgerTable.remaining} > 0`,
    ))
    .orderBy(asc(productOversellLedgerTable.createdAt), asc(productOversellLedgerTable.id));
  for (const row of open) {
    if (toResolve <= 0) break;
    const take = Math.min(row.remaining, toResolve);
    const newRemaining = row.remaining - take;
    await tx
      .update(productOversellLedgerTable)
      .set({ remaining: newRemaining, ...(newRemaining === 0 ? { resolvedAt: new Date() } : {}) })
      .where(eq(productOversellLedgerTable.id, row.id));
    toResolve -= take;
  }
}
