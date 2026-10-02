import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, productsTable, productVariantsTable, productTypesTable, categoriesTable, brandsTable, merchantsTable, businessProfileTable, customersTable, customerPortalTokensTable, productReviewsTable, customerWishlistItemsTable, loyaltySettingsTable, serviceJobsTable, transactionsTable, staffTable } from "@workspace/db";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "node:crypto";
import { hashPassword, verifyPassword } from "../lib/auth";
import { soleMerchantId, SOLE_MERCHANT_EMAIL } from "../lib/sole-merchant";
import { normalisePhoneFor } from "../lib/phone";
import { hashToken, issueSetupLink } from "../lib/customerPasswordLinks";
import { triggerInstantSync } from "../services/autoSyncScheduler";
import { shopVisible, shopListable, shopHidesOutOfStock, inStockSql } from "../lib/shop-visibility";
import { isPreOrderActive, localDate } from "../lib/pre-orders";
import { hasPurchased, reviewerName, buyerCustomerIds, PURCHASE_SALE_STATUSES } from "../lib/shop-reviews";
import { loyaltyEarnedFor, loyaltyProgramInfo, formatLoyalty, type LoyaltyConfig } from "../lib/loyalty";
import { shopMediaUrl, serveShopMedia, describeVideo } from "../lib/shop-media";
import type { ProductMediaItem } from "@workspace/db";
import { productWarrantyExpiry, productWarrantyLabel, repairWarrantyExpiry, DAY_MS } from "../lib/warranty";
import { formatAddressParts } from "../lib/address";
import { profileRequirements, missingRequired } from "../lib/customer-profile-rules";
import { ensureReferralCode, findReferrer, normaliseReferralCode } from "../lib/referrals";
import { checkDeliveryAddress } from "../lib/shipping-region";
import { emailChangeToken, readEmailChangeToken } from "../lib/shop-email-change";
import { sendEmail } from "../services/email";
import { escapeHtml } from "../lib/html-escape";
import { shopOrigin } from "../lib/publicUrl";

/**
 * The online shop's API (koastal.com.au/shop) — public, no staff session.
 *
 * The shop is a second front end on the SAME database as the POS, so nothing is
 * synced: a product's price and stock, a customer and their account are the
 * POS's own rows. Everything here is scoped to the one business this install
 * runs (soleMerchantId); nothing in a request can name another merchant.
 *
 * Catalogue: a product is listed when it is active, show_online is on and no
 * category above it is hidden (lib/shop-visibility.ts).
 * Only whether an item is in stock is revealed, never the count.
 *
 * Accounts: the shop account is also the customer's portal (the old portal's
 * appointments, quotes, wallet passes and /c/<token> sign-in are in
 * routes/shop-account.ts) — the password is customers.portal_password_hash
 * and a signed-in shopper is `req.session.portalCustomerId`. Two rules keep accounts safe:
 *   - login is by email + password; one email can belong to several POS
 *     customers (duplicates), so each candidate's password is tried;
 *   - registering with an email the POS already knows never sets a password
 *     directly — it emails a set-password link to that address instead, so
 *     knowing someone's email is never enough to take over their account.
 */

const router: IRouter = Router();

/** A new session id on sign-in, as the POS logins do: a session id planted in
 *  the browser beforehand (session fixation) must not become signed in. */
function freshSession(req: import("express").Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

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
const reviewLimiter = ipLimiter(60 * 60 * 1000, 20, "Too many reviews from this connection — please try again later.");
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

/* ── Media ───────────────────────────────────────────────────────────── */

/* Uploaded product/category images and videos, public only while the shop
   shows them (lib/shop-media.ts). GET and HEAD, with Range for video. */
router.get("/shop/media/*path", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const raw = req.params.path as unknown;
  const path = Array.isArray(raw) ? raw.join("/") : String(raw);
  await serveShopMedia(req, res, merchantId, path);
});

/* ── Catalogue ────────────────────────────────────────────────────────── */

const visible = shopVisible;

router.get("/shop/categories", async (_req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const counts = await db
    .select({ categoryId: productsTable.categoryId, n: sql<number>`count(*)::int` })
    .from(productsTable).where(shopListable(merchantId, await shopHidesOutOfStock(merchantId))).groupBy(productsTable.categoryId);
  const countBy = new Map(counts.map((c) => [c.categoryId, c.n]));
  const cats = await db.select().from(categoriesTable)
    .where(eq(categoriesTable.merchantId, merchantId))
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));
  // A parent is listed when it or any child has products on the shop.
  const total = (id: number): number =>
    (countBy.get(id) ?? 0) + cats.filter((c) => c.parentId === id).reduce((s, c) => s + total(c.id), 0);
  res.json(cats
    .map((c) => ({ id: c.id, name: c.name, parentId: c.parentId ?? null, color: c.color ?? null, imageUrl: shopMediaUrl(c.imageUrl ?? null), productCount: total(c.id) }))
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

  const conds: SQL[] = [shopListable(merchantId, await shopHidesOutOfStock(merchantId))];
  if (category) {
    // Include every category below it, at any depth, so a parent lists
    // everything under it — the same set its productCount adds up.
    conds.push(sql`${productsTable.categoryId} IN (
      WITH RECURSIVE sub AS (
        SELECT id FROM ${categoriesTable} WHERE ${categoriesTable.merchantId} = ${merchantId} AND ${categoriesTable.id} = ${category}
        UNION
        SELECT c.id FROM ${categoriesTable} c JOIN sub s ON c.parent_id = s.id
      )
      SELECT id FROM sub
    )`);
  }
  if (search) {
    const like = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(productsTable.name, like), ilike(productsTable.sku, like), ilike(productsTable.description, like))!);
  }
  // Same rule as the "hide out-of-stock" option (lib/shop-visibility.ts): untracked, in stock, or on pre-order.
  if (inStock === "true") conds.push(inStockSql());

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
      preOrder: productsTable.preOrder, preOrderReleaseDate: productsTable.preOrderReleaseDate, preOrderEtaDate: productsTable.preOrderEtaDate,
    })
    .from(productsTable)
    .leftJoin(brandsTable, and(eq(brandsTable.id, productsTable.brandId), eq(brandsTable.merchantId, productsTable.merchantId)))
    .leftJoin(productTypesTable, eq(productTypesTable.id, productsTable.productTypeId))
    .where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize);

  res.json({ total, page, pageSize, items: rows.map(summaryOf) });
});

