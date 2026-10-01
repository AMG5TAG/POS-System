import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, customersTable, appointmentsTable, quotesTable, merchantsTable, referralRewardsTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "node:crypto";
import { soleMerchantId } from "../lib/sole-merchant";
import { buyerCustomerIds } from "../lib/shop-reviews";
import { findCustomerByPortalToken, maskContact } from "../lib/portalAuth";
import { applyEstimateApprovalToJob } from "../services/quoteApproval";
import { sendApplePass, sendGoogleWalletLink } from "../lib/wallet-pass";
import { shopCustomer, accountOf, loyaltySettings } from "./shop";
import { ensureReferralCode, findReferrer, referralSettingsFor, refereeProgress, referredBy } from "../lib/referrals";
import { formatLoyalty } from "../lib/loyalty";
import { shopOrigin } from "../lib/publicUrl";
import { issueSetupLink } from "../lib/customerPasswordLinks";


/**
 * The parts of the shop account that used to be the customer portal: signing
 * in from a /c/<token> link, appointments, quotes (approve / decline) and the
 * loyalty card's wallet passes. Repairs, warranties, loyalty and the profile
 * are in routes/shop.ts.
 *
 * Like the rest of the account, records are gathered across every POS customer
 * sharing the shopper's email (buyerCustomerIds) — the POS has duplicates, and
 * a quote raised on one of them is still this shopper's quote.
 */

const router: IRouter = Router();

const LOCALHOST = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const ipLimiter = (windowMs: number, max: number, message: string, failuresOnly = false) =>
  rateLimit({
    windowMs, max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: failuresOnly,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
    skip: (req) => LOCALHOST.has(req.ip ?? ""),
  });

const tokenLimiter = ipLimiter(15 * 60 * 1000, 30, "Too many attempts — please try again in 15 minutes.", true);
const setupLimiter = ipLimiter(60 * 60 * 1000, 10, "Too many requests — please try again later.");
const referralLimiter = ipLimiter(15 * 60 * 1000, 60, "Too many requests — please try again shortly.");
const bookingLimiter = ipLimiter(60 * 60 * 1000, 10, "Too many bookings from this connection — please call us instead.");

/** The signed-in shopper and their merchant, or a 401 already sent. */
async function signedIn(req: import("express").Request, res: import("express").Response) {
  const c = await shopCustomer(req);
  if (!c) { res.status(401).json({ error: "Please sign in." }); return null; }
  return c;
}

/* ── Signing in from an account link ─────────────────────────────────────── */

/*
 * The /c/<token> link texted with a repair update, printed on a completed
 * job's QR and carried by the wallet pass. The link says whose account it is;
 * it never signs anyone in by itself, since a sticker QR is readable by anyone
 * holding the device. A customer with a password is asked to sign in with it
 * (`password_required`); one without is asked to set one up
 * (`setup_required`), and POST /shop/auth/token/setup sends the set-up link to
 * the contact on file — never to an address the request names. Only a
 * shopper already signed in as that customer goes straight through. A token
 * never names another business's customer.
 */
async function linkCustomer(merchantId: number | null, raw: unknown) {
  const token = typeof raw === "string" ? raw.trim() : "";
  const customer = token ? await findCustomerByPortalToken(token) : null;
  return merchantId != null && customer && customer.merchantId === merchantId ? customer : null;
}

router.post("/shop/auth/token", tokenLimiter, async (req, res): Promise<void> => {
  const customer = await linkCustomer(await soleMerchantId(), req.body?.token);
  if (!customer) {
    res.status(404).json({ error: "This link is no longer valid. Sign in with your email instead." });
    return;
  }
  if (req.session?.portalCustomerId === customer.id) {
    res.json({ customer: accountOf(customer) });
    return;
  }
  const contactHint = maskContact(customer.email, customer.phone);
  if (customer.portalPasswordHash) {
    res.status(401).json({ error: "Please sign in with your password.", reason: "password_required", contactHint });
    return;
  }
  res.status(401).json({
    error: "Please set up your account to continue.",
    reason: "setup_required",
    contactHint,
    canSendLink: !!(customer.email || customer.phone),
  });
});

/* Sends the set-up link for the customer an account link names, to the
   contact on file (email, else SMS — issueSetupLink). Same answer whatever
   happened, so the route can't be used to probe accounts. */
router.post("/shop/auth/token/setup", setupLimiter, async (req, res): Promise<void> => {
  const customer = await linkCustomer(await soleMerchantId(), req.body?.token);
  if (customer && (customer.email || customer.phone)) {
    await issueSetupLink(customer, customer.portalPasswordHash ? "reset" : "setup", req.log);
  }
  res.json({ ok: true });
});

/* ── Appointments ────────────────────────────────────────────────────────── */

