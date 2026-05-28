import { Router, type IRouter } from "express";
import { db, print3dSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const NUMERIC_FIELDS = [
  "purchasePrice", "profitMargin", "electricityRate", "overheadPerHour",
  "laborRate", "failureRate", "filamentWastePercent", "coolingFactor", "roundingValue",
] as const;

const serialize = (row: typeof print3dSettingsTable.$inferSelect) => {
  const out: Record<string, unknown> = { ...row };
  for (const f of NUMERIC_FIELDS) out[f] = parseFloat(row[f] as string);
  return out;
};

router.get("/print-3d-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(print3dSettingsTable).where(eq(print3dSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(print3dSettingsTable).values({ merchantId }).returning();
    res.json(serialize(created!)); return;
  }
  res.json(serialize(row));
});

router.put("/print-3d-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = { ...body };
  for (const f of NUMERIC_FIELDS) {
    if (typeof body[f] === "number") patch[f] = String(body[f]);
  }
  const [existing] = await db.select().from(print3dSettingsTable).where(eq(print3dSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(print3dSettingsTable).set(patch).where(eq(print3dSettingsTable.merchantId, merchantId)).returning();
    res.json(serialize(updated!)); return;
  }
  const [created] = await db.insert(print3dSettingsTable).values({ merchantId, ...patch }).returning();
  res.json(serialize(created!));
});

export default router;