type SummaryRow = {
  id: number; name: string; price: string; imageUrl: string | null; categoryId: number | null; brandName: string | null;
  trackInventory: string; stockQuantity: number; isRefurbished: string; typeTracksStock: boolean | null; isService: boolean | null;
  preOrder: string; preOrderReleaseDate: string | null; preOrderEtaDate: string | null;
};

/* A product on pre-order (lib/pre-orders.ts), as the shop shows it — or null.
   The shop is the one business's, so "today" is its local (Sydney) date. */
function preOrderOf(p: { preOrder: string; preOrderReleaseDate: string | null; preOrderEtaDate: string | null }) {
  return isPreOrderActive(p, localDate("Australia/Sydney"))
    ? { releaseDate: p.preOrderReleaseDate ?? null, etaDate: p.preOrderEtaDate ?? null }
    : null;
}

function summaryOf(p: SummaryRow) {
  return {
    id: p.id, name: p.name, price: money(p.price) ?? 0, imageUrl: shopMediaUrl(p.imageUrl ?? null),
    categoryId: p.categoryId ?? null, brand: p.brandName ?? null,
    inStock: inStockOf(p), refurbished: bool(p.isRefurbished), isService: p.isService === true,
    preOrder: preOrderOf(p),
  };
}

/* "Just purchased" pop-ups: products sold in the last 24 hours, newest first —
   till sales and paid online orders alike, since both are transactions. Says
   *what* sold and roughly when, never who bought it: no customer, suburb,
   quantity or price paid leaves this route. Only products the shop lists
   (and not services — "someone just bought a screen repair" isn't news). */
export const RECENT_PURCHASE_WINDOW_HOURS = 24;
router.get("/shop/recent-purchases", async (_req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const sold = await db.execute<{ pid: number; at: string }>(sql`
    SELECT (item->>'productId')::int AS pid, max(t.created_at) AS at
    FROM ${transactionsTable} t, jsonb_array_elements(CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END) item
    WHERE t.merchant_id = ${merchantId}
      AND t.status = 'completed'
      AND t.created_at > now() - make_interval(hours => ${RECENT_PURCHASE_WINDOW_HOURS})
      AND (item->>'productId') ~ '^[1-9][0-9]{0,9}$'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 40`);
  const when = new Map(sold.rows.map((r) => [Number(r.pid), new Date(r.at)]));
  if (when.size === 0) { res.set("Cache-Control", "public, max-age=300"); res.json([]); return; }
  const rows = await db
    .select({ id: productsTable.id, name: productsTable.name, imageUrl: productsTable.imageUrl, isService: productTypesTable.isService })
    .from(productsTable)
    .leftJoin(productTypesTable, eq(productTypesTable.id, productsTable.productTypeId))
    .where(and(shopListable(merchantId, await shopHidesOutOfStock(merchantId)), inArray(productsTable.id, [...when.keys()])));
  const items = rows
    .filter((p) => p.isService !== true)
    .map((p) => ({ id: p.id, name: p.name, imageUrl: shopMediaUrl(p.imageUrl ?? null), purchasedAt: when.get(p.id)!.toISOString() }))
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))
    .slice(0, 12);
  res.set("Cache-Control", "public, max-age=300");
  res.json(items);
});

router.get("/shop/products/:id", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(404).json({ error: "Not found" }); return; }
  const [p] = await db
    .select({ product: productsTable, categoryName: categoriesTable.name, brandName: brandsTable.name, typeTracksStock: productTypesTable.trackStock, isService: productTypesTable.isService })
    .from(productsTable)
    .leftJoin(categoriesTable, and(eq(categoriesTable.id, productsTable.categoryId), eq(categoriesTable.merchantId, productsTable.merchantId)))
    .leftJoin(brandsTable, and(eq(brandsTable.id, productsTable.brandId), eq(brandsTable.merchantId, productsTable.merchantId)))
    .leftJoin(productTypesTable, eq(productTypesTable.id, productsTable.productTypeId))
    .where(and(visible(merchantId), eq(productsTable.id, id)));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  const variants = await db.select().from(productVariantsTable)
    .where(and(eq(productVariantsTable.productId, id), eq(productVariantsTable.isActive, "true")))
    .orderBy(asc(productVariantsTable.sortOrder), asc(productVariantsTable.id));
  const pr = p.product;
  res.json({
    id: pr.id, name: pr.name, description: pr.description ?? "", price: money(pr.price) ?? 0,
    imageUrl: shopMediaUrl(pr.imageUrl ?? null), sku: pr.sku ?? null,
    // Gallery after the primary image, in the order set in the POS.
    media: ((pr.media ?? []) as ProductMediaItem[]).filter((m) => m && typeof m.url === "string" && m.url).map((m) =>
      m.type === "video"
        ? { type: "video" as const, url: shopMediaUrl(m.url), ...describeVideo(m.url) }
        : { type: "image" as const, url: shopMediaUrl(m.url) }),
    category: p.categoryName ? { id: pr.categoryId, name: p.categoryName } : null,
    brand: p.brandName ?? null,
    inStock: inStockOf({ ...pr, typeTracksStock: p.typeTracksStock }), refurbished: bool(pr.isRefurbished),
    preOrder: preOrderOf(pr),
    isService: p.isService === true,
    warranty: pr.warrantyDuration > 0 ? { duration: pr.warrantyDuration, unit: pr.warrantyUnit } : null,
    technicalSpecs: pr.technicalSpecs ?? "",
    weightKg: pr.weightKg != null ? parseFloat(pr.weightKg) : null,
    dimensionsCm: pr.lengthCm != null || pr.widthCm != null || pr.heightCm != null
      ? { length: pr.lengthCm != null ? parseFloat(pr.lengthCm) : null, width: pr.widthCm != null ? parseFloat(pr.widthCm) : null, height: pr.heightCm != null ? parseFloat(pr.heightCm) : null }
      : null,
    rating: await ratingOf(merchantId, id),
    variants: variants.map((v) => ({
      id: v.id, name: v.name, price: money(v.price) ?? money(pr.price) ?? 0, imageUrl: shopMediaUrl(v.imageUrl ?? null),
      attributes: v.attributes ?? {}, inStock: inStockOf({ trackInventory: pr.trackInventory, stockQuantity: v.stockQuantity, typeTracksStock: p.typeTracksStock }),
    })),
  });
});

