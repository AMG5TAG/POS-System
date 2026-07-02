import { Router, type IRouter } from "express";
import { db, serviceJobsTable, customersTable, merchantsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { customerDisplayName } from "../lib/customer-name";
import { withUniqueRetry, nextSequential } from "../lib/document-numbers";
import { escapeHtml } from "../lib/html-escape";
import { sendEmail } from "../services/email";
import { registerServiceQr, registerQrBestEffort } from "../services/entityQr";
import { sendSms } from "../services/sms";
import { publicDomain } from "../lib/publicUrl";
import { UpdateServiceJobParams, DeleteServiceJobParams, SendServiceJobEmailParams } from "@workspace/api-zod";
import { getServiceWarrantyDefaults } from "./service-settings";

const router: IRouter = Router();

interface CustomerInfo { name: string | null; phone: string | null; email: string | null; portalToken: string | null; }

function formatJob(job: typeof serviceJobsTable.$inferSelect, customer: CustomerInfo | null) {
  return {
    id: job.id,
    merchantId: job.merchantId,
    customerId: job.customerId ?? null,
    staffId: job.staffId ?? null,
    jobNumber: job.jobNumber,
    customerName:  customer?.name  ?? null,
    customerPhone: customer?.phone ?? null,
    customerEmail: customer?.email ?? null,
    status: job.status,
    bookInDate: job.bookInDate,
    deviceType: job.deviceType ?? null,
    deviceDescription: job.deviceDescription ?? null,
    serialNumber: job.serialNumber ?? null,
    condition: job.condition ?? null,
    partnerRepairCode: job.partnerRepairCode ?? null,
    isPartnerRepair: job.isPartnerRepair === "true",
    isCritical: job.isCritical === "true",
    isUnderWarranty: job.isUnderWarranty === "true",
    repairWarrantyDays: job.repairWarrantyDays ?? 0,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    reworkOfJobId: job.reworkOfJobId ?? null,
    reopenedFromJobId: job.reopenedFromJobId ?? null,
    estimateApprovedAt: job.estimateApprovedAt ? job.estimateApprovedAt.toISOString() : null,
    estimateApprovedVia: job.estimateApprovedVia ?? null,
    depositRequired: job.depositRequired != null ? parseFloat(job.depositRequired) : null,
    depositPaid: parseFloat(job.depositPaid ?? "0"),
    isMailIn: job.isMailIn === "true",
    shippingCarrier: job.shippingCarrier ?? null,
    inboundTracking: job.inboundTracking ?? null,
    returnTracking: job.returnTracking ?? null,
    returnAddress: job.returnAddress ?? null,
    workDescription: job.workDescription ?? null,
    additionalEquipment: job.additionalEquipment ?? null,
    passwordOrPin: job.passwordOrPin ?? null,
    accounts: job.accounts ?? null,
    signature: job.signature ?? null,
    photos: job.photos ? (() => { try { return JSON.parse(job.photos!); } catch { return []; } })() : [],
    estimatedCost: job.estimatedCost ? parseFloat(job.estimatedCost) : null,
    notes: job.notes ?? null,
    heardFrom: job.heardFrom ?? null,
    heardFromDetails: job.heardFromDetails ?? null,
    referredByCustomerId: job.referredByCustomerId ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function nextJobNumber(existing: Array<{ jobNumber: string }>, prefix = "SJ", digits = 4, tryIndex = 0): string {
  return `${prefix}${String(nextSequential(existing.map((j) => j.jobNumber), tryIndex)).padStart(digits, "0")}`;
}

router.get("/service-jobs", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobs = await db
    .select()
    .from(serviceJobsTable)
    .where(eq(serviceJobsTable.merchantId, merchantId))
    .orderBy(desc(serviceJobsTable.createdAt));

  const customerIds = [...new Set(jobs.filter((j) => j.customerId).map((j) => j.customerId!))];
  const customers =
    customerIds.length > 0
      ? await db.select().from(customersTable)
          .where(and(eq(customersTable.merchantId, merchantId), inArray(customersTable.id, customerIds)))
      : [];
  const customerMap = new Map<number, CustomerInfo>(
    customers.map((c) => [c.id, {
      name:  customerDisplayName(c.firstName, c.lastName, c.company),
      phone: c.phone ?? null,
      email: c.email ?? null,
      portalToken: c.portalToken ?? null,
    }])
  );

  res.json(jobs.map((j) => formatJob(j, j.customerId ? (customerMap.get(j.customerId) ?? null) : null)));
});

router.post("/service-jobs", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Record<string, unknown>;

  const today = new Date().toISOString().split("T")[0];

  const jobPrefix = typeof body.jobNumberPrefix === "string" && body.jobNumberPrefix ? body.jobNumberPrefix : "SJ";
  const jobDigits = typeof body.jobNumberDigits === "number" && body.jobNumberDigits > 0 ? body.jobNumberDigits : 4;

  // Pre-fill the repair warranty window from the merchant's Service Options
  // default unless the caller supplied an explicit value.
  const warrantyDefaults = await getServiceWarrantyDefaults(merchantId);
  const repairWarrantyDays = body.repairWarrantyDays != null
    ? Math.max(0, Math.round(Number(body.repairWarrantyDays) || 0))
    : warrantyDefaults.repairWarrantyDays;

  // Derive the job number from max+1 and retry on the unique-index conflict so a
  // concurrent create can't produce a duplicate SJ####. `existing` is re-read per
  // attempt so a committed concurrent job is reflected in the next number.
  const job = await withUniqueRetry("service_jobs_merchant_job_number_unique", async (tryIndex) => {
    const existing = await db
      .select({ jobNumber: serviceJobsTable.jobNumber })
      .from(serviceJobsTable)
      .where(eq(serviceJobsTable.merchantId, merchantId));
    const [created] = await db
    .insert(serviceJobsTable)
    .values({
      merchantId,
      repairWarrantyDays,
      customerId: body.customerId ? Number(body.customerId) : null,
      staffId: body.staffId ? Number(body.staffId) : null,
      jobNumber: nextJobNumber(existing, jobPrefix, jobDigits, tryIndex),
      title: body.title ? String(body.title) : "Service Job",
      status: typeof body.status === "string" ? body.status : "pending",
      bookInDate: typeof body.bookInDate === "string" ? body.bookInDate : today,
      deviceType: typeof body.deviceType === "string" ? body.deviceType : null,
      deviceDescription: typeof body.deviceDescription === "string" ? body.deviceDescription : null,
      serialNumber: typeof body.serialNumber === "string" ? body.serialNumber : null,
      condition: typeof body.condition === "string" ? body.condition : null,
      partnerRepairCode: typeof body.partnerRepairCode === "string" ? body.partnerRepairCode : null,
      isPartnerRepair: body.isPartnerRepair ? "true" : "false",
      isCritical: body.isCritical ? "true" : "false",
      isUnderWarranty: body.isUnderWarranty ? "true" : "false",
      workDescription: typeof body.workDescription === "string" ? body.workDescription : null,
      additionalEquipment: typeof body.additionalEquipment === "string" ? body.additionalEquipment : null,
      passwordOrPin: typeof body.passwordOrPin === "string" ? body.passwordOrPin : null,
      accounts: typeof body.accounts === "string" ? body.accounts : null,
      signature: typeof body.signature === "string" ? body.signature : null,
      photos: Array.isArray(body.photos) ? JSON.stringify(body.photos) : null,
      estimatedCost: body.estimatedCost != null ? String(body.estimatedCost) : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      heardFrom: typeof body.heardFrom === "string" ? body.heardFrom : null,
      heardFromDetails: typeof body.heardFromDetails === "string" ? body.heardFromDetails : null,
      referredByCustomerId: body.referredByCustomerId != null ? Number(body.referredByCustomerId) : null,
    })
    .returning();
    return created;
  });

  const customer: CustomerInfo | null = job.customerId
    ? await db
        .select()
        .from(customersTable)
        .where(and(eq(customersTable.id, job.customerId), eq(customersTable.merchantId, merchantId)))
        .then(([c]) => c ? { name: customerDisplayName(c.firstName, c.lastName, c.company), phone: c.phone ?? null, email: c.email ?? null, portalToken: c.portalToken ?? null } : null)
    : null;

  registerQrBestEffort(registerServiceQr(merchantId, job.id, customer?.name ?? null));
  res.status(201).json(formatJob(job, customer));
});

router.patch("/service-jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = UpdateServiceJobParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;
  const body = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (typeof body.status === "string") updates.status = body.status;
  if (typeof body.bookInDate === "string") updates.bookInDate = body.bookInDate;
  if (body.customerId !== undefined) updates.customerId = body.customerId ? Number(body.customerId) : null;
  if (body.staffId !== undefined) updates.staffId = body.staffId ? Number(body.staffId) : null;
  if (typeof body.deviceType === "string") updates.deviceType = body.deviceType;
  if (typeof body.deviceDescription === "string") updates.deviceDescription = body.deviceDescription;
  if (typeof body.serialNumber === "string") updates.serialNumber = body.serialNumber;
  if (typeof body.condition === "string") updates.condition = body.condition;
  if (typeof body.partnerRepairCode === "string") updates.partnerRepairCode = body.partnerRepairCode;
  if (body.isPartnerRepair !== undefined) updates.isPartnerRepair = body.isPartnerRepair ? "true" : "false";
  if (body.isCritical !== undefined) updates.isCritical = body.isCritical ? "true" : "false";
  if (body.isUnderWarranty !== undefined) updates.isUnderWarranty = body.isUnderWarranty ? "true" : "false";
  if (body.repairWarrantyDays !== undefined) updates.repairWarrantyDays = Math.max(0, Math.round(Number(body.repairWarrantyDays) || 0));
  if (body.isMailIn !== undefined) updates.isMailIn = body.isMailIn ? "true" : "false";
  if (typeof body.shippingCarrier === "string") updates.shippingCarrier = body.shippingCarrier;
  if (typeof body.inboundTracking === "string") updates.inboundTracking = body.inboundTracking;
  if (typeof body.returnTracking === "string") updates.returnTracking = body.returnTracking;
  if (typeof body.returnAddress === "string") updates.returnAddress = body.returnAddress;
  if (typeof body.workDescription === "string") updates.workDescription = body.workDescription;
  if (typeof body.additionalEquipment === "string") updates.additionalEquipment = body.additionalEquipment;
  if (typeof body.passwordOrPin === "string") updates.passwordOrPin = body.passwordOrPin;
  if (typeof body.accounts === "string") updates.accounts = body.accounts;
  if (typeof body.signature === "string") updates.signature = body.signature;
  if (Array.isArray(body.photos)) updates.photos = JSON.stringify(body.photos);
  if (body.estimatedCost !== undefined) updates.estimatedCost = body.estimatedCost != null ? String(body.estimatedCost) : null;
  if (typeof body.notes === "string") updates.notes = body.notes;
  if (typeof body.heardFrom === "string") updates.heardFrom = body.heardFrom;
  if (typeof body.heardFromDetails === "string") updates.heardFromDetails = body.heardFromDetails;
  if (body.referredByCustomerId !== undefined) updates.referredByCustomerId = body.referredByCustomerId != null ? Number(body.referredByCustomerId) : null;

  // Append a timestamped status-change entry to notes whenever the status changes
  if (typeof body.status === "string") {
    const [current] = await db
      .select({ status: serviceJobsTable.status, notes: serviceJobsTable.notes })
      .from(serviceJobsTable)
      .where(and(eq(serviceJobsTable.id, id), eq(serviceJobsTable.merchantId, merchantId)))
      .limit(1);

    // A completed repair is a finished record — its completion date anchors the
    // repair-warranty window and it lives in Service History. It cannot be moved
    // to another status; staff must Reopen it, which spawns a new linked repair.
    if (current && current.status === "completed" && body.status !== "completed") {
      res.status(409).json({ error: "Completed repairs can't be changed to another status. Use Reopen to create a new linked repair." });
      return;
    }
    // Stamp completion time on the first transition into "completed" (anchors
    // the repair-warranty window).
    if (current && body.status !== current.status && body.status === "completed") {
      updates.completedAt = new Date();
    }
    if (current && body.status !== current.status) {
      const STATUS_LABELS: Record<string, string> = {
        "pending":                     "Pending",
        "in-progress":                 "In Progress",
        "awaiting-parts":              "Awaiting Parts",
        "awaiting-stock":              "Awaiting Stock",
        "at-repairer":                 "At Repairer",
        "awaiting-partner-approval":   "Awaiting Partner Approval",
        "partner-replacement":         "Partner Replacement",
        "awaiting-customer":           "Awaiting Customer",
        "completed":                   "Completed",
        "cancelled":                   "Cancelled",
      };
      const fromLabel = STATUS_LABELS[current.status] ?? current.status;
      const toLabel   = STATUS_LABELS[body.status]    ?? body.status;
      const now = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      const stamp = `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`;
      const logEntry = `[${stamp}] Status: ${fromLabel} → ${toLabel}`;
      const baseNotes = typeof updates.notes === "string" ? updates.notes : (current.notes ?? "");
      updates.notes = baseNotes ? `${baseNotes}\n${logEntry}` : logEntry;
    }
  }

  const [job] = await db
    .update(serviceJobsTable)
    .set(updates)
    .where(and(eq(serviceJobsTable.id, id), eq(serviceJobsTable.merchantId, merchantId)))
    .returning();

  if (!job) {
    res.status(404).json({ error: "Service job not found" });
    return;
  }

  const customer: CustomerInfo | null = job.customerId
    ? await db
        .select()
        .from(customersTable)
        .where(and(eq(customersTable.id, job.customerId), eq(customersTable.merchantId, merchantId)))
        .then(([c]) => c ? { name: customerDisplayName(c.firstName, c.lastName, c.company), phone: c.phone ?? null, email: c.email ?? null, portalToken: c.portalToken ?? null } : null)
    : null;

  // Auto-send SMS on key status transitions
  const SMS_NOTIFY_STATUSES = new Set(["in-progress", "awaiting-customer", "completed"]);
  if (typeof body.status === "string" && SMS_NOTIFY_STATUSES.has(body.status) && customer?.phone && customer.portalToken) {
    const [merchant] = await db.select({ businessName: merchantsTable.businessName, username: merchantsTable.username, portalDomain: merchantsTable.portalDomain })
      .from(merchantsTable).where(eq(merchantsTable.id, merchantId));
    const bizName = merchant?.businessName ?? "Your repair shop";
    const domain  = publicDomain(req);
    const portalUrl = merchant?.portalDomain
      ? `https://${merchant.portalDomain}/c/${customer.portalToken}`
      : merchant?.username
        ? `https://${domain}/b/${merchant.username}/c/${customer.portalToken}`
        : null;

    const statusLabel: Record<string, string> = {
      "in-progress":      "In Progress",
      "at-repairer":       "At Repairer",
      "awaiting-customer": "Ready — awaiting your decision",
      "completed":         "Completed & ready for pickup",
    };
    const label = statusLabel[body.status] ?? body.status;
    const smsBody = portalUrl
      ? `${bizName}: Your repair #${job.jobNumber} is now ${label}. Track it here: ${portalUrl}`
      : `${bizName}: Your repair #${job.jobNumber} is now ${label}.`;

    sendSms({ to: customer.phone, body: smsBody }, merchantId).catch(() => {});
  }

  res.json(formatJob(job, customer));
});

