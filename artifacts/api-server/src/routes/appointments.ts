import { Router, type IRouter } from "express";
import { db, appointmentsTable, customersTable, staffTable, merchantsTable, serviceJobsTable } from "@workspace/db";
import { eq, and, gte, lt, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { customerDisplayName } from "../lib/customer-name";
import { CreateAppointmentBody, UpdateAppointmentBody, DeleteAppointmentParams, UpdateAppointmentParams } from "@workspace/api-zod";
import { sendSms } from "../services/sms";
import { sendEmail } from "../services/email";
import { generateIcs } from "../services/icsGenerator";
import { triggerInstantSync } from "../services/autoSyncScheduler";

const router: IRouter = Router();

type CustomerRow = typeof customersTable.$inferSelect;

async function formatAppointment(
  a: typeof appointmentsTable.$inferSelect,
  customerMap: Map<number, CustomerRow>,
  staffMap: Map<number, { name: string }>,
  jobMap?: Map<number, string>,
) {
  const customer = a.customerId ? customerMap.get(a.customerId) : null;
  const staff = a.staffId ? staffMap.get(a.staffId) : null;
  const endAt = new Date(a.scheduledAt.getTime() + a.durationMinutes * 60 * 1000);

  const billingParts = [
    customer?.billingStreet, customer?.billingCity,
    customer?.billingState, customer?.billingPostcode,
  ].filter(Boolean);
  const customerAddress = billingParts.length
    ? billingParts.join(", ")
    : (customer?.address ?? null);

  return {
    id: a.id,
    merchantId: a.merchantId,
    customerId: a.customerId ?? null,
    staffId: a.staffId ?? null,
    serviceJobId: a.serviceJobId ?? null,
    serviceJobNumber: a.serviceJobId ? (jobMap?.get(a.serviceJobId) ?? null) : null,
    title: a.title,
    description: a.description ?? null,
    scheduledAt: a.scheduledAt.toISOString(),
    endAt: endAt.toISOString(),
    durationMinutes: a.durationMinutes,
    status: a.status,
    notes: a.notes ?? null,
    customerName:    customer ? customerDisplayName(customer.firstName, customer.lastName, customer.company) : null,
    customerPhone:   customer?.phone   ?? null,
    customerEmail:   customer?.email   ?? null,
    customerAddress: customerAddress,
    staffName: staff?.name ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Map service-job id → job number for the given appointments (merchant-scoped). */
async function buildJobMap(merchantId: number, appts: Array<{ serviceJobId: number | null }>): Promise<Map<number, string>> {
  const ids = [...new Set(appts.map((a) => a.serviceJobId).filter((v): v is number => v != null))];
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: serviceJobsTable.id, jobNumber: serviceJobsTable.jobNumber })
    .from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.merchantId, merchantId), inArray(serviceJobsTable.id, ids)));
  return new Map(rows.map((r) => [r.id, r.jobNumber]));
}

router.get("/appointments", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const year = req.query.year ? parseInt(String(req.query.year), 10) : null;
  const month = req.query.month ? parseInt(String(req.query.month), 10) : null;
  if (year !== null && isNaN(year)) { res.status(400).json({ error: "Invalid year" }); return; }
  if (month !== null && isNaN(month)) { res.status(400).json({ error: "Invalid month" }); return; }

  const conditions = [eq(appointmentsTable.merchantId, merchantId)];
  if (year && month) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    conditions.push(gte(appointmentsTable.scheduledAt, start));
    conditions.push(lt(appointmentsTable.scheduledAt, end));
  }

  const appts = await db
    .select()
    .from(appointmentsTable)
    .where(and(...conditions))
    .orderBy(appointmentsTable.scheduledAt);

  const customerIds = [...new Set(appts.filter((a) => a.customerId).map((a) => a.customerId!))];
  const staffIds = [...new Set(appts.filter((a) => a.staffId).map((a) => a.staffId!))];

  const [customers, staffMembers] = await Promise.all([
    customerIds.length > 0
      ? db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId))
      : Promise.resolve([]),
    staffIds.length > 0
      ? db.select().from(staffTable).where(eq(staffTable.merchantId, merchantId))
      : Promise.resolve([]),
  ]);

  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const staffMap = new Map(staffMembers.map((s) => [s.id, s]));
  const jobMap = await buildJobMap(merchantId, appts);

  const result = await Promise.all(appts.map((a) => formatAppointment(a, customerMap, staffMap, jobMap)));
  res.json(result);
});

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function apptRefCode(id: number): string {
  return `KA${String(id).padStart(5, "0")}`;
}

