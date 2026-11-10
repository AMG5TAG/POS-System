import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Inventory › Promotions routes (routes/promotions.ts) against the real
 * database (skipped without DATABASE_URL): saved copy is per product and per
 * business, is cleaned on the way in, and drafting falls back to the product's
 * own text whenever Claude is unavailable — never to an error.
 */

const hasDb = !!process.env.DATABASE_URL;

const h = vi.hoisted(() => ({ merchantId: 0, ai: "none" as "none" | "ok" | "fail" }));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { session: Record<string, unknown> }).session.merchantId = h.merchantId;
    (req as unknown as { log: unknown }).log = { warn: () => {}, error: () => {}, info: () => {} };
    next();
  },
}));
vi.mock("../services/ai", () => ({
  NoAiProviderError: class extends Error {},
  isAiAvailable: async () => h.ai !== "none",
  aiJson: async () => {
    if (h.ai === "fail") throw new Error("rate limited");
    return {
      provider: "claude",
      data: {
        subtitle: "Business desktop", features: ["Fast", "Quiet", "Small", "Cool", "Cheap"],
        pitch: "Ultra all in one", blurb: "Mounts behind your monitor.",
        specs: { cpu: "Intel i5", ram: "", storage: "", gpu: "", display: "", os: "", warranty: "Lifetime", grade: "" },
      },
    };
  },
}));

describe.skipIf(!hasDb)("promotions routes (real DB)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, t: any, orm: any, app: express.Express;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let productId = 0;

  beforeAll(async () => {
    t = await import("@workspace/db");
    db = t.db;
    orm = await import("drizzle-orm");
    const [m] = await db.select({ id: t.merchantsTable.id }).from(t.merchantsTable).limit(1);
    h.merchantId = m.id;
    const [p] = await db.insert(t.productsTable).values({
      merchantId: h.merchantId, name: "Promo Test Dell Optiplex Desktop (Refurbished)", price: "695",
      description: "Compact business desktop for the office.\n• Whisper quiet",
      technicalSpecs: "Processor: Intel i5\nMemory: 16GB",
      warrantyDuration: 12, warrantyUnit: "months",
    }).returning();
    productId = p.id;
    const { default: router } = await import("../routes/promotions");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use("/api", router);
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(t.productPromotionsTable).where(orm.eq(t.productPromotionsTable.productId, productId));
    await db.delete(t.productsTable).where(orm.eq(t.productsTable.id, productId));
    await t.pool.end();
  });

  it("drafts from the product when no AI is connected, and picks the computers card", async () => {
    h.ai = "none";
    const res = await request(app).post(`/api/promotions/${productId}/generate`).expect(200);
    expect(res.body.source).toBe("product");
    expect(res.body.aiError).toBeUndefined();
    expect(res.body.suggestedTemplate).toBe("computers");
    expect(res.body.copy.features).toContain("Whisper quiet");
    expect(res.body.copy.specs).toMatchObject({ cpu: "Intel i5", ram: "16GB", warranty: "12 months" });
    expect(res.body.copy.banner).toMatch(/refurbished/i);
  });

  it("uses Claude when connected, keeping the warranty from the product record", async () => {
    h.ai = "ok";
    const res = await request(app).post(`/api/promotions/${productId}/generate`).expect(200);
    expect(res.body.source).toBe("ai");
    expect(res.body.copy.pitch).toBe("Ultra all in one");
    expect(res.body.copy.specs.cpu).toBe("Intel i5");
    expect(res.body.copy.specs.ram).toBe("16GB");
    expect(res.body.copy.specs.warranty).toBe("12 months");
  });

  it("falls back to the product's text, with a note, when Claude fails", async () => {
    h.ai = "fail";
    const res = await request(app).post(`/api/promotions/${productId}/generate`).expect(200);
    expect(res.body.source).toBe("product");
    expect(res.body.aiError).toBeTruthy();
  });

  it("saves, cleans, updates in place and lists the copy", async () => {
    await request(app).put(`/api/promotions/${productId}`).send({
      template: "computers",
      copy: { features: ["  Fast  ", "", "fast"], pitch: "Hello", specs: { cpu: "i7" } },
    }).expect(200);
    const res = await request(app).put(`/api/promotions/${productId}`).send({
      template: "products", copy: { features: ["Quiet"], pitch: "Again" },
    }).expect(200);
    expect(res.body.template).toBe("products");
    expect(res.body.copy.features).toEqual(["Quiet"]);

    const list = await request(app).get("/api/promotions").expect(200);
    const mine = list.body.filter((r: { productId: number }) => r.productId === productId);
    expect(mine).toHaveLength(1);
    expect(mine[0].copy.pitch).toBe("Again");
    expect(mine[0].copy.specs.cpu).toBe("");
  });

  it("refuses an unknown template and a product that is not this business's", async () => {
    await request(app).put(`/api/promotions/${productId}`).send({ template: "bogus", copy: {} }).expect(400);
    await request(app).put("/api/promotions/2147483000").send({ template: "classic", copy: {} }).expect(404);
    await request(app).post("/api/promotions/2147483000/generate").expect(404);
  });

  it("forgets saved copy", async () => {
    await request(app).delete(`/api/promotions/${productId}`).expect(204);
    const list = await request(app).get("/api/promotions").expect(200);
    expect(list.body.some((r: { productId: number }) => r.productId === productId)).toBe(false);
  });
});
