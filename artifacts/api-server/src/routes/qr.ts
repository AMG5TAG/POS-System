import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, qrCodesTable, qrSettingsTable, qrSavedTemplatesTable, productsTable, customersTable, serviceJobsTable, merchantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { stripManagedFields } from "../lib/settings-body";
import { registerProductQrsBatch, registerCustomerQrsBatch } from "../services/entityQr";
import { recordMarketingEvent } from "../lib/marketingEvents";
import { publicOrigin, customerPortalUrl, techAppJobUrl } from "../lib/publicUrl";

const router: IRouter = Router();

/* /qr/j/:jobId takes a sequential id and, for a completed job, answers with the
   customer's account link — so unthrottled it could be walked to harvest them.
   A sticker is scanned a handful of times; this leaves staff scanning a pile
   of stickers plenty of room. */
const LOCALHOST = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const jobQrLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Too many scans from this connection — please try again shortly.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  skip: (req) => LOCALHOST.has(req.ip ?? ""),
});

// Public, unauthenticated dynamic-QR redirect. A "trackable" QR encodes
// /api/qr/r/:id instead of its raw destination, so each scan hits us first —
// we log a scan event (device / geo / referrer) then 302 to the real URL. This
// is the only way to measure QR scans: a QR pointing straight at an external URL
// never touches our server.
router.get("/qr/r/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(id)) { res.redirect(302, publicOrigin()); return; }
  const [row] = await db.select().from(qrCodesTable).where(eq(qrCodesTable.id, id)).limit(1);
  if (!row) { res.status(404).type("text/plain").send("QR code not found"); return; }
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    res.status(410).type("text/plain").send("This QR code has expired"); return;
  }
  recordMarketingEvent(req, { merchantId: row.merchantId, kind: "qr", targetId: row.id, targetSlug: row.label });
  const dest = (row.url || "").trim() || publicOrigin();
  res.redirect(302, dest);
});

/**
 * Public, unauthenticated service-job QR resolver.
 *
 * A service sticker is printed once and then lives on the device, so the ink
 * cannot be re-encoded when the job moves on. The sticker therefore carries THIS
 * url — stable for the life of the job — and the destination is decided at scan
 * time:
 *
 *   job not completed  → the Tech App deep link (staff finish the work)
 *   job completed      → the customer's shop account (customerPortalUrl; they track/collect it there)
 *
 * A completed job whose customer has no portal token (or a merchant with no
 * portal address) falls back to the Tech App rather than dead-ending: a sticker
 * that opens nothing is worse than one that opens the staff view.
 *
 * Whoever scans the sticker reaches the account *link*, not the account: the
 * token only says whose account it is, and the customer signs in with their
 * shop password or is asked to set one up (POST /shop/auth/token).
 */
router.get("/qr/j/:jobId", jobQrLimiter, async (req, res): Promise<void> => {
  const jobId = parseInt(String(req.params.jobId ?? ""), 10);
  if (isNaN(jobId)) { res.redirect(302, publicOrigin(req)); return; }

  const [job] = await db
    .select({ id: serviceJobsTable.id, merchantId: serviceJobsTable.merchantId,
              status: serviceJobsTable.status, customerId: serviceJobsTable.customerId })
    .from(serviceJobsTable).where(eq(serviceJobsTable.id, jobId)).limit(1);
  if (!job) { res.status(404).type("text/plain").send("Service job not found"); return; }

  const [merchant] = await db
    .select({ username: merchantsTable.username, portalDomain: merchantsTable.portalDomain })
    .from(merchantsTable).where(eq(merchantsTable.id, job.merchantId)).limit(1);

  if (job.status === "completed" && job.customerId != null) {
    const [customer] = await db
      .select({ portalToken: customersTable.portalToken })
      .from(customersTable)
      .where(and(eq(customersTable.id, job.customerId), eq(customersTable.merchantId, job.merchantId)))
      .limit(1);
    const portalUrl = customerPortalUrl(merchant, customer?.portalToken, req);
    if (portalUrl) { res.redirect(302, portalUrl); return; }
  }

  res.redirect(302, techAppJobUrl(merchant?.username, job.id, req));
});

