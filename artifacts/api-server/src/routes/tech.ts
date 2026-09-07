import { Router, type IRouter, type Request, type Response } from "express";
import { db, merchantsTable, staffTable, serviceJobsTable, customersTable, appointmentsTable, techAppSettingsTable, techAppEventsTable, qrCodesTable } from "@workspace/db";
import { eq, and, or, asc, desc, ilike } from "drizzle-orm";
import { z } from "zod/v4";
import { customerDisplayName } from "../lib/customer-name";
import { matchStaffByPin } from "../lib/staff-pin";
import { sendSms } from "../services/sms";
import { triggerInstantSync } from "../services/autoSyncScheduler";
import { customerPortalUrl } from "../lib/publicUrl";
import { NOTE_SEP, parseNotes, buildNoteTimestamp } from "../lib/service-job-notes";

/**
 * Technician web app ("Tech App") API.
 *
 * Serves the mobile companion app at /b/:businessUsername/t/webapp. A
 * technician signs in with their staff PIN scoped to the business in the
 * URL; the session only unlocks these /api/tech endpoints — it never grants
 * access to the main application (requireAuth checks session.merchantId,
 * which is NOT set here).
 *
 * Privacy: every service-job read is scoped to the technician's merchant.
 * Scanning a ticket QR from a different business returns 403 with
 * { reason: "foreign_business" } so the client can show a privacy screen
 * instead of leaking another company's repair data.
 */

declare module "express-session" {
  interface SessionData {
    tech?: { staffId: number; merchantId: number };
  }
}

const router: IRouter = Router();

/* ── PIN rate limiting (mirrors staff verify-pin) ────────────────────── */
const PIN_MAX_FAILS = 5;
const PIN_WINDOW_MS = 60_000;
const pinFailures = new Map<number, { fails: number; resetAt: number }>();

function pinRateLimited(merchantId: number): boolean {
  const entry = pinFailures.get(merchantId);
  if (!entry || Date.now() > entry.resetAt) return false;
  return entry.fails >= PIN_MAX_FAILS;
}

