import { Router, type IRouter } from "express";
import { db, staffRosteringSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/staff-rostering-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(staffRosteringSettingsTable).where(eq(staffRosteringSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(staffRosteringSettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/staff-rostering-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Partial<typeof staffRosteringSettingsTable.$inferInsert>;
  const [existing] = await db.select().from(staffRosteringSettingsTable).where(eq(staffRosteringSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(staffRosteringSettingsTable).set(body).where(eq(staffRosteringSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(staffRosteringSettingsTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

export default router;
