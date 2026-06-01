import { Router, type IRouter } from "express";
import { db, merchantSecuritySettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateSecuritySettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function getOrCreate(merchantId: number) {
  const [existing] = await db
    .select()
    .from(merchantSecuritySettingsTable)
    .where(eq(merchantSecuritySettingsTable.merchantId, merchantId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(merchantSecuritySettingsTable)
    .values({ merchantId })
    .returning();
  return created!;
}

router.get("/auth/security-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const row = await getOrCreate(merchantId);
  res.json(row);
});

router.patch("/auth/security-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = UpdateSecuritySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  if (Object.keys(data).length === 0) {
    const row = await getOrCreate(merchantId);
    res.json(row);
    return;
  }
  const [existing] = await db
    .select()
    .from(merchantSecuritySettingsTable)
    .where(eq(merchantSecuritySettingsTable.merchantId, merchantId))
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(merchantSecuritySettingsTable)
      .set(data)
      .where(eq(merchantSecuritySettingsTable.merchantId, merchantId))
      .returning();
    res.json(updated);
    return;
  }
  const [created] = await db
    .insert(merchantSecuritySettingsTable)
    .values({ merchantId, ...data })
    .returning();
  res.json(created);
});

export default router;
