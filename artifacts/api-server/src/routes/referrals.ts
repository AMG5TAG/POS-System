import { Router, type IRouter } from "express";
import { db, referralRewardsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { referralSettingsFor } from "../lib/referrals";

/**
 * GET /referrals/summary — what POS › Marketing › Referrals needs to count the
 * programme the way the shop account and the automatic rewards do
 * (lib/referrals.ts, services/referralRewards.ts): the saved settings, with
 * Management › Referrals' defaults, and every reward recorded so far.
 */
const router: IRouter = Router();

router.get("/referrals/summary", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const settings = await referralSettingsFor(merchantId);
  const rewards = await db.select({
    refereeId: referralRewardsTable.refereeCustomerId,
    referrerId: referralRewardsTable.referrerCustomerId,
    status: referralRewardsTable.status,
    referrerValue: referralRewardsTable.referrerValue,
    refereeValue: referralRewardsTable.refereeValue,
    createdAt: referralRewardsTable.createdAt,
  }).from(referralRewardsTable).where(eq(referralRewardsTable.merchantId, merchantId));
  res.json({
    settings,
    rewards: rewards.map((r) => ({
      ...r, referrerValue: parseFloat(r.referrerValue), refereeValue: parseFloat(r.refereeValue), createdAt: r.createdAt.toISOString(),
    })),
  });
});

export default router;
