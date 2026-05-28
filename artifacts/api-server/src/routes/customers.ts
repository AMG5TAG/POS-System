import { Router, type IRouter } from "express";
import {
  db,
  customersTable, customerNotesTable, customerFilesTable,
  transactionsTable, appointmentsTable, serviceJobsTable,
  laybysTable, invoicesTable, parkedSalesTable,
  formSubmissionsTable, marketingAutomationLogTable,
  merchantsTable,
} from "@workspace/db";
import { eq, and, ilike, or, sql, desc, isNull } from "drizzle-orm";
import crypto from "node:crypto";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
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

function generateReferralCode(firstName?: string | null, lastName?: string | null): string {
  const f = (firstName ?? "X")[0].toUpperCase();
  const l = (lastName ?? "X")[0].toUpperCase();
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${f}${l}-${suffix}`;
}

function generateStandardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "KOA";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function uniqueStandardCode(merchantId: number): Promise<string> {
  for (let attempts = 0; attempts < 20; attempts++) {
    const code = generateStandardCode();
    const existing = await db.select({ id: customersTable.id }).from(customersTable).where(
      and(eq(customersTable.merchantId, merchantId), eq(customersTable.referralCode, code))
    ).limit(1);
    if (existing.length === 0) return code;
  }
  return `KOA${crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 5)}`;
}

async function uniqueReferralCode(merchantId: number, firstName?: string | null, lastName?: string | null): Promise<string> {
  for (let attempts = 0; attempts < 10; attempts++) {
    const code = generateReferralCode(firstName, lastName);
    const existing = await db.select({ id: customersTable.id }).from(customersTable).where(
      and(eq(customersTable.merchantId, merchantId), eq(customersTable.referralCode, code))
    ).limit(1);
    if (existing.length === 0) return code;
  }
  return generateReferralCode(firstName, lastName);
}

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
    referralCode: c.referralCode ?? null,
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
  const merchantId = req.session.merchantId!;
  const code = parsed.data.referralCode ?? await uniqueReferralCode(merchantId, parsed.data.firstName, parsed.data.lastName);
  const [customer] = await db.insert(customersTable).values({
    ...parsed.data,
    merchantId,
    portalToken: crypto.randomUUID(),
    referralCode: code,
  }).returning();
  res.status(201).json(formatCustomer(customer));
});

router.post("/customers/generate-referral-codes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const missing = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(and(
      eq(customersTable.merchantId, merchantId),
      or(isNull(customersTable.referralCode), eq(customersTable.referralCode, "")),
    ));
  let updated = 0;
  for (const c of missing) {
    const code = await uniqueStandardCode(merchantId);
    await db.update(customersTable).set({ referralCode: code }).where(eq(customersTable.id, c.id));
    updated++;
  }
  res.json({ updated });
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
  const merchantId = req.session.merchantId!;
  const patch = { ...parsed.data };
  if (patch.referralCode) {
    patch.referralCode = patch.referralCode.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const existing = await db.select({ id: customersTable.id }).from(customersTable).where(
      and(eq(customersTable.merchantId, merchantId), eq(customersTable.referralCode, patch.referralCode), sql`${customersTable.id} != ${params.data.id}`)
    ).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "Referral code already in use" }); return; }
  }
  const [customer] = await db.update(customersTable).set(patch).where(and(eq(customersTable.id, params.data.id), eq(customersTable.merchantId, merchantId))).returning();
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(formatCustomer(customer));
});

router.delete("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(customersTable).where(and(eq(customersTable.id, params.data.id), eq(customersTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

router.post("/customers/:id/generate-referral-code", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid customer id" }); return; }
  const merchantId = req.session.merchantId!;
  const code = await uniqueStandardCode(merchantId);
  const [customer] = await db.update(customersTable)
    .set({ referralCode: code })
    .where(and(eq(customersTable.id, id), eq(customersTable.merchantId, merchantId)))
    .returning();
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(formatCustomer(customer));
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
    photos: j.photos ? (() => { try { return JSON.parse(j.photos!); } catch { return []; } })() : [],
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
  const [merchant] = await db.select({ username: merchantsTable.username })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, req.session.merchantId!));
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ?? req.hostname;
  const origin = `https://${domain}`;
  const username = merchant?.username;
  const portalPath = username ? `/b/${username}/c/${token}` : `/portal/${token}`;
  res.json({ token, portalUrl: `${origin}${portalPath}` });
});

/* ─── Merge profiles ──────────────────────────────────────────────────────── */

