import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * The shop's favicon is the business logo (routes/shop.ts, GET /shop/favicon).
 * Pinned: a stored data: URL is served as the image itself, a hosted logo is a
 * redirect, and an SVG is refused — served from the shop's origin it could run
 * script.
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
vi.mock("../lib/sole-merchant", () => ({ soleMerchantId: async () => 1 }));
vi.mock("../services/autoSyncScheduler", () => ({ triggerInstantSync: vi.fn() }));

let app: express.Express;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

beforeAll(async () => {
  const { default: router } = await import("../routes/shop");
  app = express();
  app.use("/api", router);
}, 60000);

beforeEach(() => { h.rows = []; });

describe("shop favicon", () => {
  it("serves a stored data: URL logo as the image", async () => {
    h.rows = [[{ logoUrl: null }], [{ logo: `data:image/png;base64,${PNG.toString("base64")}` }]];
    const res = await request(app).get("/api/shop/favicon").buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^image\/png/);
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
    expect(res.headers.etag).toBeTruthy();
  });

  it("prefers the business profile logo, falling back to the merchant's", async () => {
    h.rows = [[{ logoUrl: "https://cdn.example.com/logo.png" }], [{ logo: "" }]];
    const res = await request(app).get("/api/shop/favicon");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://cdn.example.com/logo.png");
  });

  it("refuses an SVG logo", async () => {
    h.rows = [[{ logoUrl: null }], [{ logo: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}` }]];
    expect((await request(app).get("/api/shop/favicon")).status).toBe(404);
  });
});