router.delete("/service-jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = DeleteServiceJobParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  await db
    .delete(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, id), eq(serviceJobsTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

// POST /service-jobs/:id/sms
router.post("/service-jobs/:id/sms", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = SendServiceJobEmailParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;

  const [job] = await db.select().from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, id), eq(serviceJobsTable.merchantId, merchantId)));
  if (!job) { res.status(404).json({ error: "Service job not found" }); return; }

  const customer: CustomerInfo | null = job.customerId
    ? await db.select().from(customersTable)
        .where(and(eq(customersTable.id, job.customerId), eq(customersTable.merchantId, merchantId)))
        .then(([c]) => c ? { name: customerDisplayName(c.firstName, c.lastName, c.company), phone: c.phone ?? null, email: c.email ?? null, portalToken: c.portalToken ?? null } : null)
    : null;

  const bodyPhone = (req.body as { phone?: string } | undefined)?.phone?.trim() || null;
  const toPhone   = bodyPhone ?? customer?.phone ?? null;

  if (!toPhone) { res.status(400).json({ error: "No phone number on file" }); return; }

  const [merchant] = await db.select({ businessName: merchantsTable.businessName, username: merchantsTable.username, portalDomain: merchantsTable.portalDomain })
    .from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const bizName   = merchant?.businessName ?? "Your repair shop";
  const domain    = publicDomain(req);
  const portalUrl = customer?.portalToken
    ? merchant?.portalDomain
      ? `https://${merchant.portalDomain}/c/${customer.portalToken}`
      : merchant?.username
        ? `https://${domain}/b/${merchant.username}/c/${customer.portalToken}`
        : null
    : null;

  const statusLabel: Record<string, string> = {
    "pending":                     "Pending",
    "in-progress":                 "In Progress",
    "awaiting-parts":              "Awaiting Parts",
    "awaiting-stock":              "Awaiting Stock",
    "at-repairer":                 "At Repairer",
    "awaiting-partner-approval":   "Awaiting Partner Approval",
    "partner-replacement":         "Partner Replacement",
    "awaiting-customer":           "Awaiting Your Decision",
    "completed":                   "Completed & ready for pickup",
    "cancelled":                   "Cancelled",
  };
  const label = statusLabel[job.status] ?? job.status;
  const smsBody = portalUrl
    ? `${bizName}: Your repair #${job.jobNumber} (${job.deviceDescription ?? job.deviceType ?? "device"}) is ${label}. Track it: ${portalUrl}`
    : `${bizName}: Your repair #${job.jobNumber} is ${label}.`;

  const result = await sendSms({ to: toPhone, body: smsBody }, merchantId);

  if (!result.success) {
    req.log.warn({ serviceJobId: id, to: toPhone, error: result.error }, "Service job SMS failed");
    res.status(400).json({ error: result.error ?? "Failed to send SMS" });
    return;
  }

  req.log.info({ serviceJobId: id, to: toPhone, provider: result.provider }, "Service job SMS sent");
  res.json({ success: true });
});

