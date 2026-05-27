import { Router } from "express";
import { db, aiSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();
router.use(requireAuth);

router.get("/ai/settings", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(aiSettingsTable)
    .where(eq(aiSettingsTable.merchantId, merchantId));
  return res.json({ aiEnabled: row?.aiEnabled ?? true });
});

router.put("/ai/settings", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { aiEnabled } = req.body as { aiEnabled: boolean };
  const existing = await db.select({ id: aiSettingsTable.id })
    .from(aiSettingsTable)
    .where(eq(aiSettingsTable.merchantId, merchantId));
  if (existing.length === 0) {
    await db.insert(aiSettingsTable).values({ merchantId, aiEnabled });
  } else {
    await db.update(aiSettingsTable)
      .set({ aiEnabled, updatedAt: new Date() })
      .where(eq(aiSettingsTable.merchantId, merchantId));
  }
  return res.json({ ok: true });
});

export default router;
