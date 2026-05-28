import { Router, type IRouter } from "express";
import { db, pcBuilderSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const serialize = (row: typeof pcBuilderSettingsTable.$inferSelect) => ({
  ...row,
  defaultMarkup: parseFloat(row.defaultMarkup),
  laborRate:     parseFloat(row.laborRate),
});

router.get("/pc-builder-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(pcBuilderSettingsTable).where(eq(pcBuilderSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(pcBuilderSettingsTable).values({ merchantId }).returning();
    res.json(serialize(created!)); return;
  }
  res.json(serialize(row));
});

router.put("/pc-builder-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = { ...body };
  if (typeof body.defaultMarkup === "number") patch.defaultMarkup = String(body.defaultMarkup);
  if (typeof body.laborRate === "number")     patch.laborRate = String(body.laborRate);
  const [existing] = await db.select().from(pcBuilderSettingsTable).where(eq(pcBuilderSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(pcBuilderSettingsTable).set(patch).where(eq(pcBuilderSettingsTable.merchantId, merchantId)).returning();
    res.json(serialize(updated!)); return;
  }
  const [created] = await db.insert(pcBuilderSettingsTable).values({ merchantId, ...patch }).returning();
  res.json(serialize(created!));
});

export default router;