function recordPinFailure(merchantId: number): void {
  const now = Date.now();
  const entry = pinFailures.get(merchantId);
  if (!entry || now > entry.resetAt) {
    pinFailures.set(merchantId, { fails: 1, resetAt: now + PIN_WINDOW_MS });
  } else {
    entry.fails += 1;
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Per-merchant tech app settings with defaults when no row exists yet. */
async function getTechSettings(merchantId: number) {
  const [row] = await db
    .select()
    .from(techAppSettingsTable)
    .where(eq(techAppSettingsTable.merchantId, merchantId))
    .limit(1);
  return {
    enabled:             (row?.enabled ?? "true") === "true",
    showCustomerContact: (row?.showCustomerContact ?? "true") === "true",
    showCredentials:     (row?.showCredentials ?? "true") === "true",
    allowStatusChange:   (row?.allowStatusChange ?? "true") === "true",
  };
}

/** Fire-and-forget moderation-trail entry (never blocks the response). */
function logTechEvent(merchantId: number, staffId: number | null, staffName: string, action: string, detail = ""): void {
  void db
    .insert(techAppEventsTable)
    .values({ merchantId, staffId, staffName, action, detail })
    .catch(() => { /* audit logging must never break the request */ });
}

async function findMerchantByUsername(username: string) {
  const [m] = await db
    .select({
      id: merchantsTable.id,
      businessName: merchantsTable.businessName,
      logoUrl: merchantsTable.logoUrl,
      status: merchantsTable.status,
    })
    .from(merchantsTable)
    .where(eq(merchantsTable.username, username.toLowerCase()));
  return m && m.status === "active" ? m : null;
}

/** Compact job shape for the tech list — heavy fields (photos, signature)
    are only returned by the detail endpoint. */
function formatJobSummary(
  job: typeof serviceJobsTable.$inferSelect,
  customer?: typeof customersTable.$inferSelect | null,
) {
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    status: job.status,
    customerName: customer
      ? customerDisplayName(customer.firstName, customer.lastName, customer.company)
      : null,
    deviceType: job.deviceType ?? null,
    deviceDescription: job.deviceDescription ?? null,
    isCritical: job.isCritical === "true",
    isUnderWarranty: job.isUnderWarranty === "true",
    bookInDate: job.bookInDate,
    createdAt: job.createdAt.toISOString(),
  };
}

function formatJobDetail(
  job: typeof serviceJobsTable.$inferSelect,
  customer?: typeof customersTable.$inferSelect | null,
) {
  return {
    ...formatJobSummary(job, customer),
    customerPhone: customer?.phone ?? null,
    customerEmail: customer?.email ?? null,
    deviceColour: job.deviceColour ?? null,
    deviceQuantity: job.deviceQuantity ?? null,
    serialNumber: job.serialNumber ?? null,
    condition: job.condition ?? null,
    workDescription: job.workDescription ?? null,
    additionalEquipment: job.additionalEquipment ?? null,
    passwordOrPin: job.passwordOrPin ?? null,
    accounts: job.accounts ?? null,
    notes: job.notes ?? null,
    isPartnerRepair: job.isPartnerRepair === "true",
    partnerRepairCode: job.partnerRepairCode ?? null,
    photos: job.photos ? (() => { try { return JSON.parse(job.photos!) as string[]; } catch { return []; } })() : [],
    updatedAt: job.updatedAt.toISOString(),
  };
}

/* The tech app lets the caller supply the stamp (a note written offline keeps
   the time it was actually taken), so it validates the shape it will accept.
   The format itself lives in lib/service-job-notes. */
const NOTE_TS_RE = /^\[\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\]$/;

/** Auth gate for tech endpoints — verifies the session technician still
    exists and is active. */
async function requireTech(
  req: Request,
  res: Response,
): Promise<{
  staffId: number;
  merchantId: number;
  staffName: string;
  role: string;
  settings: Awaited<ReturnType<typeof getTechSettings>>;
} | null> {
  const tech = req.session?.tech;
  if (!tech) {
    res.status(401).json({ error: "Not signed in" });
    return null;
  }
  const [staff] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.id, tech.staffId), eq(staffTable.merchantId, tech.merchantId)));
  if (!staff || staff.isActive !== "true") {
    res.status(401).json({ error: "Not signed in" });
    return null;
  }
  /* Disabling the Tech App in Management cuts off existing sessions too */
  const settings = await getTechSettings(tech.merchantId);
  if (!settings.enabled) {
    res.status(403).json({ error: "The Tech App is currently disabled for this business" });
    return null;
  }
  return { staffId: staff.id, merchantId: staff.merchantId, staffName: staff.name, role: staff.role, settings };
}

/* ── Public: business info for the login screen ──────────────────────── */
router.get("/tech/b/:username/info", async (req, res): Promise<void> => {
  const merchant = await findMerchantByUsername(req.params.username);
  if (!merchant) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json({ businessName: merchant.businessName, logoUrl: merchant.logoUrl ?? null });
});

/* ── Login with staff PIN ────────────────────────────────────────────── */
const TechLoginBody = z.object({ pin: z.string().min(1).max(32) });

router.post("/tech/b/:username/login", async (req, res): Promise<void> => {
  const merchant = await findMerchantByUsername(req.params.username);
  if (!merchant) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  const parsed = TechLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "PIN is required" });
    return;
  }
  const settings = await getTechSettings(merchant.id);
  if (!settings.enabled) {
    res.status(403).json({ error: "The Tech App is currently disabled for this business" });
    return;
  }
  if (pinRateLimited(merchant.id)) {
    res.status(429).json({ error: "Too many attempts — try again in a minute" });
    return;
  }
  const staff = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.merchantId, merchant.id), eq(staffTable.isActive, "true")));
  const match = await matchStaffByPin(staff, parsed.data.pin);
  if (!match) {
    recordPinFailure(merchant.id);
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }
  req.session.tech = { staffId: match.id, merchantId: merchant.id };
  logTechEvent(merchant.id, match.id, match.name, "login", "Signed in to the Tech App");
  res.json({
    staff: { id: match.id, name: match.name, role: match.role },
    business: { businessName: merchant.businessName, logoUrl: merchant.logoUrl ?? null },
  });
});

