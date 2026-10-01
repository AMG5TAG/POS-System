import { describe, it, expect } from "vitest";
import { isOnlineOrderSale, saleLines, onlineOrderLines, paymentLabel, orderStatusLabel, tracking } from "../lib/shop-orders";

/**
 * lib/shop-orders.ts — the shop account's Orders card. Pinned: a till sale
 * raised from an online order is recognised (so it isn't listed twice), lines
 * carry name/qty/total only (never cost price), and labels/tracking read the
 * way a customer expects.
 */

describe("in-store vs online", () => {
  it("recognises the till sale an online order was booked as", () => {
    expect(isOnlineOrderSale("delivery-order:42")).toBe(true);
    expect(isOnlineOrderSale("pos-abc-123")).toBe(false);
    expect(isOnlineOrderSale(null)).toBe(false);
  });
});

describe("lines", () => {
  it("keeps name, quantity and total from a till sale — nothing else", () => {
    const lines = saleLines([{ productId: 1, productName: "Case", quantity: 2, unitPrice: 20, totalPrice: 36, costPrice: 5 }]);
    expect(lines).toEqual([{ name: "Case", quantity: 2, total: 36 }]);
    expect(JSON.stringify(lines)).not.toContain("cost");
  });

  it("works out a missing line total, and tolerates bad data", () => {
    expect(saleLines([{ productName: "Cable", quantity: 3, unitPrice: 9.95 }])).toEqual([{ name: "Cable", quantity: 3, total: 29.85 }]);
    expect(saleLines(null)).toEqual([]);
    expect(onlineOrderLines("not json")).toEqual([]);
    expect(onlineOrderLines('[{"name":"Charger","qty":1,"price":49,"lineTotal":49}]')).toEqual([{ name: "Charger", quantity: 1, total: 49 }]);
  });
});

describe("labels", () => {
  it("names payment methods and order statuses for a customer", () => {
    expect(paymentLabel("eftpos")).toBe("EFTPOS");
    expect(paymentLabel("gift_card")).toBe("Gift card");
    expect(paymentLabel("bank_deposit")).toBe("Bank deposit");
    expect(orderStatusLabel("shipped")).toBe("On its way");
    expect(orderStatusLabel("on_hold")).toBe("On hold");
  });

  it("links a carrier's tracking page, or just the number when there isn't one", () => {
    expect(tracking("auspost", " 33AB ")).toEqual({ carrier: "Australia Post", number: "33AB", url: "https://auspost.com.au/mypost/track/details/33AB" });
    expect(tracking("other", "X1")).toEqual({ carrier: "Other", number: "X1", url: null });
    expect(tracking("auspost", "")).toBeNull();
  });
});
