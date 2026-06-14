import { Router, type IRouter } from "express";
import { db, scheduledReportsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type Row = typeof scheduledReportsTable.$inferSelect;
const FREQ = new Set(["daily", "weekly", "monthly"]);
const FMT = new Set(["pdf", "csv"]);

function fmt(row: Row) {
  return {
    id: row.id,
    name: row.name,
    reportType: row.reportType,
    frequency: row.frequency,
    format: row.format,
    email: row.email,
    enabled: row.enabled === "true",
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function listAll(merchantId: number) {
  const rows = await db.select().from(scheduledReportsTable)
    .where(eq(scheduledReportsTable.merchantId, merchantId)).orderBy(desc(scheduledReportsTable.createdAt));
  return rows.map(fmt);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /scheduled-reports
router.get("/scheduled-reports", requireAuth, async (req, res): Promise<void> => {
  res.json({ items: await listAll(req.session.merchantId!) });
});

// POST /scheduled-reports
router.post("/scheduled-reports", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: "Valid email required" }); return; }
  await db.insert(scheduledReportsTable).values({
    merchantId,
    name,
    reportType: typeof b.reportType === "string" ? b.reportType : "daily_sales",
    frequency: typeof b.frequency === "string" && FREQ.has(b.frequency) ? b.frequency : "daily",
    format: typeof b.format === "string" && FMT.has(b.format) ? b.format : "pdf",
    email,
    enabled: "true",
  });
  res.status(201).json({ items: await listAll(merchantId) });
});

// PUT /scheduled-reports/:id — edit / toggle enabled.
router.put("/scheduled-reports/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<typeof scheduledReportsTable.$inferInsert> = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
  if (typeof b.reportType === "string") patch.reportType = b.reportType;
  if (typeof b.frequency === "string" && FREQ.has(b.frequency)) patch.frequency = b.frequency;
  if (typeof b.format === "string" && FMT.has(b.format)) patch.format = b.format;
  if (typeof b.email === "string" && EMAIL_RE.test(b.email.trim())) patch.email = b.email.trim();
  if (b.enabled !== undefined) patch.enabled = b.enabled ? "true" : "false";
  const [updated] = await db.update(scheduledReportsTable).set(patch)
    .where(and(eq(scheduledReportsTable.id, id), eq(scheduledReportsTable.merchantId, merchantId))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ items: await listAll(merchantId) });
});

// DELETE /scheduled-reports/:id
router.delete("/scheduled-reports/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  await db.delete(scheduledReportsTable)
    .where(and(eq(scheduledReportsTable.id, id), eq(scheduledReportsTable.merchantId, merchantId)));
  res.json({ items: await listAll(merchantId) });
});

export default router;
