import { Router, type IRouter } from "express";
import { db, serviceJobChecklistTable, serviceJobsTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type Row = typeof serviceJobChecklistTable.$inferSelect;

const RESULTS = new Set(["pending", "pass", "fail", "na"]);
const PHASES = new Set(["intake", "outgoing"]);

function fmt(row: Row) {
  return {
    id: row.id,
    serviceJobId: row.serviceJobId,
    label: row.label,
    result: row.result,
    phase: row.phase,
    note: row.note ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ownJob(merchantId: number, jobId: number): Promise<boolean> {
  if (!Number.isFinite(jobId)) return false;
  const [job] = await db.select({ id: serviceJobsTable.id }).from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, jobId), eq(serviceJobsTable.merchantId, merchantId))).limit(1);
  return !!job;
}

async function list(jobId: number) {
  const rows = await db.select().from(serviceJobChecklistTable)
    .where(eq(serviceJobChecklistTable.serviceJobId, jobId))
    .orderBy(asc(serviceJobChecklistTable.sortOrder), asc(serviceJobChecklistTable.id));
  return { items: rows.map(fmt) };
}

// GET /service-jobs/:jobId/checklist
router.get("/service-jobs/:jobId/checklist", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobId = Number(req.params.jobId);
  if (!(await ownJob(merchantId, jobId))) { res.status(404).json({ error: "Service job not found" }); return; }
  res.json(await list(jobId));
});

// POST /service-jobs/:jobId/checklist — add one item, or many (body.items[]) to apply a template.
router.post("/service-jobs/:jobId/checklist", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobId = Number(req.params.jobId);
  if (!(await ownJob(merchantId, jobId))) { res.status(404).json({ error: "Service job not found" }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const incoming: Array<Record<string, unknown>> = Array.isArray(b.items)
    ? (b.items as Array<Record<string, unknown>>)
    : [b];

  const [{ max }] = await db.select({
    max: sql<number>`COALESCE(MAX(${serviceJobChecklistTable.sortOrder}), 0)`,
  }).from(serviceJobChecklistTable).where(eq(serviceJobChecklistTable.serviceJobId, jobId));
  let order = Number(max ?? 0);

  const values = incoming
    .map((it) => {
      const label = typeof it.label === "string" ? it.label.trim() : "";
      if (!label) return null;
      order += 1;
      return {
        merchantId,
        serviceJobId: jobId,
        label,
        result: typeof it.result === "string" && RESULTS.has(it.result) ? it.result : "pending",
        phase: typeof it.phase === "string" && PHASES.has(it.phase) ? it.phase : "intake",
        note: typeof it.note === "string" && it.note.trim() ? it.note.trim() : null,
        sortOrder: order,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (values.length === 0) { res.status(400).json({ error: "No valid checklist items" }); return; }
  await db.insert(serviceJobChecklistTable).values(values);
  res.json(await list(jobId));
});

// PUT /service-jobs/:jobId/checklist/:itemId — set result/note/label.
router.put("/service-jobs/:jobId/checklist/:itemId", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobId = Number(req.params.jobId);
  const itemId = Number(req.params.itemId);
  if (!(await ownJob(merchantId, jobId))) { res.status(404).json({ error: "Service job not found" }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<typeof serviceJobChecklistTable.$inferInsert> = {};
  if (typeof b.label === "string" && b.label.trim()) patch.label = b.label.trim();
  if (typeof b.result === "string" && RESULTS.has(b.result)) patch.result = b.result;
  if (typeof b.phase === "string" && PHASES.has(b.phase)) patch.phase = b.phase;
  if (typeof b.note === "string") patch.note = b.note.trim() || null;

  const [updated] = await db.update(serviceJobChecklistTable).set(patch)
    .where(and(
      eq(serviceJobChecklistTable.id, itemId),
      eq(serviceJobChecklistTable.serviceJobId, jobId),
      eq(serviceJobChecklistTable.merchantId, merchantId),
    )).returning();
  if (!updated) { res.status(404).json({ error: "Item not found" }); return; }
  res.json(await list(jobId));
});

// DELETE /service-jobs/:jobId/checklist/:itemId
router.delete("/service-jobs/:jobId/checklist/:itemId", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobId = Number(req.params.jobId);
  const itemId = Number(req.params.itemId);
  if (!(await ownJob(merchantId, jobId))) { res.status(404).json({ error: "Service job not found" }); return; }
  await db.delete(serviceJobChecklistTable)
    .where(and(
      eq(serviceJobChecklistTable.id, itemId),
      eq(serviceJobChecklistTable.serviceJobId, jobId),
      eq(serviceJobChecklistTable.merchantId, merchantId),
    ));
  res.json(await list(jobId));
});

export default router;
