import { Router, type IRouter } from "express";
import { db, customersTable, customerNotesTable, customerFilesTable, transactionsTable, appointmentsTable, serviceJobsTable } from "@workspace/db";
import { eq, and, ilike, or, sql, desc } from "drizzle-orm";
import crypto from "node:crypto";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListCustomersQueryParams,
  CreateCustomerBody,
  GetCustomerParams,
  UpdateCustomerParams,
  UpdateCustomerBody,
  DeleteCustomerParams,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

function formatCustomer(c: typeof customersTable.$inferSelect) {
  return {
    id: c.id,
    merchantId: c.merchantId,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    address: c.address ?? null,
    notes: c.notes ?? null,
    dateOfBirth: c.dateOfBirth ?? null,
    loyaltyPoints: c.loyaltyPoints,
    totalSpent: parseFloat(c.totalSpent),
    visitCount: c.visitCount,
    createdAt: c.createdAt.toISOString(),
    company: c.company ?? null,
    abn: c.abn ?? null,
    referredBy: c.referredBy ?? null,
    whatsappSameAsPhone: c.whatsappSameAsPhone ?? null,
    billingStreet: c.billingStreet ?? null,
    billingCity: c.billingCity ?? null,
    billingState: c.billingState ?? null,
    billingPostcode: c.billingPostcode ?? null,
    billingCountry: c.billingCountry ?? null,
    shippingStreet: c.shippingStreet ?? null,
    shippingCity: c.shippingCity ?? null,
    shippingState: c.shippingState ?? null,
    shippingPostcode: c.shippingPostcode ?? null,
    shippingCountry: c.shippingCountry ?? null,
    customerGroup: c.customerGroup ?? null,
    warningNote: c.warningNote ?? null,
    agreedToMarketing: c.agreedToMarketing ?? null,
    portalToken: c.portalToken ?? null,
  };
}

/* ── CRUD ──────────────────────────────────────────────────────────────────── */

router.get("/customers", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListCustomersQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }
  const { search, limit = 50, offset = 0 } = queryParams.data;
  const conditions = [eq(customersTable.merchantId, req.session.merchantId!)];
  if (search) {
    conditions.push(
      or(
        ilike(customersTable.firstName, `%${search}%`),
        ilike(customersTable.lastName, `%${search}%`),
        ilike(customersTable.email, `%${search}%`),
        ilike(customersTable.phone, `%${search}%`)
      )!
    );
  }
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(customersTable).where(and(...conditions));
  const customers = await db.select().from(customersTable).where(and(...conditions)).limit(limit).offset(offset).orderBy(customersTable.createdAt);
  res.json({ items: customers.map(formatCustomer), total: Number(countResult.count) });
});

router.post("/customers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [customer] = await db.insert(customersTable).values({
    ...parsed.data,
    merchantId: req.session.merchantId!,
    portalToken: crypto.randomUUID(),
  }).returning();
  res.status(201).json(formatCustomer(customer));
});

router.get("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [customer] = await db.select().from(customersTable).where(and(eq(customersTable.id, params.data.id), eq(customersTable.merchantId, req.session.merchantId!)));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(formatCustomer(customer));
});

router.patch("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [customer] = await db.update(customersTable).set(parsed.data).where(and(eq(customersTable.id, params.data.id), eq(customersTable.merchantId, req.session.merchantId!))).returning();
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(formatCustomer(customer));
});

