import type { Logger } from "pino";
import { db, customersTable, referralRewardsTable, loyaltySettingsTable } from "@workspace/db";
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { referralSettingsFor, refereeProgress } from "../lib/referrals";
import { trackedInterval } from "../lib/shutdown";
import { jitteredStart } from "../lib/scheduler-jitter";
import { logger as rootLogger } from "../lib/logger";

/**
 * Automatic referral rewards (the POS referral programme, lib/referrals.ts).
 *
 * When a referred customer qualifies — spends `minSpend` over `minVisits`
 * visits within `qualifyDays` of joining — the referrer is credited
 * `referrerRewardValue` and the referred customer `refereeRewardValue`, in the
 * loyalty programme's unit, onto their loyalty balances. Both are rewarded at
 * that moment, not at sign-up, so a fake account earns nothing.
 *
 * A `referral_rewards` row per referred customer (unique) is the guard: it is
 * inserted in the same DB transaction as the two balance credits, so a reward
 * is paid once even if a sale and the daily sweep race. Referrals that had
 * already qualified when this began were recorded "pre_automation" by
 * scripts/src/add-referral-rewards.ts and are never paid.
 *
 * Checked right after every sale for its customer (finalizeSale) and by a
 * daily sweep, which catches spend that arrives another way (paid invoices,
 * completed laybys). Rewards are only paid while both the referral programme
 * and the loyalty programme are on.
 */

type Result = "paid" | "not_referred" | "not_qualified" | "already" | "off";

export async function awardReferralIfQualified(merchantId: number, refereeId: number, now = new Date()): Promise<Result> {
  const [c] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, refereeId), eq(customersTable.merchantId, merchantId)));
  if (!c || (!c.referredBy && !c.referredByCustomerId)) return "not_referred";

  const s = await referralSettingsFor(merchantId);
  const [loyalty] = await db.select({ isEnabled: loyaltySettingsTable.isEnabled }).from(loyaltySettingsTable)
    .where(eq(loyaltySettingsTable.merchantId, merchantId)).limit(1);
  if (!s.enabled || (loyalty && loyalty.isEnabled !== "true")) return "off";

  if (!refereeProgress(c, s, now).qualified) return "not_qualified";

  // The referrer: by id when known, else by the code the POS stores.
  const [referrer] = await db.select({ id: customersTable.id }).from(customersTable)
    .where(and(
      eq(customersTable.merchantId, merchantId),
      c.referredByCustomerId != null
        ? eq(customersTable.id, c.referredByCustomerId)
        : sql`upper(${customersTable.referralCode}) = upper(${c.referredBy})`,
    )).limit(1);
  const referrerId = referrer && referrer.id !== c.id ? referrer.id : null;

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(referralRewardsTable).values({
      merchantId,
      refereeCustomerId: c.id,
      referrerCustomerId: referrerId,
      referrerValue: (referrerId ? s.referrerRewardValue : 0).toFixed(2),
      refereeValue: s.refereeRewardValue.toFixed(2),
      status: "paid",
    }).onConflictDoNothing().returning({ id: referralRewardsTable.id });
    if (!row) return "already" as const;
    if (referrerId && s.referrerRewardValue > 0) {
      await tx.update(customersTable)
        .set({ loyaltyPoints: sql`${customersTable.loyaltyPoints} + ${s.referrerRewardValue}` })
        .where(and(eq(customersTable.id, referrerId), eq(customersTable.merchantId, merchantId)));
    }
    if (s.refereeRewardValue > 0) {
      await tx.update(customersTable)
        .set({ loyaltyPoints: sql`${customersTable.loyaltyPoints} + ${s.refereeRewardValue}` })
        .where(and(eq(customersTable.id, c.id), eq(customersTable.merchantId, merchantId)));
    }
    return "paid" as const;
  });
}

/** After a sale: check its customer. Never throws — a sale is never failed by this. */
export function checkReferralAfterSale(merchantId: number, customerId: number | null | undefined): void {
  if (!customerId) return;
  void awardReferralIfQualified(merchantId, customerId)
    .then((r) => { if (r === "paid") rootLogger.info({ merchantId, customerId }, "Referral reward paid"); })
    .catch((err) => rootLogger.error({ err, merchantId, customerId }, "Referral reward check failed"));
}

/** Every referred customer still inside a qualifying window and not yet rewarded. */
export async function sweepReferralRewards(logger: Logger, now = new Date()): Promise<number> {
  // The longest window any business could have set is unknown here, so look
  // back a year; each candidate is judged by its own business's settings.
  const since = new Date(now.getTime() - 366 * 86_400_000);
  const candidates = await db.select({ id: customersTable.id, merchantId: customersTable.merchantId })
    .from(customersTable)
    .leftJoin(referralRewardsTable, and(
      eq(referralRewardsTable.refereeCustomerId, customersTable.id),
      eq(referralRewardsTable.merchantId, customersTable.merchantId),
    ))
    .where(and(
      isNull(referralRewardsTable.id),
      gte(customersTable.createdAt, since),
      or(sql`coalesce(${customersTable.referredBy}, '') <> ''`, sql`${customersTable.referredByCustomerId} is not null`),
    ));
  let paid = 0;
  for (const c of candidates) {
    try {
      if ((await awardReferralIfQualified(c.merchantId, c.id, now)) === "paid") paid++;
    } catch (err) {
      logger.error({ err, customerId: c.id }, "Referral reward sweep failed for customer");
    }
  }
  if (paid) logger.info({ paid }, "Referral rewards paid by daily sweep");
  return paid;
}

export function scheduleReferralRewards(logger: Logger): void {
  const run = () => sweepReferralRewards(logger).catch((err) => logger.error({ err }, "Referral reward sweep error"));
  jitteredStart(run);
  trackedInterval(run, 24 * 60 * 60 * 1000);
  logger.info("Referral reward scheduler started (daily)");
}