/* ── Related products ────────────────────────────────────────────────── */

/* Up to 12 other listed products: the same category first, then the same
   brand, then the category's siblings (same parent). */
router.get("/shop/products/:id/related", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(404).json({ error: "Not found" }); return; }
  const [p] = await db.select({ categoryId: productsTable.categoryId, brandId: productsTable.brandId })
    .from(productsTable).where(and(visible(merchantId), eq(productsTable.id, id)));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }

  const tiers: SQL[] = [];
  if (p.categoryId != null) tiers.push(eq(productsTable.categoryId, p.categoryId));
  if (p.brandId != null) tiers.push(eq(productsTable.brandId, p.brandId));
  if (p.categoryId != null) tiers.push(sql`${productsTable.categoryId} IN (
    SELECT s.id FROM ${categoriesTable} s JOIN ${categoriesTable} me ON me.id = ${p.categoryId}
    WHERE s.merchant_id = ${merchantId} AND me.parent_id IS NOT NULL AND s.parent_id = me.parent_id)`);
  if (tiers.length === 0) { res.json({ items: [] }); return; }

  const rank = sql`CASE ${sql.join(tiers.map((t, i) => sql`WHEN ${t} THEN ${i}`), sql` `)} END`;
  const rows = await db
    .select({
      id: productsTable.id, name: productsTable.name, price: productsTable.price, imageUrl: productsTable.imageUrl,
      categoryId: productsTable.categoryId, brandName: brandsTable.name,
      trackInventory: productsTable.trackInventory, stockQuantity: productsTable.stockQuantity,
      isRefurbished: productsTable.isRefurbished, typeTracksStock: productTypesTable.trackStock,
      isService: productTypesTable.isService,
      preOrder: productsTable.preOrder, preOrderReleaseDate: productsTable.preOrderReleaseDate, preOrderEtaDate: productsTable.preOrderEtaDate,
    })
    .from(productsTable)
    .leftJoin(brandsTable, and(eq(brandsTable.id, productsTable.brandId), eq(brandsTable.merchantId, productsTable.merchantId)))
    .leftJoin(productTypesTable, eq(productTypesTable.id, productsTable.productTypeId))
    .where(and(shopListable(merchantId, await shopHidesOutOfStock(merchantId)), sql`${productsTable.id} <> ${id}`, or(...tiers)))
    .orderBy(rank, desc(productsTable.createdAt))
    .limit(12);
  res.json({ items: rows.map(summaryOf) });
});

/* ── Reviews ─────────────────────────────────────────────────────────── */

/* Anyone can read a listed product's approved reviews. Writing one needs a
   signed-in shop account that has bought the product (lib/shop-reviews.ts);
   one review per customer per product, and posting again edits it. */

async function ratingOf(merchantId: number, productId: number) {
  const [r] = await db.select({ avg: sql<string | null>`avg(${productReviewsTable.rating})`, n: sql<number>`count(*)::int` })
    .from(productReviewsTable)
    .where(and(eq(productReviewsTable.merchantId, merchantId), eq(productReviewsTable.productId, productId), eq(productReviewsTable.status, "approved")));
  return { average: r?.avg != null ? Math.round(parseFloat(r.avg) * 10) / 10 : null, count: r?.n ?? 0 };
}

async function listedProduct(merchantId: number, raw: string): Promise<number | null> {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [p] = await db.select({ id: productsTable.id }).from(productsTable).where(and(visible(merchantId), eq(productsTable.id, id)));
  return p?.id ?? null;
}

router.get("/shop/products/:id/reviews", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const id = await listedProduct(merchantId, String(req.params.id));
  if (id == null) { res.status(404).json({ error: "Not found" }); return; }
  const rows = await db.select().from(productReviewsTable)
    .where(and(eq(productReviewsTable.merchantId, merchantId), eq(productReviewsTable.productId, id), eq(productReviewsTable.status, "approved")))
    .orderBy(desc(productReviewsTable.createdAt))
    .limit(100);

  const c = await shopCustomer(req);
  let viewer: { signedIn: boolean; canReview: boolean; myReview: { rating: number; title: string; body: string } | null } = { signedIn: false, canReview: false, myReview: null };
  if (c) {
    const [mine] = await db.select().from(productReviewsTable)
      .where(and(eq(productReviewsTable.merchantId, merchantId), eq(productReviewsTable.productId, id), eq(productReviewsTable.customerId, c.id)));
    viewer = {
      signedIn: true,
      canReview: await hasPurchased(merchantId, c, id),
      myReview: mine ? { rating: mine.rating, title: mine.title, body: mine.body } : null,
    };
  }
  res.json({
    rating: await ratingOf(merchantId, id),
    reviews: rows.map((r) => ({
      id: r.id, author: r.authorName || "Customer", rating: r.rating, title: r.title, body: r.body,
      verified: r.verified === "true", createdAt: r.createdAt.toISOString(),
    })),
    viewer,
  });
});

const ReviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).default(""),
  body: z.string().trim().min(1, "Please write a few words about the product").max(4000),
});

