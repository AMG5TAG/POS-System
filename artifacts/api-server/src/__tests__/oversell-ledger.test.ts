import { describe, it, expect, vi } from "vitest";

// The helper only uses the table object as a query identifier and imports `db`
// as a type (erased at runtime), so a table shim is all that's needed — no real
// database connection.
vi.mock("@workspace/db", () => {
  const tableProxy = new Proxy({} as Record<string, unknown>, { get: () => tableProxy });
  return { productOversellLedgerTable: tableProxy };
});

import { reconcileOversellLedger } from "../lib/oversellLedger";

type OpenRow = { id: number; remaining: number };

// Minimal fake of a drizzle transaction that records inserts/updates and serves
// a canned set of open backorder rows to the FIFO-resolve query.
function makeFakeTx(openRows: OpenRow[] = []) {
  const inserted: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: unknown; set: Record<string, unknown> }> = [];
  const tx = {
    insert: () => ({
      values: (v: Record<string, unknown>) => { inserted.push(v); return Promise.resolve(); },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: (..._args: unknown[]) => Promise.resolve(openRows),
        }),
      }),
    }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: (cond: unknown) => { updates.push({ id: cond, set }); return Promise.resolve(); },
      }),
    }),
  };
  return { tx: tx as never, inserted, updates };
}

describe("reconcileOversellLedger", () => {
  it("does nothing when stock stays at or above zero", async () => {
    const { tx, inserted, updates } = makeFakeTx();
    await reconcileOversellLedger(tx, { merchantId: 1, productId: 9, prevStock: 5, newStock: 3 });
    expect(inserted).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("records an oversell row when a sale crosses stock below zero", async () => {
    const { tx, inserted } = makeFakeTx();
    await reconcileOversellLedger(tx, {
      merchantId: 1, productId: 9, prevStock: 2, newStock: -3,
      receiptNumber: "KR00042", transactionId: 77,
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      productId: 9,
      quantity: 3,       // only the units below zero (2 on-hand covered the rest)
      remaining: 3,
      receiptNumber: "KR00042",
      transactionId: 77,
    });
  });

  it("records only the incremental units when already oversold", async () => {
    const { tx, inserted } = makeFakeTx();
    await reconcileOversellLedger(tx, {
      merchantId: 1, productId: 9, prevStock: -1, newStock: -4,
      receiptNumber: "KR00099",
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ quantity: 3, remaining: 3, receiptNumber: "KR00099" });
  });

  it("resolves outstanding backorders FIFO when fully replenished", async () => {
    const { tx, inserted, updates } = makeFakeTx([
      { id: 1, remaining: 2 },
      { id: 2, remaining: 1 },
    ]);
    await reconcileOversellLedger(tx, { merchantId: 1, productId: 9, prevStock: -3, newStock: 0 });
    expect(inserted).toHaveLength(0);
    expect(updates).toHaveLength(2);
    // Both rows fully covered → remaining 0 and stamped resolved.
    expect(updates[0].set.remaining).toBe(0);
    expect(updates[0].set.resolvedAt).toBeInstanceOf(Date);
    expect(updates[1].set.remaining).toBe(0);
    expect(updates[1].set.resolvedAt).toBeInstanceOf(Date);
  });

  it("partially resolves oldest-first and leaves the remainder open", async () => {
    const { tx, updates } = makeFakeTx([
      { id: 1, remaining: 2 },
      { id: 2, remaining: 3 },
    ]);
    // Replenish covers only 3 units (from -5 to -2).
    await reconcileOversellLedger(tx, { merchantId: 1, productId: 9, prevStock: -5, newStock: -2 });
    expect(updates).toHaveLength(2);
    // Oldest row fully covered...
    expect(updates[0].set.remaining).toBe(0);
    expect(updates[0].set.resolvedAt).toBeInstanceOf(Date);
    // ...second row partially reduced (3 → 2), still open (no resolvedAt).
    expect(updates[1].set.remaining).toBe(2);
    expect(updates[1].set.resolvedAt).toBeUndefined();
  });

  it("stops resolving once the replenished amount is exhausted", async () => {
    const { tx, updates } = makeFakeTx([
      { id: 1, remaining: 1 },
      { id: 2, remaining: 5 },
    ]);
    // Only 1 unit replenished (from -2 to -1) → only the first row is touched.
    await reconcileOversellLedger(tx, { merchantId: 1, productId: 9, prevStock: -2, newStock: -1 });
    expect(updates).toHaveLength(1);
    expect(updates[0].set.remaining).toBe(0);
  });
});