// POST /service-jobs/:id/email
router.post("/service-jobs/:id/email", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = SendServiceJobEmailParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;

  const [job] = await db.select().from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, id), eq(serviceJobsTable.merchantId, merchantId)));
  if (!job) {
    res.status(404).json({ error: "Service job not found" });
    return;
  }

  const customer: CustomerInfo | null = job.customerId
    ? await db.select().from(customersTable)
        .where(and(eq(customersTable.id, job.customerId), eq(customersTable.merchantId, merchantId)))
        .then(([c]) => c ? {
          name: customerDisplayName(c.firstName, c.lastName, c.company),
          phone: c.phone ?? null,
          email: c.email ?? null,
          portalToken: c.portalToken ?? null,
        } : null)
    : null;

  const bodyEmail = (req.body as { email?: string } | undefined)?.email?.trim() || null;
  const toEmail = bodyEmail ?? customer?.email ?? null;

  if (!toEmail) {
    res.status(400).json({ error: "Customer has no email address" });
    return;
  }

  const { db: dbInstance, merchantsTable } = await import("@workspace/db");
  const [merchant] = await dbInstance.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const bizName = escapeHtml(merchant?.businessName ?? "Your Business");

  // Escape every user-controlled value before it lands in the HTML email — job
  // notes/device fields/customer details are free text and would otherwise allow
  // markup injection into the message.
  const formatVal = (v: string | null | undefined) => v && v.trim() ? escapeHtml(v) : "—";
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  const photos: string[] = job.photos ? (() => { try { return JSON.parse(job.photos); } catch { return []; } })() : [];

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Service Job #${job.jobNumber}</title></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#111;margin-top:0;border-bottom:2px solid #f0c040;padding-bottom:8px;">Service Job #${job.jobNumber}</h2>
  <p style="color:#666;font-size:12px;margin-bottom:16px;">Sent from ${bizName}</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;width:140px;color:#666;font-size:12px;">Customer</td><td style="padding:6px 0;border-bottom:1px solid #eee;font-weight:500;">${formatVal(customer?.name)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Phone</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${formatVal(customer?.phone)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Email</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${formatVal(toEmail)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Book-In Date</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${fmtDate(job.bookInDate)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Status</td><td style="padding:6px 0;border-bottom:1px solid #eee;"><span style="text-transform:capitalize;">${escapeHtml(job.status.replace(/-/g, " "))}</span></td></tr>
  </table>

  <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin:20px 0 8px;">Device</h3>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;width:140px;color:#666;font-size:12px;">Device Type</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${formatVal(job.deviceType)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Description</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${formatVal(job.deviceDescription)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Serial Number</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${formatVal(job.serialNumber)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Condition</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${formatVal(job.condition)}</td></tr>
  </table>

  <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin:20px 0 8px;">Work Details</h3>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;width:140px;color:#666;font-size:12px;vertical-align:top;">Work Description</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${formatVal(job.workDescription)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Estimated Cost</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${job.estimatedCost ? `$${parseFloat(job.estimatedCost).toFixed(2)}` : "—"}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Partner Repair</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${job.isPartnerRepair === "true" ? "Yes" : "No"}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Under Warranty</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${job.isUnderWarranty === "true" ? "Yes" : "No"}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Critical</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${job.isCritical === "true" ? "Yes" : "No"}</td></tr>
  </table>

  ${job.notes ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin:20px 0 8px;">Notes</h3><div style="background:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:12px;font-size:13px;white-space:pre-wrap;">${escapeHtml(job.notes)}</div>` : ""}
  ${photos.length ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin:20px 0 8px;">Photos</h3><p style="font-size:12px;color:#666;">${photos.length} photo(s) attached to this job.</p>` : ""}

  <p style="margin-top:24px;padding-top:12px;border-top:1px solid #eee;font-size:12px;color:#999;">This email was sent automatically from ${bizName} via KoaPOS.</p>
</body>
</html>`;

  const result = await sendEmail(merchantId, {
    to: toEmail,
    subject: `Service Job Update — #${job.jobNumber}`,
    html,
    text: `Service Job #${job.jobNumber} from ${bizName}\n\nCustomer: ${formatVal(customer?.name)}\nPhone: ${formatVal(customer?.phone)}\nBook-In: ${fmtDate(job.bookInDate)}\nStatus: ${job.status}\n\nDevice: ${formatVal(job.deviceType)}\nDescription: ${formatVal(job.deviceDescription)}\nSerial: ${formatVal(job.serialNumber)}\nCondition: ${formatVal(job.condition)}\n\nWork: ${formatVal(job.workDescription)}\nEst. Cost: ${job.estimatedCost ? `$${parseFloat(job.estimatedCost).toFixed(2)}` : "—"}\n\n${job.notes ? `Notes:\n${job.notes}\n\n` : ""}Sent from ${bizName} via KoaPOS.`,
  });

  if (!result.success) {
    req.log.warn({ serviceJobId: id, to: toEmail, error: result.error }, "Service job email failed");
    res.status(400).json({ error: result.error ?? "Failed to send service job email" });
    return;
  }

  req.log.info({ serviceJobId: id, to: toEmail, provider: result.provider }, "Service job email sent");
  res.json({ success: true });
});

// POST /service-jobs/:id/rework — open a no-charge rework job linked to the original.
router.post("/service-jobs/:id/rework", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [orig] = await db.select().from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, id), eq(serviceJobsTable.merchantId, merchantId))).limit(1);
  if (!orig) { res.status(404).json({ error: "Service job not found" }); return; }

  const today = new Date().toISOString().split("T")[0];

  const { reworkWarrantyDays } = await getServiceWarrantyDefaults(merchantId);

  const created = await withUniqueRetry("service_jobs_merchant_job_number_unique", async (tryIndex) => {
    const existing = await db.select({ jobNumber: serviceJobsTable.jobNumber })
      .from(serviceJobsTable).where(eq(serviceJobsTable.merchantId, merchantId));
    const [row] = await db.insert(serviceJobsTable).values({
      merchantId,
      customerId: orig.customerId ?? null,
      staffId: orig.staffId ?? null,
      jobNumber: nextJobNumber(existing, "SJ", 4, tryIndex),
      title: `Rework of ${orig.jobNumber}`,
      status: "pending",
      bookInDate: today,
      deviceType: orig.deviceType ?? null,
      deviceDescription: orig.deviceDescription ?? null,
      serialNumber: orig.serialNumber ?? null,
      condition: orig.condition ?? null,
      workDescription: orig.workDescription ?? null,
      isUnderWarranty: "true",
      repairWarrantyDays: reworkWarrantyDays,
      reworkOfJobId: orig.id,
    }).returning();
    return row;
  });

  let customer: CustomerInfo | null = null;
  if (created.customerId) {
    const [c] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, created.customerId), eq(customersTable.merchantId, merchantId))).limit(1);
    if (c) customer = { name: customerDisplayName(c.firstName, c.lastName, c.company), phone: c.phone ?? null, email: c.email ?? null, portalToken: c.portalToken ?? null };
  }
  res.status(201).json(formatJob(created, customer));
});

