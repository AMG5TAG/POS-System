import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { refereeProgress, DEFAULT_REFERRAL } from "../lib/referrals";

/**
 * The POS referral programme in the shop account (lib/referrals.ts,
 * routes/shop-account.ts, routes/shop.ts). Pinned:
 *
 *   - a referral qualifies on the POS's rule — spend, visits, inside the
 *     window — and the referrer sees whether the spend was reached, never the
 *     amount, and the friend's first name and last initial only;
 *   - a referral link's landing page names the referrer by first name only;
 *   - "Heard from: Friend" with a code links the customer as the POS does
 *     (referred_by = the code), once, and never to themself.
 */

const h = vi.hoisted(() => ({
  rows: [] as unknown[][], sets: [] as Record<string, unknown>[], session: {} as Record<string, unknown>,
}));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        if (k === "set") return (v: Record<string, unknown>) => { h.sets.push(v); return chain(); };
        return () => chain();
      },
    });
  return { ...actual, db: new Proxy({} as any, { get: () => () => chain() }) };
});
vi.mock("../lib/sole-merchant", () => ({ soleMerchantId: async () => 1, SOLE_MERCHANT_EMAIL: "owner@koastal.test" }));
vi.mock("../services/autoSyncScheduler", () => ({ triggerInstantSync: vi.fn() }));
vi.mock("../lib/phone", () => ({ normalisePhoneFor: async (_m: number, p: string) => p }));
vi.mock("../lib/customer-profile-rules", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  profileRequirements: vi.fn(async () => ({
    required: { email: false, phone: false, dateOfBirth: false, company: false, abn: false, billingAddress: false },
    heardFromSources: [{ name: "Friend", requiresDetails: true }],
  })),
}));

const DAY = 86_400_000;
const now = new Date("2026-10-01T00:00:00Z");
const friend = (over: object = {}) => ({
  firstName: "Jo", lastName: "Bloggs", createdAt: new Date(now.getTime() - 10 * DAY), totalSpent: "60.00", visitCount: 2, ...over,
});

describe("refereeProgress", () => {
  it("qualifies with the spend and visits inside the window", () => {
    expect(refereeProgress(friend(), DEFAULT_REFERRAL, now)).toMatchObject({ qualified: true, spendReached: true, visits: 2, expired: false });
  });

  it("is in progress short of either threshold, with the days left", () => {
    expect(refereeProgress(friend({ visitCount: 1 }), DEFAULT_REFERRAL, now)).toMatchObject({ qualified: false, daysLeft: 80, expired: false });
    expect(refereeProgress(friend({ totalSpent: "20" }), DEFAULT_REFERRAL, now)).toMatchObject({ qualified: false, spendReached: false });
  });

  it("closes once the window passes unqualified", () => {
    expect(refereeProgress(friend({ visitCount: 1, createdAt: new Date(now.getTime() - 120 * DAY) }), DEFAULT_REFERRAL, now))
      .toMatchObject({ qualified: false, expired: true, daysLeft: 0 });
  });

  it("names the friend by first name and last initial, and never their spend", () => {
    const p = refereeProgress(friend(), DEFAULT_REFERRAL, now);
    expect(p.name).toBe("Jo B.");
    expect(JSON.stringify(p)).not.toContain("60");
  });
});

let app: express.Express;
const customer = {
  id: 9, merchantId: 1, firstName: "Sam", lastName: "Lee", email: "sam@example.com", referralCode: "SL-AB12",
  referredBy: null as string | null, referredByCustomerId: null as number | null, dateOfBirth: null, heardFrom: null,
};
const profile = (over: object = {}) => ({
  firstName: "Sam", lastName: "Lee", phone: "",
  address: { street: "", city: "", state: "", postcode: "", country: "Australia" }, heardFrom: "Friend", heardFromDetails: "Jo", ...over,
});

beforeAll(async () => {
  const { default: shopRouter } = await import("../routes/shop");
  const { default: accountRouter } = await import("../routes/shop-account");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).session = h.session; next(); });
  app.use("/api", shopRouter, accountRouter);
}, 60000);

beforeEach(() => { h.rows = []; h.sets = []; h.session = {}; });

describe("referral link landing page", () => {
  it("names the referrer by first name only", async () => {
    h.rows = [[{ id: 4, firstName: "Jo", lastName: "Bloggs", referralCode: "JB-XY34" }], [], [], [{ businessName: "Koastal" }]];
    const res = await request(app).get("/api/shop/referral/jb-xy34");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: "JB-XY34", firstName: "Jo", businessName: "Koastal" });
    expect(JSON.stringify(res.body)).not.toContain("Bloggs");
  });

  it("404s a code that names nobody", async () => {
    h.rows = [[]];
    expect((await request(app).get("/api/shop/referral/NOPE")).status).toBe(404);
  });
});

describe("Heard from: Friend, with a referral code", () => {
  // Query order: the shopper; then their sibling records and the referrer.
  it("links the customer to the friend as the POS does", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[customer], [{ id: 9 }], [{ id: 4, firstName: "Jo", lastName: "Bloggs", referralCode: "JB-XY34" }], [customer]];
    const res = await request(app).patch("/api/shop/account/profile").send(profile({ friendReferralCode: "jb-xy34" }));
    expect(res.status).toBe(200);
    expect(h.sets[0]).toMatchObject({ referredBy: "JB-XY34", referredByCustomerId: 4, heardFrom: "Friend", heardFromDetails: "Jo" });
  });

  it("is optional", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[customer], [customer]];
    const res = await request(app).patch("/api/shop/account/profile").send(profile());
    expect(res.status).toBe(200);
    expect(h.sets[0]).not.toHaveProperty("referredBy");
  });

  it("refuses a code that names nobody (or the customer themself)", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[customer], [{ id: 9 }], []];
    const res = await request(app).patch("/api/shop/account/profile").send(profile({ friendReferralCode: "SL-AB12" }));
    expect(res.status).toBe(400);
    expect(h.sets).toEqual([]);
  });

  it("can't move a referral that is already linked", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[{ ...customer, referredBy: "JB-XY34", referredByCustomerId: 4 }]];
    const res = await request(app).patch("/api/shop/account/profile").send(profile({ friendReferralCode: "ZZ-9999" }));
    expect(res.status).toBe(409);
    expect(h.sets).toEqual([]);
  });

  it("re-saving the linked code is fine", async () => {
    h.session = { portalCustomerId: 9 };
    const linked = { ...customer, referredBy: "JB-XY34", referredByCustomerId: 4 };
    h.rows = [[linked], [linked]];
    expect((await request(app).patch("/api/shop/account/profile").send(profile({ friendReferralCode: "JB-XY34" }))).status).toBe(200);
  });
});
