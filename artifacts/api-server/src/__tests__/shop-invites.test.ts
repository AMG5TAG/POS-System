import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * Bulk shop-account invites (routes/shop-invites.ts). This emails real
 * customers, so what is pinned is who gets one and that nothing goes without
 * the exact count typed back.
 */

const h = vi.hoisted(() => ({ rows: [] as unknown[][] }));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        return () => chain();
      },
    });
  return { ...actual, db: new Proxy({} as any, { get: () => () => chain() }) };
});

const issueSetupLink = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../lib/customerPasswordLinks", () => ({ issueSetupLink }));
vi.mock("../middlewares/requireAuth", () => ({ requireAuth: (_q: any, _s: any, n: any) => n() }));
vi.mock("../middlewares/requireManagerOrOwner", () => ({ requireManagerOrOwner: (_q: any, _s: any, n: any) => n() }));

let app: express.Express;

const c = (id: number, email: string, portalPasswordHash: string | null = null) => ({ id, merchantId: 1, email, portalPasswordHash });
// Candidate rows as the eligibility query returns them (best customer first):
// ann has two records (one invite), bob has one, cat's duplicate already has a
// password (an active account — no invite).
const CANDIDATES = [c(1, "ann@example.com"), c(2, "Ann@Example.com "), c(3, "bob@example.com"), c(4, "cat@example.com"), c(5, "cat@example.com", "hash")];

beforeAll(async () => {
  const { default: router } = await import("../routes/shop-invites");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).session = { merchantId: 1 }; next(); });
  app.use("/api", router);
}, 60000);

beforeEach(() => { h.rows = []; issueSetupLink.mockClear(); });

describe("shop invites", () => {
  it("counts one invite per email, and none where the email already has an account", async () => {
    h.rows = [[{ active: 1 }], [{ noEmail: 7 }], CANDIDATES];
    const res = await request(app).get("/api/shop-invites/summary");
    expect(res.body).toMatchObject({ eligible: 2, active: 1, noEmail: 7 });
  });

  it("sends nothing when the typed count doesn't match", async () => {
    h.rows = [CANDIDATES];
    const res = await request(app).post("/api/shop-invites/send").send({ confirmCount: 5 });
    expect(res.status).toBe(409);
    expect(res.body.eligible).toBe(2);
    expect(issueSetupLink).not.toHaveBeenCalled();
  });

  it("sends nothing without a confirmation", async () => {
    const res = await request(app).post("/api/shop-invites/send").send({});
    expect(res.status).toBe(400);
    expect(issueSetupLink).not.toHaveBeenCalled();
  });

  it("emails each eligible customer a shop invite once the count is confirmed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      h.rows = [CANDIDATES];
      const res = await request(app).post("/api/shop-invites/send").send({ confirmCount: 2 });
      expect(res.status).toBe(202);
      await vi.runAllTimersAsync();
      expect(issueSetupLink).toHaveBeenCalledTimes(2);
      const ids = issueSetupLink.mock.calls.map((call) => ((call as unknown as [{ id: number }])[0]).id);
      expect(ids).toEqual([1, 3]);
      for (const call of issueSetupLink.mock.calls) {
        const [, purpose] = call as unknown as [unknown, string];
        expect(purpose).toBe("invite");
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
