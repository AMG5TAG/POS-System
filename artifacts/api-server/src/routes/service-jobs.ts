import { Router, type IRouter } from "express";
import { db, serviceJobsTable, customersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { sendEmail } from "../services/email";

const router: IRouter = Router();

interface CustomerInfo { name: string | null; phone: string | null; email: string | null; }

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
    workDescription: job.workDescription ?? null,
    additionalEquipment: job.additionalEquipment ?? null,
    passwordOrPin: job.passwordOrPin ?? null,
    accounts: job.accounts ?? null,
    signature: job.signature ?? null,
    photos: job.photos ? (() => { try { return JSON.parse(job.photos!); } catch { return []; } })() : [],
    estimatedCost: job.estimatedCost ? parseFloat(job.estimatedCost) : null,
    notes: job.notes ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function nextJobNumber(existing: Array<{ jobNumber: string }>, prefix = "SJ", digits = 4): string {
  let max = 0;
  for (const job of existing) {
    const n = parseInt(job.jobNumber.replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(digits, "0")}`;
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
      ? await db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId))
      : [];
  const customerMap = new Map<number, CustomerInfo>(
    customers.map((c) => [c.id, {
      name:  `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || null,
      phone: c.phone ?? null,
      email: c.email ?? null,
    }])
  );

  res.json(jobs.map((j) => formatJob(j, j.customerId ? (customerMap.get(j.customerId) ?? null) : null)));
});

router.post("/service-jobs", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Record<string, unknown>;

  const existing = await db
    .select({ jobNumber: serviceJobsTable.jobNumber })
    .from(serviceJobsTable)
    .where(eq(serviceJobsTable.merchantId, merchantId));

  const today = new Date().toISOString().split("T")[0];

  const jobPrefix = typeof body.jobNumberPrefix === "string" && body.jobNumberPrefix ? body.jobNumberPrefix : "SJ";
  const jobDigits = typeof body.jobNumberDigits === "number" && body.jobNumberDigits > 0 ? body.jobNumberDigits : 4;

  const [job] = await db
    .insert(serviceJobsTable)
    .values({
      merchantId,
      customerId: body.customerId ? Number(body.customerId) : null,
      staffId: body.staffId ? Number(body.staffId) : null,
      jobNumber: nextJobNumber(existing, jobPrefix, jobDigits),
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
    })
    .returning();

  const customer: CustomerInfo | null = job.customerId
    ? await db
        .select()
        .from(customersTable)
        .where(and(eq(customersTable.id, job.customerId), eq(customersTable.merchantId, merchantId)))
        .then(([c]) => c ? { name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || null, phone: c.phone ?? null, email: c.email ?? null } : null)
    : null;

  res.status(201).json(formatJob(job, customer));
});

router.patch("/service-jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
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
  if (typeof body.workDescription === "string") updates.workDescription = body.workDescription;
  if (typeof body.additionalEquipment === "string") updates.additionalEquipment = body.additionalEquipment;
  if (typeof body.passwordOrPin === "string") updates.passwordOrPin = body.passwordOrPin;
  if (typeof body.accounts === "string") updates.accounts = body.accounts;
  if (typeof body.signature === "string") updates.signature = body.signature;
  if (Array.isArray(body.photos)) updates.photos = JSON.stringify(body.photos);
  if (body.estimatedCost !== undefined) updates.estimatedCost = body.estimatedCost != null ? String(body.estimatedCost) : null;
  if (typeof body.notes === "string") updates.notes = body.notes;

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
        .then(([c]) => c ? { name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || null, phone: c.phone ?? null, email: c.email ?? null } : null)
    : null;

  res.json(formatJob(job, customer));
});

router.delete("/service-jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, id), eq(serviceJobsTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

// POST /service-jobs/:id/email
router.post("/service-jobs/:id/email", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
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
          name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || null,
          phone: c.phone ?? null,
          email: c.email ?? null,
        } : null)
    : null;

  if (!customer?.email) {
    res.status(400).json({ error: "Customer has no email address" });
    return;
  }

  const { db: dbInstance, merchantsTable } = await import("@workspace/db");
  const [merchant] = await dbInstance.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const bizName = merchant?.businessName ?? "Your Business";

  const formatVal = (v: string | null | undefined) => v && v.trim() ? v : "—";
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
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;width:140px;color:#666;font-size:12px;">Customer</td><td style="padding:6px 0;border-bottom:1px solid #eee;font-weight:500;">${formatVal(customer.name)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Phone</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${formatVal(customer.phone)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Email</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${formatVal(customer.email)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Book-In Date</td><td style="padding:6px 0;border-bottom:1px solid #eee;">${fmtDate(job.bookInDate)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#666;font-size:12px;">Status</td><td style="padding:6px 0;border-bottom:1px solid #eee;"><span style="text-transform:capitalize;">${job.status.replace(/-/g, " ")}</span></td></tr>
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

  ${job.notes ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin:20px 0 8px;">Notes</h3><div style="background:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:12px;font-size:13px;white-space:pre-wrap;">${job.notes}</div>` : ""}
  ${photos.length ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin:20px 0 8px;">Photos</h3><p style="font-size:12px;color:#666;">${photos.length} photo(s) attached to this job.</p>` : ""}

  <p style="margin-top:24px;padding-top:12px;border-top:1px solid #eee;font-size:12px;color:#999;">This email was sent automatically from ${bizName} via KoaPOS.</p>
</body>
</html>`;

  const result = await sendEmail(merchantId, {
    to: customer.email,
    subject: `Service Job Update — #${job.jobNumber}`,
    html,
    text: `Service Job #${job.jobNumber} from ${bizName}\n\nCustomer: ${formatVal(customer.name)}\nPhone: ${formatVal(customer.phone)}\nBook-In: ${fmtDate(job.bookInDate)}\nStatus: ${job.status}\n\nDevice: ${formatVal(job.deviceType)}\nDescription: ${formatVal(job.deviceDescription)}\nSerial: ${formatVal(job.serialNumber)}\nCondition: ${formatVal(job.condition)}\n\nWork: ${formatVal(job.workDescription)}\nEst. Cost: ${job.estimatedCost ? `$${parseFloat(job.estimatedCost).toFixed(2)}` : "—"}\n\n${job.notes ? `Notes:\n${job.notes}\n\n` : ""}Sent from ${bizName} via KoaPOS.`,
  });

  res.json(result);
});

export default router;
