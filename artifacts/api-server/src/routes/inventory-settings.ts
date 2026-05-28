import { Router, type IRouter } from "express";
import { db, inventorySettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/inventory-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(inventorySettingsTable).where(eq(inventorySettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(inventorySettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/inventory-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Partial<typeof inventorySettingsTable.$inferInsert>;
  const [existing] = await db.select().from(inventorySettingsTable).where(eq(inventorySettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(inventorySettingsTable).set(body).where(eq(inventorySettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(inventorySettingsTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

export default router;
