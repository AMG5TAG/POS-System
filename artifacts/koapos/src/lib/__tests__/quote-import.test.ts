import { describe, it, expect } from "vitest";
import { distributeQuoteDiscount } from "../quote-import";

const sum = (ns: number[]) => Math.round(ns.reduce((s, n) => s + n, 0) * 100) / 100;

/* A quote's discount is part of the price the customer agreed to. Importing the
   lines without it charges them more than the quote they accepted, so it is
   spread back over those lines — and the parts have to sum to the whole. */
describe("distributeQuoteDiscount", () => {
  it("gives every line nothing when the quote had no discount", () => {
    expect(distributeQuoteDiscount([100, 250], 0)).toEqual([0, 0]);
  });

  it("splits a discount in proportion to what each line is worth", () => {
    expect(distributeQuoteDiscount([100, 300], 40)).toEqual([10, 30]);
  });

  it("sums to the discount exactly when the split does not divide evenly", () => {
    const parts = distributeQuoteDiscount([10, 10, 10], 10);
    expect(sum(parts)).toBe(10);
    // The last line absorbs the rounding remainder rather than leaving the cart
    // and the quote a cent apart.
    expect(parts).toEqual([3.33, 3.33, 3.34]);
  });

  it("never discounts a line by more than the line is worth", () => {
    const parts = distributeQuoteDiscount([5, 500], 500);
    expect(parts[0]).toBeLessThanOrEqual(5);
    expect(parts[1]).toBeLessThanOrEqual(500);
  });

  it("clamps a discount larger than the quote itself", () => {
    expect(sum(distributeQuoteDiscount([50, 50], 999))).toBe(100);
  });

  it("ignores a negative discount", () => {
    expect(distributeQuoteDiscount([50, 50], -20)).toEqual([0, 0]);
  });

  it("leaves a free quote alone instead of dividing by zero", () => {
    expect(distributeQuoteDiscount([0, 0], 10)).toEqual([0, 0]);
  });

  it("puts the whole discount on the only line there is", () => {
    expect(distributeQuoteDiscount([370], 50)).toEqual([50]);
  });
});
