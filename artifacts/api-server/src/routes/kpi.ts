import { Router, type IRouter } from "express";
import { db, kpiSettingsTable, kpiTargetsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

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
  const body = req.body as Partial<typeof kpiSettingsTable.$inferInsert>;
  const [existing] = await db.select().from(kpiSettingsTable).where(eq(kpiSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(kpiSettingsTable).set(body).where(eq(kpiSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(kpiSettingsTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

router.get("/kpi-targets", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(kpiTargetsTable).where(eq(kpiTargetsTable.merchantId, merchantId));
  res.json({ items: items.map(r => ({ ...r, target: parseFloat(r.target as unknown as string) })), total: items.length });
});

router.post("/kpi-targets", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { targetId, name, metric, categoryId = "", period = "monthly", target = 0, staffIds = "[]", reward = "null", notes = "", isActive = "true" } = req.body;
  if (!targetId || !name || !metric) { res.status(400).json({ error: "targetId, name, and metric are required" }); return; }
  const [row] = await db.insert(kpiTargetsTable).values({ merchantId, targetId, name, metric, categoryId, period, target, staffIds, reward, notes, isActive }).returning();
  res.status(201).json({ ...row, target: parseFloat(row.target as unknown as string) });
});

router.patch("/kpi-targets/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const { name, metric, categoryId, period, target, staffIds, reward, notes, isActive } = req.body;
  const [row] = await db.update(kpiTargetsTable).set({ name, metric, categoryId, period, target, staffIds, reward, notes, isActive })
    .where(and(eq(kpiTargetsTable.id, id), eq(kpiTargetsTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, target: parseFloat(row.target as unknown as string) });
});

router.delete("/kpi-targets/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(kpiTargetsTable).where(and(eq(kpiTargetsTable.id, id), eq(kpiTargetsTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