/* ── Session info / logout ───────────────────────────────────────────── */
router.get("/tech/me", async (req, res): Promise<void> => {
  const tech = await requireTech(req, res);
  if (!tech) return;
  const [merchant] = await db
    .select({ businessName: merchantsTable.businessName, logoUrl: merchantsTable.logoUrl, username: merchantsTable.username })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, tech.merchantId));
  res.json({
    staff: { id: tech.staffId, name: tech.staffName, role: tech.role },
    business: { businessName: merchant?.businessName ?? "", logoUrl: merchant?.logoUrl ?? null, username: merchant?.username ?? null },
  });
});

router.post("/tech/logout", async (req, res): Promise<void> => {
  const tech = req.session?.tech;
  if (tech) {
    const [staff] = await db.select({ name: staffTable.name }).from(staffTable).where(eq(staffTable.id, tech.staffId));
    logTechEvent(tech.merchantId, tech.staffId, staff?.name ?? "", "logout", "Signed out of the Tech App");
  }
  if (req.session) req.session.tech = undefined;
  res.json({ ok: true });
});

/* ── Service jobs (scoped to the technician's business) ──────────────── */
router.get("/tech/service-jobs", async (req, res): Promise<void> => {
  const tech = await requireTech(req, res);
  if (!tech) return;

  const jobs = await db
    .select()
    .from(serviceJobsTable)
    .where(eq(serviceJobsTable.merchantId, tech.merchantId))
    .orderBy(desc(serviceJobsTable.createdAt));

  const customerIds = [...new Set(jobs.filter((j) => j.customerId).map((j) => j.customerId!))];
  const customers = customerIds.length
    ? await db.select().from(customersTable).where(eq(customersTable.merchantId, tech.merchantId))
    : [];
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  /* "Current" services — everything not finished. Completed/cancelled are
     excluded from the technician's work list. */
  const current = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled");
  res.json({
    items: current.map((j) => formatJobSummary(j, j.customerId ? customerMap.get(j.customerId) ?? null : null)),
  });
});

router.get("/tech/service-jobs/:id", async (req, res): Promise<void> => {
  const tech = await requireTech(req, res);
  if (!tech) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid job id" });
    return;
  }

  const [job] = await db.select().from(serviceJobsTable).where(eq(serviceJobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Service job not found" });
    return;
  }
  /* Privacy wall: a ticket from another business is never described — the
     client shows a privacy screen on this reason code. */
  if (job.merchantId !== tech.merchantId) {
    logTechEvent(tech.merchantId, tech.staffId, tech.staffName, "denied_foreign", "Scanned a ticket belonging to another business");
    res.status(403).json({ error: "This service ticket belongs to another business", reason: "foreign_business" });
    return;
  }

  /* Service-QR expiry: the printed QR is valid for 30 days from creation. Once
     the persisted service QR has expired, the scanned code no longer resolves.
     Jobs with no persisted QR (created before this feature) are unaffected. */
  const [serviceQr] = await db
    .select({ expiresAt: qrCodesTable.expiresAt })
    .from(qrCodesTable)
    .where(and(
      eq(qrCodesTable.merchantId, tech.merchantId),
      eq(qrCodesTable.entryId, `service-${id}`),
      eq(qrCodesTable.qrType, "service"),
    ));
  if (serviceQr?.expiresAt && serviceQr.expiresAt.getTime() < Date.now()) {
    logTechEvent(tech.merchantId, tech.staffId, tech.staffName, "qr_expired", `Scanned an expired QR for job ${job.jobNumber}`);
    res.status(410).json({ error: "This service QR code has expired.", reason: "qr_expired" });
    return;
  }

  const customer = job.customerId
    ? (await db
        .select()
        .from(customersTable)
        .where(and(eq(customersTable.id, job.customerId), eq(customersTable.merchantId, tech.merchantId))))[0] ?? null
    : null;

  logTechEvent(tech.merchantId, tech.staffId, tech.staffName, "job_view", `Viewed service job ${job.jobNumber}`);

  /* Field-visibility settings from Management > Staff & Operations > Tech App */
  const detail = formatJobDetail(job, customer);
  if (!tech.settings.showCustomerContact) {
    detail.customerPhone = null;
    detail.customerEmail = null;
  }
  if (!tech.settings.showCredentials) {
    detail.passwordOrPin = null;
    detail.accounts = null;
  }
  res.json({ ...detail, canChangeStatus: tech.settings.allowStatusChange });
});

