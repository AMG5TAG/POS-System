import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, productsTable, productVariantsTable, productTypesTable, categoriesTable, brandsTable, merchantsTable, businessProfileTable, customersTable, customerPortalTokensTable } from "@workspace/db";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "node:crypto";
import { hashPassword, verifyPassword } from "../lib/auth";
import { soleMerchantId } from "../lib/sole-merchant";
import { normalisePhoneFor } from "../lib/phone";
import { hashToken, issueSetupLink } from "../lib/customerPasswordLinks";
import { triggerInstantSync } from "../services/autoSyncScheduler";

/**
 * The online shop's API (shop.koastal.com.au) — public, no staff session.
 *
 * The shop is a second front end on the SAME database as the POS, so nothing is
 * synced: a product's price and stock, a customer and their account are the
 * POS's own rows. Everything here is scoped to the one business this install
 * runs (soleMerchantId); nothing in a request can name another merchant.
 *
 * Catalogue: a product is listed when it is active AND show_online is on.
 * Only whether an item is in stock is revealed, never the count.
 *
 * Accounts: a customer has one account for the shop and the portal — the
 * password is customers.portal_password_hash and a signed-in shopper is
 * `req.session.portalCustomerId`. Two rules keep accounts safe:
 *   - login is by email + password; one email can belong to several POS
 *     customers (duplicates), so each candidate's password is tried;
 *   - registering with an email the POS already knows never sets a password
 *     directly — it emails a set-password link to that address instead, so
 *     knowing someone's email is never enough to take over their account.
 */

const router: IRouter = Router();

const LOCALHOST = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const ipLimiter = (windowMs: number, max: number, message: string, failuresOnly = false) =>
  rateLimit({
    windowMs, max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: failuresOnly,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
    skip: (req) => LOCALHOST.has(req.ip ?? ""),
  });

const loginLimiter = ipLimiter(15 * 60 * 1000, 20, "Too many sign-in attempts — please try again in 15 minutes.", true);
const linkLimiter = ipLimiter(60 * 60 * 1000, 10, "Too many requests — please try again later.");
const registerLimiter = ipLimiter(60 * 60 * 1000, 10, "Too many sign-ups from this connection — please try again later.");

async function merchantOr404(res: import("express").Response): Promise<number | null> {
  const id = await soleMerchantId();
  if (id == null) { res.status(404).json({ error: "Shop not found" }); return null; }
  return id;
}

const bool = (v: string | null | undefined) => v === "true";
const money = (v: string | null | undefined) => (v == null ? null : parseFloat(v));

/* ── Business ─────────────────────────────────────────────────────────── */

router.get("/shop/info", async (_req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const [m] = await db
    .select({ businessName: merchantsTable.businessName, logoUrl: merchantsTable.logoUrl, phone: merchantsTable.phone, address: merchantsTable.address, city: merchantsTable.city, email: merchantsTable.email })
    .from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const [p] = await db.select().from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId)).limit(1);
  const json = <T,>(s: string | undefined, fallback: T): T => { try { return s ? JSON.parse(s) as T : fallback; } catch { return fallback; } };
  res.json({
    businessName: m?.businessName ?? "",
    logoUrl: p?.logo || m?.logoUrl || null,
    tagline: p?.tagline ?? "",
    description: p?.description ?? "",
    phone: m?.phone ?? null,
    email: p?.contactEmail || null,
    address: [m?.address, m?.city, p?.state, p?.postcode].filter(Boolean).join(", ") || null,
    abn: p?.abn || null,
    openingHours: json<Record<string, unknown>>(p?.openingHours, {}),
    socialLinks: json<Record<string, string>>(p?.socialLinks, {}),
  });
});

/* The shop's favicon is the business logo (Settings › Business Details), so it
   follows the logo rather than carrying a copy of it. The logo is usually stored
   as a data: URL, which a <link rel="icon"> in static HTML can't name — so it is
   decoded and served as an image here. Raster types only: an SVG served from
   this origin could carry script. */
const FAVICON_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon", "image/vnd.microsoft.icon"]);

router.get("/shop/favicon", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const [m] = await db.select({ logoUrl: merchantsTable.logoUrl }).from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const [p] = await db.select({ logo: businessProfileTable.logo }).from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId)).limit(1);
  const logo = (p?.logo || m?.logoUrl || "").trim();

  const data = /^data:([\w/.+-]+);base64,(.+)$/s.exec(logo);
  if (data && FAVICON_TYPES.has(data[1]!.toLowerCase())) {
    const body = Buffer.from(data[2]!, "base64");
    const etag = `"${crypto.createHash("sha1").update(body).digest("base64url")}"`;
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }
    res.type(data[1]!).send(body);
    return;
  }
  if (/^https?:\/\//i.test(logo)) {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.redirect(302, logo);
    return;
  }
  res.status(404).json({ error: "No logo" });
});