router.get("/shop/account/appointments", async (req, res): Promise<void> => {
  const c = await signedIn(req, res);
  if (!c) return;
  const ids = await buyerCustomerIds(c.merchantId, c);
  const rows = await db.select().from(appointmentsTable)
    .where(and(eq(appointmentsTable.merchantId, c.merchantId), inArray(appointmentsTable.customerId, ids)))
    .orderBy(desc(appointmentsTable.scheduledAt))
    .limit(100);
  res.json(rows.map((a) => ({
    id: a.id,
    title: a.title,
    scheduledAt: a.scheduledAt.toISOString(),
    durationMinutes: a.durationMinutes,
    status: a.status,
    notes: a.notes ?? null,
  })));
});

const BookingBody = z.object({
  title: z.string().trim().min(1, "Tell us what the appointment is for").max(120),
  scheduledAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional(),
});

/* A request for a time, as the portal took it: it lands in the POS calendar as
   "scheduled" and staff confirm or move it. There is no availability check. */
router.post("/shop/account/appointments", bookingLimiter, async (req, res): Promise<void> => {
  const c = await signedIn(req, res);
  if (!c) return;
  const parsed = BookingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please check the booking." }); return; }
  const at = new Date(parsed.data.scheduledAt);
  const now = Date.now();
  if (at.getTime() < now || at.getTime() > now + 366 * 24 * 60 * 60 * 1000) {
    res.status(400).json({ error: "Please choose a time in the next 12 months." });
    return;
  }
  const [appt] = await db.insert(appointmentsTable).values({
    merchantId: c.merchantId,
    customerId: c.id,
    title: parsed.data.title,
    scheduledAt: at,
    durationMinutes: 30,
    notes: parsed.data.notes || null,
    status: "scheduled",
  }).returning();
  res.status(201).json({
    id: appt!.id, title: appt!.title, scheduledAt: appt!.scheduledAt.toISOString(),
    durationMinutes: appt!.durationMinutes, status: appt!.status, notes: appt!.notes ?? null,
  });
});

/* ── Quotes ──────────────────────────────────────────────────────────────── */

/* Only quotes that were sent to the customer or that they have answered — a
   draft is the shop's working copy, and a converted one is a sale. */
const VISIBLE_QUOTE_STATUSES = ["sent", "accepted", "declined"];
const pastExpiry = (q: { expiryDate: Date | null }) => !!q.expiryDate && q.expiryDate.getTime() < Date.now();

router.get("/shop/account/quotes", async (req, res): Promise<void> => {
  const c = await signedIn(req, res);
  if (!c) return;
  const ids = await buyerCustomerIds(c.merchantId, c);
  const rows = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.merchantId, c.merchantId), inArray(quotesTable.customerId, ids), inArray(quotesTable.status, VISIBLE_QUOTE_STATUSES)))
    .orderBy(desc(quotesTable.createdAt))
    .limit(100);
  res.json(rows.map((q) => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    status: pastExpiry(q) && q.status === "sent" ? "expired" : q.status,
    total: parseFloat(q.total),
    depositRequired: q.depositRequired != null ? parseFloat(q.depositRequired) : null,
    items: ((q.items as Array<{ description?: string; quantity?: number; unitPrice?: number }> | null) ?? []).map((i) => ({
      description: i.description ?? "", quantity: Number(i.quantity ?? 1), unitPrice: Number(i.unitPrice ?? 0),
    })),
    expiryDate: q.expiryDate?.toISOString() ?? null,
    notes: q.notes ?? null,
    createdAt: q.createdAt.toISOString(),
  })));
});

/* The customer's yes or no. Accepting is their go-ahead on a linked repair, so
   it moves that job on and carries the deposit to the counter, exactly as the
   portal did (services/quoteApproval.ts). */
router.post("/shop/account/quotes/:id/respond", async (req, res): Promise<void> => {
  const c = await signedIn(req, res);
  if (!c) return;
  const quoteId = Number(req.params.id);
  const decision = String(req.body?.decision ?? "");
  if (!Number.isInteger(quoteId) || (decision !== "accept" && decision !== "decline")) {
    res.status(400).json({ error: "Invalid decision" });
    return;
  }
  const ids = await buyerCustomerIds(c.merchantId, c);
  const [quote] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.merchantId, c.merchantId), inArray(quotesTable.customerId, ids)))
    .limit(1);
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  if (quote.status !== "sent") { res.status(409).json({ error: "This quote can no longer be changed" }); return; }
  if (pastExpiry(quote)) { res.status(409).json({ error: "This quote has expired" }); return; }

  const status = decision === "accept" ? "accepted" : "declined";
  const events = (quote.events as Array<unknown> | null) ?? [];
  await db.update(quotesTable)
    .set({ status, events: [...events, { type: status, timestamp: new Date().toISOString(), detail: "via online account" }] })
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.merchantId, c.merchantId)));
  if (decision === "accept") await applyEstimateApprovalToJob(c.merchantId, quote, "portal");
  res.json({ id: quoteId, status });
});

/* ── Referrals ───────────────────────────────────────────────────────────── */

