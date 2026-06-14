import { Router, type IRouter } from "express";
import { db, serviceJobTimeTable, serviceJobsTable, staffTable } from "@workspace/db";
import { eq, and, asc, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type Row = typeof serviceJobTimeTable.$inferSelect;

async function ownJob(merchantId: number, jobId: number): Promise<boolean> {
  if (!Number.isFinite(jobId)) return false;
  const [job] = await db.select({ id: serviceJobsTable.id }).from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, jobId), eq(serviceJobsTable.merchantId, merchantId))).limit(1);
  return !!job;
}

function liveMinutes(row: Row): number {
  if (row.durationMinutes != null) return row.durationMinutes;
  if (!row.endedAt) return Math.max(0, Math.round((Date.now() - row.startedAt.getTime()) / 60000));
  return Math.max(0, Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 60000));
}

async function listAndTotals(jobId: number, staffNames: Map<number, string>) {
  const rows = await db.select().from(serviceJobTimeTable)
    .where(eq(serviceJobTimeTable.serviceJobId, jobId))
    .orderBy(asc(serviceJobTimeTable.id));
  const entries = rows.map((r) => ({
    id: r.id,
    staffId: r.staffId ?? null,
    staffName: r.staffId ? (staffNames.get(r.staffId) ?? null) : null,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    durationMinutes: liveMinutes(r),
    running: !r.endedAt,
    note: r.note ?? null,
  }));
  const totalMinutes = entries.reduce((s, e) => s + e.durationMinutes, 0);
  const running = entries.find((e) => e.running) ?? null;
  return { entries, totalMinutes, running };
}

async function staffMap(merchantId: number): Promise<Map<number, string>> {
  const rows = await db.select().from(staffTable).where(eq(staffTable.merchantId, merchantId));
  return new Map(rows.map((s) => [s.id, s.name]));
}

// GET /service-jobs/:jobId/time
router.get("/service-jobs/:jobId/time", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobId = Number(req.params.jobId);
  if (!(await ownJob(merchantId, jobId))) { res.status(404).json({ error: "Service job not found" }); return; }
  res.json(await listAndTotals(jobId, await staffMap(merchantId)));
});

// POST /service-jobs/:jobId/time — action: start | stop | manual
router.post("/service-jobs/:jobId/time", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobId = Number(req.params.jobId);
  if (!(await ownJob(merchantId, jobId))) { res.status(404).json({ error: "Service job not found" }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const action = String(b.action ?? "");
  const staffId = b.staffId != null ? Number(b.staffId) : (req.session.staffId ?? null);

  if (action === "start") {
    // Close any running timer for this staff on this job first.
    await db.update(serviceJobTimeTable)
      .set({ endedAt: new Date() })
      .where(and(eq(serviceJobTimeTable.serviceJobId, jobId), isNull(serviceJobTimeTable.endedAt),
        staffId != null ? eq(serviceJobTimeTable.staffId, staffId) : isNull(serviceJobTimeTable.staffId)));
    // stamp durations for the just-closed rows
    await stampDurations(jobId);
    await db.insert(serviceJobTimeTable).values({ merchantId, serviceJobId: jobId, staffId });
  } else if (action === "stop") {
    const entryId = b.entryId != null ? Number(b.entryId) : null;
    const cond = entryId != null
      ? and(eq(serviceJobTimeTable.id, entryId), eq(serviceJobTimeTable.serviceJobId, jobId))
      : and(eq(serviceJobTimeTable.serviceJobId, jobId), isNull(serviceJobTimeTable.endedAt));
    await db.update(serviceJobTimeTable).set({ endedAt: new Date() }).where(cond);
    await stampDurations(jobId);
  } else if (action === "manual") {
    const minutes = Math.max(0, Math.round(Number(b.minutes) || 0));
    if (minutes <= 0) { res.status(400).json({ error: "Minutes must be > 0" }); return; }
    const ended = new Date();
    const started = new Date(ended.getTime() - minutes * 60000);
    await db.insert(serviceJobTimeTable).values({
      merchantId, serviceJobId: jobId, staffId,
      startedAt: started, endedAt: ended, durationMinutes: minutes,
      note: typeof b.note === "string" && b.note.trim() ? b.note.trim() : null,
    });
  } else {
    res.status(400).json({ error: "Invalid action" }); return;
  }

  res.json(await listAndTotals(jobId, await staffMap(merchantId)));
});

/** Persist durationMinutes for any ended rows that haven't been stamped yet. */
async function stampDurations(jobId: number): Promise<void> {
  const rows = await db.select().from(serviceJobTimeTable)
    .where(and(eq(serviceJobTimeTable.serviceJobId, jobId), isNull(serviceJobTimeTable.durationMinutes)));
  for (const r of rows) {
    if (r.endedAt) {
      const mins = Math.max(0, Math.round((r.endedAt.getTime() - r.startedAt.getTime()) / 60000));
      await db.update(serviceJobTimeTable).set({ durationMinutes: mins }).where(eq(serviceJobTimeTable.id, r.id));
    }
  }
}

// DELETE /service-jobs/:jobId/time/:entryId
router.delete("/service-jobs/:jobId/time/:entryId", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobId = Number(req.params.jobId);
  const entryId = Number(req.params.entryId);
  if (!(await ownJob(merchantId, jobId))) { res.status(404).json({ error: "Service job not found" }); return; }
  await db.delete(serviceJobTimeTable)
    .where(and(eq(serviceJobTimeTable.id, entryId), eq(serviceJobTimeTable.serviceJobId, jobId), eq(serviceJobTimeTable.merchantId, merchantId)));
  res.json(await listAndTotals(jobId, await staffMap(merchantId)));
});

export default router;