/* ── Catalogue ────────────────────────────────────────────────────────── */

const visible = (merchantId: number): SQL =>
  and(eq(productsTable.merchantId, merchantId), eq(productsTable.isActive, "true"), eq(productsTable.showOnline, "true"))!;

router.get("/shop/categories", async (_req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const counts = await db
    .select({ categoryId: productsTable.categoryId, n: sql<number>`count(*)::int` })
    .from(productsTable).where(visible(merchantId)).groupBy(productsTable.categoryId);
  const countBy = new Map(counts.map((c) => [c.categoryId, c.n]));
  const cats = await db.select().from(categoriesTable)
    .where(eq(categoriesTable.merchantId, merchantId))
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));
  // A parent is listed when it or any child has products on the shop.
  const total = (id: number): number =>
    (countBy.get(id) ?? 0) + cats.filter((c) => c.parentId === id).reduce((s, c) => s + total(c.id), 0);
  res.json(cats
    .map((c) => ({ id: c.id, name: c.name, parentId: c.parentId ?? null, color: c.color ?? null, productCount: total(c.id) }))
    .filter((c) => c.productCount > 0));
});

const ListQuery = z.object({
  category: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(["name", "price-asc", "price-desc", "newest"]).default("name"),
  inStock: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

/* Services and anything whose product type doesn't track stock are always
   available — a repair or a website build has no stock count to run out of. */
function inStockOf(p: { trackInventory: string; stockQuantity: number; typeTracksStock?: boolean | null }): boolean {
  return p.typeTracksStock === false || p.trackInventory !== "true" || p.stockQuantity > 0;
}

router.get("/shop/products", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const q = ListQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { category, search, sort, inStock, page, pageSize } = q.data;

  const conds: SQL[] = [visible(merchantId)];
  if (category) {
    // Include the category's children, so a parent category lists everything under it.
    const kids = await db.select({ id: categoriesTable.id }).from(categoriesTable)
      .where(and(eq(categoriesTable.merchantId, merchantId), eq(categoriesTable.parentId, category)));
    conds.push(inArray(productsTable.categoryId, [category, ...kids.map((k) => k.id)]));
  }
  if (search) {
    const like = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(productsTable.name, like), ilike(productsTable.sku, like), ilike(productsTable.description, like))!);
  }
  if (inStock === "true") conds.push(sql`(${productTypesTable.trackStock} = false OR ${productsTable.trackInventory} <> 'true' OR ${productsTable.stockQuantity} > 0)`);

  const order = sort === "price-asc" ? [asc(productsTable.price)]
    : sort === "price-desc" ? [desc(productsTable.price)]
    : sort === "newest" ? [desc(productsTable.createdAt)]
    : [asc(productsTable.name)];

  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(productsTable)
    .leftJoin(productTypesTable, eq(productTypesTable.id, productsTable.productTypeId)).where(where);
  const rows = await db
    .select({
      id: productsTable.id, name: productsTable.name, price: productsTable.price, imageUrl: productsTable.imageUrl,
      categoryId: productsTable.categoryId, brandName: brandsTable.name,
      trackInventory: productsTable.trackInventory, stockQuantity: productsTable.stockQuantity,
      isRefurbished: productsTable.isRefurbished, typeTracksStock: productTypesTable.trackStock,
      isService: productTypesTable.isService,
    })
    .from(productsTable)
    .leftJoin(brandsTable, eq(brandsTable.id, productsTable.brandId))
    .leftJoin(productTypesTable, eq(productTypesTable.id, productsTable.productTypeId))
    .where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize);

  res.json({
    total, page, pageSize,
    items: rows.map((p) => ({
      id: p.id, name: p.name, price: money(p.price) ?? 0, imageUrl: p.imageUrl ?? null,
      categoryId: p.categoryId ?? null, brand: p.brandName ?? null,
      inStock: inStockOf(p), refurbished: bool(p.isRefurbished), isService: p.isService === true,
    })),
  });
});

