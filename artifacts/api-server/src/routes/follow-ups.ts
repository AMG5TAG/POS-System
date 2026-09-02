import { Router, type IRouter } from "express";
import {
  db,
  followUpTemplatesTable,
  followUpLogTable,
  followUpSettingsTable,
  serviceJobsTable,
  appointmentsTable,
  customersTable,
  staffTable,
  merchantsTable,
  businessProfileTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { createHmac } from "crypto";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { sendEmail } from "../services/email";
import { sendSms } from "../services/sms";
import { escapeHtml } from "../lib/html-escape";

const router: IRouter = Router();

/* ── Shortcodes ────────────────────────────────────────────────────────────
 * The `{{code}}` placeholders a follow-up template may use. Exposed over the
 * API so the template editor's palette can never drift from what the renderer
 * actually substitutes.
 */

export const FOLLOW_UP_SHORTCODES: { code: string; label: string; example: string }[] = [
  { code: "first_name",     label: "Customer first name",       example: "Sarah" },
  { code: "last_name",      label: "Customer last name",        example: "Johnson" },
  { code: "customer_name",  label: "Customer full name",        example: "Sarah Johnson" },
  { code: "business_name",  label: "Your business name",        example: "KoaPOS Demo" },
  { code: "business_phone", label: "Your business phone",       example: "02 5555 1234" },
  { code: "business_email", label: "Your business email",       example: "hello@example.com" },
  { code: "reference",      label: "Job number / booking ref",  example: "SJ-1042" },
  { code: "job_number",     label: "Service job number",        example: "SJ-1042" },
  { code: "service_title",  label: "Service / appointment name", example: "Screen replacement" },
  { code: "device",         label: "Device or item serviced",   example: "iPhone 13" },
  { code: "staff_name",     label: "Staff member who completed it", example: "Alex Taylor" },
  { code: "completed_date", label: "Date it was completed",     example: "12/07/2026" },
  { code: "days_since",     label: "Days since completion",     example: "30" },
  { code: "review_link",    label: "Your review link (Settings)", example: "https://g.page/r/…" },
];

type Vars = Record<string, string>;

/** Substitute `{{shortcode}}` placeholders; unknown codes are left untouched. */
export function applyShortcodes(text: string, vars: Vars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => vars[key] ?? whole);
}

/** Plain-text rendering of an HTML body, for SMS and the email text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    // Paragraph-level blocks read better with a blank line between them.
    .replace(/<\/(p|div|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Spam Act 2003 compliance helpers (mirrors email-campaigns) ───────────── */

