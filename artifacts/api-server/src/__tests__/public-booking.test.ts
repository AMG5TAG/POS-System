import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";

/* The public repair booking form takes bookings for this install's own business
   only (routes/public-booking.ts). Other accounts are still in the database, and
   a booking to one wrote a customer and a service job into data nobody reads.
   Real DB (skipped without DATABASE_URL); reads only. */

const hasDb = !!process.env.DATABASE_URL;
const h = vi.hoisted(() => ({ sole: 0 as number | null }));
vi.mock("../lib/sole-merchant", () => ({ soleMerchantId: async () => h.sole }));

describe.skipIf(!hasDb)("public booking is this business's only (real DB)", () => {
  let app: express.Express;
  let own = { id: 0, username: "" };

  beforeAll(async () => {
    const t = await import("@workspace/db");
    const orm = await import("drizzle-orm");
    const [m] = await t.db.select({ id: t.merchantsTable.id, username: t.merchantsTable.username })
      .from(t.merchantsTable).where(orm.isNotNull(t.merchantsTable.username)).limit(1);
    own = { id: m!.id, username: m!.username! };
    app = express();
    app.use(express.json());
    app.use("/api", (await import("../routes/public-booking")).default);
  }, 120_000);

  it("serves the sole business's booking page", async () => {
    h.sole = own.id;
    expect((await request(app).get(`/api/book/${own.username}`)).status).toBe(200);
  });

  it("answers not found for any other business, and takes no booking for it", async () => {
    h.sole = own.id + 1_000_000; // as if this username belonged to another account
    expect((await request(app).get(`/api/book/${own.username}`)).status).toBe(404);
    const res = await request(app).post(`/api/book/${own.username}`)
      .send({ firstName: "Test", email: "nobody@example.com", faultDescription: "x" });
    expect(res.status).toBe(404);
  });
});
