import { Router, type IRouter } from "express";
import { db, merchantsTable, partnerReferralsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { CreatePartnerReferralBody } from "@workspace/api-zod";

const router: IRouter = Router();

function generatePartnerCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "KP-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function getOrCreateReferralCode(merchantId: number): Promise<string> {
  const [merchant] = await db
    .select({ partnerReferralCode: merchantsTable.partnerReferralCode })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));

  if (merchant?.partnerReferralCode) return merchant.partnerReferralCode;

  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generatePartnerCode();
    const existing = await db
      .select({ id: merchantsTable.id })
      .from(merchantsTable)
      .where(eq(merchantsTable.partnerReferralCode, code))
      .limit(1);
    if (existing.length === 0) {
      await db
        .update(merchantsTable)
        .set({ partnerReferralCode: code })
        .where(eq(merchantsTable.id, merchantId));
      return code;
    }
  }

  const fallback = `KP-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await db
    .update(merchantsTable)
    .set({ partnerReferralCode: fallback })
    .where(eq(merchantsTable.id, merchantId));
  return fallback;
}

router.get("/partner-referrals", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const referralCode = await getOrCreateReferralCode(merchantId);
  const referralUrl = `https://koapos.com/join?ref=${referralCode}`;

  const referrals = await db
    .select()
    .from(partnerReferralsTable)
    .where(eq(partnerReferralsTable.referrerMerchantId, merchantId))
    .orderBy(partnerReferralsTable.referredAt);

  res.json({
    referralCode,
    referralUrl,
    referrals: referrals.map((r) => ({
      id: r.id,
      referredBusinessName: r.referredBusinessName,
      contactName: r.contactName,
      contactEmail: r.contactEmail,
      referredAt: r.referredAt.toISOString(),
      status: r.status,
      plan: r.plan ?? null,
      bonusEarned: r.bonusEarned,
    })),
  });
});

router.post("/partner-referrals", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePartnerReferralBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const merchantId = req.session.merchantId!;
  const [referral] = await db
    .insert(partnerReferralsTable)
    .values({
      referrerMerchantId: merchantId,
      referredBusinessName: parsed.data.businessName,
      contactName: parsed.data.contactName,
      contactEmail: parsed.data.contactEmail,
    })
    .returning();

  res.status(201).json({
    id: referral.id,
    referredBusinessName: referral.referredBusinessName,
    contactName: referral.contactName,
    contactEmail: referral.contactEmail,
    referredAt: referral.referredAt.toISOString(),
    status: referral.status,
    plan: referral.plan ?? null,
    bonusEarned: referral.bonusEarned,
  });
});

export default router;
