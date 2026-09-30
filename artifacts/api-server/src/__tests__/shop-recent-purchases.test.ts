import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * "Just purchased" pop-ups (GET /shop/recent-purchases, routes/shop.ts).
 * Pinned: the response says what sold and when — never who bought it — only
 * products the shop lists are named, services are left out, and the newest
 * sale comes first.
 */

const h = vi.hoisted(() => ({ rows: [] as unknown[] }));

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
vi.mock("../lib/sole-merchant", () => ({ soleMerchantId: async () => 1 }));
vi.mock("../services/autoSyncScheduler", () => ({ triggerInstantSync: vi.fn() }));

let app: express.Express;

beforeAll(async () => {
  const { default: shopRouter } = await import("../routes/shop");
  app = express();
  app.use("/api", shopRouter);
}, 60000);

beforeEach(() => { h.rows = []; });

describe("shop recent purchases", () => {
  it("lists listed products newest first, without services or buyer details", async () => {
    h.rows = [
      { rows: [{ pid: 2, at: "2026-09-30T03:00:00Z" }, { pid: 1, at: "2026-09-30T01:00:00Z" }, { pid: 3, at: "2026-09-30T02:00:00Z" }] },
      [
        { id: 1, name: "USB-C cable", imageUrl: null, isService: false },
        { id: 2, name: "iPhone case", imageUrl: null, isService: null },
        { id: 3, name: "Screen repair", imageUrl: null, isService: true },
      ],
    ];
    const res = await request(app).get("/api/shop/recent-purchases");
    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: number }) => p.id)).toEqual([2, 1]);
    for (const p of res.body) expect(Object.keys(p).sort()).toEqual(["id", "imageUrl", "name", "purchasedAt"]);
  });

  it("returns an empty list when nothing sold", async () => {
    h.rows = [{ rows: [] }];
    const res = await request(app).get("/api/shop/recent-purchases");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
