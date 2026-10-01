import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Automatic referral rewards (services/referralRewards.ts). Pinned:
 *   - nothing is paid until the referred customer qualifies (spend + visits,
 *     inside the window) — not at sign-up;
 *   - when they do, the referrer and the friend are both credited, once: the
 *     referral_rewards row is the guard, and a second check pays nothing;
 *   - nothing is paid while the referral or loyalty programme is off;
 *   - a customer is never their own referrer.
 */

const h = vi.hoisted(() => ({
  rows: [] as unknown[][], values: [] as Record<string, unknown>[], sets: [] as Record<string, unknown>[],
}));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        if (k === "values") return (v: Record<string, unknown>) => { h.values.push(v); return chain(); };
        if (k === "set") return (v: Record<string, unknown>) => { h.sets.push(v); return chain(); };
        return () => chain();
      },
    });
  const db: any = new Proxy({} as any, {
    get: (_t, k) => (k === "transaction" ? (fn: (tx: unknown) => unknown) => fn(db) : () => chain()),
  });
  return { ...actual, db };
});

const { awardReferralIfQualified } = await import("../services/referralRewards");

const DAY = 86_400_000;
const now = new Date("2026-10-01T00:00:00Z");
const friend = (over: object = {}) => ({
  id: 20, merchantId: 1, referredBy: "SL-AB12", referredByCustomerId: 9,
  createdAt: new Date(now.getTime() - 10 * DAY), totalSpent: "80.00", visitCount: 2, ...over,
});
const SETTINGS = [{ s: JSON.stringify({ enabled: true, minSpend: 50, minVisits: 2, qualifyDays: 90, refereeRewardValue: 200, referrerRewardValue: 500 }) }];
const LOYALTY_ON = [{ isEnabled: "true" }];

beforeEach(() => { h.rows = []; h.values = []; h.sets = []; });

describe("awardReferralIfQualified", () => {
  it("pays the referrer and the friend once the friend qualifies", async () => {
    h.rows = [[friend()], SETTINGS, LOYALTY_ON, [{ id: 9 }], [{ id: 1 }]];
    expect(await awardReferralIfQualified(1, 20, now)).toBe("paid");
    expect(h.values[0]).toMatchObject({ refereeCustomerId: 20, referrerCustomerId: 9, referrerValue: "500.00", refereeValue: "200.00", status: "paid" });
    expect(h.sets).toHaveLength(2); // both loyalty balances credited
  });

  it("pays nothing a second time — the reward row already exists", async () => {
    h.rows = [[friend()], SETTINGS, LOYALTY_ON, [{ id: 9 }], []];
    expect(await awardReferralIfQualified(1, 20, now)).toBe("already");
    expect(h.sets).toEqual([]);
  });

  it("pays nothing until the friend qualifies", async () => {
    h.rows = [[friend({ visitCount: 1 })], SETTINGS, LOYALTY_ON];
    expect(await awardReferralIfQualified(1, 20, now)).toBe("not_qualified");
    expect(h.values).toEqual([]);
  });

  it("pays nothing once the window has closed", async () => {
    h.rows = [[friend({ createdAt: new Date(now.getTime() - 120 * DAY) })], SETTINGS, LOYALTY_ON];
    expect(await awardReferralIfQualified(1, 20, now)).toBe("not_qualified");
  });

  it("ignores a customer nobody referred", async () => {
    h.rows = [[friend({ referredBy: null, referredByCustomerId: null })]];
    expect(await awardReferralIfQualified(1, 20, now)).toBe("not_referred");
  });

  it("pays nothing while the referral programme is off", async () => {
    h.rows = [[friend()], [{ s: JSON.stringify({ enabled: false }) }], LOYALTY_ON];
    expect(await awardReferralIfQualified(1, 20, now)).toBe("off");
  });

  it("pays nothing while the loyalty programme is off", async () => {
    h.rows = [[friend()], SETTINGS, [{ isEnabled: "false" }]];
    expect(await awardReferralIfQualified(1, 20, now)).toBe("off");
  });

  it("never credits a customer as their own referrer", async () => {
    h.rows = [[friend({ referredByCustomerId: 20 })], SETTINGS, LOYALTY_ON, [{ id: 20 }], [{ id: 1 }]];
    expect(await awardReferralIfQualified(1, 20, now)).toBe("paid");
    expect(h.values[0]).toMatchObject({ referrerCustomerId: null, referrerValue: "0.00" });
    expect(h.sets).toHaveLength(1); // only the friend's own reward
  });
});