router.get("/shop/products/:id", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(404).json({ error: "Not found" }); return; }
  const [p] = await db
    .select({ product: productsTable, categoryName: categoriesTable.name, brandName: brandsTable.name, typeTracksStock: productTypesTable.trackStock, isService: productTypesTable.isService })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
    .leftJoin(brandsTable, eq(brandsTable.id, productsTable.brandId))
    .leftJoin(productTypesTable, eq(productTypesTable.id, productsTable.productTypeId))
    .where(and(visible(merchantId), eq(productsTable.id, id)));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  const variants = await db.select().from(productVariantsTable)
    .where(and(eq(productVariantsTable.productId, id), eq(productVariantsTable.isActive, "true")))
    .orderBy(asc(productVariantsTable.sortOrder), asc(productVariantsTable.id));
  const pr = p.product;
  res.json({
    id: pr.id, name: pr.name, description: pr.description ?? "", price: money(pr.price) ?? 0,
    imageUrl: pr.imageUrl ?? null, sku: pr.sku ?? null,
    category: p.categoryName ? { id: pr.categoryId, name: p.categoryName } : null,
    brand: p.brandName ?? null,
    inStock: inStockOf({ ...pr, typeTracksStock: p.typeTracksStock }), refurbished: bool(pr.isRefurbished),
    isService: p.isService === true,
    warranty: pr.warrantyDuration > 0 ? { duration: pr.warrantyDuration, unit: pr.warrantyUnit } : null,
    variants: variants.map((v) => ({
      id: v.id, name: v.name, price: money(v.price) ?? money(pr.price) ?? 0, imageUrl: v.imageUrl ?? null,
      attributes: v.attributes ?? {}, inStock: inStockOf({ trackInventory: pr.trackInventory, stockQuantity: v.stockQuantity, typeTracksStock: p.typeTracksStock }),
    })),
  });
});

/* ── Accounts ─────────────────────────────────────────────────────────── */

const Email = z.string().trim().toLowerCase().email().max(254);
const Password = z.string().min(8, "Password must be at least 8 characters").max(200);

function accountOf(c: typeof customersTable.$inferSelect) {
  return {
    id: c.id, firstName: c.firstName ?? "", lastName: c.lastName ?? "", email: c.email ?? "", phone: c.phone ?? "",
    address: {
      street: c.billingStreet ?? c.address ?? "", city: c.billingCity ?? "", state: c.billingState ?? "",
      postcode: c.billingPostcode ?? "", country: c.billingCountry ?? "Australia",
    },
    loyaltyPoints: c.loyaltyPoints, portalToken: c.portalToken ?? null,
  };
}

async function customersByEmail(merchantId: number, email: string) {
  return db.select().from(customersTable)
    .where(and(eq(customersTable.merchantId, merchantId), sql`lower(${customersTable.email}) = ${email}`))
    .orderBy(desc(customersTable.totalSpent), asc(customersTable.id));
}

/** The signed-in shopper, or null. */
export async function shopCustomer(req: import("express").Request) {
  const id = req.session?.portalCustomerId;
  const merchantId = await soleMerchantId();
  if (!id || merchantId == null) return null;
  const [c] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, id), eq(customersTable.merchantId, merchantId)));
  return c ?? null;
}

router.get("/shop/auth/me", async (req, res): Promise<void> => {
  const c = await shopCustomer(req);
  res.json({ customer: c ? accountOf(c) : null });
});

router.post("/shop/auth/login", loginLimiter, async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const parsed = z.object({ email: Email, password: z.string().min(1) }).safeParse(req.body);
  const deny = () => res.status(401).json({ error: "Incorrect email or password." });
  if (!parsed.success) { deny(); return; }

  const candidates = await customersByEmail(merchantId, parsed.data.email);
  for (const c of candidates) {
    if (c.portalPasswordHash && await verifyPassword(parsed.data.password, c.portalPasswordHash)) {
      await db.update(customersTable).set({ portalLastLoginAt: new Date() }).where(eq(customersTable.id, c.id));
      req.session.portalCustomerId = c.id;
      res.json({ customer: accountOf(c) });
      return;
    }
  }
  // A known customer who has never set a password gets a hint (and can use
  // "forgot password" to receive a set-up link) — the same answer otherwise.
  if (candidates.length > 0 && candidates.every((c) => !c.portalPasswordHash)) {
    res.status(401).json({ error: "Incorrect email or password.", needsSetup: true });
    return;
  }
  deny();
});

router.post("/shop/auth/logout", (req, res): void => {
  if (req.session) req.session.portalCustomerId = undefined;
  res.json({ ok: true });
});

const RegisterBody = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(""),
  email: Email,
  phone: z.string().trim().max(40).default(""),
  password: Password,
});

