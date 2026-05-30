import { Router, type IRouter } from "express";
import {
  db,
  customersTable, customerNotesTable, customerFilesTable,
  transactionsTable, appointmentsTable, serviceJobsTable,
  laybysTable, invoicesTable, parkedSalesTable,
  formSubmissionsTable, marketingAutomationLogTable,
  emailCampaignsTable, productPreOrdersTable, productReturnAuthsTable,
  merchantsTable, staffTable,
} from "@workspace/db";
import { eq, and, ilike, or, sql, desc, isNull, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import multer from "multer";
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
import { parseCsvBuffer, normaliseHeaders } from "../lib/parseCsv";

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
    heardFrom: c.heardFrom ?? null,
    heardFromDetails: c.heardFromDetails ?? null,
    referredByCustomerId: c.referredByCustomerId ?? null,
  };
}

/* ── CRUD ──────────────────────────────────────────────────────────────────── */

router.get("/customers", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListCustomersQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }
  const { search, heardFrom, limit = 50, offset = 0 } = queryParams.data;
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
  if (heardFrom) {
    conditions.push(eq(customersTable.heardFrom, heardFrom));
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
    heardFrom: parsed.data.heardFrom ?? null,
    heardFromDetails: parsed.data.heardFromDetails ?? null,
    referredByCustomerId: parsed.data.referredByCustomerId ?? null,
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

/* ── CSV Import ──────────────────────────────────────────────────────────────── */

const CUSTOMER_HEADER_MAP: Record<string, string> = {
  first_name: "firstName",  firstname: "firstName",
  last_name:  "lastName",   lastname:  "lastName",
  email: "email",           email_address: "email",
  phone: "phone",           phone_number: "phone",  mobile: "phone",
  address: "address",       billing_address: "address",
  loyalty_points: "loyaltyPoints", loyaltypoints: "loyaltyPoints", points: "loyaltyPoints",
  group: "customerGroup",   customer_group: "customerGroup",  customergroup: "customerGroup",
  notes: "notes",           note: "notes",  comments: "notes",
};

const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post("/customers/import", requireAuth, uploadMemory.single("file"), async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  if (!req.file) {
    res.status(400).json({ error: "No CSV file uploaded (field name: file)" }); return;
  }

  // ── Parse CSV server-side ──────────────────────────────────────────────────
  let rawRows: Record<string, string>[];
  try {
    const parsed = parseCsvBuffer(req.file.buffer);
    if (parsed.length === 0) { res.status(400).json({ error: "CSV file is empty or has no data rows" }); return; }
    // Normalise header keys to camelCase using the header map
    const firstKeys = Object.keys(parsed[0]);
    const normKeys  = normaliseHeaders(firstKeys, CUSTOMER_HEADER_MAP);
    rawRows = parsed.map((row) => {
      const out: Record<string, string> = {};
      firstKeys.forEach((k, i) => { out[normKeys[i]] = row[k] ?? ""; });
      return out;
    });
  } catch (err) {
    req.log.error({ err }, "Customer CSV parse failed");
    res.status(400).json({ error: "Failed to parse CSV file" }); return;
  }

  // ── Load existing emails for deduplication ─────────────────────────────────
  const existingEmailRows = await db
    .select({ email: customersTable.email })
    .from(customersTable)
    .where(eq(customersTable.merchantId, merchantId));
  const existingEmails = new Set(
    existingEmailRows.map((r) => r.email?.toLowerCase().trim()).filter(Boolean) as string[],
  );

  // ── Validate & build insert set ────────────────────────────────────────────
  const errors: { row: number; message: string }[] = [];
  const seenEmails = new Set<string>(); // within-file duplicate tracking

  type InsertRow = {
    rowNum: number;
    firstName: string | null; lastName: string | null; email: string | null;
    phone: string | null; address: string | null; notes: string | null;
    customerGroup: string; loyaltyPoints: number;
  };
  const toInsert: InsertRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row       = rawRows[i];
    const rowNum    = i + 1;
    const firstName = (row.firstName ?? "").trim();
    const lastName  = (row.lastName  ?? "").trim();
    const email     = (row.email     ?? "").trim().toLowerCase();
    const phone     = (row.phone     ?? "").trim();
    const address   = (row.address   ?? "").trim();
    const notes     = (row.notes     ?? "").trim();
    const customerGroup = (row.customerGroup ?? "Standard").trim() || "Standard";
    const loyaltyPoints = Math.max(0, parseInt(row.loyaltyPoints ?? "0") || 0);

    if (!firstName && !lastName && !email && !phone) {
      errors.push({ row: rowNum, message: "At least one of first name, last name, email, or phone is required" });
      continue;
    }
    if (email && existingEmails.has(email)) {
      errors.push({ row: rowNum, message: `Email already exists: ${email}` });
      continue;
    }
    if (email && seenEmails.has(email)) {
      errors.push({ row: rowNum, message: `Duplicate email in file: ${email}` });
      continue;
    }
    if (email) seenEmails.add(email);

    toInsert.push({ rowNum, firstName: firstName || null, lastName: lastName || null,
      email: email || null, phone: phone || null, address: address || null,
      notes: notes || null, customerGroup, loyaltyPoints });
    if (email) existingEmails.add(email); // prevent later rows in same file from matching
  }

  if (toInsert.length === 0) {
    res.json({ imported: 0, skipped: rawRows.length, errors }); return;
  }

  // ── Generate referral codes, then bulk insert ──────────────────────────────
  const usedCodes = new Set<string>();
  const insertValues: (typeof customersTable.$inferInsert)[] = [];

  for (const r of toInsert) {
    let code: string;
    for (let attempt = 0; attempt < 15; attempt++) {
      code = generateReferralCode(r.firstName, r.lastName);
      const alreadyInDb = await db.select({ id: customersTable.id }).from(customersTable)
        .where(and(eq(customersTable.merchantId, merchantId), eq(customersTable.referralCode, code)))
        .limit(1);
      if (alreadyInDb.length === 0 && !usedCodes.has(code)) { usedCodes.add(code); break; }
    }
    code! ??= `KOA${crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 5)}`;
    insertValues.push({
      merchantId,
      firstName:    r.firstName,
      lastName:     r.lastName,
      email:        r.email,
      phone:        r.phone,
      address:      r.address,
      notes:        r.notes,
      customerGroup: r.customerGroup,
      loyaltyPoints: r.loyaltyPoints,
      portalToken:  crypto.randomUUID(),
      referralCode: code!,
    });
  }

  let imported = 0;
  const skipped = rawRows.length - toInsert.length;

  try {
    await db.insert(customersTable).values(insertValues);
    imported = insertValues.length;
  } catch (err) {
    req.log.error({ err }, "Customer CSV bulk insert failed");
    res.status(500).json({ error: "Database error during bulk insert" }); return;
  }

  res.json({ imported, skipped, errors });
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
    subtotal: parseFloat(t.subtotal),
    taxTotal: parseFloat(t.taxTotal),
    discountTotal: parseFloat(t.discountTotal),
    total: parseFloat(t.total),
    paymentMethod: t.paymentMethod,
    notes: t.notes ?? null,
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

/* ─── Shared merge helper ─────────────────────────────────────────────────── */

async function executeMergePair(
  merchantId: number,
  primaryId: number,
  secondaryId: number,
  mergedByName: string,
  reason?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [primary] = await tx.select().from(customersTable)
      .where(and(eq(customersTable.id, primaryId), eq(customersTable.merchantId, merchantId))).limit(1);
    const [secondary] = await tx.select().from(customersTable)
      .where(and(eq(customersTable.id, secondaryId), eq(customersTable.merchantId, merchantId))).limit(1);

    if (!primary || !secondary) throw new Error(`Customer record not found: ${primaryId} or ${secondaryId}`);

    // Step A: Ledger entries
    await tx.update(transactionsTable).set({ customerId: primaryId })
      .where(and(eq(transactionsTable.customerId, secondaryId), eq(transactionsTable.merchantId, merchantId)));
    await tx.update(invoicesTable).set({ customerId: primaryId })
      .where(and(eq(invoicesTable.customerId, secondaryId), eq(invoicesTable.merchantId, merchantId)));
    await tx.update(laybysTable).set({ customerId: primaryId })
      .where(and(eq(laybysTable.customerId, secondaryId), eq(laybysTable.merchantId, merchantId)));
    await tx.update(parkedSalesTable).set({ customerId: primaryId })
      .where(and(eq(parkedSalesTable.customerId, secondaryId), eq(parkedSalesTable.merchantId, merchantId)));
    await tx.update(productPreOrdersTable).set({ customerId: primaryId })
      .where(eq(productPreOrdersTable.customerId, secondaryId));
    await tx.update(productReturnAuthsTable).set({ customerId: primaryId })
      .where(eq(productReturnAuthsTable.customerId, secondaryId));

    // Step B: Service / intake / attachments / forms
    await tx.update(serviceJobsTable).set({ customerId: primaryId })
      .where(and(eq(serviceJobsTable.customerId, secondaryId), eq(serviceJobsTable.merchantId, merchantId)));
    await tx.update(customerFilesTable).set({ customerId: primaryId })
      .where(and(eq(customerFilesTable.customerId, secondaryId), eq(customerFilesTable.merchantId, merchantId)));
    await tx.update(formSubmissionsTable).set({ customerId: primaryId })
      .where(and(eq(formSubmissionsTable.customerId, secondaryId), eq(formSubmissionsTable.merchantId, merchantId)));
    await tx.update(marketingAutomationLogTable).set({ customerId: primaryId })
      .where(and(eq(marketingAutomationLogTable.customerId, secondaryId), eq(marketingAutomationLogTable.merchantId, merchantId)));
    await tx.update(emailCampaignsTable).set({ customerId: primaryId })
      .where(eq(emailCampaignsTable.customerId, secondaryId));

    // Step C: Calendar
    await tx.update(appointmentsTable).set({ customerId: primaryId })
      .where(and(eq(appointmentsTable.customerId, secondaryId), eq(appointmentsTable.merchantId, merchantId)));

    // Step D: Aggregate loyalty + audit note
    const combinedPoints = (primary.loyaltyPoints ?? 0) + (secondary.loyaltyPoints ?? 0);
    const combinedSpent  = parseFloat(primary.totalSpent)  + parseFloat(secondary.totalSpent);
    const combinedVisits = (primary.visitCount  ?? 0)      + (secondary.visitCount  ?? 0);

    await tx.update(customersTable)
      .set({ loyaltyPoints: combinedPoints, totalSpent: combinedSpent.toFixed(2), visitCount: combinedVisits, updatedAt: new Date() })
      .where(eq(customersTable.id, primaryId));

    const mergeDate = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
    const secName   = [secondary.firstName, secondary.lastName].filter(Boolean).join(" ") || `ID ${secondaryId}`;
    const auditParts = [
      `[System] Profile merged on ${mergeDate}.`,
      `Absorbed: ${secName} (ID ${secondaryId}).`,
      `Loyalty consolidated: +${secondary.loyaltyPoints ?? 0} pts, +$${parseFloat(secondary.totalSpent).toFixed(2)} spent, +${secondary.visitCount ?? 0} visits.`,
      `New totals: ${combinedPoints} pts, $${combinedSpent.toFixed(2)} spent, ${combinedVisits} visits.`,
      `Merged by: ${mergedByName}.`,
    ];
    if (reason) auditParts.push(`Reason: ${reason}`);

    await tx.insert(customerNotesTable).values({
      merchantId, customerId: primaryId, note: auditParts.join(" "), popupOnBooking: false, popupOnSale: false,
    });
    await tx.update(customerNotesTable).set({ customerId: primaryId })
      .where(and(eq(customerNotesTable.customerId, secondaryId), eq(customerNotesTable.merchantId, merchantId)));

    await tx.delete(customersTable)
      .where(and(eq(customersTable.id, secondaryId), eq(customersTable.merchantId, merchantId)));
  });
}

