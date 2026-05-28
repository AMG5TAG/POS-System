import { Router, type IRouter } from "express";
import { db, posReceiptSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/pos-receipt-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(posReceiptSettingsTable).where(eq(posReceiptSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(posReceiptSettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/pos-receipt-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Partial<typeof posReceiptSettingsTable.$inferInsert>;
  const [existing] = await db.select().from(posReceiptSettingsTable).where(eq(posReceiptSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(posReceiptSettingsTable).set(body).where(eq(posReceiptSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(posReceiptSettingsTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

export default router;
