import { Router, type IRouter } from "express";
import { db, regionalExtSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/regional-ext-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(regionalExtSettingsTable).where(eq(regionalExtSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(regionalExtSettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/regional-ext-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Partial<typeof regionalExtSettingsTable.$inferInsert>;
  const [existing] = await db.select().from(regionalExtSettingsTable).where(eq(regionalExtSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(regionalExtSettingsTable).set(body).where(eq(regionalExtSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(regionalExtSettingsTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

export default router;
