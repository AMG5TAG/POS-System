import { db, customersTable, customerSettingsTable } from "@workspace/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { generateReferralCode } from "@workspace/db";
import { shopOrigin } from "./publicUrl";

/**
 * The POS referral programme, as the shop account shows it.
 *
 * Every customer has their own `referral_code`. A customer someone referred
 * carries the referrer's code in `referred_by` — that is what POS › Marketing
 * › Referrals matches on — and, when known, their id in
 * `referred_by_customer_id`. A referral QUALIFIES (earns the referrer their
 * reward) once the referred customer has spent `minSpend` and visited
 * `minVisits` times within `qualifyDays` of joining, as the POS's referrals
 * page counts it. The thresholds and rewards are Management › Referrals
 * (`customer_settings.referral_settings`), with that page's own defaults.
 */

export interface ReferralSettings {
  enabled: boolean;
  minSpend: number;
  minVisits: number;
  qualifyDays: number;
  refereeRewardValue: number;
  referrerRewardValue: number;
}

/* Management › Referrals' DEFAULT_REFERRAL — what the POS shows until it is saved. */
export const DEFAULT_REFERRAL: ReferralSettings = {
  enabled: true, minSpend: 50, minVisits: 2, qualifyDays: 90, refereeRewardValue: 200, referrerRewardValue: 500,
};

export async function referralSettingsFor(merchantId: number): Promise<ReferralSettings> {
  const [row] = await db.select({ s: customerSettingsTable.referralSettings }).from(customerSettingsTable)
    .where(eq(customerSettingsTable.merchantId, merchantId));
  let saved: Partial<ReferralSettings> = {};
  try { saved = row?.s ? JSON.parse(row.s) : {}; } catch { /* defaults */ }
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : DEFAULT_REFERRAL.enabled,
    minSpend: num(saved.minSpend, DEFAULT_REFERRAL.minSpend),
    minVisits: num(saved.minVisits, DEFAULT_REFERRAL.minVisits),
    qualifyDays: num(saved.qualifyDays, DEFAULT_REFERRAL.qualifyDays),
    refereeRewardValue: num(saved.refereeRewardValue, DEFAULT_REFERRAL.refereeRewardValue),
    referrerRewardValue: num(saved.referrerRewardValue, DEFAULT_REFERRAL.referrerRewardValue),
  };
}

/** Codes are stored upper-case, letters, digits and dashes (as the POS edits them). */
export const normaliseReferralCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9-]/g, "");

/** The customer's code, minted (and saved) if they have none yet. */
export async function ensureReferralCode(c: { id: number; merchantId: number; firstName: string | null; lastName: string | null; referralCode: string | null }): Promise<string> {
  if (c.referralCode) return c.referralCode;
  for (let i = 0; i < 10; i++) {
    const code = generateReferralCode(c.firstName, c.lastName);
    const [taken] = await db.select({ id: customersTable.id }).from(customersTable)
      .where(and(eq(customersTable.merchantId, c.merchantId), eq(customersTable.referralCode, code))).limit(1);
    if (taken) continue;
    await db.update(customersTable).set({ referralCode: code }).where(eq(customersTable.id, c.id));
    return code;
  }
  throw new Error("Could not mint a unique referral code");
}

/** The customer a code belongs to — never `selfIds` (a customer can't refer themself). */
export async function findReferrer(merchantId: number, code: string, selfIds: number[]) {
  const norm = normaliseReferralCode(code);
  if (!norm) return null;
  const [r] = await db.select({ id: customersTable.id, firstName: customersTable.firstName, lastName: customersTable.lastName, referralCode: customersTable.referralCode })
    .from(customersTable)
    .where(and(eq(customersTable.merchantId, merchantId), eq(customersTable.referralCode, norm)))
    .limit(1);
  if (!r || selfIds.includes(r.id)) return null;
  return r;
}

export type RefereeProgress = {
  name: string; joinedAt: string; qualified: boolean;
  /** "paid" once the system credited the reward; "pre_automation" when it had
   *  qualified before automatic rewards began (referral_rewards). */
  reward?: "paid" | "pre_automation" | null;
  visits: number; spendReached: boolean; daysLeft: number; expired: boolean;
};

/**
 * Where one referred customer stands. Shown to the referrer, so it says
 * whether the spend threshold is met but never what they spent.
 */
export function refereeProgress(
  r: { firstName: string | null; lastName: string | null; createdAt: Date; totalSpent: string | number; visitCount: number },
  s: ReferralSettings,
  now = new Date(),
): RefereeProgress {
  const days = Math.floor((now.getTime() - r.createdAt.getTime()) / 86_400_000);
  const spendReached = Number(r.totalSpent) >= s.minSpend;
  const visitsReached = r.visitCount >= s.minVisits;
  const inWindow = days <= s.qualifyDays;
  const qualified = spendReached && visitsReached && inWindow;
  return {
    name: [r.firstName?.trim(), r.lastName?.trim()?.[0] ? `${r.lastName.trim()[0]}.` : ""].filter(Boolean).join(" ") || "A friend",
    joinedAt: r.createdAt.toISOString(),
    qualified,
    visits: r.visitCount,
    spendReached,
    daysLeft: Math.max(0, s.qualifyDays - days),
    expired: !qualified && !inWindow,
  };
}

/** Everyone referred by any of `ids` (the shopper's same-email records), newest first. */
export async function referredBy(merchantId: number, ids: number[], codes: string[]) {
  const byCode = codes.filter(Boolean);
  return db.select({
    id: customersTable.id, firstName: customersTable.firstName, lastName: customersTable.lastName,
    createdAt: customersTable.createdAt, totalSpent: customersTable.totalSpent, visitCount: customersTable.visitCount,
  }).from(customersTable)
    .where(and(
      eq(customersTable.merchantId, merchantId),
      byCode.length
        ? or(inArray(customersTable.referredByCustomerId, ids), inArray(sql`upper(${customersTable.referredBy})`, byCode))
        : inArray(customersTable.referredByCustomerId, ids),
    ))
    .orderBy(sql`${customersTable.createdAt} desc`)
    .limit(200);
}

/**
 * A customer's referral code and shareable link (the shop's /r/<code>), for
 * documents: the invoice and quote templates' referral footer
 * (`showReferralLink`) prints these, so a printed invoice, the shop account
 * and the POS all carry the same code and link. {} without a customer.
 */
export async function referralFieldsFor(merchantId: number, customerId: number | null | undefined): Promise<{ referralCode?: string; referralUrl?: string }> {
  if (!customerId) return {};
  const [c] = await db.select({ id: customersTable.id, merchantId: customersTable.merchantId, firstName: customersTable.firstName, lastName: customersTable.lastName, referralCode: customersTable.referralCode })
    .from(customersTable).where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId)));
  if (!c) return {};
  const code = await ensureReferralCode(c).catch(() => c.referralCode);
  if (!code) return {};
  return { referralCode: code, referralUrl: `${shopOrigin()}/r/${encodeURIComponent(code)}` };
}
