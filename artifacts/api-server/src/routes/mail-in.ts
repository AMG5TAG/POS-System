import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import crypto from "node:crypto";
import {
  db, mailInRequestsTable, mailInSettingsTable, merchantsTable, businessProfileTable,
  customersTable, serviceJobsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { soleMerchantId } from "../lib/sole-merchant";
import { normalisePhoneFor } from "../lib/phone";
import { sendEmail } from "../services/email";
import { escapeHtml } from "../lib/html-escape";
import { shopOrigin } from "../lib/publicUrl";
import { withUniqueRetry, nextSequential } from "../lib/document-numbers";
import { registerServiceQr, registerQrBestEffort } from "../services/entityQr";
import { triggerInstantSync } from "../services/autoSyncScheduler";
import { SERVICE_WARRANTY_DEFAULTS } from "../lib/service-job-defaults";
import {
  MAIL_IN_CARRIERS, MAIL_IN_TERMS, OPEN_MAIL_IN_STATUSES, canStaffSetStatus, statusAfterTracking,
  nextMailInReference, newMailInToken, hashMailInToken, isMailInToken, cleanTrackingNumber,
  jobDeviceDescription, returnAddressLine, formatOpeningHours,
} from "../lib/mail-in";

/**
 * Mail-in repairs. Public half (the shop's Mail-In page): page details, the
 * request form, and a token link where the customer adds their tracking
 * number. Staff half (Online › Mail-In): the list, notes/status, "Received"
 * — which turns the request into a service job — and the page's wording.
 * Rules live in lib/mail-in.ts.
 */

const router: IRouter = Router();

const LOCALHOST = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const limiter = (windowMs: number, max: number) => rateLimit({
  windowMs, max,
  message: { error: "Too many requests from this connection — please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  skip: (req) => LOCALHOST.has(req.ip ?? ""),
});
const submitLimiter = limiter(60 * 60 * 1000, 5);
const trackLimiter = limiter(15 * 60 * 1000, 30);

const DEFAULT_RETURN_TEXT = "Return postage is quoted with your repair. You can also collect it in store.";
// Service job numbers the POS issues (service-jobs-new.tsx uses the same).
const JOB_PREFIX = "KS";
const JOB_DIGITS = 4;

async function settingsFor(merchantId: number) {
  const [row] = await db.select().from(mailInSettingsTable).where(eq(mailInSettingsTable.merchantId, merchantId)).limit(1);
  return {
    enabled: row ? row.enabled === "true" : true,
    returnText: row?.returnText || DEFAULT_RETURN_TEXT,
    extraNotes: row?.extraNotes ?? "",
  };
}

async function businessFor(merchantId: number) {
  const [m] = await db
    .select({ businessName: merchantsTable.businessName, phone: merchantsTable.phone, email: merchantsTable.email, address: merchantsTable.address, city: merchantsTable.city })
    .from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const [p] = await db.select().from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId)).limit(1);
  let hours: unknown = {};
  try { hours = JSON.parse(p?.openingHours ?? "{}"); } catch { /* none */ }
  return {
    businessName: m?.businessName ?? "",
    phone: m?.phone ?? null,
    email: p?.contactEmail || m?.email || null,
    // The address customers post to is the business address (Settings › Business Details).
    addressLines: [m?.businessName, m?.address, [m?.city, p?.state, p?.postcode].filter(Boolean).join(" ")].filter((l): l is string => !!l && l.trim() !== ""),
    openingHours: formatOpeningHours(hours),
  };
}

const trackLink = (token: string) => `${shopOrigin()}/mail-in/track/${token}`;

/* ── Public: the shop's Mail-In page ─────────────────────────────────── */