/* ── Add notes / photos to a service sheet from the tech app ─────────── */

/** Load a service job scoped to the technician's merchant. Writes the
    error response (400/404/403) and returns null when not accessible. */
async function loadScopedJob(
  req: Request<{ id: string }>,
  res: Response,
  tech: NonNullable<Awaited<ReturnType<typeof requireTech>>>,
): Promise<typeof serviceJobsTable.$inferSelect | null> {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid job id" });
    return null;
  }
  const [job] = await db.select().from(serviceJobsTable).where(eq(serviceJobsTable.id, id));
  if (!job) {
    res.status(404).json({ error: "Service job not found" });
    return null;
  }
  if (job.merchantId !== tech.merchantId) {
    logTechEvent(tech.merchantId, tech.staffId, tech.staffName, "denied_foreign", "Tried to update a ticket belonging to another business");
    res.status(403).json({ error: "This service ticket belongs to another business", reason: "foreign_business" });
    return null;
  }
  return job;
}

const TechAddNoteBody = z.object({
  text: z.string().trim().min(1).max(5000),
  /* Built on the device so the time matches the technician's clock, same as
     the admin dialog. Server time is the fallback for invalid/missing. */
  timestamp: z.string().optional(),
});

router.post("/tech/service-jobs/:id/notes", async (req, res): Promise<void> => {
  const tech = await requireTech(req, res);
  if (!tech) return;
  const parsed = TechAddNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Note text is required" });
    return;
  }
  const job = await loadScopedJob(req, res, tech);
  if (!job) return;

  const ts = parsed.data.timestamp && NOTE_TS_RE.test(parsed.data.timestamp)
    ? parsed.data.timestamp
    : buildNoteTimestamp();
  const entry = `${ts} ${tech.staffName}: ${parsed.data.text}`;
  const notes = [...parseNotes(job.notes), entry].join(NOTE_SEP);

  await db.update(serviceJobsTable).set({ notes }).where(eq(serviceJobsTable.id, job.id));
  logTechEvent(tech.merchantId, tech.staffId, tech.staffName, "note_added", `Added a note to service job ${job.jobNumber}`);
  res.json({ notes });
});

const TechAddPhotosBody = z.object({
  /* Data URIs, same storage format the admin Service Job dialog uses. */
  photos: z.array(z.string().regex(/^data:[\w.+-]+\/[\w.+-]+;base64,/)).min(1).max(12),
});

