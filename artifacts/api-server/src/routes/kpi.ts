import { Router, type IRouter } from "express";
import { db, kpiSettingsTable, kpiTargetsTable, merchantsTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { computeActual } from "./kpi-calc";

const PatchKpiSettings = z.object({
  trackCategories: z.string(), trackAppointments: z.string(),
  trackServices: z.string(), trackSuppliers: z.string(), trackWastage: z.string(),
  weekStartDay: z.string(),
}).partial();

const router: IRouter = Router();

/* ── Settings ──────────────────────────────────────────────────────────────── */

router.get("/kpi-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(kpiSettingsTable).where(eq(kpiSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(kpiSettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/kpi-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = PatchKpiSettings.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(kpiSettingsTable).where(eq(kpiSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(kpiSettingsTable)
      .set(parsed.data)
      .where(eq(kpiSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(kpiSettingsTable)
    .values({ merchantId, ...parsed.data }).returning();
  res.json(created);
});

/* ── Targets ───────────────────────────────────────────────────────────────── */

router.get("/kpi-targets", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(kpiTargetsTable).where(eq(kpiTargetsTable.merchantId, merchantId));
  res.json({ items: items.map(r => ({ ...r, target: parseFloat(r.target as unknown as string) })), total: items.length });
});

router.post("/kpi-targets", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { targetId, name, metric, categoryId = "", period = "monthly", target = 0, staffIds = "[]", reward = "null", notes = "", isActive = "true", startDate = null, endDate = null } = req.body;
  if (!targetId || !name || !metric) { res.status(400).json({ error: "targetId, name, and metric are required" }); return; }
  const [row] = await db.insert(kpiTargetsTable).values({ merchantId, targetId, name, metric, categoryId, period, target, staffIds, reward, notes, isActive, startDate, endDate }).returning();
  res.status(201).json({ ...row, target: parseFloat(row.target as unknown as string) });
});

router.patch("/kpi-targets/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, metric, categoryId, period, target, staffIds, reward, notes, isActive, showOnDashboard, startDate, endDate } = req.body;

  // When marking this KPI for dashboard display, unset all others first
  if (showOnDashboard === "true") {
    await db.update(kpiTargetsTable)
      .set({ showOnDashboard: "false" })
      .where(and(eq(kpiTargetsTable.merchantId, merchantId), ne(kpiTargetsTable.id, id)));
  }

  const updates: Partial<typeof kpiTargetsTable.$inferInsert> = {};
  if (name             !== undefined) updates.name            = name;
  if (metric           !== undefined) updates.metric          = metric;
  if (categoryId       !== undefined) updates.categoryId      = categoryId;
  if (period           !== undefined) updates.period          = period;
  if (target           !== undefined) updates.target          = target;
  if (staffIds         !== undefined) updates.staffIds        = staffIds;
  if (reward           !== undefined) updates.reward          = reward;
  if (notes            !== undefined) updates.notes           = notes;
  if (isActive         !== undefined) updates.isActive        = isActive;
  if (showOnDashboard  !== undefined) updates.showOnDashboard = showOnDashboard;
  if (startDate        !== undefined) updates.startDate       = startDate;
  if (endDate          !== undefined) updates.endDate         = endDate;

  const [row] = await db.update(kpiTargetsTable)
    .set(updates)
    .where(and(eq(kpiTargetsTable.id, id), eq(kpiTargetsTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, target: parseFloat(row.target as unknown as string) });
});

router.delete("/kpi-targets/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(kpiTargetsTable).where(and(eq(kpiTargetsTable.id, id), eq(kpiTargetsTable.merchantId, merchantId)));
  res.status(204).end();
});

/* ── Progress (all active targets) ─────────────────────────────────────────── */

router.get("/kpi-targets/progress", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  const [settingsRow] = await db.select().from(kpiSettingsTable).where(eq(kpiSettingsTable.merchantId, merchantId)).limit(1);
  const weekStartDay = settingsRow?.weekStartDay ?? "monday";
  const [merchantRow] = await db.select({ timezone: merchantsTable.timezone }).from(merchantsTable).where(eq(merchantsTable.id, merchantId)).limit(1);
  const timeZone = merchantRow?.timezone ?? null;

  const rows = await db.select().from(kpiTargetsTable)
    .where(and(eq(kpiTargetsTable.merchantId, merchantId), eq(kpiTargetsTable.isActive, "true")));

  const items = await Promise.all(rows.map(async (row) => ({
    id: row.id,
    targetId: row.targetId,
    actual: await computeActual(merchantId, row, weekStartDay, timeZone),
  })));

  res.json({ items, total: items.length });
});

/* ── Dashboard KPI ─────────────────────────────────────────────────────────── */

router.get("/kpi-targets/dashboard-kpi", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  const [kpiRow] = await db
    .select()
    .from(kpiTargetsTable)
    .where(and(
      eq(kpiTargetsTable.merchantId, merchantId),
      eq(kpiTargetsTable.showOnDashboard, "true"),
      eq(kpiTargetsTable.isActive, "true"),
    ))
    .limit(1);

  if (!kpiRow) {
    res.json(null);
    return;
  }

  const [settingsRow] = await db.select().from(kpiSettingsTable).where(eq(kpiSettingsTable.merchantId, merchantId)).limit(1);
  const weekStartDay = settingsRow?.weekStartDay ?? "monday";
  const [merchantRow] = await db.select({ timezone: merchantsTable.timezone }).from(merchantsTable).where(eq(merchantsTable.id, merchantId)).limit(1);

  const kpi = { ...kpiRow, target: parseFloat(kpiRow.target as unknown as string) };
  const actual = await computeActual(merchantId, kpiRow, weekStartDay, merchantRow?.timezone ?? null);

  res.json({ kpi, actual });
});

export default router;
