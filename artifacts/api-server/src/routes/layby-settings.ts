import { Router, type IRouter } from "express";
import { db, laybySettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/api/layby-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(laybySettingsTable).where(eq(laybySettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(laybySettingsTable).values({ merchantId }).returning();
    res.json({ ...created, minimumDepositValue: parseFloat(created.minimumDepositValue as unknown as string) }); return;
  }
  res.json({ ...row, minimumDepositValue: parseFloat(row.minimumDepositValue as unknown as string) });
});

router.put("/api/layby-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Partial<typeof laybySettingsTable.$inferInsert>;
  const [existing] = await db.select().from(laybySettingsTable).where(eq(laybySettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(laybySettingsTable).set(body).where(eq(laybySettingsTable.merchantId, merchantId)).returning();
    res.json({ ...updated, minimumDepositValue: parseFloat(updated.minimumDepositValue as unknown as string) }); return;
  }
  const [created] = await db.insert(laybySettingsTable).values({ merchantId, ...body }).returning();
  res.json({ ...created, minimumDepositValue: parseFloat(created.minimumDepositValue as unknown as string) });
});

export default router;
