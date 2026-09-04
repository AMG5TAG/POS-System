import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Booking a paid online order as a sale.
 *
 * The order was already paid for in stock terms when the shopper checked out —
 * `online-store-checkout` decrements stock and bumps the customer's totals in
 * the same transaction that writes the order. So the thing that can go wrong
 * here is doing any of it a second time: a merchant double-clicking "Mark paid",
 * a retried request, or toggling pending → paid → pending → paid. Each of those
 * must leave exactly one sale and must not move stock.
 */

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { transactions: [], customers: [], products: [] };
  const mkTable = (name: string, cols: string[]) => {
    const t: any = { _name: name };
    for (const c of cols) t[c] = { _table: name, _col: c };
    return t;
  };
  const transactionsTable = mkTable("transactions",
    ["id", "merchantId", "customerId", "receiptNumber", "status", "subtotal", "taxTotal",
     "discountTotal", "total", "paymentMethod", "notes", "items", "idempotencyKey"]);
  const customersTable = mkTable("customers", ["id", "merchantId", "email", "totalSpent", "visitCount"]);
  const productsTable = mkTable("products", ["id", "merchantId", "stockQuantity"]);
  const deliveryOrdersTable = mkTable("delivery_orders", ["id", "merchantId"]);

  const matches = (row: any, pred: any): boolean => {
    if (!pred) return true;
    if (pred.type === "and") return pred.preds.every((p: any) => matches(row, p));
    if (pred.type === "eq") return row[pred.col._col] === pred.val;
    return true;
  };
  const project = (row: any, projection: any) => {
    if (!projection) return { ...row };
    const out: any = {};
    for (const k of Object.keys(projection)) out[k] = row[projection[k]._col];
    return out;
  };

  class Q {
    kind: string; table: any = null; projection: any = null; pred: any = null;
    lim: number | null = null; vals: any = null;
    constructor(kind: string, table?: any, projection?: any) {
      this.kind = kind; this.table = table ?? null; this.projection = projection ?? null;
    }
    from(t: any) { this.table = t; return this; }
    where(p: any) { this.pred = p; return this; }
    limit(n: number) { this.lim = n; return this; }
    values(o: any) { this.vals = o; return this; }
    returning() { return this; }
    private exec(): any {
      const rows = this.table ? store[this.table._name] : [];
      if (this.kind === "select") {
        let out = rows.filter((r) => matches(r, this.pred));
        if (this.lim != null) out = out.slice(0, this.lim);
        return out.map((r) => project(r, this.projection));
      }
      if (this.kind === "insert") {
        // Enforce the real unique index on (merchantId, idempotencyKey).
        if (this.table._name === "transactions" && this.vals.idempotencyKey != null) {
          const clash = rows.some((r) =>
            r.merchantId === this.vals.merchantId && r.idempotencyKey === this.vals.idempotencyKey);
          if (clash) {
            const e: any = new Error("duplicate key");
            e.code = "23505"; e.constraint = "transactions_merchant_idempotency_idx";
            throw e;
          }
        }
        const row = { id: rows.length + 1, ...this.vals };
        rows.push(row);
        return [{ ...row }];
      }
      return [];
    }
    then(resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) {
      try { return Promise.resolve(this.exec()).then(resolve); }
      catch (e) { return reject ? reject(e) : Promise.reject(e); }
    }
  }

  const db: any = {
    select: (projection?: any) => new Q("select", undefined, projection),
    insert: (t: any) => new Q("insert", t),
  };
  return {
    store, db, transactionsTable, customersTable, productsTable, deliveryOrdersTable,
    reset() { store.transactions = []; store.customers = []; store.products = []; },
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  transactionsTable: h.transactionsTable,
  customersTable: h.customersTable,
  productsTable: h.productsTable,
  deliveryOrdersTable: h.deliveryOrdersTable,
}));
vi.mock("drizzle-orm", () => ({
  eq:  (col: any, val: any) => ({ type: "eq", col, val }),
  and: (...preds: any[]) => ({ type: "and", preds }),
}));

