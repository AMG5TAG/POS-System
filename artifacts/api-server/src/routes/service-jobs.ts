import { Router, type IRouter } from "express";
import { db, serviceJobsTable, customersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function formatJob(job: typeof serviceJobsTable.$inferSelect, customerName: string | null) {
  return {
    id: job.id,
    merchantId: job.merchantId,
    customerId: job.customerId ?? null,
    staffId: job.staffId ?? null,
    jobNumber: job.jobNumber,
    customerName,
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

function nextJobNumber(existing: Array<{ jobNumber: string }>): string {
  let max = 0;
  for (const job of existing) {
    const n = parseInt(job.jobNumber.replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `SJ-${String(max + 1).padStart(4, "0")}`;
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
  const customerMap = new Map(
    customers.map((c) => [c.id, `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || null])
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

  const [job] = await db
    .insert(serviceJobsTable)
    .values({
      merchantId,
      customerId: body.customerId ? Number(body.customerId) : null,
      staffId: body.staffId ? Number(body.staffId) : null,
      jobNumber: nextJobNumber(existing),
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

  const customerName = job.customerId
    ? await db
        .select()
        .from(customersTable)
        .where(and(eq(customersTable.id, job.customerId), eq(customersTable.merchantId, merchantId)))
        .then(([c]) => (c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || null : null))
    : null;

  res.status(201).json(formatJob(job, customerName));
});

router.patch("/service-jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
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

  const customerName = job.customerId
    ? await db
        .select()
        .from(customersTable)
        .where(and(eq(customersTable.id, job.customerId), eq(customersTable.merchantId, merchantId)))
        .then(([c]) => (c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || null : null))
    : null;

  res.json(formatJob(job, customerName));
});

router.delete("/service-jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, id), eq(serviceJobsTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