router.post("/shop/products/:id/reviews", reviewLimiter, async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const c = await shopCustomer(req);
  if (!c) { res.status(401).json({ error: "Sign in to leave a review" }); return; }
  const id = await listedProduct(merchantId, String(req.params.id));
  if (id == null) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = ReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid review" }); return; }
  if (!(await hasPurchased(merchantId, c, id))) {
    res.status(403).json({ error: "Only customers who have bought this product can review it" });
    return;
  }
  const fields = {
    rating: parsed.data.rating, title: parsed.data.title, body: parsed.data.body,
    authorName: reviewerName(c.firstName, c.lastName), authorEmail: c.email ?? "", verified: "true",
  };
  const [existing] = await db.select({ id: productReviewsTable.id }).from(productReviewsTable)
    .where(and(eq(productReviewsTable.merchantId, merchantId), eq(productReviewsTable.productId, id), eq(productReviewsTable.customerId, c.id)));
  if (existing) {
    // Editing keeps the review's status: a review staff hid stays hidden.
    await db.update(productReviewsTable).set(fields).where(eq(productReviewsTable.id, existing.id));
    res.json({ ok: true, updated: true });
    return;
  }
  await db.insert(productReviewsTable).values({ ...fields, merchantId, productId: id, customerId: c.id, status: "approved" });
  res.status(201).json({ ok: true, updated: false });
});

/* ── Loyalty ─────────────────────────────────────────────────────────── */

/* The POS loyalty program as the shop shows it: the rewards section, the
   account balance and the cart's "You'll earn…". Everything comes from the
   POS loyalty settings and lib/loyalty.ts, so the website says what the till
   does. */

export async function loyaltySettings(merchantId: number) {
  const [row] = await db.select().from(loyaltySettingsTable).where(eq(loyaltySettingsTable.merchantId, merchantId)).limit(1);
  return {
    programType: row?.programType ?? "cashback",
    config: (row?.config ?? {}) as LoyaltyConfig,
    // Same default as the till: no settings row means the program is on.
    programOn: row ? row.isEnabled === "true" : true,
  };
}

router.get("/shop/loyalty", async (_req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const l = await loyaltySettings(merchantId);
  res.json(loyaltyProgramInfo(l.programType, l.config, l.programOn));
});

const EstimateBody = z.object({
  lines: z.array(z.object({
    productId: z.number().int().positive(),
    variantId: z.number().int().positive().nullish(),
    quantity: z.number().int().min(1).max(99),
  })).max(100),
});

/* What a cart would earn, priced from the database (never the browser). A
   guest gets the figure they'd earn once signed in, flagged signedIn: false. */
router.post("/shop/loyalty/estimate", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const parsed = EstimateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid cart" }); return; }
  const l = await loyaltySettings(merchantId);
  const c = await shopCustomer(req);
  const ids = [...new Set(parsed.data.lines.map((x) => x.productId))];
  const products = ids.length === 0 ? [] : await db.select({
    id: productsTable.id, price: productsTable.price, categoryId: productsTable.categoryId, excludeFromLoyalty: productsTable.excludeFromLoyalty,
  }).from(productsTable).where(and(visible(merchantId), inArray(productsTable.id, ids)));
  const byId = new Map(products.map((p) => [p.id, p]));
  const variantIds = parsed.data.lines.map((x) => x.variantId).filter((v): v is number => v != null);
  const variants = variantIds.length === 0 ? [] : await db.select({ id: productVariantsTable.id, productId: productVariantsTable.productId, price: productVariantsTable.price })
    .from(productVariantsTable).where(and(inArray(productVariantsTable.id, variantIds), eq(productVariantsTable.isActive, "true")));
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const lines = parsed.data.lines.flatMap((x) => {
    const p = byId.get(x.productId);
    if (!p) return [];
    const v = x.variantId != null ? variantById.get(x.variantId) : undefined;
    const unit = money(v && v.productId === p.id ? v.price : null) ?? money(p.price) ?? 0;
    return [{ productId: p.id, totalPrice: Math.round(unit * x.quantity * 100) / 100, excludeFromLoyalty: p.excludeFromLoyalty === "true", categoryId: p.categoryId ?? null }];
  });
  const total = Math.round(lines.reduce((s, x) => s + x.totalPrice, 0) * 100) / 100;
  const customer = c
    ? { customerGroup: c.customerGroup ?? null, totalSpent: c.totalSpent, loyaltyPoints: c.loyaltyPoints ?? 0, dateOfBirth: c.dateOfBirth ?? null }
    : { customerGroup: null, totalSpent: "0", loyaltyPoints: 0, dateOfBirth: null };
  const earned = loyaltyEarnedFor({ programType: l.programType, config: l.config, programOn: l.programOn, customer, lines, total });
  res.json({ enabled: l.programOn, earned, formatted: formatLoyalty(l.programType, l.config, earned), signedIn: !!c });
});

/* ── Account overview ────────────────────────────────────────────────── */

/* The signed-in shopper's loyalty balance, repairs and live warranties. Repairs
   and purchases are gathered across every POS record sharing their email (the
   POS has duplicates; lib/shop-reviews.ts explains why that is safe). */