router.delete("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(customersTable).where(and(eq(customersTable.id, params.data.id), eq(customersTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

/* ── History ───────────────────────────────────────────────────────────────── */

router.get("/customers/:id/history", requireAuth, async (req, res): Promise<void> => {
  const customerId = parseInt(String(req.params.id), 10);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customer id" }); return; }
  const merchantId = req.session.merchantId!;

  const [txRows, apptRows, jobRows] = await Promise.all([
    db.select().from(transactionsTable)
      .where(and(eq(transactionsTable.merchantId, merchantId), eq(transactionsTable.customerId, customerId)))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(50),
    db.select().from(appointmentsTable)
      .where(and(eq(appointmentsTable.merchantId, merchantId), eq(appointmentsTable.customerId, customerId)))
      .orderBy(desc(appointmentsTable.scheduledAt))
      .limit(50),
    db.select().from(serviceJobsTable)
      .where(and(eq(serviceJobsTable.merchantId, merchantId), eq(serviceJobsTable.customerId, customerId)))
      .orderBy(desc(serviceJobsTable.createdAt))
      .limit(50),
  ]);

  const transactions = txRows.map((t) => ({
    id: t.id, receiptNumber: t.receiptNumber, status: t.status,
    total: parseFloat(t.total), paymentMethod: t.paymentMethod,
    items: Array.isArray(t.items) ? t.items : [],
    createdAt: t.createdAt.toISOString(),
  }));

  const appointments = apptRows.map((a) => ({
    id: a.id, title: a.title, status: a.status,
    scheduledAt: a.scheduledAt.toISOString(),
    durationMinutes: a.durationMinutes,
    notes: a.notes ?? null,
    createdAt: a.createdAt.toISOString(),
  }));

  const serviceJobs = jobRows.map((j) => ({
    id: j.id, jobNumber: j.jobNumber, status: j.status,
    deviceType: j.deviceType ?? null, deviceDescription: j.deviceDescription ?? null,
    estimatedCost: j.estimatedCost ? parseFloat(j.estimatedCost) : null,
    createdAt: j.createdAt.toISOString(),
  }));

  res.json({ transactions, appointments, serviceJobs });
});

/* ── Notes ─────────────────────────────────────────────────────────────────── */

router.get("/customers/:id/notes", requireAuth, async (req, res): Promise<void> => {
  const customerId = parseInt(String(req.params.id), 10);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customer id" }); return; }
  const merchantId = req.session.merchantId!;
  const notes = await db.select().from(customerNotesTable)
    .where(and(eq(customerNotesTable.merchantId, merchantId), eq(customerNotesTable.customerId, customerId)))
    .orderBy(desc(customerNotesTable.createdAt));
  res.json(notes.map((n) => ({
    id: n.id, merchantId: n.merchantId, customerId: n.customerId,
    note: n.note, popupOnBooking: n.popupOnBooking, popupOnSale: n.popupOnSale,
    createdAt: n.createdAt.toISOString(),
  })));
});

router.post("/customers/:id/notes", requireAuth, async (req, res): Promise<void> => {
  const customerId = parseInt(String(req.params.id), 10);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customer id" }); return; }
  const merchantId = req.session.merchantId!;
  const { note, popupOnBooking = false, popupOnSale = false } = req.body as { note?: string; popupOnBooking?: boolean; popupOnSale?: boolean };
  if (!note?.trim()) { res.status(400).json({ error: "note is required" }); return; }
  const [record] = await db.insert(customerNotesTable)
    .values({ merchantId, customerId, note: note.trim(), popupOnBooking, popupOnSale })
    .returning();
  res.status(201).json({
    id: record.id, merchantId: record.merchantId, customerId: record.customerId,
    note: record.note, popupOnBooking: record.popupOnBooking, popupOnSale: record.popupOnSale,
    createdAt: record.createdAt.toISOString(),
  });
});

router.delete("/customers/:id/notes/:noteId", requireAuth, async (req, res): Promise<void> => {
  const customerId = parseInt(String(req.params.id), 10);
  const noteId = parseInt(String(req.params.noteId), 10);
  if (isNaN(customerId) || isNaN(noteId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(customerNotesTable)
    .where(and(eq(customerNotesTable.id, noteId), eq(customerNotesTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

/* ── Files ─────────────────────────────────────────────────────────────────── */

function fileUrl(fileKey: string): string {
  return `/api/storage/objects/${fileKey.replace(/^\/objects\//, "")}`;
}

router.get("/customers/:id/files", requireAuth, async (req, res): Promise<void> => {
  const customerId = parseInt(String(req.params.id), 10);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customer id" }); return; }
  const merchantId = req.session.merchantId!;
  const files = await db.select().from(customerFilesTable)
    .where(and(eq(customerFilesTable.merchantId, merchantId), eq(customerFilesTable.customerId, customerId)))
    .orderBy(desc(customerFilesTable.createdAt));
  res.json(files.map((f) => ({
    id: f.id, merchantId: f.merchantId, customerId: f.customerId,
    filename: f.filename, fileKey: f.fileKey, contentType: f.contentType,
    sizeBytes: f.sizeBytes, url: fileUrl(f.fileKey),
    createdAt: f.createdAt.toISOString(),
  })));
});

router.post("/customers/:id/files", requireAuth, async (req, res): Promise<void> => {
  const customerId = parseInt(String(req.params.id), 10);
  if (isNaN(customerId)) { res.status(400).json({ error: "Invalid customer id" }); return; }
  const merchantId = req.session.merchantId!;
  const { filename, fileKey, contentType, sizeBytes } = req.body as { filename?: string; fileKey?: string; contentType?: string; sizeBytes?: number };
  if (!filename || !fileKey || !contentType) { res.status(400).json({ error: "filename, fileKey, and contentType are required" }); return; }
  const [record] = await db.insert(customerFilesTable)
    .values({ merchantId, customerId, filename, fileKey, contentType, sizeBytes: sizeBytes ?? 0 })
    .returning();
  res.status(201).json({
    id: record.id, merchantId: record.merchantId, customerId: record.customerId,
    filename: record.filename, fileKey: record.fileKey, contentType: record.contentType,
    sizeBytes: record.sizeBytes, url: fileUrl(record.fileKey),
    createdAt: record.createdAt.toISOString(),
  });
});

router.delete("/customers/:id/files/:fileId", requireAuth, async (req, res): Promise<void> => {
  const customerId = parseInt(String(req.params.id), 10);
  const fileId = parseInt(String(req.params.fileId), 10);
  if (isNaN(customerId) || isNaN(fileId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(customerFilesTable)
    .where(and(eq(customerFilesTable.id, fileId), eq(customerFilesTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

router.get("/customers/:id/portal-token", requireAuth, async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.id, params.data.id), eq(customersTable.merchantId, req.session.merchantId!)));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  let token = customer.portalToken;
  if (!token) {
    token = crypto.randomUUID();
    await db.update(customersTable).set({ portalToken: token }).where(eq(customersTable.id, customer.id));
  }
  const origin = `${req.protocol}://${req.get("host")}`;
  res.json({ token, portalUrl: `${origin}/portal/${token}` });
});

export default router;
