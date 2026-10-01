import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  return importOriginal();
});

import { isPreOrderActive, allocateReceived, balanceOwing, localDate, preOrderNumber } from "../lib/pre-orders";
import { planPreOrders } from "../lib/pre-order-sales";

/**
 * Pre-orders (lib/pre-orders.ts, lib/pre-order-sales.ts). Pinned: a product
 * stops being a pre-order on its release date by itself; received units go to
 * the oldest pre-order first and never over-fill one; a sale opens a pre-order
 * for each pre-order line — in full, or by a deposit that can't exceed the
 * price — and a sale collecting a pre-order doesn't open another.
 */

describe("pre-order products", () => {
  it("is a pre-order until the release date, then a normal product", () => {
    const p = { preOrder: "true", preOrderReleaseDate: "2026-10-15" };
    expect(isPreOrderActive(p, "2026-10-14")).toBe(true);
    expect(isPreOrderActive(p, "2026-10-15")).toBe(false);
    expect(isPreOrderActive({ preOrder: "true", preOrderReleaseDate: null }, "2030-01-01")).toBe(true);
    expect(isPreOrderActive({ preOrder: "false", preOrderReleaseDate: "2099-01-01" }, "2026-01-01")).toBe(false);
  });

  it("reads today in the merchant's timezone", () => {
    // 20:00 UTC on 30 Sep is already 1 Oct in Sydney.
    expect(localDate("Australia/Sydney", new Date("2026-09-30T20:00:00Z"))).toBe("2026-10-01");
  });

  it("numbers pre-orders from their id", () => {
    expect(preOrderNumber(7)).toBe("PRE-0007");
  });
});

describe("allocating received stock", () => {
  it("fills the oldest pre-order first and stops when units run out", () => {
    const out = allocateReceived([
      { id: 1, quantity: 2, allocatedQuantity: 0 },
      { id: 2, quantity: 1, allocatedQuantity: 0 },
      { id: 3, quantity: 1, allocatedQuantity: 0 },
    ], 3);
    expect(out).toEqual([
      { id: 1, add: 2, allocatedQuantity: 2, complete: true },
      { id: 2, add: 1, allocatedQuantity: 1, complete: true },
    ]);
  });

  it("tops up a partly filled pre-order before moving on", () => {
    const out = allocateReceived([{ id: 1, quantity: 3, allocatedQuantity: 2 }, { id: 2, quantity: 1, allocatedQuantity: 0 }], 1);
    expect(out).toEqual([{ id: 1, add: 1, allocatedQuantity: 3, complete: true }]);
  });

  it("leaves a pre-order incomplete when not enough arrives", () => {
    expect(allocateReceived([{ id: 1, quantity: 5, allocatedQuantity: 0 }], 2)).toEqual([{ id: 1, add: 2, allocatedQuantity: 2, complete: false }]);
  });

  it("never reports a negative balance", () => {
    expect(balanceOwing(100, 120)).toBe(0);
    expect(balanceOwing(1299, 200)).toBe(1099);
  });
});

describe("pre-orders opened by a sale", () => {
  const products = new Map([
    [5, { id: 5, name: "Console X", price: "800.00", preOrder: "true", preOrderReleaseDate: "2026-12-01", preOrderEtaDate: "2026-11-28" }],
    [6, { id: 6, name: "Cable", price: "20.00", preOrder: "false", preOrderReleaseDate: null, preOrderEtaDate: null }],
  ]);
  const today = "2026-10-01";

  it("opens a paid-in-full pre-order for a pre-order product line only", () => {
    const r = planPreOrders([
      { productId: 5, quantity: 1, unitPrice: 800, totalPrice: 800 },
      { productId: 6, quantity: 2, unitPrice: 20, totalPrice: 40 },
    ], products, today, new Set());
    expect(r.ok && r.plans).toEqual([{ productId: 5, productName: "Console X", quantity: 1, unitPrice: 800, totalAmount: 800, paid: 800, etaDate: "2026-11-28", deposit: false }]);
  });

  it("opens a deposit pre-order against price × quantity", () => {
    const r = planPreOrders([{ productId: 0, quantity: 1, unitPrice: 200, totalPrice: 200, preOrderDeposit: { productId: 5, quantity: 2 } }], products, today, new Set());
    expect(r.ok && r.plans[0]).toMatchObject({ productId: 5, quantity: 2, totalAmount: 1600, paid: 200, deposit: true });
  });

  it("refuses a deposit larger than the price, or on a product no longer on pre-order", () => {
    expect(planPreOrders([{ productId: 0, quantity: 1, unitPrice: 900, totalPrice: 900, preOrderDeposit: { productId: 5, quantity: 1 } }], products, today, new Set()).ok).toBe(false);
    expect(planPreOrders([{ productId: 0, quantity: 1, unitPrice: 10, totalPrice: 10, preOrderDeposit: { productId: 5, quantity: 1 } }], products, "2026-12-01", new Set()).ok).toBe(false);
  });

  it("doesn't open a new pre-order for the product a sale is collecting", () => {
    const r = planPreOrders([{ productId: 5, quantity: 1, unitPrice: 800, totalPrice: 600 }], products, today, new Set([5]));
    expect(r.ok && r.plans).toEqual([]);
  });
});