async function resolveMergedByName(merchantId: number, staffId: number | undefined): Promise<string> {
  const [merchant] = await db.select({ ownerName: merchantsTable.ownerName })
    .from(merchantsTable).where(eq(merchantsTable.id, merchantId)).limit(1);
  let name = merchant?.ownerName?.trim() || "Unknown";
  if (staffId) {
    const [sm] = await db.select({ name: staffTable.name })
      .from(staffTable)
      .where(and(eq(staffTable.id, staffId), eq(staffTable.merchantId, merchantId)))
      .limit(1);
    if (sm?.name) name = sm.name;
  }
  return name;
}

/* ─── Merge two profiles (single) ────────────────────────────────────────── */

router.post("/customers/:primaryId/merge/:secondaryId", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId  = req.session.merchantId!;
  const primaryId   = parseInt(String(req.params.primaryId),   10);
  const secondaryId = parseInt(String(req.params.secondaryId), 10);

  if (isNaN(primaryId) || isNaN(secondaryId)) { res.status(400).json({ error: "Invalid customer ID" }); return; }
  if (primaryId === secondaryId) { res.status(400).json({ error: "Cannot merge a profile with itself" }); return; }

  const [primary] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, primaryId), eq(customersTable.merchantId, merchantId))).limit(1);
  const [secondary] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, secondaryId), eq(customersTable.merchantId, merchantId))).limit(1);
  if (!primary || !secondary) { res.status(404).json({ error: "One or both customer profiles not found" }); return; }

  const mergedByName = await resolveMergedByName(merchantId, req.session.staffId ?? undefined);
  const reason = typeof req.body?.reason === "string" && req.body.reason.trim() ? req.body.reason.trim() : undefined;

  try {
    await executeMergePair(merchantId, primaryId, secondaryId, mergedByName, reason);
  } catch (err) {
    req.log.error({ err, primaryId, secondaryId, merchantId }, "Customer merge failed — rolled back");
    res.status(500).json({ error: "Merge failed: transaction rolled back. No data was modified.", detail: err instanceof Error ? err.message : String(err) });
    return;
  }

  const [updated] = await db.select().from(customersTable).where(eq(customersTable.id, primaryId)).limit(1);
  res.json(formatCustomer(updated));
});