router.post("/tech/service-jobs/:id/photos", async (req, res): Promise<void> => {
  const tech = await requireTech(req, res);
  if (!tech) return;
  const parsed = TechAddPhotosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "At least one photo or file is required" });
    return;
  }
  const job = await loadScopedJob(req, res, tech);
  if (!job) return;

  const existing = job.photos ? (() => { try { return JSON.parse(job.photos!) as string[]; } catch { return []; } })() : [];
  const photos = [...existing, ...parsed.data.photos];

  await db.update(serviceJobsTable).set({ photos: JSON.stringify(photos) }).where(eq(serviceJobsTable.id, job.id));
  logTechEvent(tech.merchantId, tech.staffId, tech.staffName, "photos_added", `Added ${parsed.data.photos.length} photo(s)/file(s) to service job ${job.jobNumber}`);
  res.json({ photos });
});

/* ── Change a service job's status from the tech app ─────────────────── */

const SERVICE_STATUSES = [
  "pending", "in-progress", "awaiting-parts", "awaiting-stock", "at-repairer",
  "awaiting-partner-approval", "partner-replacement", "awaiting-customer",
  "awaiting-pickup", "completed", "cancelled",
] as const;

const STATUS_LABELS: Record<string, string> = {
  "pending":                   "Pending",
  "in-progress":               "In Progress",
  "awaiting-parts":            "Awaiting Parts",
  "awaiting-stock":            "Awaiting Stock",
  "at-repairer":               "At Repairer",
  "awaiting-partner-approval": "Awaiting Partner Approval",
  "partner-replacement":       "Partner Replacement",
  "awaiting-customer":         "Awaiting Customer",
  "awaiting-pickup":       "Completed - Awaiting Pickup",
  "completed":                 "Completed",
  "cancelled":                 "Cancelled",
};

const TechSetStatusBody = z.object({ status: z.enum(SERVICE_STATUSES) });

router.patch("/tech/service-jobs/:id/status", async (req, res): Promise<void> => {
  const tech = await requireTech(req, res);
  if (!tech) return;
  /* Management > Tech App can turn status changes off for technicians */
  if (!tech.settings.allowStatusChange) {
    res.status(403).json({ error: "Changing job status from the Tech App is disabled for this business" });
    return;
  }
  const parsed = TechSetStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const job = await loadScopedJob(req, res, tech);
  if (!job) return;

  const status = parsed.data.status;
  if (status === job.status) {
    res.json({ status, notes: job.notes ?? null });
    return;
  }

  /* Status-change log entry in notes — same format the admin app writes */
  const fromLabel = STATUS_LABELS[job.status] ?? job.status;
  const toLabel = STATUS_LABELS[status] ?? status;
  const logEntry = `${buildNoteTimestamp()} Status: ${fromLabel} → ${toLabel}`;
  const notes = job.notes ? `${job.notes}\n${logEntry}` : logEntry;

  await db.update(serviceJobsTable).set({ status, notes }).where(eq(serviceJobsTable.id, job.id));
  logTechEvent(tech.merchantId, tech.staffId, tech.staffName, "status_changed", `Changed service job ${job.jobNumber} status to ${toLabel}`);

  /* Auto-send SMS on key status transitions — mirrors the admin endpoint */
  const SMS_NOTIFY_STATUSES = new Set(["in-progress", "awaiting-customer", "awaiting-pickup", "completed"]);
  if (SMS_NOTIFY_STATUSES.has(status) && job.customerId) {
    const [customer] = await db
      .select({ phone: customersTable.phone, portalToken: customersTable.portalToken })
      .from(customersTable)
      .where(and(eq(customersTable.id, job.customerId), eq(customersTable.merchantId, tech.merchantId)));
    if (customer?.phone && customer.portalToken) {
      const [merchant] = await db
        .select({ businessName: merchantsTable.businessName, username: merchantsTable.username, portalDomain: merchantsTable.portalDomain })
        .from(merchantsTable)
        .where(eq(merchantsTable.id, tech.merchantId));
      const bizName = merchant?.businessName ?? "Your repair shop";
      const portalUrl = customerPortalUrl(merchant, customer.portalToken, req);
      const smsLabel: Record<string, string> = {
        "in-progress":       "In Progress",
        "awaiting-customer": "Ready — awaiting your decision",
        "awaiting-pickup":   "Completed & ready for pickup",
        "completed":         "Completed",
      };
      const label = smsLabel[status] ?? status;
      const smsBody = portalUrl
        ? `${bizName}: Your repair #${job.jobNumber} is now ${label}. Track it here: ${portalUrl}`
        : `${bizName}: Your repair #${job.jobNumber} is now ${label}.`;
      sendSms({ to: customer.phone, body: smsBody }, tech.merchantId).catch(() => {});
    }
  }

  res.json({ status, notes });
});