router.post("/shop/auth/register", registerLimiter, async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please check your details." }); return; }
  const b = parsed.data;

  const existing = await customersByEmail(merchantId, b.email);
  if (existing.length > 0) {
    // Already a customer (in store or online). Never set a password from here —
    // send the set-up link to the address on file; the inbox is the proof.
    const target = existing.find((c) => !c.portalPasswordHash) ?? existing[0]!;
    await issueSetupLink(target, target.portalPasswordHash ? "reset" : "setup", req.log, "shop");
    res.json({ status: "check-email" });
    return;
  }

  const [customer] = await db.insert(customersTable).values({
    merchantId,
    firstName: b.firstName,
    lastName: b.lastName || null,
    email: b.email,
    phone: b.phone ? await normalisePhoneFor(merchantId, b.phone) : null,
    heardFrom: "Online shop",
    portalToken: crypto.randomUUID(),
    portalPasswordHash: await hashPassword(b.password),
    portalPasswordSetAt: new Date(),
    portalLastLoginAt: new Date(),
  }).returning();
  triggerInstantSync(merchantId, "contacts");
  req.session.portalCustomerId = customer!.id;
  res.status(201).json({ status: "created", customer: accountOf(customer!) });
});

/** Send a set-up / reset link. Always the same answer, so it can't be used to
 *  learn whether an email belongs to a customer. */
router.post("/shop/auth/forgot", linkLimiter, async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const parsed = z.object({ email: Email }).safeParse(req.body);
  if (parsed.success) {
    const candidates = await customersByEmail(merchantId, parsed.data.email);
    const target = candidates.find((c) => c.portalPasswordHash) ?? candidates[0];
    if (target) await issueSetupLink(target, target.portalPasswordHash ? "reset" : "setup", req.log, "shop");
  }
  res.json({ ok: true });
});

router.post("/shop/auth/set-password", linkLimiter, async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const parsed = z.object({ token: z.string().min(1), password: Password }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }); return; }

  const [row] = await db.select().from(customerPortalTokensTable)
    .where(eq(customerPortalTokensTable.tokenHash, hashToken(parsed.data.token)));
  const bad = (msg: string) => res.status(400).json({ error: msg });
  if (!row) { bad("This link is invalid or has expired. Please request a new one."); return; }
  if (row.usedAt) { bad("This link has already been used. Please request a new one."); return; }
  if (row.expiresAt.getTime() < Date.now()) { bad("This link has expired. Please request a new one."); return; }

  const [customer] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, row.customerId), eq(customersTable.merchantId, merchantId)));
  if (!customer) { bad("This link is invalid or has expired. Please request a new one."); return; }

  const now = new Date();
  const passwordHash = await hashPassword(parsed.data.password);
  await db.transaction(async (tx) => {
    await tx.update(customersTable)
      .set({ portalPasswordHash: passwordHash, portalPasswordSetAt: now, portalLastLoginAt: now })
      .where(eq(customersTable.id, customer.id));
    await tx.update(customerPortalTokensTable).set({ usedAt: now }).where(eq(customerPortalTokensTable.id, row.id));
    await tx.delete(customerPortalTokensTable)
      .where(and(eq(customerPortalTokensTable.customerId, customer.id), isNull(customerPortalTokensTable.usedAt)));
  });
  req.session.portalCustomerId = customer.id;
  res.json({ customer: accountOf({ ...customer, portalPasswordHash: passwordHash }) });
});

const ProfileBody = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80),
  phone: z.string().trim().max(40),
  address: z.object({
    street: z.string().trim().max(200), city: z.string().trim().max(100), state: z.string().trim().max(50),
    postcode: z.string().trim().max(10), country: z.string().trim().max(60),
  }),
});

/* A shopper edits their own record — the same row the POS shows. Email is not
   editable here: it is the login, and changing it would need verification. */
router.patch("/shop/account/profile", async (req, res): Promise<void> => {
  const c = await shopCustomer(req);
  if (!c) { res.status(401).json({ error: "Please sign in." }); return; }
  const parsed = ProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please check your details." }); return; }
  const b = parsed.data;
  const [updated] = await db.update(customersTable).set({
    firstName: b.firstName, lastName: b.lastName || null,
    phone: b.phone ? await normalisePhoneFor(c.merchantId, b.phone) : null,
    billingStreet: b.address.street || null, billingCity: b.address.city || null, billingState: b.address.state || null,
    billingPostcode: b.address.postcode || null, billingCountry: b.address.country || null,
    updatedAt: new Date(),
  }).where(eq(customersTable.id, c.id)).returning();
  triggerInstantSync(c.merchantId, "contacts");
  res.json({ customer: accountOf(updated!) });
});

export default router;
