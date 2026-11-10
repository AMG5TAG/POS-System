import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { archiveLogText, canArchive, clearsArchive } from "../lib/service-job-archive";

/* Service Jobs › Archive. A parked job keeps its status, so Restore puts it
   back where it was; finished jobs are history, not archive. */

describe("archive rules", () => {
  it("archives open jobs only", () => {
    expect(canArchive("awaiting-customer")).toBe(true);
    expect(canArchive("in-progress")).toBe(true);
    expect(canArchive("completed")).toBe(false);
    expect(canArchive("cancelled")).toBe(false);
  });
  it("finishing a job takes it out of the archive", () => {
    expect(clearsArchive("completed")).toBe(true);
    expect(clearsArchive("cancelled")).toBe(true);
    expect(clearsArchive("in-progress")).toBe(false);
  });
  it("logs why", () => {
    expect(archiveLogText(true, "declined", " Too expensive ")).toBe("Archived — Customer declined: Too expensive");
    expect(archiveLogText(true, "long-term")).toBe("Archived — Long-term job");
    expect(archiveLogText(true)).toBe("Archived — Other");
    expect(archiveLogText(false)).toBe("Restored from archive");
  });
});

const hasDb = !!process.env.DATABASE_URL;
const h = vi.hoisted(() => ({ merchantId: 0 }));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { session: Record<string, unknown> }).session.merchantId = h.merchantId;
    (req as unknown as { log: unknown }).log = { warn: () => {}, error: () => {}, info: () => {} };
    next();
  },
}));
vi.mock("../services/sms", () => ({ sendSms: vi.fn(async () => {}) }));
vi.mock("../services/email", () => ({ sendEmail: vi.fn(async () => {}) }));

describe.skipIf(!hasDb)("archive route (real DB)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, t: any, orm: any, app: express.Express;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const ids: number[] = [];
  const tag = `ARCH${Date.now()}`;

  beforeAll(async () => {
    t = await import("@workspace/db");
    db = t.db;
    orm = await import("drizzle-orm");
    const [m] = await db.select({ id: t.merchantsTable.id }).from(t.merchantsTable).limit(1);
    h.merchantId = m.id;
    for (const [i, status] of (["awaiting-customer", "in-progress", "completed"] as const).entries()) {
      const [j] = await db.insert(t.serviceJobsTable).values({
        merchantId: h.merchantId, jobNumber: `${tag}-${i}`, status, bookInDate: "2026-11-01", title: "Archive test",
      }).returning();
      ids.push(j.id);
    }
    const { default: router } = await import("../routes/service-jobs");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use("/api", router);
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(t.serviceJobsTable).where(orm.inArray(t.serviceJobsTable.id, ids));
    await t.pool.end();
  });

  const row = async (id: number) => (await db.select().from(t.serviceJobsTable).where(orm.eq(t.serviceJobsTable.id, id)))[0];

  it("archives open jobs with a reason, keeps their status, logs it, and skips finished ones", async () => {
    const res = await request(app).post("/api/service-jobs/archive")
      .send({ ids, archived: true, reason: "declined", note: "Too dear" }).expect(200);
    expect(res.body.jobs).toHaveLength(2);
    expect(res.body.skipped).toBe(1);
    const a = await row(ids[0]!);
    expect(a.archivedAt).toBeTruthy();
    expect(a.archiveReason).toBe("declined");
    expect(a.status).toBe("awaiting-customer");
    expect(a.notes).toContain("Archived — Customer declined: Too dear");
    expect((await row(ids[2]!)).archivedAt).toBeNull();
    // The list carries the flag for the Archive tab.
    const list = await request(app).get("/api/service-jobs").expect(200);
    expect(list.body.find((j: { id: number }) => j.id === ids[0]).archiveReason).toBe("declined");
  });

  it("restores a job to where it was", async () => {
    await request(app).post("/api/service-jobs/archive").send({ ids: [ids[0]], archived: false }).expect(200);
    const a = await row(ids[0]!);
    expect(a.archivedAt).toBeNull();
    expect(a.archiveReason).toBeNull();
    expect(a.status).toBe("awaiting-customer");
    expect(a.notes).toContain("Restored from archive");
  });

  it("completing an archived job moves it to history", async () => {
    // ids[1] is still archived from the first test.
    expect((await row(ids[1]!)).archivedAt).toBeTruthy();
    await request(app).patch(`/api/service-jobs/${ids[1]}`).send({ status: "completed" }).expect(200);
    const b = await row(ids[1]!);
    expect(b.status).toBe("completed");
    expect(b.archivedAt).toBeNull();
  });
});
