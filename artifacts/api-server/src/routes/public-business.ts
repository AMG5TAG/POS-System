import { Router, type IRouter } from "express";
import { db, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SOLE_MERCHANT_EMAIL } from "../lib/sole-merchant";

/**
 * GET /public/business — the one business this install runs (public, no auth).
 *
 * The staff apps live at short addresses with no business in them (/a/tech,
 * /a/mobile), while their APIs are still addressed by username
 * (/tech/b/:username/…, /mobile-pos/b/:username/…). The apps read the username
 * here. Only what already appears in every public link is returned.
 */
const router: IRouter = Router();

router.get("/public/business", async (_req, res): Promise<void> => {
  const [m] = await db
    .select({ username: merchantsTable.username, businessName: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.email, SOLE_MERCHANT_EMAIL))
    .limit(1);
  if (!m?.username) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ username: m.username, businessName: m.businessName });
});

export default router;
