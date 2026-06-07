import { Router, type IRouter, type Request, type Response } from "express";
import { db, merchantsTable, staffTable, serviceJobsTable, customersTable, techAppSettingsTable, techAppEventsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { customerDisplayName } from "../lib/customer-name";

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
  const match = staff.find((s) => s.pin && s.pin === parsed.data.pin);
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
  res.json(detail);
});

export default router;
