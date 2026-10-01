import { describe, it, expect } from "vitest";
import { followPrice, reconcileGroupPrices, groupPriceFor, resolveCustomerGroupId } from "@workspace/group-pricing";

/* Customer-group prices follow the sell price at the same share
   (@workspace/group-pricing): what a price change does to them, in the product
   form, PATCH /products/:id, bulk price changes and CSV import. */

describe("followPrice", () => {
  it("keeps each group's share of the price", () => {
    expect(followPrice({ trade: 65, staff: 104 }, 130, 140)).toEqual({ trade: 70, staff: 112 });
  });
  it("rounds to the cent", () => {
    expect(followPrice({ trade: 40 }, 65, 70)).toEqual({ trade: 43.08 });
  });
  it("leaves the map alone when there is no old price to scale from", () => {
    expect(followPrice({ trade: 10 }, 0, 50)).toEqual({ trade: 10 });
  });
  it("passes an empty map through", () => {
    expect(followPrice(null, 130, 140)).toBeNull();
  });
});

describe("reconcileGroupPrices (a save that changes the price)", () => {
  it("with no group prices sent, every stored one follows", () => {
    expect(reconcileGroupPrices({ trade: 65 }, 130, 140)).toEqual({ trade: 70 });
  });
  it("a group re-sent unchanged follows the price", () => {
    expect(reconcileGroupPrices({ trade: 65, staff: 130 }, 130, 140, { trade: 65, staff: 130 })).toEqual({ trade: 70, staff: 140 });
  });
  it("a group edited in the same save keeps the edit", () => {
    expect(reconcileGroupPrices({ trade: 65 }, 130, 140, { trade: 60 })).toEqual({ trade: 60 });
  });
  it("a group not stored before keeps what was sent", () => {
    expect(reconcileGroupPrices({ trade: 65 }, 130, 140, { trade: 65, staff: 140 })).toEqual({ trade: 70, staff: 140 });
  });
});

describe("groupPriceFor / resolveCustomerGroupId (till and server)", () => {
  const groups = [{ id: "trade", name: "Trade" }];
  it("resolves a group by id or name", () => {
    expect(resolveCustomerGroupId("Trade", groups)).toBe("trade");
    expect(resolveCustomerGroupId("TRADE", groups)).toBe("trade");
    expect(resolveCustomerGroupId("Unknown", groups)).toBeNull();
  });
  it("prefers the stored price, then the rule, else none", () => {
    const p = { price: 100, costPrice: 50, taxRate: 10, categoryId: null };
    const rule = { groupId: "trade", enabled: true, formula: { basis: "cost_ex" as const, mode: "markup" as const, percent: 20, capAtRRP: true }, categoryRules: [] };
    expect(groupPriceFor({ ...p, groupPrices: { trade: 70 } }, "trade", [rule])).toBe(70);
    expect(groupPriceFor(p, "trade", [rule])).toBe(60);
    expect(groupPriceFor(p, "trade", [])).toBeNull();
    expect(groupPriceFor(p, null, [rule])).toBeNull();
  });
});
