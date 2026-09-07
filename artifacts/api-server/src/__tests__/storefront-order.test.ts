import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_SCOPES, API_SCOPES, API_ENDPOINTS } from "../lib/storefront-api";

/**
 * Placing an order — the one thing the Storefront Data API can change.
 *
 * The whole safety argument for opening a write rests on two claims, so both are
 * pinned here: a caller cannot name its own price, and an order is never money
 * until a human says so. If either stops holding, a leaked key stops being a
 * confidentiality problem and starts being a financial one.
 */

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { products: [], discounts: [], customers: [], delivery_orders: [] };
  const mkTable = (name: string, cols: string[]) => {
    const t: any = { _name: name };
    for (const c of cols) t[c] = { _table: name, _col: c };
    return t;
  };
  const productsTable = mkTable("products", ["id", "merchantId", "name", "price", "taxRate", "stockQuantity", "trackInventory", "isActive"]);
  const discountsTable = mkTable("discounts", ["id", "merchantId", "code", "type", "value", "isActive", "usedCount", "maxUses", "minOrderAmount", "startDate", "endDate"]);
  const customersTable = mkTable("customers", ["id", "merchantId", "email", "firstName", "lastName", "phone", "address", "billingStreet", "billingCity", "billingState", "billingPostcode", "totalSpent", "visitCount"]);
  const deliveryOrdersTable = mkTable("delivery_orders", ["id", "merchantId", "orderId", "number", "channel", "customer", "customerEmail", "phone", "address", "city", "state", "postcode", "status", "placedAt", "total", "items", "notes", "subtotal", "discountCode", "discountTotal", "taxTotal", "shippingTotal", "currency", "paymentStatus", "paymentProvider", "paymentRef"]);

  const matches = (row: any, pred: any): boolean => {
    if (!pred) return true;
    if (pred.type === "and") return pred.preds.every((p: any) => matches(row, p));
    if (pred.type === "eq") return row[pred.col._col] === pred.val;
    if (pred.type === "inArray") return pred.vals.includes(row[pred.col._col]);
    return true;
  };

  class Q {
    kind: string; table: any = null; pred: any = null; lim: number | null = null;
    setObj: any = null; vals: any = null;
    constructor(kind: string, table?: any) { this.kind = kind; this.table = table ?? null; }
    from(t: any) { this.table = t; return this; }
    where(p: any) { this.pred = p; return this; }
    limit(n: number) { this.lim = n; return this; }
    set(o: any) { this.setObj = o; return this; }
    values(o: any) { this.vals = o; return this; }
    returning() { return this; }
    private exec(): any {
      const rows = this.table ? store[this.table._name] : [];
      if (this.kind === "select") {
        let out = rows.filter((r) => matches(r, this.pred));
        if (this.lim != null) out = out.slice(0, this.lim);
        return out.map((r) => ({ ...r }));
      }
      if (this.kind === "insert") { const row = { id: rows.length + 1, ...this.vals }; rows.push(row); return [{ ...row }]; }
      if (this.kind === "update") {
        const hit = rows.filter((r) => matches(r, this.pred));
        for (const r of hit) {
          for (const [k, v] of Object.entries<any>(this.setObj)) {
            r[k] = v && typeof v === "object" && "__delta" in v ? Number(r[k] ?? 0) + v.__delta : v;
          }
        }
        return hit.map((r) => ({ ...r }));
      }
      return [];
    }
    then(resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) {
      try { return Promise.resolve(this.exec()).then(resolve); }
      catch (e) { return reject ? reject(e) : Promise.reject(e); }
    }
  }

  const api: any = {
    select: () => new Q("select"),
    insert: (t: any) => new Q("insert", t),
    update: (t: any) => new Q("update", t),
  };
  const db: any = { ...api, transaction: (fn: any) => Promise.resolve().then(() => fn(api)) };
  return {
    store, db, productsTable, discountsTable, customersTable, deliveryOrdersTable,
    reset() { store.products = []; store.discounts = []; store.customers = []; store.delivery_orders = []; },
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  productsTable: h.productsTable,
  discountsTable: h.discountsTable,
  customersTable: h.customersTable,
  deliveryOrdersTable: h.deliveryOrdersTable,
}));
vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ type: "eq", col, val }),
  and: (...preds: any[]) => ({ type: "and", preds }),
  inArray: (col: any, vals: any[]) => ({ type: "inArray", col, vals }),
  /* `sql` here only ever expresses "add this much to the column". */
  sql: (strings: TemplateStringsArray, ..._v: unknown[]) => {
    const delta = Number(String(_v[_v.length - 1] ?? 0));
    return { __delta: String(strings[1] ?? "").includes("-") ? -delta : delta };
  },
}));