router.get("/shop/mail-in", async (_req, res): Promise<void> => {
  const merchantId = await soleMerchantId();
  if (merchantId == null) { res.status(404).json({ error: "Not found" }); return; }
  const [settings, business] = await Promise.all([settingsFor(merchantId), businessFor(merchantId)]);
  res.json({
    enabled: settings.enabled,
    businessName: business.businessName,
    phone: business.phone,
    email: business.email,
    addressLines: business.addressLines,
    openingHours: business.openingHours,
    returnText: settings.returnText,
    extraNotes: settings.extraNotes,
    terms: MAIL_IN_TERMS,
  });
});

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const SubmitBody = z.object({
  firstName:    text(1, 60),
  lastName:     text(0, 60).optional(),
  email:        z.string().trim().toLowerCase().email().max(254),
  phone:        text(6, 30),
  street:       text(3, 160),
  suburb:       text(2, 80),
  state:        z.enum(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]),
  postcode:     z.string().trim().regex(/^\d{4}$/),
  deviceType:   text(2, 60),
  brandModel:   text(2, 120),
  serialNumber: text(0, 80).optional(),
  fault:        text(10, 3000),
  accessories:  text(0, 500).optional(),
  // Every term must be ticked; the form sends one true per term, in order.
  agreed:       z.array(z.literal(true)).length(MAIL_IN_TERMS.length),
});