const order = (over: any = {}) => ({
  id: 7, merchantId: 1, orderId: "WEB-1", number: "WEB-1",
  customerEmail: "shopper@example.com", total: "110.00", subtotal: "110.00",
  taxTotal: "10.00", discountTotal: "0", paymentProvider: "",
  items: JSON.stringify([{ productId: 3, name: "Widget", qty: 2, price: 55, taxRate: 10, lineTotal: 110 }]),
  ...over,
});

beforeEach(() => h.reset());

describe("recordPaidOrderAsSale", () => {
  it("books the order as a completed sale with the order's money breakdown", async () => {
    const { recordPaidOrderAsSale } = await import("../services/deliveryOrderSale");
    const res = await recordPaidOrderAsSale(1, order() as any);

    expect(res.recorded).toBe(true);
    expect(h.store.transactions).toHaveLength(1);
    const t = h.store.transactions[0];
    /* Written as a numeric string the way every other money write here does;
       Postgres normalises it into numeric(10,2), so assert the value. */
    expect(parseFloat(t.total)).toBe(110);
    expect(parseFloat(t.taxTotal)).toBe(10);
    expect(t.status).toBe("completed");
    expect(t.idempotencyKey).toBe("delivery-order:7");
    expect(t.items[0]).toMatchObject({ productId: 3, productName: "Widget", quantity: 2, totalPrice: 110 });
  });

  /* The one that matters: marking paid twice must not double the takings. */
  it("books once however many times it is called", async () => {
    const { recordPaidOrderAsSale } = await import("../services/deliveryOrderSale");
    const first  = await recordPaidOrderAsSale(1, order() as any);
    const second = await recordPaidOrderAsSale(1, order() as any);
    const third  = await recordPaidOrderAsSale(1, order() as any);

    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(third.recorded).toBe(false);
    expect(second.transactionId).toBe(first.transactionId);
    expect(h.store.transactions).toHaveLength(1);
  });

  /* Stock and customer totals were applied when the order was placed. */
  it("moves no stock and does not re-bump the customer's totals", async () => {
    h.store.products.push({ id: 3, merchantId: 1, stockQuantity: 5 });
    h.store.customers.push({ id: 9, merchantId: 1, email: "shopper@example.com", totalSpent: "110.00", visitCount: 1 });
    const { recordPaidOrderAsSale } = await import("../services/deliveryOrderSale");

    await recordPaidOrderAsSale(1, order() as any);

    expect(h.store.products[0].stockQuantity).toBe(5);
    expect(h.store.customers[0].totalSpent).toBe("110.00");
    expect(h.store.customers[0].visitCount).toBe(1);
  });

  it("attributes the sale to the customer matched by email", async () => {
    h.store.customers.push({ id: 9, merchantId: 1, email: "shopper@example.com" });
    const { recordPaidOrderAsSale } = await import("../services/deliveryOrderSale");
    await recordPaidOrderAsSale(1, order() as any);
    expect(h.store.transactions[0].customerId).toBe(9);
  });

  /* Orders placed before productId was persisted still have to book. */
  it("books a legacy order whose lines carry only name, qty and price", async () => {
    const { recordPaidOrderAsSale } = await import("../services/deliveryOrderSale");
    await recordPaidOrderAsSale(1, order({
      items: JSON.stringify([{ name: "Old Widget", qty: 1, price: 20 }]),
    }) as any);

    const t = h.store.transactions[0];
    expect(t.items[0]).toMatchObject({ productId: 0, productName: "Old Widget", quantity: 1, totalPrice: 20 });
  });

  it("still books the money when the line blob is unreadable", async () => {
    const { recordPaidOrderAsSale } = await import("../services/deliveryOrderSale");
    const res = await recordPaidOrderAsSale(1, order({ items: "not json" }) as any);
    expect(res.recorded).toBe(true);
    expect(parseFloat(h.store.transactions[0].total)).toBe(110);
    expect(h.store.transactions[0].items).toEqual([]);
  });

  it("keeps each merchant's orders separate", async () => {
    const { recordPaidOrderAsSale } = await import("../services/deliveryOrderSale");
    await recordPaidOrderAsSale(1, order() as any);
    const other = await recordPaidOrderAsSale(2, order() as any);
    expect(other.recorded).toBe(true);
    expect(h.store.transactions).toHaveLength(2);
  });
});