router.post("/customers/:primaryId/merge/:secondaryId", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const primaryId   = parseInt(String(req.params.primaryId),   10);
  const secondaryId = parseInt(String(req.params.secondaryId), 10);

  if (isNaN(primaryId) || isNaN(secondaryId)) {
    res.status(400).json({ error: "Invalid customer ID" }); return;
  }
  if (primaryId === secondaryId) {
    res.status(400).json({ error: "Cannot merge a profile with itself" }); return;
  }

  // Verify both records belong to this merchant
  const [primary] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, primaryId),   eq(customersTable.merchantId, merchantId))).limit(1);
  const [secondary] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, secondaryId), eq(customersTable.merchantId, merchantId))).limit(1);

  if (!primary || !secondary) {
    res.status(404).json({ error: "One or both customer profiles not found" }); return;
  }

  await db.transaction(async (tx) => {
    // ── 1. Cascade all customer_id FKs to the primary record ──────────────
    await tx.update(transactionsTable)
      .set({ customerId: primaryId })
      .where(and(eq(transactionsTable.customerId, secondaryId), eq(transactionsTable.merchantId, merchantId)));

    await tx.update(invoicesTable)
      .set({ customerId: primaryId })
      .where(and(eq(invoicesTable.customerId, secondaryId), eq(invoicesTable.merchantId, merchantId)));

    await tx.update(serviceJobsTable)
      .set({ customerId: primaryId })
      .where(and(eq(serviceJobsTable.customerId, secondaryId), eq(serviceJobsTable.merchantId, merchantId)));

    await tx.update(appointmentsTable)
      .set({ customerId: primaryId })
      .where(and(eq(appointmentsTable.customerId, secondaryId), eq(appointmentsTable.merchantId, merchantId)));

    await tx.update(laybysTable)
      .set({ customerId: primaryId })
      .where(and(eq(laybysTable.customerId, secondaryId), eq(laybysTable.merchantId, merchantId)));

    await tx.update(parkedSalesTable)
      .set({ customerId: primaryId })
      .where(and(eq(parkedSalesTable.customerId, secondaryId), eq(parkedSalesTable.merchantId, merchantId)));

    await tx.update(customerNotesTable)
      .set({ customerId: primaryId })
      .where(and(eq(customerNotesTable.customerId, secondaryId), eq(customerNotesTable.merchantId, merchantId)));

    await tx.update(customerFilesTable)
      .set({ customerId: primaryId })
      .where(and(eq(customerFilesTable.customerId, secondaryId), eq(customerFilesTable.merchantId, merchantId)));

    await tx.update(formSubmissionsTable)
      .set({ customerId: primaryId })
      .where(and(eq(formSubmissionsTable.customerId, secondaryId), eq(formSubmissionsTable.merchantId, merchantId)));

    await tx.update(marketingAutomationLogTable)
      .set({ customerId: primaryId })
      .where(and(eq(marketingAutomationLogTable.customerId, secondaryId), eq(marketingAutomationLogTable.merchantId, merchantId)));

    // ── 2. Aggregate loyalty balances and stats ────────────────────────────
    const combinedPoints = (primary.loyaltyPoints ?? 0) + (secondary.loyaltyPoints ?? 0);
    const combinedSpent  = parseFloat(primary.totalSpent)  + parseFloat(secondary.totalSpent);
    const combinedVisits = (primary.visitCount ?? 0)       + (secondary.visitCount ?? 0);

    await tx.update(customersTable)
      .set({
        loyaltyPoints: combinedPoints,
        totalSpent:    combinedSpent.toFixed(2),
        visitCount:    combinedVisits,
        updatedAt:     new Date(),
      })
      .where(eq(customersTable.id, primaryId));

    // ── 3. Append permanent merge audit note ──────────────────────────────
    const mergeDate = new Date().toLocaleDateString("en-AU", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
    const secName = [secondary.firstName, secondary.lastName].filter(Boolean).join(" ") || `ID ${secondaryId}`;
    const auditNote = [
      `[System] Profile merged on ${mergeDate}.`,
      `Absorbed Profile ID: ${secondaryId} (${secName}).`,
      `Loyalty consolidated: +${secondary.loyaltyPoints ?? 0} pts, +$${parseFloat(secondary.totalSpent).toFixed(2)} total spent, +${secondary.visitCount ?? 0} visits.`,
    ].join(" ");

    await tx.insert(customerNotesTable).values({
      merchantId,
      customerId:     primaryId,
      note:           auditNote,
      popupOnBooking: false,
      popupOnSale:    false,
    });

    // ── 4. Permanently delete the secondary record ─────────────────────────
    await tx.delete(customersTable)
      .where(and(eq(customersTable.id, secondaryId), eq(customersTable.merchantId, merchantId)));
  });

  // Return the updated primary
  const [updated] = await db.select().from(customersTable)
    .where(eq(customersTable.id, primaryId)).limit(1);

  res.json(formatCustomer(updated));
});

export default router;