/* ─── Bulk duplicate detection ───────────────────────────────────────────── */

router.post("/customers/bulk-merge-preview", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  const allCustomers = await db.select().from(customersTable)
    .where(eq(customersTable.merchantId, merchantId));

  const phoneDups = await db
    .select({ phone: customersTable.phone, ids: sql<number[]>`array_agg(${customersTable.id}::int)` })
    .from(customersTable)
    .where(and(eq(customersTable.merchantId, merchantId), sql`${customersTable.phone} IS NOT NULL AND ${customersTable.phone} != ''`))
    .groupBy(customersTable.phone)
    .having(sql`count(*) > 1`);

  const nameDups = await db
    .select({
      firstName: customersTable.firstName,
      lastName:  customersTable.lastName,
      ids:       sql<number[]>`array_agg(${customersTable.id}::int)`,
    })
    .from(customersTable)
    .where(and(
      eq(customersTable.merchantId, merchantId),
      sql`${customersTable.firstName} IS NOT NULL AND ${customersTable.firstName} != ''`,
      sql`${customersTable.lastName}  IS NOT NULL AND ${customersTable.lastName}  != ''`,
    ))
    .groupBy(customersTable.firstName, customersTable.lastName)
    .having(sql`count(*) > 1`);

  const customerMap = new Map(allCustomers.map(c => [c.id, c]));
  const bucketMap   = new Map<string, { ids: number[]; matchType: "phone" | "name" | "both" }>();

  for (const { ids } of phoneDups) {
    const key = [...ids].sort((a, b) => a - b).join(",");
    bucketMap.set(key, { ids, matchType: "phone" });
  }
  for (const { ids } of nameDups) {
    const key = [...ids].sort((a, b) => a - b).join(",");
    if (bucketMap.has(key)) bucketMap.get(key)!.matchType = "both";
    else                    bucketMap.set(key, { ids, matchType: "name" });
  }

  const allBucketIds = [...new Set([...bucketMap.values()].flatMap(b => b.ids))];
  const txTotals = allBucketIds.length > 0
    ? await db.select({
        customerId: transactionsTable.customerId,
        totalSpent: sql<number>`COALESCE(SUM(${transactionsTable.total}::numeric), 0)::float`,
        txCount:    sql<number>`count(*)::int`,
      })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.merchantId, merchantId), inArray(transactionsTable.customerId, allBucketIds)))
      .groupBy(transactionsTable.customerId)
    : [];

  const txByCustomer = new Map(txTotals.map(t => [t.customerId, t]));

  const buckets = [...bucketMap.entries()].map(([bucketKey, { ids, matchType }]) => {
    const customers  = ids.map(id => customerMap.get(id)).filter(Boolean) as typeof allCustomers;
    const totalSpent = ids.reduce((s, id) => s + (txByCustomer.get(id)?.totalSpent ?? 0), 0);
    const totalTx    = ids.reduce((s, id) => s + (txByCustomer.get(id)?.txCount    ?? 0), 0);

    const suggestedPrimary = customers.reduce((best, c) => {
      const cTx = txByCustomer.get(c.id)?.txCount    ?? 0;
      const bTx = txByCustomer.get(best.id)?.txCount  ?? 0;
      const cSp = txByCustomer.get(c.id)?.totalSpent  ?? 0;
      const bSp = txByCustomer.get(best.id)?.totalSpent ?? 0;
      if (cTx > bTx)                          return c;
      if (cTx === bTx && cSp > bSp)           return c;
      if (cSp === bSp && c.createdAt < best.createdAt) return c;
      return best;
    });

    return {
      bucketKey,
      matchType,
      customers:          customers.map(formatCustomer),
      totalTransactions:  totalTx,
      totalSpent,
      suggestedPrimaryId: suggestedPrimary.id,
    };
  });

  res.json({ buckets, scannedTotal: allCustomers.length });
});