function fmtDateTimeAU(d: Date, tz: string): string {
  return d.toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: tz,
  });
}

async function sendAppointmentNotifications(opts: {
  merchantId: number;
  apptId: number;
  scheduledAt: Date;
  endAt: Date;
  durationMinutes: number;
  title: string;
  notes: string | null;
  customerFirstName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  staffName: string | null;
  sendSmsFlag: boolean;
  sendEmailFlag: boolean;
}) {
  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, opts.merchantId));
  if (!merchant) return;

  const tz = merchant.timezone ?? "Australia/Sydney";
  const businessName = merchant.businessName;
  const ref = apptRefCode(opts.apptId);
  const firstName = opts.customerFirstName ?? "there";
  const dateStr = fmtDateTimeAU(opts.scheduledAt, tz);
  const duration = formatDuration(opts.durationMinutes);

  const locationParts = [merchant.address, merchant.city].filter(Boolean);
  const location = locationParts.length ? locationParts.join(", ") : null;

  if (opts.sendSmsFlag && opts.customerPhone) {
    let smsBody = `Hi ${firstName}, your appointment with ${businessName} is confirmed.\n`;
    smsBody += `Date: ${dateStr}\nDuration: ${duration}\nRef: ${ref}`;
    if (opts.staffName) smsBody += `\nWith: ${opts.staffName}`;
    sendSms({ to: opts.customerPhone, body: smsBody }, opts.merchantId).catch(() => {});
  }

  if (opts.sendEmailFlag && opts.customerEmail) {
    const icsData = generateIcs({
      uid: `appointment-${opts.apptId}@koastellar`,
      summary: `${opts.title} — ${businessName}`,
      description: opts.notes ?? undefined,
      location: location ?? undefined,
      startAt: opts.scheduledAt,
      endAt: opts.endAt,
    });

    const staffLine = opts.staffName ? `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px;">With</td><td style="padding:4px 0;font-size:14px;">${opts.staffName}</td></tr>` : "";
    const notesLine = opts.notes ? `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px;">Notes</td><td style="padding:4px 0;font-size:14px;">${opts.notes}</td></tr>` : "";
    const locationLine = location ? `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px;">Location</td><td style="padding:4px 0;font-size:14px;">${location}</td></tr>` : "";

    const html = `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111;">
  <h2 style="font-size:20px;margin-bottom:4px;">Appointment Confirmed</h2>
  <p style="color:#555;margin-top:0;">Reference: <strong>${ref}</strong></p>
  <p style="font-size:15px;">Hi ${firstName},</p>
  <p style="font-size:15px;">Your appointment with <strong>${businessName}</strong> has been confirmed.</p>
  <table style="border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px;">Date &amp; Time</td><td style="padding:4px 0;font-size:14px;font-weight:600;">${dateStr}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px;">Duration</td><td style="padding:4px 0;font-size:14px;">${duration}</td></tr>
    ${staffLine}
    ${locationLine}
    ${notesLine}
  </table>
  <p style="font-size:14px;color:#555;">A calendar invitation is attached — add it to your calendar for automatic reminders.</p>
  <p style="font-size:14px;color:#555;">If you need to reschedule, please contact us as soon as possible.</p>
  <p style="font-size:13px;color:#888;margin-top:24px;">${businessName}</p>
</div>`.trim();

    const text = `Hi ${firstName},\n\nYour appointment with ${businessName} is confirmed.\n\nDate: ${dateStr}\nDuration: ${duration}${opts.staffName ? `\nWith: ${opts.staffName}` : ""}${location ? `\nLocation: ${location}` : ""}${opts.notes ? `\nNotes: ${opts.notes}` : ""}\n\nRef: ${ref}\n\nA calendar invitation is attached.\n\n${businessName}`;

    sendEmail(opts.merchantId, {
      to: opts.customerEmail,
      subject: `Appointment Confirmed — ${dateStr}`,
      html,
      text,
      attachments: [{ filename: "appointment.ics", content: icsData, contentType: "text/calendar" }],
    }).catch(() => {});
  }
}

