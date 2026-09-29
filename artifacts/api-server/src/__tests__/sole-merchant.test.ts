import { describe, it, expect, vi, beforeEach } from "vitest";

/* KoaPOS runs for one business. Every other merchant row is kept in the
   database but must be unable to sign in or use an existing session. */

const rows: Record<number, { status: string; email: string }> = {
  1: { status: "active", email: "admin@koastal.com.au" },
  2: { status: "active", email: "someone-else@example.com" },
  3: { status: "suspended", email: "admin@koastal.com.au" },
};
let lastId = 0;

vi.mock("@workspace/db", () => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: (cond: { id: number }) => { lastId = cond.id; return chain; },
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve(rows[lastId] ? [rows[lastId]] : []).then(resolve),
  };
  return { db: chain, merchantsTable: { id: "id", status: "status", email: "email" } };
});
vi.mock("drizzle-orm", () => ({ eq: (_col: unknown, id: number) => ({ id }) }));

import { isSoleMerchantEmail, SOLE_MERCHANT_EMAIL } from "../lib/sole-merchant";
import { isMerchantActive, invalidateMerchantStatusCache } from "../middlewares/requireAuth";

describe("single-business install", () => {
  beforeEach(() => { for (const id of [1, 2, 3]) invalidateMerchantStatusCache(id); });

  it("defaults to admin@koastal.com.au", () => {
    expect(SOLE_MERCHANT_EMAIL).toBe("admin@koastal.com.au");
  });

  it("matches the email case- and whitespace-insensitively", () => {
    expect(isSoleMerchantEmail(" Admin@Koastal.com.au ")).toBe(true);
    expect(isSoleMerchantEmail("admin@koastalkomputers.com.au")).toBe(false);
    expect(isSoleMerchantEmail(null)).toBe(false);
    expect(isSoleMerchantEmail("")).toBe(false);
  });

  it("only the one business passes the session gate", async () => {
    expect(await isMerchantActive(1)).toBe(true);
    expect(await isMerchantActive(2)).toBe(false); // another business: data kept, access refused
    expect(await isMerchantActive(3)).toBe(false); // the right email is still subject to status
    expect(await isMerchantActive(99)).toBe(false);
  });
});
