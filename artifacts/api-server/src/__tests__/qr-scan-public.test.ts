import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";

// Regression guard for scanned/downloaded tracked QR codes returning
// {"error":"Unauthorized"}. A tracked QR encodes /api/qr/r/:id, which is a
// PUBLIC redirect. The bug: qrRouter (and shortlinksRouter) were mounted in
// routes/index.ts AFTER routers that apply a blanket, pathless
// router.use(requireAuth), so an unauthenticated scan hit that guard first and
// got a 401 before reaching the public handler.
//
// This test mounts the REAL routes/index.ts chain with the REAL requireAuth and
// NO session, so any router mounted before qr/shortlinks that applies a blanket
// guard would 401 the scan. db is mocked to resolve every query to [], so a scan
// that DOES reach the public handler lands on its "not found" branch (404/redirect),
// never 401. If someone re-orders the mounts and reintroduces the bug, the
// "not 401" assertions below fail.

// Keep the REAL table exports (they are just Drizzle column refs — many routers
// dereference them at module top-level) and override only `db` so every query
// resolves to []. Vitest builds the mock namespace from enumerable keys, so a
// Proxy can't stand in for the ~100 named table exports — importOriginal is the
// clean way to preserve them all.
vi.mock("@workspace/db", async (importOriginal) => {
  // The real db module throws if DATABASE_URL is unset and constructs a pg Pool;
  // the Pool connects lazily, so a placeholder URL is enough to import cleanly.
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain: any = new Proxy({} as any, {
    get(_t, k) {
      if (k === "then") return (res: any) => Promise.resolve([]).then(res);
      if (k === "catch") return () => chain;
      if (k === "finally") return () => chain;
      return () => chain;
    },
  });
  const db = new Proxy({} as any, { get: () => () => chain });
  return { ...actual, db };
});

let app: express.Express;

beforeAll(async () => {
  const { default: apiRouter } = await import("../routes/index");
  app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
}, 60000); // importing the full ~139-router chain is transform-heavy

describe("public QR / shortlink resolvers survive the blanket-auth routers", () => {
  it("GET /api/qr/r/:id is reachable without a session (not 401)", async () => {
    const res = await request(app).get("/api/qr/r/1");
    expect(res.status).not.toBe(401);
    expect(res.body).not.toEqual({ error: "Unauthorized" });
  });

  it("GET /api/shortlinks/r/:slug is reachable without a session (not 401)", async () => {
    const res = await request(app).get("/api/shortlinks/r/some-slug");
    expect(res.status).not.toBe(401);
    expect(res.body).not.toEqual({ error: "Unauthorized" });
  });

  it("an authenticated QR route still 401s without a session (guard is active)", async () => {
    // Negative control: proves requireAuth really rejects unauthenticated
    // requests, so the two assertions above pass because of mount order — not
    // because auth is disabled in this test.
    const res = await request(app).get("/api/qr-codes");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });
});