router.post("/appointments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const merchantId = req.session.merchantId!;
  const { scheduledAt, endAt, title, customerId, staffId, serviceJobId, status, notes, sendSms: sendSmsFlag, sendEmail: sendEmailFlag } = parsed.data;

  const start = new Date(scheduledAt);
  const end = new Date(endAt);
  const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));

  // Auto-generate a title if not provided
  let resolvedTitle = title ?? "Appointment";
  let customer: typeof customersTable.$inferSelect | null = null;
  if (customerId) {
    const [found] = await db.select().from(customersTable).where(
      and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId))
    );
    if (found) {
      customer = found;
      if (!title) {
        const who = customerDisplayName(found.firstName, found.lastName, found.company);
        resolvedTitle = who ? `Appointment — ${who}` : "Appointment";
      }
    }
  }

  const [appt] = await db
    .insert(appointmentsTable)
    .values({
      merchantId,
      customerId: customerId ?? null,
      staffId: staffId ?? null,
      serviceJobId: serviceJobId ?? null,
      title: resolvedTitle,
      scheduledAt: start,
      durationMinutes,
      status: status ?? "scheduled",
      notes: notes ?? null,
    })
    .returning();

  const [customers, staffMembers] = await Promise.all([
    db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId)),
    db.select().from(staffTable).where(eq(staffTable.merchantId, merchantId)),
  ]);
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const staffMap = new Map(staffMembers.map((s) => [s.id, s]));

  const formatted = await formatAppointment(appt, customerMap, staffMap, await buildJobMap(merchantId, [appt]));
  triggerInstantSync(merchantId, "calendar");
  res.status(201).json(formatted);

  if ((sendSmsFlag || sendEmailFlag) && customer) {
    const staff = staffId ? staffMap.get(staffId) : null;
    sendAppointmentNotifications({
      merchantId,
      apptId: appt.id,
      scheduledAt: start,
      endAt: end,
      durationMinutes,
      title: resolvedTitle,
      notes: notes ?? null,
      customerFirstName: customer.firstName ?? null,
      customerPhone: customer.phone ?? null,
      customerEmail: customer.email ?? null,
      staffName: staff?.name ?? null,
      sendSmsFlag: !!sendSmsFlag,
      sendEmailFlag: !!sendEmailFlag,
    }).catch(() => {});
  }
});

router.patch("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const merchantId = req.session.merchantId!;
  const { scheduledAt, endAt, ...rest } = parsed.data;

  const updates: Record<string, unknown> = { ...rest };
  if (scheduledAt) updates.scheduledAt = new Date(scheduledAt);
  if (scheduledAt && endAt) {
    const start = new Date(scheduledAt);
    const end = new Date(endAt);
    updates.durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  }

  const [appt] = await db
    .update(appointmentsTable)
    .set(updates)
    .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.merchantId, merchantId)))
    .returning();

  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const customers = await db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId));
  const staffMembers = await db.select().from(staffTable).where(eq(staffTable.merchantId, merchantId));
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const staffMap = new Map(staffMembers.map((s) => [s.id, s]));

  triggerInstantSync(merchantId, "calendar");
  res.json(await formatAppointment(appt, customerMap, staffMap, await buildJobMap(merchantId, [appt])));
});

router.delete("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(appointmentsTable)
    .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