// POST /service-jobs/:id/reopen — open a NEW repair continuing from a completed
// job, linked back to the original via reopenedFromJobId. Unlike /rework this is
// a fresh, chargeable repair (not forced under-warranty); the original stays
// completed and untouched in Service History.
router.post("/service-jobs/:id/reopen", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [orig] = await db.select().from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, id), eq(serviceJobsTable.merchantId, merchantId))).limit(1);
  if (!orig) { res.status(404).json({ error: "Service job not found" }); return; }
  if (orig.status !== "completed") { res.status(409).json({ error: "Only completed repairs can be reopened" }); return; }

  const today = new Date().toISOString().split("T")[0];

  const { repairWarrantyDays } = await getServiceWarrantyDefaults(merchantId);

  const created = await withUniqueRetry("service_jobs_merchant_job_number_unique", async (tryIndex) => {
    const existing = await db.select({ jobNumber: serviceJobsTable.jobNumber })
      .from(serviceJobsTable).where(eq(serviceJobsTable.merchantId, merchantId));
    const [row] = await db.insert(serviceJobsTable).values({
      merchantId,
      customerId: orig.customerId ?? null,
      staffId: orig.staffId ?? null,
      jobNumber: nextJobNumber(existing, "SJ", 4, tryIndex),
      title: `Reopen of ${orig.jobNumber}`,
      status: "pending",
      bookInDate: today,
      deviceType: orig.deviceType ?? null,
      deviceDescription: orig.deviceDescription ?? null,
      serialNumber: orig.serialNumber ?? null,
      condition: orig.condition ?? null,
      workDescription: orig.workDescription ?? null,
      repairWarrantyDays,
      reopenedFromJobId: orig.id,
    }).returning();
    return row;
  });

  let customer: CustomerInfo | null = null;
  if (created.customerId) {
    const [c] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, created.customerId), eq(customersTable.merchantId, merchantId))).limit(1);
    if (c) customer = { name: customerDisplayName(c.firstName, c.lastName, c.company), phone: c.phone ?? null, email: c.email ?? null, portalToken: c.portalToken ?? null };
  }

  registerQrBestEffort(registerServiceQr(merchantId, created.id, customer?.name ?? null));
  res.status(201).json(formatJob(created, customer));
});

