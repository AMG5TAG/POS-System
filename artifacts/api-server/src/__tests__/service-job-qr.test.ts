import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * The service-job QR resolver (`GET /api/qr/j/:jobId`).
 *
 * A repair sticker is printed once and then lives on the device for weeks, so
 * the ink cannot be re-encoded when the job moves on. The sticker carries this
 * stable url and the destination is chosen at scan time — the Tech App while
 * staff still have the device, the customer's portal once the job is completed.
 * These tests pin that choice, since getting it wrong hands a customer a staff
 * login screen (or, worse, hands a stranger someone's portal).
 */

// Rows the mocked `db` hands back, in query order. Each awaited Drizzle chain
// shifts one off, so a test just lists what its route's queries should find.
const h = vi.hoisted(() => ({ rows: [] as unknown[][] }));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  // Keep every real table export (routers dereference them at module top-level)
  // and swap only `db`.
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        if (k === "catch") return (rej: any) => Promise.resolve(h.rows.shift() ?? []).catch(rej);
        if (k === "finally") return (f: any) => Promise.resolve(h.rows.shift() ?? []).finally(f);
        return () => chain();
      },
    });
  const db = new Proxy({} as any, { get: () => () => chain() });
  return { ...actual, db };
});

let app: express.Express;

const JOB = { id: 7, merchantId: 1, status: "in-progress", customerId: 3 };
const MERCHANT = { username: "koastal", portalDomain: null };

beforeAll(async () => {
  process.env.PUBLIC_DOMAIN = "koapos.com.au"; // pin the origin the links advertise
  const { default: qrRouter } = await import("../routes/qr");
  app = express();
  app.use(express.json());
  app.use("/api", qrRouter);
}, 60000);

beforeEach(() => { h.rows = []; });

describe("GET /api/qr/j/:jobId", () => {
  it("sends an open job to the Tech App", async () => {
    h.rows = [[JOB], [MERCHANT]];
    const res = await request(app).get("/api/qr/j/7");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://koapos.com.au/b/koastal/t/techapp?job=7");
  });

  it("sends a completed job to the customer's portal", async () => {
    h.rows = [[{ ...JOB, status: "completed" }], [MERCHANT], [{ portalToken: "tok-123" }]];
    const res = await request(app).get("/api/qr/j/7");
    expect(res.headers.location).toBe("https://koapos.com.au/b/koastal/c/tok-123");
  });

  it("prefers the merchant's own portal domain when they have one", async () => {
    h.rows = [
      [{ ...JOB, status: "completed" }],
      [{ username: "koastal", portalDomain: "portal.koastal.com.au" }],
      [{ portalToken: "tok-123" }],
    ];
    const res = await request(app).get("/api/qr/j/7");
    expect(res.headers.location).toBe("https://portal.koastal.com.au/c/tok-123");
  });

  // A sticker that opens nothing is worse than one that opens the staff view.
  it("falls back to the Tech App when a completed job has no portal to open", async () => {
    h.rows = [[{ ...JOB, status: "completed" }], [MERCHANT], [{ portalToken: null }]];
    const res = await request(app).get("/api/qr/j/7");
    expect(res.headers.location).toBe("https://koapos.com.au/b/koastal/t/techapp?job=7");
  });

  it("falls back to the staff Service View when the merchant has no username", async () => {
    h.rows = [[JOB], [{ username: null, portalDomain: null }]];
    const res = await request(app).get("/api/qr/j/7");
    expect(res.headers.location).toBe("https://koapos.com.au/service-jobs/7");
  });

  it("404s an unknown job rather than redirecting somewhere misleading", async () => {
    h.rows = [[]];
    const res = await request(app).get("/api/qr/j/999");
    expect(res.status).toBe(404);
  });

  it("sends a junk id home instead of querying with NaN", async () => {
    const res = await request(app).get("/api/qr/j/not-a-number");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://koapos.com.au");
    expect(h.rows).toEqual([]); // no query was attempted
  });
});