const widget = (over: any = {}) => ({
  id: 1, merchantId: 1, name: "Widget", price: "55.00", taxRate: "10",
  stockQuantity: 10, trackInventory: "true", isActive: "true", ...over,
});

const input = (over: any = {}) => ({
  items: [{ productId: 1, qty: 2 }],
  customer: { name: "Sam Shopper", email: "sam@example.com" },
  ...over,
});

beforeEach(() => h.reset());

describe("orders:write is not a default and is marked as a write", () => {
  it("is never granted unless the merchant ticks it", () => {
    expect(DEFAULT_SCOPES).not.toContain("orders:write");
  });

  it("is the only write scope, and is flagged so the UI can warn", () => {
    const writes = API_SCOPES.filter((s) => s.write);
    expect(writes.map((s) => s.id)).toEqual(["orders:write"]);
  });

  it("is the only endpoint that is not a GET", () => {
    const writeEndpoints = API_ENDPOINTS.filter((e) => e.method === "POST");
    expect(writeEndpoints.map((e) => e.path)).toEqual(["/orders"]);
    expect(writeEndpoints[0].scope).toBe("orders:write");
  });
});

describe("placeStorefrontOrder", () => {
  it("prices the order from the catalogue, not from the caller", async () => {
    h.store.products.push(widget());
    const { placeStorefrontOrder } = await import("../services/storefrontOrder");

    /* A caller trying to buy two $55 widgets for a dollar. */
    const res = await placeStorefrontOrder(1, input({
      items: [{ productId: 1, qty: 2, price: 0.01, unitPrice: 0.01, total: 0.01 }],
      total: 0.01, subtotal: 0.01,
    }) as never);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.order.total).toBe(110);
    expect(res.order.subtotal).toBe(110);
    expect(h.store.delivery_orders[0].total).toBe("110");
  });

  it("records the order unpaid, so it is not revenue yet", async () => {
    h.store.products.push(widget());
    const { placeStorefrontOrder } = await import("../services/storefrontOrder");
    const res = await placeStorefrontOrder(1, input() as never);

    expect(res.ok && res.order.paymentStatus).toBe("pending");
    expect(h.store.delivery_orders[0].paymentStatus).toBe("pending");
  });

  it("reserves stock for what was ordered", async () => {
    h.store.products.push(widget({ stockQuantity: 10 }));
    const { placeStorefrontOrder } = await import("../services/storefrontOrder");
    await placeStorefrontOrder(1, input() as never);
    expect(h.store.products[0].stockQuantity).toBe(8);
  });

  it("refuses to oversell", async () => {
    h.store.products.push(widget({ stockQuantity: 1 }));
    const { placeStorefrontOrder } = await import("../services/storefrontOrder");
    const res = await placeStorefrontOrder(1, input() as never);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);
    expect(h.store.delivery_orders).toHaveLength(0);
    expect(h.store.products[0].stockQuantity).toBe(1);
  });

  it("will not sell another merchant's product", async () => {
    h.store.products.push(widget({ merchantId: 2 }));
    const { placeStorefrontOrder } = await import("../services/storefrontOrder");
    const res = await placeStorefrontOrder(1, input() as never);
    expect(res.ok).toBe(false);
    expect(h.store.delivery_orders).toHaveLength(0);
  });

  it("rejects an invalid discount code rather than ignoring it", async () => {
    h.store.products.push(widget());
    const { placeStorefrontOrder } = await import("../services/storefrontOrder");
    const res = await placeStorefrontOrder(1, input({ discountCode: "MADEUP" }) as never);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  /* A retried POST must not buy the goods twice. */
  it("returns the first order when a reference is repeated", async () => {
    h.store.products.push(widget({ stockQuantity: 10 }));
    const { placeStorefrontOrder } = await import("../services/storefrontOrder");

    const first  = await placeStorefrontOrder(1, input({ reference: "ext-1" }) as never);
    const second = await placeStorefrontOrder(1, input({ reference: "ext-1" }) as never);

    expect(first.ok && first.order.duplicate).toBe(false);
    expect(second.ok && second.order.duplicate).toBe(true);
    expect(h.store.delivery_orders).toHaveLength(1);
    // and the retry did not take the stock a second time
    expect(h.store.products[0].stockQuantity).toBe(8);
  });
});
