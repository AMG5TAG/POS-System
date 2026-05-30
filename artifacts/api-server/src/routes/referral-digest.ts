import { Router, type IRouter } from "express";
import { db, customerSettingsTable, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { runDigestForMerchant } from "../services/referralDigestScheduler";

const router: IRouter = Router();

router.post("/referral-digest/send-now", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  const [settings] = await db
    .select({ weeklyDigestOptIn: customerSettingsTable.weeklyDigestOptIn })
    .from(customerSettingsTable)
    .where(eq(customerSettingsTable.merchantId, merchantId));

  if (!settings || settings.weeklyDigestOptIn !== "true") {
    res.status(400).json({ error: "Weekly digest is not enabled. Enable it first, then send a test." });
    return;
  }

  const [merchant] = await db
    .select({ email: merchantsTable.email, businessName: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));

  if (!merchant) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }

  const result = await runDigestForMerchant(merchantId, merchant.email, merchant.businessName, req.log);

  if (!result.success) {
    res.status(502).json({ error: result.error });
    return;
  }

  res.json({ sent: true, email: merchant.email });
});

export default router;