// POST /qr-codes/backfill — persist a trackable QR for every existing product
// and customer (idempotent; safe to re-run). Service-job QRs are not backfilled
// since they expire 30 days after creation.
router.post("/qr-codes/backfill", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const products = await db.select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable).where(eq(productsTable.merchantId, merchantId));
  const customers = await db.select({ id: customersTable.id, firstName: customersTable.firstName, lastName: customersTable.lastName })
    .from(customersTable).where(eq(customersTable.merchantId, merchantId));
  await registerProductQrsBatch(merchantId, products);
  await registerCustomerQrsBatch(merchantId, customers.map((c) => ({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" ") })));
  res.json({ products: products.length, customers: customers.length });
});

router.get("/qr-codes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(qrCodesTable).where(eq(qrCodesTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/qr-codes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { entryId, label, url = "", qrType = "website", content = "{}", settings = "{}" } = req.body;
  if (!entryId || !label) { res.status(400).json({ error: "entryId and label are required" }); return; }
  // Idempotent on (merchantId, entryId, qrType): re-saving the same QR updates
  // it in place rather than creating a duplicate.
  const [row] = await db.insert(qrCodesTable)
    .values({ merchantId, entryId, label, url, qrType, content, settings })
    .onConflictDoUpdate({
      target: [qrCodesTable.merchantId, qrCodesTable.entryId, qrCodesTable.qrType],
      set: { label, url, content, settings },
    })
    .returning();
  res.status(201).json(row);
});

router.get("/qr-codes/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(qrCodesTable).where(and(eq(qrCodesTable.id, id), eq(qrCodesTable.merchantId, merchantId))).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/qr-codes/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { label, url, qrType, content, settings } = req.body as Partial<{ label: string; url: string; qrType: string; content: string; settings: string }>;
  const update: Partial<{ label: string; url: string; qrType: string; content: string; settings: string }> = {};
  if (label !== undefined) update.label = label;
  if (url !== undefined) update.url = url;
  if (qrType !== undefined) update.qrType = qrType;
  if (content !== undefined) update.content = content;
  if (settings !== undefined) update.settings = settings;
  const [row] = await db.update(qrCodesTable).set(update).where(and(eq(qrCodesTable.id, id), eq(qrCodesTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/qr-codes/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(qrCodesTable).where(and(eq(qrCodesTable.id, id), eq(qrCodesTable.merchantId, merchantId)));
  res.status(204).end();
});

router.get("/qr-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(qrSettingsTable).where(eq(qrSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(qrSettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/qr-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = stripManagedFields(req.body ?? {}) as Partial<typeof qrSettingsTable.$inferInsert>;
  const [existing] = await db.select().from(qrSettingsTable).where(eq(qrSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(qrSettingsTable).set(body).where(eq(qrSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(qrSettingsTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

router.get("/qr-saved-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(qrSavedTemplatesTable).where(eq(qrSavedTemplatesTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/qr-saved-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { templateId, name, settings = "{}" } = req.body;
  if (!templateId || !name) { res.status(400).json({ error: "templateId and name are required" }); return; }
  const [row] = await db.insert(qrSavedTemplatesTable).values({ merchantId, templateId, name, settings }).returning();
  res.status(201).json(row);
});

router.get("/qr-saved-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(qrSavedTemplatesTable).where(and(eq(qrSavedTemplatesTable.id, id), eq(qrSavedTemplatesTable.merchantId, merchantId))).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/qr-saved-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, settings } = req.body as Partial<{ name: string; settings: string }>;
  const update: Partial<{ name: string; settings: string }> = {};
  if (name !== undefined) update.name = name;
  if (settings !== undefined) update.settings = settings;
  const [row] = await db.update(qrSavedTemplatesTable).set(update).where(and(eq(qrSavedTemplatesTable.id, id), eq(qrSavedTemplatesTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/qr-saved-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(qrSavedTemplatesTable).where(and(eq(qrSavedTemplatesTable.id, id), eq(qrSavedTemplatesTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