router.get("/shop/account/overview", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const c = await shopCustomer(req);
  if (!c) { res.status(401).json({ error: "Please sign in." }); return; }
  const ids = await buyerCustomerIds(merchantId, c);
  const l = await loyaltySettings(merchantId);
  const now = new Date();

  const jobs = await db.select({
    id: serviceJobsTable.id, jobNumber: serviceJobsTable.jobNumber, title: serviceJobsTable.title, status: serviceJobsTable.status,
    bookInDate: serviceJobsTable.bookInDate, deviceType: serviceJobsTable.deviceType, deviceDescription: serviceJobsTable.deviceDescription,
    completedAt: serviceJobsTable.completedAt, repairWarrantyDays: serviceJobsTable.repairWarrantyDays, createdAt: serviceJobsTable.createdAt,
    workDescription: serviceJobsTable.workDescription, estimatedCost: serviceJobsTable.estimatedCost,
  }).from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.merchantId, merchantId), inArray(serviceJobsTable.customerId, ids)))
    .orderBy(desc(serviceJobsTable.createdAt)).limit(100);

  const warranties: { key: string; kind: "product" | "repair"; name: string; label: string; startedAt: string; expiresAt: string; daysRemaining: number; reference: string | null }[] = [];

  const sales = await db.select({ id: transactionsTable.id, receiptNumber: transactionsTable.receiptNumber, createdAt: transactionsTable.createdAt, items: transactionsTable.items })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.merchantId, merchantId), inArray(transactionsTable.customerId, ids), inArray(transactionsTable.status, [...PURCHASE_SALE_STATUSES])));
  type Line = { productId?: number | null; productName?: string | null; name?: string | null };
  const soldIds = [...new Set(sales.flatMap((t) => (Array.isArray(t.items) ? (t.items as Line[]) : []).map((i) => i.productId).filter((x): x is number => x != null)))];
  const warrantied = soldIds.length === 0 ? [] : await db.select({ id: productsTable.id, name: productsTable.name, warrantyDuration: productsTable.warrantyDuration, warrantyUnit: productsTable.warrantyUnit })
    .from(productsTable).where(and(eq(productsTable.merchantId, merchantId), inArray(productsTable.id, soldIds), gt(productsTable.warrantyDuration, 0)));
  const wById = new Map(warrantied.map((p) => [p.id, p]));
  for (const t of sales) {
    (Array.isArray(t.items) ? (t.items as Line[]) : []).forEach((it, idx) => {
      const p = it.productId != null ? wById.get(it.productId) : undefined;
      if (!p) return;
      const exp = productWarrantyExpiry(t.createdAt, p.warrantyDuration, p.warrantyUnit);
      if (!exp || exp < now) return;
      warranties.push({
        key: `p-${t.id}-${idx}`, kind: "product", name: it.productName || it.name || p.name,
        label: productWarrantyLabel(p.warrantyDuration, p.warrantyUnit), startedAt: t.createdAt.toISOString(), expiresAt: exp.toISOString(),
        daysRemaining: Math.ceil((exp.getTime() - now.getTime()) / DAY_MS), reference: t.receiptNumber,
      });
    });
  }
  for (const j of jobs) {
    if (!j.completedAt || j.status === "cancelled") continue;
    const exp = repairWarrantyExpiry(j.completedAt, j.repairWarrantyDays);
    if (!exp || exp < now) continue;
    warranties.push({
      key: `r-${j.id}`, kind: "repair", name: `${j.deviceDescription || j.deviceType || j.title} — repair`,
      label: `${j.repairWarrantyDays}-day repair warranty`, startedAt: j.completedAt.toISOString(), expiresAt: exp.toISOString(),
      daysRemaining: Math.ceil((exp.getTime() - now.getTime()) / DAY_MS), reference: j.jobNumber,
    });
  }
  warranties.sort((a, b) => a.daysRemaining - b.daysRemaining);

  res.json({
    loyalty: {
      ...loyaltyProgramInfo(l.programType, l.config, l.programOn),
      balance: c.loyaltyPoints ?? 0,
      formatted: formatLoyalty(l.programType, l.config, c.loyaltyPoints ?? 0),
      totalSpent: parseFloat(c.totalSpent ?? "0"),
      visitCount: c.visitCount ?? 0,
    },
    repairs: jobs.map((j) => ({
      id: j.id, jobNumber: j.jobNumber, status: j.status,
      device: j.deviceDescription || j.deviceType || j.title || "Repair",
      bookedIn: j.bookInDate || j.createdAt.toISOString().slice(0, 10),
      completedAt: j.completedAt ? j.completedAt.toISOString() : null,
      // What the job is for and what it was estimated at. Never the job's
      // `notes`: that is the staff's own log (calls, internal remarks).
      workDescription: j.workDescription ?? null,
      estimatedCost: money(j.estimatedCost),
    })),
    warranties,
  });
});

/* ── Wishlist ────────────────────────────────────────────────────────── */

/* The heart on a product image. Signed-in shoppers only. `ids` is every saved
   product (so hearts render filled); `items` only those still listed, since a
   product taken off the shop can't be opened. */

