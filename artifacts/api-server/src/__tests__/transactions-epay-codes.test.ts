import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({}));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  invalidateMerchantStatusCache: () => {},
}));

const { drawsFromCodePool } = await import("../routes/transactions");

const DIGITAL_CODE = { isDigital: true, printCode: true };

/* A "Physical or Printed Card" product (e.g. an M365 ESD card) gets its code
   from the third-party terminal, so it has no code pool. The sale used to be
   refused with "Insufficient digital codes … (need 1, have 0)". */
describe("drawsFromCodePool", () => {
  it("skips a Physical or Printed Card product", () => {
    expect(drawsFromCodePool({ isEpay: "true" }, DIGITAL_CODE)).toBe(false);
  });

  it("still draws a code for an ordinary digital_code product", () => {
    expect(drawsFromCodePool({ isEpay: "false" }, DIGITAL_CODE)).toBe(true);
  });

  it("never draws for a type that doesn't print codes", () => {
    expect(drawsFromCodePool({ isEpay: "false" }, { isDigital: true, printCode: false })).toBe(false);
    expect(drawsFromCodePool({ isEpay: "false" }, undefined)).toBe(false);
  });
});