function makeUnsubToken(merchantId: number, customerId: number): string {
  const secret = process.env.UNSUBSCRIBE_SECRET ?? process.env.SESSION_SECRET ?? "koapos-unsub-secret";
  const payload = `${merchantId}:${customerId}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function footerHtml(bizName: string, bizAddress: string, unsub: string): string {
  return `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;line-height:1.6;">
  <p>${escapeHtml(bizName)}${bizAddress ? ` · ${escapeHtml(bizAddress)}` : ""}</p>
  <p>You are receiving this email because you are a customer of ${escapeHtml(bizName)}.</p>
  <p><a href="${unsub}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> from marketing emails.</p>
</div>`;
}

/* ── Settings ──────────────────────────────────────────────────────────────── */

const WINDOW_UNITS = ["days", "weeks", "months"] as const;
type WindowUnit = (typeof WINDOW_UNITS)[number];

type SettingsRow = typeof followUpSettingsTable.$inferSelect;

function formatSettings(s: SettingsRow) {
  return {
    id: s.id,
    merchantId: s.merchantId,
    windowValue: s.windowValue,
    windowUnit: s.windowUnit,
    includeServices: s.includeServices === "true",
    includeAppointments: s.includeAppointments === "true",
    hideAlreadySent: s.hideAlreadySent === "true",
    requireOptIn: s.requireOptIn === "true",
    defaultChannel: s.defaultChannel,
    defaultTemplateId: s.defaultTemplateId ?? null,
    reviewUrl: s.reviewUrl,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Read the merchant's settings row, creating it with defaults on first use. */
async function getOrCreateSettings(merchantId: number): Promise<SettingsRow> {
  const [existing] = await db
    .select()
    .from(followUpSettingsTable)
    .where(eq(followUpSettingsTable.merchantId, merchantId))
    .limit(1);
  if (existing) return existing;
  // A concurrent first request may win the insert — the unique index turns that
  // into a no-op and we re-read the winner's row.
  const [created] = await db
    .insert(followUpSettingsTable)
    .values({ merchantId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [row] = await db
    .select()
    .from(followUpSettingsTable)
    .where(eq(followUpSettingsTable.merchantId, merchantId))
    .limit(1);
  return row!;
}

/** Subtract the configured window from now to get the "completed before" cutoff. */
export function windowCutoff(value: number, unit: WindowUnit, from: Date = new Date()): Date {
  const cutoff = new Date(from);
  if (unit === "months") cutoff.setMonth(cutoff.getMonth() - value);
  else if (unit === "weeks") cutoff.setDate(cutoff.getDate() - value * 7);
  else cutoff.setDate(cutoff.getDate() - value);
  return cutoff;
}

/* ── Business identity + template variables ────────────────────────────────── */

interface BizInfo { name: string; address: string; phone: string; email: string }

async function getBizInfo(merchantId: number): Promise<BizInfo> {
  const [[m], [bp]] = await Promise.all([
    db.select({
      name: merchantsTable.businessName,
      address: merchantsTable.address,
      city: merchantsTable.city,
      phone: merchantsTable.phone,
      email: merchantsTable.email,
    }).from(merchantsTable).where(eq(merchantsTable.id, merchantId)),
    db.select({ state: businessProfileTable.state, postcode: businessProfileTable.postcode })
      .from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId)),
  ]);
  return {
    name: m?.name ?? "Your Business",
    address: [m?.address, m?.city, bp?.state, bp?.postcode].filter(Boolean).join(", "),
    phone: m?.phone ?? "",
    email: m?.email ?? "",
  };
}

/* ── Due list ──────────────────────────────────────────────────────────────── */

interface DueItem {
  id: string;
  sourceType: "service_job" | "appointment";
  sourceId: number;
  reference: string;
  title: string;
  device: string;
  staffName: string;
  completedAt: string;
  daysSince: number;
  customerId: number | null;
  customerName: string;
  email: string;
  phone: string;
  agreedToMarketing: boolean;
  lastFollowUpAt: string | null;
  followUpCount: number;
  markedDoneAt: string | null;
}

/**
 * `follow_up_log.status` for a record the merchant cleared by hand instead of
 * sending anything — chased by phone, in person, or simply no longer worth
 * chasing. Kept distinct from "sent" so the history stays honest about what was
 * actually dispatched, and so undoing it can never touch real send records.
 */
const DONE_STATUS = "done";
/** `follow_up_log.channel` for those rows: no message left the building. */
const DONE_CHANNEL = "manual";

const DAY_MS = 24 * 3600 * 1000;

function daysBetween(then: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / DAY_MS));
}

/**
 * Completed service jobs and appointments whose completion is at least the
 * configured window old. Service jobs anchor on `completed_at` where it was
 * recorded and fall back to `updated_at` for jobs completed before that column
 * was populated; appointments anchor on the booked time.
 */
async function loadDueItems(
  merchantId: number,
  opts: { cutoff: Date; includeServices: boolean; includeAppointments: boolean; hideAlreadySent: boolean },
): Promise<DueItem[]> {
  const now = new Date();
  const staff = await db
    .select({ id: staffTable.id, name: staffTable.name })
    .from(staffTable)
    .where(eq(staffTable.merchantId, merchantId));
  const staffById = new Map(staff.map((s) => [s.id, s.name]));

  const items: DueItem[] = [];

  if (opts.includeServices) {
    const jobCompletedAt = sql<Date>`coalesce(${serviceJobsTable.completedAt}, ${serviceJobsTable.updatedAt})`;
    const rows = await db
      .select({
        job: serviceJobsTable,
        customerId: customersTable.id,
        firstName: customersTable.firstName,
        lastName: customersTable.lastName,
        email: customersTable.email,
        phone: customersTable.phone,
        agreedToMarketing: customersTable.agreedToMarketing,
      })
      .from(serviceJobsTable)
      .leftJoin(customersTable, eq(serviceJobsTable.customerId, customersTable.id))
      .where(and(
        eq(serviceJobsTable.merchantId, merchantId),
        eq(serviceJobsTable.status, "completed"),
        sql`${jobCompletedAt} <= ${opts.cutoff}`,
      ));

    for (const r of rows) {
      const completed = r.job.completedAt ?? r.job.updatedAt;
      items.push({
        id: `service_job-${r.job.id}`,
        sourceType: "service_job",
        sourceId: r.job.id,
        reference: r.job.jobNumber,
        title: r.job.title,
        device: r.job.deviceDescription || r.job.deviceType || "",
        staffName: (r.job.staffId != null ? staffById.get(r.job.staffId) : undefined) ?? "",
        completedAt: new Date(completed).toISOString(),
        daysSince: daysBetween(new Date(completed), now),
        customerId: r.customerId ?? null,
        customerName: [r.firstName, r.lastName].filter(Boolean).join(" "),
        email: r.email ?? "",
        phone: r.phone ?? "",
        agreedToMarketing: r.agreedToMarketing === "true",
        lastFollowUpAt: null,
        followUpCount: 0,
        markedDoneAt: null,
      });
    }
  }

  if (opts.includeAppointments) {
    const rows = await db
      .select({
        appt: appointmentsTable,
        customerId: customersTable.id,
        firstName: customersTable.firstName,
        lastName: customersTable.lastName,
        email: customersTable.email,
        phone: customersTable.phone,
        agreedToMarketing: customersTable.agreedToMarketing,
      })
      .from(appointmentsTable)
      .leftJoin(customersTable, eq(appointmentsTable.customerId, customersTable.id))
      .where(and(
        eq(appointmentsTable.merchantId, merchantId),
        eq(appointmentsTable.status, "completed"),
        sql`${appointmentsTable.scheduledAt} <= ${opts.cutoff}`,
      ));

    for (const r of rows) {
      items.push({
        id: `appointment-${r.appt.id}`,
        sourceType: "appointment",
        sourceId: r.appt.id,
        reference: `APT-${r.appt.id}`,
        title: r.appt.title,
        device: "",
        staffName: (r.appt.staffId != null ? staffById.get(r.appt.staffId) : undefined) ?? "",
        completedAt: new Date(r.appt.scheduledAt).toISOString(),
        daysSince: daysBetween(new Date(r.appt.scheduledAt), now),
        customerId: r.customerId ?? null,
        customerName: [r.firstName, r.lastName].filter(Boolean).join(" "),
        email: r.email ?? "",
        phone: r.phone ?? "",
        agreedToMarketing: r.agreedToMarketing === "true",
        lastFollowUpAt: null,
        followUpCount: 0,
        markedDoneAt: null,
      });
    }
  }

  // Annotate with prior follow-up activity so the UI can show (and optionally
  // hide) records that have already been chased — whether a message actually
  // went out ("sent") or the merchant chased them another way and marked the
  // record done ("done").
  const history = await db
    .select({
      sourceType: followUpLogTable.sourceType,
      sourceId: followUpLogTable.sourceId,
      status: followUpLogTable.status,
      count: sql<number>`count(*)::int`,
      lastSentAt: sql<Date>`max(${followUpLogTable.sentAt})`,
    })
    .from(followUpLogTable)
    .where(and(
      eq(followUpLogTable.merchantId, merchantId),
      inArray(followUpLogTable.status, ["sent", DONE_STATUS]),
    ))
    .groupBy(followUpLogTable.sourceType, followUpLogTable.sourceId, followUpLogTable.status);

  const sentByKey = new Map<string, { count: number; lastSentAt: Date }>();
  const doneAtByKey = new Map<string, Date>();
  for (const h of history) {
    const key = `${h.sourceType}-${h.sourceId}`;
    if (h.status === DONE_STATUS) doneAtByKey.set(key, new Date(h.lastSentAt));
    else sentByKey.set(key, { count: Number(h.count), lastSentAt: new Date(h.lastSentAt) });
  }

  for (const item of items) {
    const sent = sentByKey.get(item.id);
    if (sent) {
      item.followUpCount = sent.count;
      item.lastFollowUpAt = sent.lastSentAt.toISOString();
    }
    const doneAt = doneAtByKey.get(item.id);
    if (doneAt) item.markedDoneAt = doneAt.toISOString();
  }

  const visible = opts.hideAlreadySent
    ? items.filter((i) => i.followUpCount === 0 && i.markedDoneAt === null)
    : items;
  // Longest-overdue first — that's the order a merchant works the list in.
  return visible.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

const DueQuery = z.object({
  windowValue: z.coerce.number().int().min(0).max(3650).optional(),
  windowUnit: z.enum(WINDOW_UNITS).optional(),
  includeServices: z.enum(["true", "false"]).optional(),
  includeAppointments: z.enum(["true", "false"]).optional(),
  hideAlreadySent: z.enum(["true", "false"]).optional(),
});

// GET /follow-ups — the due list. Query params override the saved settings.
router.get("/follow-ups", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = DueQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const settings = await getOrCreateSettings(merchantId);
  const q = parsed.data;
  const windowValue = q.windowValue ?? settings.windowValue;
  const windowUnit = (q.windowUnit ?? settings.windowUnit) as WindowUnit;
  const cutoff = windowCutoff(windowValue, windowUnit);

  const items = await loadDueItems(merchantId, {
    cutoff,
    includeServices: (q.includeServices ?? settings.includeServices) === "true",
    includeAppointments: (q.includeAppointments ?? settings.includeAppointments) === "true",
    hideAlreadySent: (q.hideAlreadySent ?? settings.hideAlreadySent) === "true",
  });

  res.json({
    items,
    total: items.length,
    windowValue,
    windowUnit,
    cutoff: cutoff.toISOString(),
  });
});

/**
 * GET /follow-ups/summary — headline counts for the dashboard banner.
 *
 * Always excludes records that have already been followed up, regardless of the
 * merchant's `hideAlreadySent` display preference: "overdue" means still needs
 * action, and the banner would otherwise nag about work that is done.
 */
router.get("/follow-ups/summary", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const settings = await getOrCreateSettings(merchantId);
  const windowUnit = settings.windowUnit as WindowUnit;
  const cutoff = windowCutoff(settings.windowValue, windowUnit);

  const items = await loadDueItems(merchantId, {
    cutoff,
    includeServices: settings.includeServices === "true",
    includeAppointments: settings.includeAppointments === "true",
    hideAlreadySent: true,
  });

  // Only count customers we can actually reach on the merchant's default
  // channel — a banner urging action on unreachable records is just noise.
  const channel = settings.defaultChannel;
  const contactable = items.filter((i) =>
    ((channel === "email" || channel === "both") && i.email) ||
    ((channel === "sms" || channel === "both") && i.phone));

  res.json({
    dueCount: items.length,
    contactableCount: contactable.length,
    servicesDue: items.filter((i) => i.sourceType === "service_job").length,
    appointmentsDue: items.filter((i) => i.sourceType === "appointment").length,
    // Items are sorted oldest-first, so the head is the longest overdue.
    oldestDaysSince: items[0]?.daysSince ?? 0,
    windowValue: settings.windowValue,
    windowUnit,
  });
});

// GET /follow-ups/shortcodes
router.get("/follow-ups/shortcodes", requireAuth, async (_req, res): Promise<void> => {
  res.json({ items: FOLLOW_UP_SHORTCODES, total: FOLLOW_UP_SHORTCODES.length });
});

// GET /follow-ups/log
router.get("/follow-ups/log", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await db
    .select()
    .from(followUpLogTable)
    .where(eq(followUpLogTable.merchantId, merchantId))
    .orderBy(desc(followUpLogTable.sentAt))
    .limit(limit);
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      customerId: r.customerId ?? null,
      templateId: r.templateId ?? null,
      channel: r.channel,
      status: r.status,
      recipient: r.recipient,
      subject: r.subject,
      body: r.body,
      error: r.error ?? null,
      sentAt: r.sentAt.toISOString(),
    })),
    total: rows.length,
  });
});

/* ── Sending ───────────────────────────────────────────────────────────────── */

const SendBody = z.object({
  targets: z.array(z.object({
    sourceType: z.enum(["service_job", "appointment"]),
    sourceId: z.number().int().positive(),
  })).min(1).max(500),
  channel: z.enum(["email", "sms", "both"]),
  templateId: z.number().int().positive().nullish(),
  subject: z.string().optional(),
  body: z.string().optional(),
  smsBody: z.string().optional(),
});

/** Build the shortcode variables for one due item. */
function varsFor(item: DueItem, biz: BizInfo, reviewUrl: string): Vars {
  const completed = new Date(item.completedAt);
  return {
    first_name: item.customerName.split(" ")[0] || "there",
    last_name: item.customerName.split(" ").slice(1).join(" "),
    customer_name: item.customerName || "there",
    business_name: biz.name,
    business_phone: biz.phone,
    business_email: biz.email,
    reference: item.reference,
    job_number: item.sourceType === "service_job" ? item.reference : "",
    service_title: item.title,
    device: item.device,
    staff_name: item.staffName,
    completed_date: completed.toLocaleDateString("en-AU"),
    days_since: String(item.daysSince),
    review_link: reviewUrl,
  };
}

/**
 * Resolve the message content for a send: an explicit subject/body in the
 * request wins, otherwise the referenced template, otherwise a sensible default.
 */
async function resolveContent(
  merchantId: number,
  input: z.infer<typeof SendBody>,
): Promise<{ subject: string; body: string; smsBody: string; templateId: number | null } | { error: string }> {
  let tpl: typeof followUpTemplatesTable.$inferSelect | undefined;
  if (input.templateId != null) {
    [tpl] = await db
      .select()
      .from(followUpTemplatesTable)
      .where(and(eq(followUpTemplatesTable.id, input.templateId), eq(followUpTemplatesTable.merchantId, merchantId)))
      .limit(1);
    if (!tpl) return { error: "Template not found" };
  }

  const subject = input.subject ?? tpl?.subject ?? "";
  const body = input.body ?? tpl?.body ?? "";
  const smsBody = input.smsBody ?? tpl?.smsBody ?? "";

  const wantEmail = input.channel === "email" || input.channel === "both";
  const wantSms = input.channel === "sms" || input.channel === "both";
  if (wantEmail && !body.trim()) return { error: "An email body is required" };
  if (wantEmail && !subject.trim()) return { error: "An email subject is required" };
  if (wantSms && !smsBody.trim() && !body.trim()) return { error: "An SMS body is required" };

  return { subject, body, smsBody, templateId: tpl?.id ?? null };
}

// POST /follow-ups/preview — render a template against one record.
router.post("/follow-ups/preview", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = SendBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const target = parsed.data.targets[0]!;

  const settings = await getOrCreateSettings(merchantId);
  const [biz, item] = await Promise.all([
    getBizInfo(merchantId),
    findDueItem(merchantId, target.sourceType, target.sourceId),
  ]);
  if (!item) { res.status(404).json({ error: "Record not found" }); return; }

  const content = await resolveContent(merchantId, parsed.data);
  if ("error" in content) { res.status(400).json({ error: content.error }); return; }

  const vars = varsFor(item, biz, settings.reviewUrl);
  const html = applyShortcodes(content.body, vars);
  res.json({
    subject: applyShortcodes(content.subject, vars),
    html,
    text: htmlToText(html),
    sms: applyShortcodes(content.smsBody || htmlToText(content.body), vars),
    recipientEmail: item.email,
    recipientPhone: item.phone,
  });
});

/** Look up a single completed record regardless of the merchant's date window. */
async function findDueItem(
  merchantId: number,
  sourceType: "service_job" | "appointment",
  sourceId: number,
): Promise<DueItem | null> {
  // Reuse the list loader with an open-ended window so a record stays sendable
  // even after the merchant narrows the filter in the UI.
  const items = await loadDueItems(merchantId, {
    cutoff: new Date(Date.now() + 365 * DAY_MS),
    includeServices: sourceType === "service_job",
    includeAppointments: sourceType === "appointment",
    hideAlreadySent: false,
  });
  return items.find((i) => i.sourceType === sourceType && i.sourceId === sourceId) ?? null;
}

// POST /follow-ups/send — send one or many follow-ups.
router.post("/follow-ups/send", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = SendBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const input = parsed.data;

  const content = await resolveContent(merchantId, input);
  if ("error" in content) { res.status(400).json({ error: content.error }); return; }

  const settings = await getOrCreateSettings(merchantId);
  const biz = await getBizInfo(merchantId);
  const requireOptIn = settings.requireOptIn === "true";
  const baseUrl = process.env.APP_BASE_URL ?? "https://app.koastal.com.au";

  // Load every requested record once, then dispatch from that snapshot.
  const wantServiceIds = input.targets.filter((t) => t.sourceType === "service_job").map((t) => t.sourceId);
  const wantApptIds = input.targets.filter((t) => t.sourceType === "appointment").map((t) => t.sourceId);
  const all = await loadDueItems(merchantId, {
    cutoff: new Date(Date.now() + 365 * DAY_MS),
    includeServices: wantServiceIds.length > 0,
    includeAppointments: wantApptIds.length > 0,
    hideAlreadySent: false,
  });
  const byKey = new Map(all.map((i) => [i.id, i]));

  const wantEmail = input.channel === "email" || input.channel === "both";
  const wantSms = input.channel === "sms" || input.channel === "both";

  const results: { sourceType: string; sourceId: number; channel: string; status: string; error?: string }[] = [];
  let sent = 0, failed = 0, skipped = 0;

  for (const target of input.targets) {
    const item = byKey.get(`${target.sourceType}-${target.sourceId}`);
    if (!item) {
      skipped++;
      results.push({ ...target, channel: input.channel, status: "skipped", error: "Record not found" });
      continue;
    }
    // Spam Act 2003 s 16 — a follow-up is a marketing message unless the merchant
    // has explicitly opted out of the consent check for these sends.
    if (requireOptIn && !item.agreedToMarketing) {
      skipped++;
      results.push({ ...target, channel: input.channel, status: "skipped", error: "Customer has not opted in to marketing" });
      await logSend({ merchantId, item, templateId: content.templateId, channel: input.channel, status: "skipped", recipient: "", subject: "", body: "", error: "Not opted in" });
      continue;
    }

    const vars = varsFor(item, biz, settings.reviewUrl);
    const unsub = item.customerId != null
      ? `${baseUrl}/api/unsubscribe?t=${makeUnsubToken(merchantId, item.customerId)}`
      : "#";

    if (wantEmail) {
      if (!item.email) {
        skipped++;
        results.push({ ...target, channel: "email", status: "skipped", error: "No email address on file" });
        await logSend({ merchantId, item, templateId: content.templateId, channel: "email", status: "skipped", recipient: "", subject: "", body: "", error: "No email address on file" });
      } else {
        const subject = applyShortcodes(content.subject, vars);
        const rendered = applyShortcodes(content.body, vars);
        const html = rendered + footerHtml(biz.name, biz.address, unsub);
        const text = htmlToText(rendered) + `\n\nTo unsubscribe: ${unsub}`;
        const result = await sendEmail(merchantId, { to: item.email, subject, html, text });
        if (result.success) sent++; else failed++;
        results.push({ ...target, channel: "email", status: result.success ? "sent" : "failed", error: result.error });
        await logSend({ merchantId, item, templateId: content.templateId, channel: "email", status: result.success ? "sent" : "failed", recipient: item.email, subject, body: rendered, error: result.error });
      }
    }

    if (wantSms) {
      if (!item.phone) {
        skipped++;
        results.push({ ...target, channel: "sms", status: "skipped", error: "No phone number on file" });
        await logSend({ merchantId, item, templateId: content.templateId, channel: "sms", status: "skipped", recipient: "", subject: "", body: "", error: "No phone number on file" });
      } else {
        const rendered = applyShortcodes(content.smsBody || htmlToText(content.body), vars);
        // ACMA / Spam Act 2003: marketing SMS must carry an opt-out instruction.
        const body = `${rendered}\nReply STOP to unsubscribe.`;
        const result = await sendSms({ to: item.phone, body }, merchantId);
        if (result.success) sent++; else failed++;
        results.push({ ...target, channel: "sms", status: result.success ? "sent" : "failed", error: result.error });
        await logSend({ merchantId, item, templateId: content.templateId, channel: "sms", status: result.success ? "sent" : "failed", recipient: item.phone, subject: "", body: rendered, error: result.error });
      }
    }
  }

  res.json({ success: failed === 0, sent, failed, skipped, results });
});

async function logSend(opts: {
  merchantId: number;
  item: DueItem;
  templateId: number | null;
  channel: string;
  status: string;
  recipient: string;
  subject: string;
  body: string;
  error?: string;
}): Promise<void> {
  await db.insert(followUpLogTable).values({
    merchantId: opts.merchantId,
    sourceType: opts.item.sourceType,
    sourceId: opts.item.sourceId,
    customerId: opts.item.customerId,
    templateId: opts.templateId,
    channel: opts.channel,
    status: opts.status,
    recipient: opts.recipient,
    subject: opts.subject,
    body: opts.body,
    error: opts.error ?? null,
  });
}

/* ── Mark as done ──────────────────────────────────────────────────────────── */

const MarkDoneBody = z.object({
  targets: z.array(z.object({
    sourceType: z.enum(["service_job", "appointment"]),
    sourceId: z.number().int().positive(),
  })).min(1).max(500),
});

type Target = z.infer<typeof MarkDoneBody>["targets"][number];

/**
 * Narrow the requested targets to records this merchant actually owns, and
 * attach each one's customer. `follow_up_log` has no foreign key to the source
 * row, so an unchecked id would happily write a marker for a record belonging
 * to someone else. Duplicate targets collapse to one.
 */
async function ownedTargets(
  merchantId: number,
  targets: Target[],
): Promise<Array<Target & { customerId: number | null }>> {
  const jobIds = targets.filter((t) => t.sourceType === "service_job").map((t) => t.sourceId);
  const apptIds = targets.filter((t) => t.sourceType === "appointment").map((t) => t.sourceId);

  const [jobs, appts] = await Promise.all([
    jobIds.length
      ? db.select({ id: serviceJobsTable.id, customerId: serviceJobsTable.customerId })
          .from(serviceJobsTable)
          .where(and(eq(serviceJobsTable.merchantId, merchantId), inArray(serviceJobsTable.id, jobIds)))
      : Promise.resolve([] as { id: number; customerId: number | null }[]),
    apptIds.length
      ? db.select({ id: appointmentsTable.id, customerId: appointmentsTable.customerId })
          .from(appointmentsTable)
          .where(and(eq(appointmentsTable.merchantId, merchantId), inArray(appointmentsTable.id, apptIds)))
      : Promise.resolve([] as { id: number; customerId: number | null }[]),
  ]);

  const customerByKey = new Map<string, number | null>();
  for (const j of jobs) customerByKey.set(`service_job-${j.id}`, j.customerId ?? null);
  for (const a of appts) customerByKey.set(`appointment-${a.id}`, a.customerId ?? null);

  const seen = new Set<string>();
  const owned: Array<Target & { customerId: number | null }> = [];
  for (const t of targets) {
    const key = `${t.sourceType}-${t.sourceId}`;
    if (seen.has(key) || !customerByKey.has(key)) continue;
    seen.add(key);
    owned.push({ ...t, customerId: customerByKey.get(key) ?? null });
  }
  return owned;
}

/**
 * POST /follow-ups/mark-done — clear records off the due list without sending.
 *
 * Writes one `follow_up_log` row per record with status "done". Re-marking an
 * already-done record is a no-op rather than a second row, so the marker stays
 * a single reversible fact.
 */
router.post("/follow-ups/mark-done", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = MarkDoneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const owned = await ownedTargets(merchantId, parsed.data.targets);

  const alreadyDone = owned.length
    ? await db
        .select({ sourceType: followUpLogTable.sourceType, sourceId: followUpLogTable.sourceId })
        .from(followUpLogTable)
        .where(and(
          eq(followUpLogTable.merchantId, merchantId),
          eq(followUpLogTable.status, DONE_STATUS),
          inArray(followUpLogTable.sourceId, owned.map((t) => t.sourceId)),
        ))
    : [];
  const doneKeys = new Set(alreadyDone.map((r) => `${r.sourceType}-${r.sourceId}`));

  const rows = owned
    .filter((t) => !doneKeys.has(`${t.sourceType}-${t.sourceId}`))
    .map((t) => ({
      merchantId,
      sourceType: t.sourceType,
      sourceId: t.sourceId,
      customerId: t.customerId,
      templateId: null,
      channel: DONE_CHANNEL,
      status: DONE_STATUS,
      recipient: "",
      subject: "Marked as followed up",
      body: "Marked done by staff — no message was sent.",
    }));

  if (rows.length) await db.insert(followUpLogTable).values(rows);

  res.json({ changed: rows.length, skipped: parsed.data.targets.length - rows.length });
});

/**
 * POST /follow-ups/unmark-done — put records back on the due list.
 *
 * Only ever deletes rows whose status is "done", i.e. markers this feature
 * created. Real send history ("sent" / "failed") is never touched.
 */
router.post("/follow-ups/unmark-done", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = MarkDoneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const owned = await ownedTargets(merchantId, parsed.data.targets);

  let changed = 0;
  for (const sourceType of ["service_job", "appointment"] as const) {
    const ids = owned.filter((t) => t.sourceType === sourceType).map((t) => t.sourceId);
    if (!ids.length) continue;
    const removed = await db
      .delete(followUpLogTable)
      .where(and(
        eq(followUpLogTable.merchantId, merchantId),
        eq(followUpLogTable.status, DONE_STATUS),
        eq(followUpLogTable.sourceType, sourceType),
        inArray(followUpLogTable.sourceId, ids),
      ))
      .returning({ id: followUpLogTable.id });
    changed += removed.length;
  }

  res.json({ changed, skipped: parsed.data.targets.length - changed });
});

/* ── Settings endpoints ────────────────────────────────────────────────────── */

router.get("/follow-up-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const row = await getOrCreateSettings(merchantId);
  res.json(formatSettings(row));
});

const SettingsInput = z.object({
  windowValue: z.number().int().min(0).max(3650),
  windowUnit: z.enum(WINDOW_UNITS),
  includeServices: z.boolean(),
  includeAppointments: z.boolean(),
  hideAlreadySent: z.boolean(),
  requireOptIn: z.boolean(),
  defaultChannel: z.enum(["email", "sms", "both"]),
  defaultTemplateId: z.number().int().positive().nullable(),
  reviewUrl: z.string(),
}).partial();

router.put("/follow-up-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = SettingsInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const p = parsed.data;
  await getOrCreateSettings(merchantId);

  const [row] = await db
    .update(followUpSettingsTable)
    .set({
      ...(p.windowValue !== undefined ? { windowValue: p.windowValue } : {}),
      ...(p.windowUnit !== undefined ? { windowUnit: p.windowUnit } : {}),
      ...(p.includeServices !== undefined ? { includeServices: p.includeServices ? "true" : "false" } : {}),
      ...(p.includeAppointments !== undefined ? { includeAppointments: p.includeAppointments ? "true" : "false" } : {}),
      ...(p.hideAlreadySent !== undefined ? { hideAlreadySent: p.hideAlreadySent ? "true" : "false" } : {}),
      ...(p.requireOptIn !== undefined ? { requireOptIn: p.requireOptIn ? "true" : "false" } : {}),
      ...(p.defaultChannel !== undefined ? { defaultChannel: p.defaultChannel } : {}),
      ...(p.defaultTemplateId !== undefined ? { defaultTemplateId: p.defaultTemplateId } : {}),
      ...(p.reviewUrl !== undefined ? { reviewUrl: p.reviewUrl } : {}),
    })
    .where(eq(followUpSettingsTable.merchantId, merchantId))
    .returning();
  res.json(formatSettings(row!));
});

/* ── Template endpoints ────────────────────────────────────────────────────── */

type TemplateRow = typeof followUpTemplatesTable.$inferSelect;

function formatTemplate(t: TemplateRow) {
  return {
    id: t.id,
    merchantId: t.merchantId,
    name: t.name,
    channel: t.channel,
    subject: t.subject,
    body: t.body,
    smsBody: t.smsBody,
    isDefault: t.isDefault === "true",
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/follow-up-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select()
    .from(followUpTemplatesTable)
    .where(eq(followUpTemplatesTable.merchantId, merchantId))
    .orderBy(desc(followUpTemplatesTable.updatedAt));
  res.json({ items: rows.map(formatTemplate), total: rows.length });
});

const TemplateInput = z.object({
  name: z.string().min(1),
  channel: z.enum(["email", "sms", "both"]).default("email"),
  subject: z.string().default(""),
  body: z.string().default(""),
  smsBody: z.string().default(""),
  isDefault: z.boolean().default(false),
});

/** Only one template may be the default — clear the flag on the others. */
async function clearOtherDefaults(merchantId: number, keepId: number): Promise<void> {
  await db
    .update(followUpTemplatesTable)
    .set({ isDefault: "false" })
    .where(and(
      eq(followUpTemplatesTable.merchantId, merchantId),
      eq(followUpTemplatesTable.isDefault, "true"),
      sql`${followUpTemplatesTable.id} <> ${keepId}`,
    ));
}

router.post("/follow-up-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = TemplateInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const p = parsed.data;
  const [row] = await db
    .insert(followUpTemplatesTable)
    .values({
      merchantId,
      name: p.name,
      channel: p.channel,
      subject: p.subject,
      body: p.body,
      smsBody: p.smsBody,
      isDefault: p.isDefault ? "true" : "false",
    })
    .returning();
  if (p.isDefault) await clearOtherDefaults(merchantId, row!.id);
  res.status(201).json(formatTemplate(row!));
});

router.put("/follow-up-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = TemplateInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const p = parsed.data;
  const [row] = await db
    .update(followUpTemplatesTable)
    .set({
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.channel !== undefined ? { channel: p.channel } : {}),
      ...(p.subject !== undefined ? { subject: p.subject } : {}),
      ...(p.body !== undefined ? { body: p.body } : {}),
      ...(p.smsBody !== undefined ? { smsBody: p.smsBody } : {}),
      ...(p.isDefault !== undefined ? { isDefault: p.isDefault ? "true" : "false" } : {}),
    })
    .where(and(eq(followUpTemplatesTable.id, id), eq(followUpTemplatesTable.merchantId, merchantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (p.isDefault) await clearOtherDefaults(merchantId, id);
  res.json(formatTemplate(row));
});

router.delete("/follow-up-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .delete(followUpTemplatesTable)
    .where(and(eq(followUpTemplatesTable.id, id), eq(followUpTemplatesTable.merchantId, merchantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  // Don't leave the settings pointing at a template that no longer exists.
  await db
    .update(followUpSettingsTable)
    .set({ defaultTemplateId: null })
    .where(and(eq(followUpSettingsTable.merchantId, merchantId), eq(followUpSettingsTable.defaultTemplateId, id)));
  res.status(204).end();
});

export default router;
