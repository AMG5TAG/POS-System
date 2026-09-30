import { describe, it, expect } from "vitest";
import { loyaltyEarnedFor, loyaltyProgramInfo, formatLoyalty } from "../lib/loyalty";

/**
 * lib/loyalty.ts — the one earn rule the till credits and the online shop
 * previews. Pinned here so the two cannot drift apart again.
 */

const shopper = { customerGroup: null, totalSpent: "0", loyaltyPoints: 0, dateOfBirth: null };
const line = (totalPrice: number, over: Partial<{ productId: number; excludeFromLoyalty: boolean; categoryId: number | null }> = {}) =>
  ({ productId: 1, totalPrice, excludeFromLoyalty: false, categoryId: null, ...over });
const earn = (over: Partial<Parameters<typeof loyaltyEarnedFor>[0]>) =>
  loyaltyEarnedFor({ programType: "cashback", config: { cashbackRate: 0.01 }, programOn: true, customer: shopper, lines: [line(200)], total: 200, now: new Date("2026-09-30T02:00:00Z"), ...over });

describe("loyaltyEarnedFor", () => {
  it("pays the cashback rate on eligible spend", () => {
    expect(earn({})).toBe(2);
  });

  it("skips lines excluded from loyalty", () => {
    expect(earn({ lines: [line(200), line(100, { excludeFromLoyalty: true })], total: 300 })).toBe(2);
  });

  it("earns nothing without a customer, with the program off, paying by loyalty, or for an excluded group", () => {
    expect(earn({ customer: null })).toBe(0);
    expect(earn({ programOn: false })).toBe(0);
    expect(earn({ paymentMethod: "loyalty" })).toBe(0);
    expect(earn({ config: { cashbackRate: 0.01, excludedCustomerGroups: ["Trade"] }, customer: { ...shopper, customerGroup: "trade" } })).toBe(0);
  });

  it("floors points and applies the best active promotion", () => {
    expect(earn({ programType: "points", config: { pointsPerDollar: 1 }, lines: [line(19.99)], total: 19.99 })).toBe(19);
    const promos = [
      { id: "a", name: "Double", type: "general", active: true, multiplier: 2 },
      { id: "b", name: "Old", type: "general", active: true, multiplier: 5, endDate: "2026-01-01" },
    ];
    expect(earn({ config: { cashbackRate: 0.01, promotions: promos } })).toBe(4);
  });

  it("applies a birthday promotion only on the customer's birthday", () => {
    const config = { cashbackRate: 0.01, promotions: [{ id: "b", name: "Birthday", type: "birthday", active: true, multiplier: 3 }] };
    expect(earn({ config, customer: { ...shopper, dateOfBirth: "1990-09-30" } })).toBe(6);
    expect(earn({ config, customer: { ...shopper, dateOfBirth: "1990-03-01" } })).toBe(2);
  });

  it("never pays more cashback than the sale total", () => {
    expect(earn({ config: { cashbackRate: 0.01, promotions: [{ id: "x", name: "Bonus", type: "general", active: true, bonusAmount: 500 }] } })).toBe(200);
  });
});

describe("how the program reads on the website", () => {
  it("uses the POS program name and unit", () => {
    const info = loyaltyProgramInfo("cashback", { cashbackRate: 0.02, naming: { programName: "Koastal Koins", cashbackUnit: "Koins" } }, true);
    expect(info.name).toBe("Koastal Koins");
    expect(info.headline).toBe("Earn $2 in Koins for every $100 you spend (2% back).");
  });

  it("formats balances in the program's terms", () => {
    expect(formatLoyalty("cashback", { naming: { cashbackUnit: "Koins" } }, 4.2)).toBe("$4.20 Koins");
    expect(formatLoyalty("points", {}, 120.7)).toBe("120 Points");
  });
});
