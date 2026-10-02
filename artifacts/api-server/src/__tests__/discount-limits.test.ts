import { describe, it, expect } from "vitest";
import {
  approvalLimitFor, localClock, saleClocks, manualDiscountPct, overDiscountLimit, parseRoleLimits, ruleAllowance, tierDiscountPct,
  type PricingRuleLike,
} from "../lib/discount-limits";

/* Role discount limits on the server (lib/discount-limits.ts): only the part of
   a discount the server cannot account for — a live pricing rule, the
   customer's tier, the imported quote — is judged against the role's limit. */

const rule = (over: Partial<PricingRuleLike> = {}): PricingRuleLike => ({
  productId: null, categoryId: null, discountType: "percent", discountValue: 20,
  startTime: "00:00", endTime: "23:59", daysOfWeek: "1,2,3,4,5,6,7", isActive: "true", ...over,
});
const SYD = "Australia/Sydney";
// Friday 2 October 2026, 15:00 in Sydney (AEST, UTC+10).
const fri3pm = new Date("2026-10-02T05:00:00Z");

describe("role limits", () => {
  it("reads both stored shapes", () => {
    expect(parseRoleLimits('{"cashier":10,"manager":{"hardCap":40,"approvalThreshold":20}}')).toEqual({
      cashier: { hardCap: 10, approvalThreshold: null },
      manager: { hardCap: 40, approvalThreshold: 20 },
    });
    expect(parseRoleLimits("not json")).toEqual({});
  });

  it("asks for a manager above the lower of threshold and cap; never limits the owner", () => {
    const limits = parseRoleLimits('{"cashier":{"hardCap":30,"approvalThreshold":10},"owner":5}');
    expect(approvalLimitFor("cashier", limits)).toBe(10);
    expect(approvalLimitFor("owner", limits)).toBeNull();
    expect(approvalLimitFor("manager", limits)).toBeNull();
  });

  it("judges only what no allowance explains", () => {
    expect(manualDiscountPct({ gross: 100, discount: 30, allowance: 20 })).toBe(10);
    expect(manualDiscountPct({ gross: 100, discount: 10, allowance: 20 })).toBe(0);
    expect(overDiscountLimit(10, 10)).toBe(false);
    expect(overDiscountLimit(10.5, 10)).toBe(true);
    expect(overDiscountLimit(99, null)).toBe(false);
  });
});

describe("pricing-rule allowance", () => {
  const product = { id: 7, categoryId: 3, price: 50 };
  const at = saleClocks(fri3pm, SYD);

  it("allows a live rule on the product or its category", () => {
    expect(ruleAllowance([rule({ productId: 7 })], product, 2, at)).toBe(20);
    expect(ruleAllowance([rule({ categoryId: 3, discountType: "fixed", discountValue: 5 })], product, 1, at)).toBe(5);
    expect(ruleAllowance([rule({ productId: 8 })], product, 1, at)).toBe(0);
  });

  it("follows business time and day, with half an hour's slack", () => {
    expect(localClock(fri3pm, SYD)).toEqual({ day: 5, minutes: 15 * 60 });
    expect(ruleAllowance([rule({ startTime: "15:20", endTime: "17:00" })], product, 1, at)).toBe(10);
    expect(ruleAllowance([rule({ startTime: "16:00", endTime: "17:00" })], product, 1, at)).toBe(0);
    expect(ruleAllowance([rule({ startTime: "12:00", endTime: "14:40" })], product, 1, at)).toBe(10);
    expect(ruleAllowance([rule({ startTime: "12:00", endTime: "14:00" })], product, 1, at)).toBe(0);
    expect(ruleAllowance([rule({ daysOfWeek: "6,7" })], product, 1, at)).toBe(0);
    expect(ruleAllowance([rule({ isActive: "false" })], product, 1, at)).toBe(0);
  });
});

describe("tier allowance", () => {
  const tiers = [{ minSpend: 0, discountPct: 0 }, { minSpend: 500, discountPct: 5 }, { pointsRequired: 1000, discountPct: 10 }];
  it("picks the tier the till picks", () => {
    expect(tierDiscountPct("tiered", tiers, { totalSpent: 600, loyaltyPoints: 0 })).toBe(5);
    expect(tierDiscountPct("tiered", tiers, { totalSpent: 0, loyaltyPoints: 1200 })).toBe(10);
    expect(tierDiscountPct("points", tiers, { totalSpent: 600, loyaltyPoints: 0 })).toBe(0);
    expect(tierDiscountPct("tiered", tiers, null)).toBe(0);
  });
});

describe("cart-bound approval token", () => {
  it("holds for the same cart, not a changed one, and not after 30 minutes", async () => {
    process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
    const { discountApprovalToken, discountApprovalValid } = await import("../lib/discount-authority");
    const sale = { items: [{ productId: 1, productName: "x", quantity: 1, unitPrice: 100, totalPrice: 50, discount: 50 }], paymentMethod: "cash", subtotal: 50, taxTotal: 0, total: 50, customerId: 3 } as never;
    const now = Date.now();
    const token = discountApprovalToken(4, sale, now);
    expect(discountApprovalValid(token, 4, sale, now + 60_000)).toBe(true);
    expect(discountApprovalValid(token, 4, { ...(sale as object), customerId: 9 } as never, now)).toBe(false);
    expect(discountApprovalValid(token, 4, { ...(sale as object), items: [{ productId: 1, productName: "x", quantity: 1, unitPrice: 100, totalPrice: 10, discount: 90 }] } as never, now)).toBe(false);
    expect(discountApprovalValid(token, 5, sale, now)).toBe(false);
    expect(discountApprovalValid(token, 4, sale, now + 31 * 60_000)).toBe(false);
    expect(discountApprovalValid("123.abc", 4, sale, now)).toBe(false);
  });
});