// POST /service-jobs/:id/deposit — record a deposit collected against the job
// (in-store). Soft/advisory: accumulates into depositPaid and logs an audit line.
router.post("/service-jobs/:id/deposit", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const merchantId = req.session.merchantId!;
  const amount = Number((req.body ?? {}).amount);
  if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: "A positive amount is required" }); return; }
  const method = typeof (req.body ?? {}).method === "string" ? (req.body as { method: string }).method : null;

  const [job] = await db.select({ depositPaid: serviceJobsTable.depositPaid, notes: serviceJobsTable.notes })
    .from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, id), eq(serviceJobsTable.merchantId, merchantId))).limit(1);
  if (!job) { res.status(404).json({ error: "Service job not found" }); return; }

  const newPaid = Math.round((parseFloat(job.depositPaid ?? "0") + amount) * 100) / 100;
  const logEntry = `[${new Date().toISOString()}] Deposit recorded: $${amount.toFixed(2)}${method ? ` (${method})` : ""}`;
  const notes = job.notes ? `${job.notes}\n${logEntry}` : logEntry;

  const [updated] = await db.update(serviceJobsTable)
    .set({ depositPaid: String(newPaid), notes })
    .where(and(eq(serviceJobsTable.id, id), eq(serviceJobsTable.merchantId, merchantId)))
    .returning({ depositRequired: serviceJobsTable.depositRequired, depositPaid: serviceJobsTable.depositPaid });

  res.json({
    depositRequired: updated.depositRequired != null ? parseFloat(updated.depositRequired) : null,
    depositPaid: parseFloat(updated.depositPaid),
  });
});

export default router;