/* ── Appointments (scoped to the technician's business) ──────────────── */

const APPT_STATUSES = ["scheduled", "completed", "cancelled", "no-show"] as const;

/** Compact appointment shape for the tech app; phone honours showCustomerContact. */
function formatAppt(
  a: typeof appointmentsTable.$inferSelect,
  customer: typeof customersTable.$inferSelect | null,
  staffName: string | null,
  showContact: boolean,
) {
  const endAt = new Date(a.scheduledAt.getTime() + a.durationMinutes * 60_000);
  return {
    id: a.id,
    title: a.title,
    customerId: a.customerId ?? null,
    customerName: customer ? customerDisplayName(customer.firstName, customer.lastName, customer.company) : null,
    customerPhone: showContact ? (customer?.phone ?? null) : null,
    staffId: a.staffId ?? null,
    staffName,
    scheduledAt: a.scheduledAt.toISOString(),
    endAt: endAt.toISOString(),
    durationMinutes: a.durationMinutes,
    status: a.status,
    notes: a.notes ?? null,
  };
}

router.get("/tech/appointments", async (req, res): Promise<void> => {
  const tech = await requireTech(req, res);
  if (!tech) return;

  const appts = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.merchantId, tech.merchantId))
    .orderBy(asc(appointmentsTable.scheduledAt));

  const customers = await db.select().from(customersTable).where(eq(customersTable.merchantId, tech.merchantId));
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const staff = await db.select().from(staffTable).where(eq(staffTable.merchantId, tech.merchantId));
  const staffMap = new Map(staff.map((s) => [s.id, s.name]));

  res.json({
    items: appts.map((a) =>
      formatAppt(
        a,
        a.customerId ? customerMap.get(a.customerId) ?? null : null,
        a.staffId ? staffMap.get(a.staffId) ?? null : null,
        tech.settings.showCustomerContact,
      ),
    ),
  });
});

/* Customer lookup for the appointment form (name/phone/email contains). */
router.get("/tech/customers", async (req, res): Promise<void> => {
  const tech = await requireTech(req, res);
  if (!tech) return;
  const q = String(req.query.q ?? "").trim();
  if (q.length < 1) { res.json({ items: [] }); return; }
  const like = `%${q}%`;
  const rows = await db
    .select()
    .from(customersTable)
    .where(and(
      eq(customersTable.merchantId, tech.merchantId),
      or(
        ilike(customersTable.firstName, like),
        ilike(customersTable.lastName, like),
        ilike(customersTable.company, like),
        ilike(customersTable.phone, like),
        ilike(customersTable.email, like),
      ),
    ))
    .limit(20);
  res.json({
    items: rows.map((c) => ({
      id: c.id,
      name: customerDisplayName(c.firstName, c.lastName, c.company) || "Unnamed customer",
      phone: tech.settings.showCustomerContact ? (c.phone ?? null) : null,
    })),
  });
});