router.get("/shop/wishlist", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const c = await shopCustomer(req);
  if (!c) { res.status(401).json({ error: "Sign in to see your wishlist" }); return; }
  const saved = await db.select({ productId: customerWishlistItemsTable.productId }).from(customerWishlistItemsTable)
    .where(and(eq(customerWishlistItemsTable.merchantId, merchantId), eq(customerWishlistItemsTable.customerId, c.id)))
    .orderBy(desc(customerWishlistItemsTable.createdAt));
  const ids = saved.map((r) => r.productId);
  if (ids.length === 0) { res.json({ ids, items: [] }); return; }
  const rows = await db
    .select({
      id: productsTable.id, name: productsTable.name, price: productsTable.price, imageUrl: productsTable.imageUrl,
      categoryId: productsTable.categoryId, brandName: brandsTable.name,
      trackInventory: productsTable.trackInventory, stockQuantity: productsTable.stockQuantity,
      isRefurbished: productsTable.isRefurbished, typeTracksStock: productTypesTable.trackStock,
      isService: productTypesTable.isService,
      preOrder: productsTable.preOrder, preOrderReleaseDate: productsTable.preOrderReleaseDate, preOrderEtaDate: productsTable.preOrderEtaDate,
    })
    .from(productsTable)
    .leftJoin(brandsTable, and(eq(brandsTable.id, productsTable.brandId), eq(brandsTable.merchantId, productsTable.merchantId)))
    .leftJoin(productTypesTable, eq(productTypesTable.id, productsTable.productTypeId))
    .where(and(visible(merchantId), inArray(productsTable.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  res.json({ ids, items: ids.flatMap((id) => (byId.has(id) ? [summaryOf(byId.get(id)!)] : [])) });
});

router.put("/shop/wishlist/:productId", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const c = await shopCustomer(req);
  if (!c) { res.status(401).json({ error: "Sign in to save items" }); return; }
  const id = await listedProduct(merchantId, String(req.params.productId));
  if (id == null) { res.status(404).json({ error: "Not found" }); return; }
  await db.insert(customerWishlistItemsTable).values({ merchantId, customerId: c.id, productId: id }).onConflictDoNothing();
  res.json({ ok: true });
});

router.delete("/shop/wishlist/:productId", async (req, res): Promise<void> => {
  const merchantId = await merchantOr404(res);
  if (merchantId == null) return;
  const c = await shopCustomer(req);
  if (!c) { res.status(401).json({ error: "Sign in to change your wishlist" }); return; }
  const id = Number(req.params.productId);
  if (!Number.isInteger(id) || id <= 0) { res.status(404).json({ error: "Not found" }); return; }
  // No listing check: removing something since taken off the shop must still work.
  await db.delete(customerWishlistItemsTable).where(and(
    eq(customerWishlistItemsTable.merchantId, merchantId),
    eq(customerWishlistItemsTable.customerId, c.id),
    eq(customerWishlistItemsTable.productId, id),
  ));
  res.json({ ok: true });
});

/* ── Accounts ─────────────────────────────────────────────────────────── */

const Email = z.string().trim().toLowerCase().email().max(254);
const Password = z.string().min(8, "Password must be at least 8 characters").max(200);

export function accountOf(c: typeof customersTable.$inferSelect) {
  return {
    id: c.id, firstName: c.firstName ?? "", lastName: c.lastName ?? "", email: c.email ?? "", phone: c.phone ?? "",
    address: {
      street: c.billingStreet ?? c.address ?? "", city: c.billingCity ?? "", state: c.billingState ?? "",
      postcode: c.billingPostcode ?? "", country: c.billingCountry ?? "Australia",
    },
    /* Postal / delivery address — the POS's shipping fields. */
    shippingAddress: {
      street: c.shippingStreet ?? "", city: c.shippingCity ?? "", state: c.shippingState ?? "",
      postcode: c.shippingPostcode ?? "", country: c.shippingCountry ?? "",
    },
    company: c.company ?? "", abn: c.abn ?? "",
    whatsapp: c.whatsappSameAsPhone === "true",
    agreedToMarketing: c.agreedToMarketing === "true",
    heardFrom: c.heardFrom ?? "", heardFromDetails: c.heardFromDetails ?? "",
    /* The referrer's code, when someone referred them (POS `referred_by`). */
    referredByCode: c.referredBy ?? "",
    /* Their POS customer group (e.g. Trade), which sets their pricing. Shown
       on the account, never editable there. */
    customerGroup: c.customerGroup ?? "",
    loyaltyPoints: c.loyaltyPoints, portalToken: c.portalToken ?? null,
    dateOfBirth: c.dateOfBirth ?? null,
    /* False for a customer who came in on an account link and has never set a
       password: the account offers to email them a set-up link. */
    hasPassword: !!c.portalPasswordHash,
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

/* Whether this shopper may see the whole shop while it is behind its Coming
   Soon screen: the owner, or an active staff member, signed in with a shop
   account on their own email. Any other signed-in customer gets their account
   pages only. The curtain is not access control (the catalogue API is public);
   this only decides who is shown the unlaunched shop. */
async function canPreview(merchantId: number, email: string | null): Promise<boolean> {
  const e = email?.trim().toLowerCase();
  if (!e) return false;
  if (e === SOLE_MERCHANT_EMAIL.toLowerCase()) return true;
  const [staff] = await db.select({ id: staffTable.id }).from(staffTable)
    .where(and(eq(staffTable.merchantId, merchantId), eq(staffTable.isActive, "true"), sql`lower(${staffTable.email}) = ${e}`))
    .limit(1);
  return !!staff;
}

router.get("/shop/auth/me", async (req, res): Promise<void> => {
  const c = await shopCustomer(req);
  res.json({ customer: c ? accountOf(c) : null, preview: c ? await canPreview(c.merchantId, c.email) : false });
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
      await freshSession(req);
      req.session.portalCustomerId = c.id;
      res.json({ customer: accountOf(c) });
      return;
    }
  }
  // One answer for every failure. A "you're a customer, set a password" hint
  // here told anyone which emails belong to in-store customers; the page now
  // offers the set-up link after any failed sign-in instead.
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
  /** No longer used: the password is chosen from the emailed set-up link, which
   *  is what proves the address is theirs. Accepted so an older page can post. */
  password: z.string().optional(),
  /** From a friend's referral link (/r/<code>), kept by the browser until sign-up. */
  referralCode: z.string().trim().max(40).optional(),
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
    await issueSetupLink(target, target.portalPasswordHash ? "reset" : "setup", req.log);
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
    // No password yet. It used to be set here and the shopper signed straight
    // in, so anyone could open an account on an address they don't own — and,
    // since an account gathers every record with its email, collect a real
    // customer's repairs, files and quotes when they later came in store.
  }).returning();
  // Their own code to share, and — arriving on a friend's link — who referred
  // them, recorded as the POS records it (referred_by = the referrer's code).
  let created = customer!;
  const referralCode = await ensureReferralCode(created);
  const referrer = b.referralCode ? await findReferrer(merchantId, b.referralCode, [created.id]) : null;
  const [updated] = await db.update(customersTable).set({
    referralCode,
    ...(referrer ? {
      referredBy: referrer.referralCode, referredByCustomerId: referrer.id, heardFrom: "Friend",
      heardFromDetails: [referrer.firstName, referrer.lastName].filter(Boolean).join(" ") || null,
    } : {}),
  }).where(eq(customersTable.id, created.id)).returning();
  created = updated ?? created;
  triggerInstantSync(merchantId, "contacts");
  // The inbox is the proof, exactly as for an email the POS already knows: the
  // password is set from the link, and only then is anyone signed in.
  await issueSetupLink(created, "setup", req.log);
  res.status(201).json({ status: "check-email" });
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
    if (target) await issueSetupLink(target, target.portalPasswordHash ? "reset" : "setup", req.log);
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
  await freshSession(req);
  req.session.portalCustomerId = customer.id;
  res.json({ customer: accountOf({ ...customer, portalPasswordHash: passwordHash }) });
});

