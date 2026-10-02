import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/* Public routes must be mounted before any router that applies a blanket
   `router.use(requireAuth)` (routes/index.ts): mounted after one, they answer
   every visitor 401. The unsubscribe link in marketing emails did exactly that.
   Each request here is anonymous and must reach its own handler — a 400 for a
   bad token, not the guard's 401. */

describe("public routes are reachable without a session", () => {
  let app: express.Express;
  beforeAll(async () => {
    process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
    const { default: routes } = await import("../routes");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use("/api", routes);
  }, 120_000);

  it("unsubscribe", async () => {
    const res = await request(app).get("/api/unsubscribe?t=not-a-token");
    expect(res.status).toBe(400);
    expect(res.text).toContain("Invalid or expired link");
  });

  it("product QR page", async () => {
    const res = await request(app).get("/api/public/b/no-such-business/products/1");
    expect(res.status).toBe(404);
  });
});