const TechApptCreateBody = z.object({
  scheduledAt: z.string().min(1),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  title: z.string().trim().max(200).optional(),
  customerId: z.number().int().positive().nullable().optional(),
  status: z.enum(APPT_STATUSES).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

router.post("/tech/appointments", async (req, res): Promise<void> => {
  const tech = await requireTech(req, res);
  if (!tech) return;
  const parsed = TechApptCreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid appointment details" }); return; }
  const { scheduledAt, durationMinutes, title, customerId, status, notes } = parsed.data;

  const start = new Date(scheduledAt);
  if (isNaN(start.getTime())) { res.status(400).json({ error: "Invalid date/time" }); return; }

  /* Validate the customer belongs to this business and auto-title from them. */
  let customer: typeof customersTable.$inferSelect | null = null;
  let resolvedTitle = title?.trim() || "Appointment";
  if (customerId) {
    const [found] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, tech.merchantId)));
    if (!found) { res.status(400).json({ error: "Customer not found" }); return; }
    customer = found;
    if (!title?.trim()) {
      const who = customerDisplayName(found.firstName, found.lastName, found.company);
      resolvedTitle = who ? `Appointment — ${who}` : "Appointment";
    }
  }

  const [appt] = await db.insert(appointmentsTable).values({
    merchantId: tech.merchantId,
    customerId: customerId ?? null,
    staffId: tech.staffId, // assign to the signed-in technician
    title: resolvedTitle,
    scheduledAt: start,
    durationMinutes: durationMinutes ?? 30,
    status: status ?? "scheduled",
    notes: notes ?? null,
  }).returning();

  logTechEvent(tech.merchantId, tech.staffId, tech.staffName, "appointment_created", `Created appointment "${resolvedTitle}"`);
  triggerInstantSync(tech.merchantId, "calendar");
  res.status(201).json(formatAppt(appt, customer, tech.staffName, tech.settings.showCustomerContact));
});

const TechApptUpdateBody = z.object({
  scheduledAt: z.string().optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  title: z.string().trim().max(200).optional(),
  customerId: z.number().int().positive().nullable().optional(),
  status: z.enum(APPT_STATUSES).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

router.patch("/tech/appointments/:id", async (req, res): Promise<void> => {
  const tech = await requireTech(req, res);
  if (!tech) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid appointment id" }); return; }
  const parsed = TechApptUpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid appointment details" }); return; }
  const { scheduledAt, durationMinutes, title, customerId, status, notes } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (scheduledAt !== undefined) {
    const start = new Date(scheduledAt);
    if (isNaN(start.getTime())) { res.status(400).json({ error: "Invalid date/time" }); return; }
    updates.scheduledAt = start;
  }
  if (durationMinutes !== undefined) updates.durationMinutes = durationMinutes;
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (title !== undefined) updates.title = title.trim() || "Appointment";

  /* Validate the customer (when changing it) so we never link a foreign one. */
  let customer: typeof customersTable.$inferSelect | null = null;
  if (customerId !== undefined) {
    if (customerId === null) {
      updates.customerId = null;
    } else {
      const [found] = await db.select().from(customersTable)
        .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, tech.merchantId)));
      if (!found) { res.status(400).json({ error: "Customer not found" }); return; }
      customer = found;
      updates.customerId = customerId;
    }
  }

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  const [appt] = await db.update(appointmentsTable).set(updates)
    .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.merchantId, tech.merchantId)))
    .returning();
  if (!appt) { res.status(404).json({ error: "Appointment not found" }); return; }

  /* Resolve names for the response shape. */
  if (!customer && appt.customerId) {
    const [c] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, appt.customerId), eq(customersTable.merchantId, tech.merchantId)));
    customer = c ?? null;
  }
  let staffName: string | null = null;
  if (appt.staffId) {
    if (appt.staffId === tech.staffId) staffName = tech.staffName;
    else {
      const [s] = await db.select({ name: staffTable.name }).from(staffTable).where(eq(staffTable.id, appt.staffId));
      staffName = s?.name ?? null;
    }
  }

  logTechEvent(tech.merchantId, tech.staffId, tech.staffName, "appointment_updated", `Updated appointment "${appt.title}"`);
  triggerInstantSync(tech.merchantId, "calendar");
  res.json(formatAppt(appt, customer, staffName, tech.settings.showCustomerContact));
});

export default router;
