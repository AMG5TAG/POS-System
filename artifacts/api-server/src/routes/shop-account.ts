import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, customersTable, appointmentsTable, quotesTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "node:crypto";
import { soleMerchantId } from "../lib/sole-merchant";
import { buyerCustomerIds } from "../lib/shop-reviews";
import { findCustomerByPortalToken, merchantRequiresPortalPassword, maskContact } from "../lib/portalAuth";
import { applyEstimateApprovalToJob } from "../services/quoteApproval";
import { sendApplePass, sendGoogleWalletLink } from "../lib/wallet-pass";
import { shopCustomer, accountOf } from "./shop";

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
 * job's QR and carried by the wallet pass. The token admits under the portal's
 * rules (lib/portalAuth.ts): alone while the customer has no password or the
 * business hasn't turned on "require password"; otherwise the customer has to
 * sign in, and the link only says whose account it is. A token never signs
 * anyone in to a different business's customer.
 */
router.post("/shop/auth/token", tokenLimiter, async (req, res): Promise<void> => {
  const merchantId = await soleMerchantId();
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const customer = token ? await findCustomerByPortalToken(token) : null;
  if (merchantId == null || !customer || customer.merchantId !== merchantId) {
    res.status(404).json({ error: "This link is no longer valid. Sign in with your email instead." });
    return;
  }
  const already = req.session?.portalCustomerId === customer.id;
  if (!already && customer.portalPasswordHash && await merchantRequiresPortalPassword(merchantId)) {
    res.status(401).json({
      error: "Please sign in with your password.",
      reason: "password_required",
      contactHint: maskContact(customer.email, customer.phone),
    });
    return;
  }
  req.session.portalCustomerId = customer.id;
  res.json({ customer: accountOf(customer) });
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