/*
 * The shopper's referral link and how their referrals are going: who they
 * referred (first name and last initial), whether each has qualified yet, and
 * what they have earned — by the POS programme's rules (lib/referrals.ts).
 * A friend's spend is never shown, only whether it has reached the threshold.
 */
router.get("/shop/account/referrals", async (req, res): Promise<void> => {
  const c = await signedIn(req, res);
  if (!c) return;
  const s = await referralSettingsFor(c.merchantId);
  const code = await ensureReferralCode(c);
  const ids = await buyerCustomerIds(c.merchantId, c);
  // Their sibling records' codes count too: a friend may have been given any of them.
  const codes = (await db.select({ code: customersTable.referralCode }).from(customersTable)
    .where(and(eq(customersTable.merchantId, c.merchantId), inArray(customersTable.id, ids))))
    .map((r) => (r.code ?? "").toUpperCase());
  const now = new Date();
  const referred = (await referredBy(c.merchantId, ids, [...new Set([code.toUpperCase(), ...codes])])).filter((r) => !ids.includes(r.id));
  // What the system has actually paid (services/referralRewards.ts).
  const rewards = referred.length === 0 ? [] : await db.select({
    refereeId: referralRewardsTable.refereeCustomerId, status: referralRewardsTable.status, referrerValue: referralRewardsTable.referrerValue,
  }).from(referralRewardsTable)
    .where(and(eq(referralRewardsTable.merchantId, c.merchantId), inArray(referralRewardsTable.refereeCustomerId, referred.map((r) => r.id))));
  const rewardOf = new Map(rewards.map((r) => [r.refereeId, r]));
  const referrals = referred.map((r) => {
    const rw = rewardOf.get(r.id);
    const p = refereeProgress(r, s, now);
    // A paid or recorded reward means it qualified, whatever the totals say now.
    return rw ? { ...p, qualified: true, expired: false, reward: rw.status as "paid" | "pre_automation" } : { ...p, reward: null };
  });
  const l = await loyaltySettings(c.merchantId);
  const qualified = referrals.filter((r) => r.qualified).length;
  const paidValue = rewards.filter((r) => r.status === "paid").reduce((sum, r) => sum + Number(r.referrerValue), 0);
  const fmt = (v: number) => formatLoyalty(l.programType, l.config, v);
  res.json({
    enabled: s.enabled,
    code,
    url: `${shopOrigin()}/r/${encodeURIComponent(code)}`,
    rules: {
      minSpend: s.minSpend, minVisits: s.minVisits, qualifyDays: s.qualifyDays,
      referrerReward: fmt(s.referrerRewardValue), refereeReward: fmt(s.refereeRewardValue),
    },
    referrals,
    qualified,
    /* Rewards credited to their loyalty balance by the system. */
    earned: fmt(paidValue),
  });
});

/* The landing page for a referral link: whose it is (first name only — the
   code is shared on purpose, but nothing more about them should be) and the
   business. 404 for a code that names nobody. */
router.get("/shop/referral/:code", referralLimiter, async (req, res): Promise<void> => {
  const merchantId = await soleMerchantId();
  if (merchantId == null) { res.status(404).json({ error: "Not found" }); return; }
  const r = await findReferrer(merchantId, String(req.params.code), []);
  if (!r) { res.status(404).json({ error: "That referral link isn't valid." }); return; }
  const s = await referralSettingsFor(merchantId);
  const l = await loyaltySettings(merchantId);
  const [m] = await db.select({ businessName: merchantsTable.businessName }).from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  res.json({
    code: r.referralCode,
    firstName: r.firstName?.trim() || null,
    businessName: m?.businessName ?? "Koastal Kollective",
    refereeReward: s.enabled && s.refereeRewardValue > 0 ? formatLoyalty(l.programType, l.config, s.refereeRewardValue) : null,
    // The reward lands once they qualify (services/referralRewards.ts), not at sign-up.
    rules: { minSpend: s.minSpend, minVisits: s.minVisits, qualifyDays: s.qualifyDays },
  });
});

/* ── Wallet passes ───────────────────────────────────────────────────────── */

/* The pass's barcode is the account link, so a customer without a token yet
   (one created before tokens existed) is given one here. */
async function withToken(c: typeof customersTable.$inferSelect) {
  if (c.portalToken) return c;
  const portalToken = crypto.randomUUID();
  await db.update(customersTable).set({ portalToken }).where(eq(customersTable.id, c.id));
  return { ...c, portalToken };
}

router.get("/shop/account/wallet/apple", async (req, res): Promise<void> => {
  const c = await signedIn(req, res);
  if (!c) return;
  await sendApplePass(res, await withToken(c));
});

router.get("/shop/account/wallet/google", async (req, res): Promise<void> => {
  const c = await signedIn(req, res);
  if (!c) return;
  await sendGoogleWalletLink(res, await withToken(c));
});

export default router;