router.post("/shop/mail-in", submitLimiter, async (req, res): Promise<void> => {
  const merchantId = await soleMerchantId();
  if (merchantId == null) { res.status(404).json({ error: "Not found" }); return; }
  const settings = await settingsFor(merchantId);
  if (!settings.enabled) { res.status(403).json({ error: "Mail-in repairs aren't available right now." }); return; }
  const parsed = SubmitBody.safeParse(req.body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    res.status(400).json({ error: field === "agreed" ? "Please tick every box to agree to the terms." : `Please check ${String(field ?? "the form")}.`, field });
    return;
  }
  const b = parsed.data;

  // A signed-in shopper's own account; nobody else's is ever attached here.
  let customerId: number | null = null;
  const portalId = req.session?.portalCustomerId;
  if (portalId) {
    const [c] = await db.select({ id: customersTable.id }).from(customersTable)
      .where(and(eq(customersTable.id, portalId), eq(customersTable.merchantId, merchantId))).limit(1);
    customerId = c?.id ?? null;
  }

  const { token, tokenHash } = newMailInToken();
  const phone = await normalisePhoneFor(merchantId, b.phone);
  const request = await withUniqueRetry("mail_in_requests_merchant_reference_uniq", async (tryIndex) => {
    const existing = await db.select({ reference: mailInRequestsTable.reference }).from(mailInRequestsTable)
      .where(eq(mailInRequestsTable.merchantId, merchantId));
    const [row] = await db.insert(mailInRequestsTable).values({
      merchantId,
      reference: nextMailInReference(existing.map((r) => r.reference), tryIndex),
      tokenHash,
      customerId,
      firstName: b.firstName,
      lastName: b.lastName || null,
      email: b.email,
      phone,
      street: b.street,
      suburb: b.suburb,
      state: b.state,
      postcode: b.postcode,
      deviceType: b.deviceType,
      brandModel: b.brandModel,
      serialNumber: b.serialNumber || null,
      fault: b.fault,
      accessories: b.accessories || null,
      agreedAt: new Date(),
    }).returning();
    return row!;
  });

  const business = await businessFor(merchantId);
  const link = trackLink(token);
  const addressHtml = business.addressLines.map(escapeHtml).join("<br>");
  // Emails are best-effort: the request is saved and the page shows the same
  // details, so a mail outage must not fail the submission.
  void sendEmail(merchantId, {
    to: b.email,
    subject: `Mail-in repair ${request.reference} — how to send your device`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;color:#111">
        <h2 style="margin-top:0">Thanks, ${escapeHtml(b.firstName)} — your mail-in request is in</h2>
        <p>Your reference is <strong>${request.reference}</strong>. Please write it on a note inside the parcel.</p>
        <p><strong>Post your ${escapeHtml(b.brandModel)} to:</strong><br>${addressHtml}</p>
        <p>We strongly recommend <strong>registered, tracked post</strong>. Once it's sent, add your tracking number here so we know it's coming:</p>
        <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#007b7d;color:#fff;text-decoration:none;border-radius:6px">Add tracking number</a></p>
        <p style="color:#555">Diagnostics are free. We'll contact you with a quote before any repair goes ahead.</p>
        <p style="color:#555">${escapeHtml(settings.returnText)}</p>
      </div>`,
    text: `Your mail-in reference is ${request.reference}.\n\nPost your ${b.brandModel} to:\n${business.addressLines.join("\n")}\n\nWe strongly recommend registered, tracked post. Add your tracking number here: ${link}\n\nDiagnostics are free; no repair goes ahead without your approval of a quote.\n${settings.returnText}`,
  }).catch(() => {});
  if (business.email) {
    void sendEmail(merchantId, {
      to: business.email,
      subject: `New mail-in request ${request.reference} — ${b.brandModel}`,
      html: `<p>${escapeHtml(`${b.firstName} ${b.lastName ?? ""}`.trim())} (${escapeHtml(b.email)}, ${escapeHtml(phone)}) is posting in a <strong>${escapeHtml(`${b.deviceType} — ${b.brandModel}`)}</strong>.</p><p><strong>Fault:</strong> ${escapeHtml(b.fault)}</p><p>See Online › Mail-In in KoaPOS.</p>`,
      text: `${b.firstName} ${b.lastName ?? ""} is posting in a ${b.deviceType} — ${b.brandModel}.\nFault: ${b.fault}\nSee Online › Mail-In in KoaPOS.`,
    }).catch(() => {});
  }

  res.status(201).json({ reference: request.reference, token, trackUrl: link });
});

async function requestByToken(token: string) {
  const [row] = await db.select().from(mailInRequestsTable)
    .where(eq(mailInRequestsTable.tokenHash, hashMailInToken(token))).limit(1);
  return row ?? null;
}

/** What the token link shows: enough to confirm it's their request, nothing more. */
function publicView(r: typeof mailInRequestsTable.$inferSelect) {
  return {
    reference: r.reference,
    status: r.status,
    firstName: r.firstName,
    device: jobDeviceDescription(r),
    trackingCarrier: r.trackingCarrier,
    trackingNumber: r.trackingNumber,
    submittedAt: r.createdAt.toISOString(),
    receivedAt: r.receivedAt?.toISOString() ?? null,
  };
}

router.get("/shop/mail-in/track/:token", trackLimiter, async (req, res): Promise<void> => {
  const token = String(req.params.token);
  const r = isMailInToken(token) ? await requestByToken(token) : null;
  if (!r) { res.status(404).json({ error: "We couldn't find that mail-in request." }); return; }
  const business = await businessFor(r.merchantId);
  res.json({ ...publicView(r), addressLines: business.addressLines });
});

const TrackBody = z.object({
  carrier: z.enum(MAIL_IN_CARRIERS),
  trackingNumber: z.string().max(60),
});

router.post("/shop/mail-in/track/:token", trackLimiter, async (req, res): Promise<void> => {
  const token = String(req.params.token);
  const r = isMailInToken(token) ? await requestByToken(token) : null;
  if (!r) { res.status(404).json({ error: "We couldn't find that mail-in request." }); return; }
  const parsed = TrackBody.safeParse(req.body);
  const number = parsed.success ? cleanTrackingNumber(parsed.data.trackingNumber) : null;
  if (!parsed.success || !number) { res.status(400).json({ error: "Please enter the tracking number exactly as it appears on your receipt." }); return; }
  const next = statusAfterTracking(r.status);
  if (!next) { res.status(409).json({ error: r.status === "received" ? "We've already received your device." : "This request was cancelled — please contact us." }); return; }
  const [updated] = await db.update(mailInRequestsTable)
    .set({ trackingCarrier: parsed.data.carrier, trackingNumber: number, trackingAddedAt: new Date(), status: next })
    .where(and(eq(mailInRequestsTable.id, r.id), inArray(mailInRequestsTable.status, [...OPEN_MAIL_IN_STATUSES])))
    .returning();
  if (!updated) { res.status(409).json({ error: "This request has changed — please reload the page." }); return; }
  res.json(publicView(updated));
});

/* ── Staff: Online › Mail-In ─────────────────────────────────────────── */

function staffView(r: typeof mailInRequestsTable.$inferSelect) {
  return {
    id: r.id, reference: r.reference, status: r.status, customerId: r.customerId,
    firstName: r.firstName, lastName: r.lastName, email: r.email, phone: r.phone,
    street: r.street, suburb: r.suburb, state: r.state, postcode: r.postcode,
    deviceType: r.deviceType, brandModel: r.brandModel, serialNumber: r.serialNumber,
    fault: r.fault, accessories: r.accessories,
    trackingCarrier: r.trackingCarrier, trackingNumber: r.trackingNumber,
    trackingAddedAt: r.trackingAddedAt?.toISOString() ?? null,
    receivedAt: r.receivedAt?.toISOString() ?? null,
    serviceJobId: r.serviceJobId, staffNotes: r.staffNotes,
    agreedAt: r.agreedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/mail-in", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(mailInRequestsTable)
    .where(eq(mailInRequestsTable.merchantId, req.session.merchantId!))
    .orderBy(desc(mailInRequestsTable.createdAt))
    .limit(500);
  const jobIds = rows.map((r) => r.serviceJobId).filter((id): id is number => id != null);
  const jobs = jobIds.length
    ? await db.select({ id: serviceJobsTable.id, jobNumber: serviceJobsTable.jobNumber }).from(serviceJobsTable)
        .where(and(eq(serviceJobsTable.merchantId, req.session.merchantId!), inArray(serviceJobsTable.id, jobIds)))
    : [];
  const jobNumber = new Map(jobs.map((j) => [j.id, j.jobNumber]));
  res.json(rows.map((r) => ({ ...staffView(r), serviceJobNumber: r.serviceJobId ? jobNumber.get(r.serviceJobId) ?? null : null })));
});

/** Count for the nav badge: requests still on their way. */
router.get("/mail-in/open-count", requireAuth, async (req, res): Promise<void> => {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(mailInRequestsTable)
    .where(and(eq(mailInRequestsTable.merchantId, req.session.merchantId!), inArray(mailInRequestsTable.status, [...OPEN_MAIL_IN_STATUSES])));
  res.json({ count: n });
});

const PatchBody = z.object({
  status: z.enum(["awaiting_postage", "in_transit", "cancelled"]).optional(),
  staffNotes: z.string().max(4000).nullable().optional(),
  trackingCarrier: z.enum(MAIL_IN_CARRIERS).nullable().optional(),
  trackingNumber: z.string().max(60).nullable().optional(),
});

router.patch("/mail-in/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = PatchBody.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const merchantId = req.session.merchantId!;
  const [r] = await db.select().from(mailInRequestsTable)
    .where(and(eq(mailInRequestsTable.id, id), eq(mailInRequestsTable.merchantId, merchantId))).limit(1);
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const b = parsed.data;
  if (b.status && !canStaffSetStatus(r.status, b.status)) {
    res.status(409).json({ error: r.status === "received" ? "This device has already been received." : "That status change isn't allowed." });
    return;
  }
  let trackingNumber: string | null | undefined;
  if (b.trackingNumber !== undefined) {
    trackingNumber = b.trackingNumber ? cleanTrackingNumber(b.trackingNumber) : null;
    if (b.trackingNumber && !trackingNumber) { res.status(400).json({ error: "That doesn't look like a tracking number." }); return; }
  }
  const [updated] = await db.update(mailInRequestsTable).set({
    ...(b.status ? { status: b.status } : {}),
    ...(b.staffNotes !== undefined ? { staffNotes: b.staffNotes || null } : {}),
    ...(b.trackingCarrier !== undefined ? { trackingCarrier: b.trackingCarrier } : {}),
    ...(trackingNumber !== undefined ? { trackingNumber } : {}),
  }).where(eq(mailInRequestsTable.id, r.id)).returning();
  res.json(staffView(updated!));
});

/**
 * The parcel has arrived: book it in as a service job. Claims the request first
 * (open → received) so a double click can't create two jobs, then finds the
 * customer — the shopper who submitted it, else the newest POS customer with
 * that email, else a new one — and creates the job with the form's details.
 */
router.post("/mail-in/:id/receive", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const merchantId = req.session.merchantId!;
  const [claimed] = await db.update(mailInRequestsTable)
    .set({ status: "received", receivedAt: new Date() })
    .where(and(
      eq(mailInRequestsTable.id, id),
      eq(mailInRequestsTable.merchantId, merchantId),
      inArray(mailInRequestsTable.status, [...OPEN_MAIL_IN_STATUSES]),
    ))
    .returning();
  if (!claimed) { res.status(409).json({ error: "This request isn't waiting to be received." }); return; }
  const r = claimed;

  try {
    let customerId = r.customerId;
    if (customerId) {
      const [c] = await db.select({ id: customersTable.id }).from(customersTable)
        .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId))).limit(1);
      customerId = c?.id ?? null;
    }
    if (!customerId) {
      const [c] = await db.select({ id: customersTable.id }).from(customersTable)
        .where(and(eq(customersTable.merchantId, merchantId), sql`lower(${customersTable.email}) = ${r.email.toLowerCase()}`))
        .orderBy(desc(customersTable.id)).limit(1);
      customerId = c?.id ?? null;
    }
    if (!customerId) {
      const [c] = await db.insert(customersTable).values({
        merchantId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        billingStreet: r.street,
        billingCity: r.suburb,
        billingState: r.state,
        billingPostcode: r.postcode,
        heardFrom: "Mail-in",
        portalToken: crypto.randomUUID(),
      }).returning({ id: customersTable.id });
      customerId = c!.id;
      triggerInstantSync(merchantId, "contacts");
    }

    const today = new Date().toISOString().split("T")[0];
    const job = await withUniqueRetry("service_jobs_merchant_job_number_unique", async (tryIndex) => {
      const existing = await db.select({ jobNumber: serviceJobsTable.jobNumber }).from(serviceJobsTable)
        .where(eq(serviceJobsTable.merchantId, merchantId));
      const [created] = await db.insert(serviceJobsTable).values({
        merchantId,
        customerId,
        jobNumber: `${JOB_PREFIX}${String(nextSequential(existing.map((j) => j.jobNumber), tryIndex)).padStart(JOB_DIGITS, "0")}`,
        title: `Mail-in: ${r.brandModel}`,
        status: "pending",
        bookInDate: today,
        repairWarrantyDays: SERVICE_WARRANTY_DEFAULTS.repairWarrantyDays,
        deviceType: r.deviceType,
        deviceDescription: r.brandModel,
        serialNumber: r.serialNumber,
        workDescription: r.fault,
        additionalEquipment: r.accessories,
        isMailIn: "true",
        shippingCarrier: r.trackingCarrier,
        inboundTracking: r.trackingNumber,
        returnAddress: returnAddressLine(r),
        notes: `Mail-in ${r.reference}. Free diagnostics — quote before any repair.${r.staffNotes ? `\n${r.staffNotes}` : ""}`,
      }).returning();
      return created!;
    });
    registerQrBestEffort(registerServiceQr(merchantId, job.id, `${r.firstName} ${r.lastName ?? ""}`.trim()));

    const [updated] = await db.update(mailInRequestsTable)
      .set({ serviceJobId: job.id, customerId })
      .where(eq(mailInRequestsTable.id, r.id)).returning();
    res.json({ ...staffView(updated!), serviceJobNumber: job.jobNumber });
  } catch (err) {
    // Put the request back so it can be received again.
    await db.update(mailInRequestsTable).set({ status: claimedFrom(r), receivedAt: null }).where(eq(mailInRequestsTable.id, r.id));
    req.log?.error?.({ err }, "Mail-in receive failed");
    res.status(500).json({ error: "Couldn't create the service job — please try again." });
  }
});

/** The status a claimed request came from: tracking present means it was in transit. */
const claimedFrom = (r: { trackingNumber: string | null }) => (r.trackingNumber ? "in_transit" : "awaiting_postage");

router.get("/mail-in/settings", requireAuth, async (req, res): Promise<void> => {
  res.json(await settingsFor(req.session.merchantId!));
});

const SettingsBody = z.object({
  enabled: z.boolean().optional(),
  returnText: z.string().trim().min(1).max(1000).optional(),
  extraNotes: z.string().trim().max(2000).nullable().optional(),
});

router.put("/mail-in/settings", requireAuth, async (req, res): Promise<void> => {
  if (req.session.staffRole === "cashier") { res.status(403).json({ error: "Manager or owner role required" }); return; }
  const parsed = SettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid settings" }); return; }
  const merchantId = req.session.merchantId!;
  const b = parsed.data;
  const values = {
    ...(b.enabled !== undefined ? { enabled: b.enabled ? "true" : "false" } : {}),
    ...(b.returnText !== undefined ? { returnText: b.returnText } : {}),
    ...(b.extraNotes !== undefined ? { extraNotes: b.extraNotes || null } : {}),
  };
  if (Object.keys(values).length > 0) {
    await db.insert(mailInSettingsTable).values({ merchantId, ...values })
      .onConflictDoUpdate({ target: mailInSettingsTable.merchantId, set: values });
  }
  res.json(await settingsFor(merchantId));
});

export default router;