const ProfileBody = z.object({
  firstName: z.string().trim().min(1).max(80),
  /** Omitted leaves it alone. Changing it changes the login — see below. */
  email: Email.optional(),
  lastName: z.string().trim().max(80),
  phone: z.string().trim().max(40),
  address: z.object({
    street: z.string().trim().max(200), city: z.string().trim().max(100), state: z.string().trim().max(50),
    postcode: z.string().trim().max(10), country: z.string().trim().max(60),
  }),
  /** YYYY-MM-DD, for the birthday reward. Optional, and set once — see below. */
  dateOfBirth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your birthday as a full date").optional().or(z.literal("")),
  /* The rest of what the POS records about a customer. Each is optional so an
     older page (or a partial save) leaves the stored value alone. */
  shippingAddress: z.object({
    street: z.string().trim().max(200), city: z.string().trim().max(100), state: z.string().trim().max(50),
    postcode: z.string().trim().max(10), country: z.string().trim().max(60),
  }).optional(),
  company: z.string().trim().max(120).optional(),
  abn: z.string().trim().max(20).refine((v) => v === "" || /^\d{11}$/.test(v.replace(/\s/g, "")), "An ABN is 11 digits").optional(),
  whatsapp: z.boolean().optional(),
  agreedToMarketing: z.boolean().optional(),
  heardFrom: z.string().trim().max(80).optional(),
  heardFromDetails: z.string().trim().max(200).optional(),
  /** "Heard from: Friend" — the friend's referral code. Optional. */
  friendReferralCode: z.string().trim().max(40).optional(),
});

/* The business's required fields and "heard from" choices, for the profile form. */
router.get("/shop/account/fields", async (req, res): Promise<void> => {
  const c = await shopCustomer(req);
  if (!c) { res.status(401).json({ error: "Please sign in." }); return; }
  res.json(await profileRequirements(c.merchantId));
});