/* ─── Bulk execute merge ─────────────────────────────────────────────────── */

router.post("/customers/bulk-execute-merge", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body       = req.body as { clusters?: unknown };
  const clusters   = Array.isArray(body?.clusters)
    ? (body.clusters as { primaryId: unknown; secondaryIds: unknown[] }[])
    : [];

  if (clusters.length === 0) { res.status(400).json({ error: "No clusters provided" }); return; }

  const mergedByName = await resolveMergedByName(merchantId, req.session.staffId ?? undefined);

  const results: { primaryId: number; success: boolean; merged: number; error?: string }[] = [];
  let succeeded = 0;
  let failed    = 0;

  for (const cluster of clusters) {
    const primaryId    = parseInt(String(cluster.primaryId), 10);
    const secondaryIds = (Array.isArray(cluster.secondaryIds) ? cluster.secondaryIds : [])
      .map(id => parseInt(String(id), 10))
      .filter(id => !isNaN(id) && id !== primaryId);

    if (isNaN(primaryId) || secondaryIds.length === 0) {
      results.push({ primaryId: Number(cluster.primaryId) || 0, success: false, merged: 0, error: "Invalid cluster data" });
      failed++; continue;
    }

    let mergedCount = 0;
    try {
      for (const secondaryId of secondaryIds) {
        await executeMergePair(merchantId, primaryId, secondaryId, mergedByName);
        mergedCount++;
      }
      results.push({ primaryId, success: true, merged: mergedCount });
      succeeded++;
    } catch (err) {
      req.log.error({ err, primaryId, merchantId }, "Bulk merge cluster failed — rolled back");
      results.push({ primaryId, success: false, merged: mergedCount, error: err instanceof Error ? err.message : String(err) });
      failed++;
    }
  }

  res.json({ processed: clusters.length, succeeded, failed, results });
});

export default router;
