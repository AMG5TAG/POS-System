import { Router, type IRouter } from "express";
import { db, posRegistersTable, posSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/api/pos-registers", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(posRegistersTable).where(eq(posRegistersTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/api/pos-registers", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { registerId, name, type = "Cash", staffName = "", staffEmail = "" } = req.body;
  if (!registerId || !name) { res.status(400).json({ error: "registerId and name are required" }); return; }
  const [row] = await db.insert(posRegistersTable).values({ merchantId, registerId, name, type, staffName, staffEmail }).returning();
  res.status(201).json(row);
});

router.patch("/api/pos-registers/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const { name, type, staffName, staffEmail } = req.body;
  const [row] = await db.update(posRegistersTable).set({ name, type, staffName, staffEmail })
    .where(and(eq(posRegistersTable.id, id), eq(posRegistersTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/api/pos-registers/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(posRegistersTable).where(and(eq(posRegistersTable.id, id), eq(posRegistersTable.merchantId, merchantId)));
  res.status(204).end();
});

router.get("/api/pos-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(posSettingsTable).where(eq(posSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(posSettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/api/pos-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Partial<typeof posSettingsTable.$inferInsert>;
  const [existing] = await db.select().from(posSettingsTable).where(eq(posSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(posSettingsTable).set(body).where(eq(posSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(posSettingsTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

export default router;