/** A real, past date no more than 120 years ago. */
function plausibleBirthday(v: string): boolean {
  const d = new Date(`${v}T00:00:00Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  const now = new Date();
  return d < now && d.getUTCFullYear() >= now.getUTCFullYear() - 120;
}

/* A shopper edits their own record — the same row the POS shows.

   The email can be changed (as the customer portal allowed), but never to an
   address another customer record already has. The account gathers repairs,
   quotes and purchases from every record sharing its email
   (buyerCustomerIds), so taking someone else's address would hand over their
   history; staff merge genuine duplicates in the POS instead. */
router.patch("/shop/account/profile", async (req, res): Promise<void> => {
  const c = await shopCustomer(req);
  if (!c) { res.status(401).json({ error: "Please sign in." }); return; }
  const parsed = ProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please check your details." }); return; }
  const b = parsed.data;
  // The birthday earns a birthday reward, so a shopper can add it but not
  // change it afterwards (moving it to today would pay the bonus on demand).
  // Staff can still correct it in the POS.
  let dateOfBirth: string | undefined;
  if (b.dateOfBirth) {
    if (!plausibleBirthday(b.dateOfBirth)) { res.status(400).json({ error: "Please enter a valid birthday." }); return; }
    if (c.dateOfBirth && c.dateOfBirth !== b.dateOfBirth) {
      res.status(409).json({ error: "Your birthday is already set. Contact us if it needs correcting." });
      return;
    }
    if (!c.dateOfBirth) dateOfBirth = b.dateOfBirth;
  }
  // The POS's required fields apply here too. A field this request leaves out
  // is judged by what is stored, so an older page can still save.
  const reqs = await profileRequirements(c.merchantId);
  const missing = missingRequired(reqs.required, {
    email: b.email ?? c.email ?? "",
    phone: b.phone,
    dateOfBirth: b.dateOfBirth || c.dateOfBirth,
    company: b.company ?? c.company ?? "",
    abn: b.abn ?? c.abn ?? "",
    address: b.address,
  });
  if (missing.length) { res.status(400).json({ error: `Please add your ${missing.join(", ")}.` }); return; }
  const heard = b.heardFrom ? reqs.heardFromSources.find((h) => h.name === b.heardFrom) : undefined;
  if (b.heardFrom && !heard && b.heardFrom !== c.heardFrom) { res.status(400).json({ error: "Please choose how you heard about us from the list." }); return; }

  // A friend's referral code links this customer to them as the POS does. Set
  // once: changing who gets the credit afterwards is for staff.
  let referral: { referredBy: string; referredByCustomerId: number } | undefined;
  const friendCode = b.friendReferralCode ? normaliseReferralCode(b.friendReferralCode) : "";
  if (friendCode && friendCode !== normaliseReferralCode(c.referredBy ?? "")) {
    if (c.referredBy || c.referredByCustomerId) {
      res.status(409).json({ error: "You're already linked to a friend's referral. Contact us if it needs changing." });
      return;
    }
    const referrer = await findReferrer(c.merchantId, friendCode, await buyerCustomerIds(c.merchantId, c));
    if (!referrer) { res.status(400).json({ error: "We couldn't find that referral code — check it, or leave it blank." }); return; }
    referral = { referredBy: referrer.referralCode!, referredByCustomerId: referrer.id };
  }

  // Delivery is within Australia only (lib/shipping-region.ts). The customer's
  // own address may be anywhere; the one we would post to may not.
  const delivery = b.shippingAddress ? checkDeliveryAddress(b.shippingAddress) : null;
  if (delivery && !delivery.ok) { res.status(400).json({ error: delivery.error }); return; }

  // A new email is not applied here: a link goes to the new address and the
  // change happens when it is opened (lib/shop-email-change.ts).
  let emailChangePending: string | undefined;
  if (b.email && b.email !== (c.email ?? "").trim().toLowerCase()) {
    const [taken] = await db.select({ id: customersTable.id }).from(customersTable)
      .where(and(eq(customersTable.merchantId, c.merchantId), sql`lower(${customersTable.email}) = ${b.email}`, sql`${customersTable.id} <> ${c.id}`))
      .limit(1);
    if (taken) {
      res.status(409).json({ error: "That email is already on another account with us. Contact us and we can combine them." });
      return;
    }
    if (!emailChangeAllowed(c.id)) {
      res.status(429).json({ error: "Too many email changes — please try again in an hour." });
      return;
    }
    emailChangePending = b.email;
  }
  const [updated] = await db.update(customersTable).set({
    ...(dateOfBirth ? { dateOfBirth } : {}),
    firstName: b.firstName, lastName: b.lastName || null,
    phone: b.phone ? await normalisePhoneFor(c.merchantId, b.phone) : null,
    billingStreet: b.address.street || null, billingCity: b.address.city || null, billingState: b.address.state || null,
    billingPostcode: b.address.postcode || null, billingCountry: b.address.country || null,
    // The POS still shows the free-text address in places; keep it in step.
    address: formatAddressParts(b.address.street, b.address.city, b.address.state, b.address.postcode) || c.address,
    ...(b.shippingAddress ? {
      shippingStreet: b.shippingAddress.street || null, shippingCity: b.shippingAddress.city || null,
      shippingState: (delivery?.ok && delivery.state) || null, shippingPostcode: b.shippingAddress.postcode || null,
      shippingCountry: (delivery?.ok && delivery.country) || null,
    } : {}),
    ...(b.company !== undefined ? { company: b.company || null } : {}),
    ...(b.abn !== undefined ? { abn: b.abn.replace(/\s/g, "") || null } : {}),
    ...(b.whatsapp !== undefined ? { whatsappSameAsPhone: b.whatsapp ? "true" : "false" } : {}),
    ...(b.agreedToMarketing !== undefined ? { agreedToMarketing: b.agreedToMarketing ? "true" : "false" } : {}),
    ...(b.heardFrom !== undefined ? { heardFrom: b.heardFrom || null, heardFromDetails: b.heardFromDetails || null } : {}),
    ...(referral ?? {}),
    updatedAt: new Date(),
  }).where(eq(customersTable.id, c.id)).returning();
  triggerInstantSync(c.merchantId, "contacts");
  if (emailChangePending) await sendEmailChangeLink(updated!, emailChangePending, req.log);
  res.json({ customer: accountOf(updated!), ...(emailChangePending ? { emailChangePending } : {}) });
});

/* Each email change mails a link to an address the shopper chooses, from the
   business's own sender. Without a cap one account could send any number of
   them; 5 an hour is plenty for typos. Per process — a soft limit, which is
   all mail volume needs. */
const EMAIL_CHANGE_LIMIT = 5;
const emailChangeSends = new Map<number, number[]>();
function emailChangeAllowed(customerId: number, now = Date.now()): boolean {
  const recent = (emailChangeSends.get(customerId) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= EMAIL_CHANGE_LIMIT) { emailChangeSends.set(customerId, recent); return false; }
  recent.push(now);
  emailChangeSends.set(customerId, recent);
  return true;
}

async function sendEmailChangeLink(
  customer: typeof customersTable.$inferSelect,
  newEmail: string,
  log: { warn: (o: unknown, m: string) => void },
): Promise<void> {
  const [m] = await db.select({ businessName: merchantsTable.businessName }).from(merchantsTable).where(eq(merchantsTable.id, customer.merchantId));
  const biz = m?.businessName ?? "Your store";
  // Built from the configured site, never from request headers.
  const link = `${new URL(shopOrigin()).origin}/api/shop/auth/confirm-email?token=${encodeURIComponent(emailChangeToken(customer.id, newEmail, customer.updatedAt))}`;
  void sendEmail(customer.merchantId, {
    to: newEmail,
    subject: `Confirm your new email — ${biz}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
        <h2 style="margin-top:0">Confirm your new email</h2>
        <p>Someone asked to use this address for their ${escapeHtml(biz)} account. If that was you, confirm it below — until then your account keeps its current email.</p>
        <p style="margin:24px 0"><a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Confirm this email</a></p>
        <p style="color:#666;font-size:14px">This link expires in 24 hours. If it wasn't you, ignore this email — nothing changes.</p>
      </div>`,
    text: `Confirm your new email for your ${biz} account (expires in 24 hours):\n${link}\n\nIf it wasn't you, ignore this email.`,
  }).then((r) => { if (!r.success) log.warn({ error: r.error }, "Email-change confirmation failed to send"); }).catch(() => {});
}

/* The link from the email above. The token says who and what; the change is
   applied only if that address still isn't on another of this business's
   customer records. Answers with a redirect to the shop account. */
router.get("/shop/auth/confirm-email", linkLimiter, async (req, res): Promise<void> => {
  const back = (state: string) => res.redirect(302, `${shopOrigin()}/account?email=${state}`);
  const t = readEmailChangeToken(req.query.token);
  const merchantId = await soleMerchantId();
  if (!t || merchantId == null) { back("link-expired"); return; }
  const [c] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, t.customerId), eq(customersTable.merchantId, merchantId)));
  if (!c) { back("link-expired"); return; }
  if ((c.email ?? "").trim().toLowerCase() === t.email) { back("changed"); return; }
  // Any save since the link was sent (a different address asked for, say)
  // supersedes it.
  if ((c.updatedAt?.getTime() ?? 0) !== t.recordUpdatedAt) { back("link-expired"); return; }
  const [taken] = await db.select({ id: customersTable.id }).from(customersTable)
    .where(and(eq(customersTable.merchantId, merchantId), sql`lower(${customersTable.email}) = ${t.email}`, sql`${customersTable.id} <> ${c.id}`))
    .limit(1);
  if (taken) { back("taken"); return; }
  await db.update(customersTable).set({ email: t.email, updatedAt: new Date() }).where(eq(customersTable.id, c.id));
  triggerInstantSync(merchantId, "contacts");
  back("changed");
});

export default router;
