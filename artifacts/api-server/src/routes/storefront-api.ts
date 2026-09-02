import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import {
  db, merchantsTable, productsTable, categoriesTable, brandsTable,
  customersTable, transactionsTable,
} from "@workspace/db";
import { and, eq, lt, gte, gt, desc, asc, ilike, or, type SQL } from "drizzle-orm";
import { requireStorefrontKey, requireScope } from "../middlewares/requireStorefrontKey";
import { PAGE_SIZE, RATE_LIMIT } from "../lib/storefront-api";

/**
 * The Storefront Data API — read-only access to a merchant's own data for the
 * website they (or their AI) build elsewhere.
 *
 * Every route is authenticated by an API key, scoped by what that key was
 * granted, and filtered to the key's merchant. There is no session here and no
 * cross-merchant path: `merchantId` comes from the key, never from the request,
 * so a caller cannot ask for someone else's catalogue by changing a parameter.
 *
 * The endpoint list, its scopes and the connection brief handed to the merchant
 * all live in `lib/storefront-api.ts`; `storefront-api.test.ts` asserts this
 * router implements exactly what that brief promises.
 *
 * Read-only on purpose. Nothing here writes, so a leaked key costs a merchant
 * confidentiality — never their inventory, their prices or their money.
 */

const router: IRouter = Router();

/* ── Limits ──────────────────────────────────────────────────────────────────
 * Two limiters, because they defend different things.
 *
 * The first runs BEFORE authentication and counts only requests that failed it
 * (`skipSuccessfulRequests`), so it bounds key guessing without touching a
 * working integration's traffic. A per-key limiter alone could never do this: a
 * request that never authenticates has no key to count against.
 *
 * The second runs after, keyed by API key rather than IP, because several sites
 * behind one CDN share an egress address and the key is the thing we actually
 * want to hold to a budget.
 */
const badKeyLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 60,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? ""),
  message: { error: "rate_limited", message: "Too many failed authentication attempts." },
});

const limiter = rateLimit({
  windowMs: RATE_LIMIT.windowMinutes * 60_000,
  max: RATE_LIMIT.requests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req.storefront ? `k${req.storefront.keyId}` : ipKeyGenerator(req.ip ?? "")),
  message: { error: "rate_limited", message: "Too many requests — slow down and cache responses." },
});

/* ── Shared helpers ──────────────────────────────────────────────────────── */

function pageSize(req: Request): number {
  const raw = Number.parseInt(String(req.query.limit ?? ""), 10);
  if (!Number.isFinite(raw) || raw <= 0) return PAGE_SIZE.default;
  return Math.min(raw, PAGE_SIZE.max);
}

/**
 * Cursor paging on the primary key, descending. An id cursor is stable while
 * records are being written underneath it, which an OFFSET is not: a sale
 * recorded mid-sync would otherwise shift every later page by one and hide a row.
 */
function cursorId(req: Request): number | null {
  const raw = Number.parseInt(String(req.query.cursor ?? ""), 10);
  return Number.isFinite(raw) ? raw : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Wraps a page of rows in the envelope the brief documents. */
function page<T extends { id: number }>(res: Response, rows: T[], limit: number): void {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  res.json({
    data,
    nextCursor: hasMore ? String(data[data.length - 1]?.id ?? "") : null,
    hasMore,
  });
}

const num = (v: string | null | undefined): number => parseFloat(v ?? "0") || 0;
const bool = (v: string | null | undefined): boolean => v === "true";

/* Every route below needs a valid key; scopes are checked per route. */
router.use("/storefront/v1", badKeyLimiter, requireStorefrontKey, limiter);

/* ── The business ────────────────────────────────────────────────────────── */

router.get("/storefront/v1/store", async (req, res): Promise<void> => {
  const { merchantId, scopes } = req.storefront!;
  const [m] = await db
    .select({
      businessName: merchantsTable.businessName, username: merchantsTable.username,
      logoUrl: merchantsTable.logoUrl, email: merchantsTable.email, phone: merchantsTable.phone,
      address: merchantsTable.address, city: merchantsTable.city, country: merchantsTable.country,
      currency: merchantsTable.currency, timezone: merchantsTable.timezone,
    })
    .from(merchantsTable).where(eq(merchantsTable.id, merchantId)).limit(1);
  if (!m) { res.status(404).json({ error: "not_found", message: "Business not found" }); return; }
  res.json({ ...m, scopes });
});

/* ── Catalogue ───────────────────────────────────────────────────────────── */

/** One product as the API presents it. `stock` is withheld without the scope. */
function productPayload(
  row: {
    id: number; name: string; description: string | null; price: string; sku: string | null;
    barcode: string | null; imageUrl: string | null; categoryId: number | null;
    categoryName: string | null; brandName: string | null; taxRate: string | null;
    isActive: string; tags: string[] | null; stockQuantity: number; trackInventory: string;
    createdAt: Date; updatedAt: Date;
  },
  withStock: boolean,
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    price: num(row.price),
    sku: row.sku ?? "",
    barcode: row.barcode ?? "",
    imageUrl: row.imageUrl ?? "",
    categoryId: row.categoryId,
    categoryName: row.categoryName ?? null,
    brandName: row.brandName ?? null,
    taxRate: num(row.taxRate),
    isActive: bool(row.isActive),
    tags: row.tags ?? [],
    ...(withStock ? { stock: bool(row.trackInventory) ? row.stockQuantity : null } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const productColumns = {
  id: productsTable.id, name: productsTable.name, description: productsTable.description,
  price: productsTable.price, sku: productsTable.sku, barcode: productsTable.barcode,
  imageUrl: productsTable.imageUrl, categoryId: productsTable.categoryId,
  categoryName: categoriesTable.name, brandName: brandsTable.name,
  taxRate: productsTable.taxRate, isActive: productsTable.isActive, tags: productsTable.tags,
  stockQuantity: productsTable.stockQuantity, trackInventory: productsTable.trackInventory,
  createdAt: productsTable.createdAt, updatedAt: productsTable.updatedAt,
};

router.get("/storefront/v1/products", requireScope("products:read"), async (req, res): Promise<void> => {
  const { merchantId, scopes } = req.storefront!;
  const limit = pageSize(req);
  const cursor = cursorId(req);
  const updatedSince = parseDate(req.query.updatedSince);
  const categoryId = Number.parseInt(String(req.query.categoryId ?? ""), 10);
  const search = String(req.query.search ?? "").trim();

  const filters: SQL[] = [eq(productsTable.merchantId, merchantId)];
  // Inactive products are a merchant's own business — a storefront should not
  // list them, so they are opt-in rather than filtered out client-side.
  if (String(req.query.includeInactive) !== "true") filters.push(eq(productsTable.isActive, "true"));
  if (cursor !== null) filters.push(lt(productsTable.id, cursor));
  if (updatedSince) filters.push(gte(productsTable.updatedAt, updatedSince));
  if (Number.isFinite(categoryId)) filters.push(eq(productsTable.categoryId, categoryId));
  if (search) {
    const like = `%${search}%`;
    filters.push(or(ilike(productsTable.name, like), ilike(productsTable.sku, like), ilike(productsTable.barcode, like))!);
  }

  const rows = await db.select(productColumns).from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .leftJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
    .where(and(...filters)).orderBy(desc(productsTable.id)).limit(limit + 1);

  const withStock = scopes.includes("inventory:read");
  page(res, rows.map((r) => productPayload(r, withStock)), limit);
});

router.get("/storefront/v1/products/:id", requireScope("products:read"), async (req, res): Promise<void> => {
  const { merchantId, scopes } = req.storefront!;
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(404).json({ error: "not_found", message: "Product not found" }); return; }

  const [row] = await db.select(productColumns).from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .leftJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
    .where(and(eq(productsTable.id, id), eq(productsTable.merchantId, merchantId))).limit(1);
  if (!row) { res.status(404).json({ error: "not_found", message: "Product not found" }); return; }
  res.json(productPayload(row, scopes.includes("inventory:read")));
});

router.get("/storefront/v1/categories", requireScope("products:read"), async (req, res): Promise<void> => {
  const { merchantId } = req.storefront!;
  const limit = pageSize(req);
  const cursor = cursorId(req);
  const filters: SQL[] = [eq(categoriesTable.merchantId, merchantId)];
  if (cursor !== null) filters.push(gt(categoriesTable.id, cursor));

  const rows = await db.select({
    id: categoriesTable.id, name: categoriesTable.name, parentId: categoriesTable.parentId,
    sortOrder: categoriesTable.sortOrder, color: categoriesTable.color, icon: categoriesTable.icon,
  }).from(categoriesTable).where(and(...filters))
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.id)).limit(limit + 1);
  page(res, rows, limit);
});

router.get("/storefront/v1/brands", requireScope("products:read"), async (req, res): Promise<void> => {
  const { merchantId } = req.storefront!;
  const limit = pageSize(req);
  const cursor = cursorId(req);
  const filters: SQL[] = [eq(brandsTable.merchantId, merchantId)];
  if (cursor !== null) filters.push(gt(brandsTable.id, cursor));

  const rows = await db.select({
    id: brandsTable.id, name: brandsTable.name, logoUrl: brandsTable.logoUrl, website: brandsTable.website,
  }).from(brandsTable).where(and(...filters)).orderBy(asc(brandsTable.id)).limit(limit + 1);
  page(res, rows.map((r) => ({ ...r, logoUrl: r.logoUrl ?? "", website: r.website ?? "" })), limit);
});

/* ── Inventory ───────────────────────────────────────────────────────────── */

router.get("/storefront/v1/inventory", requireScope("inventory:read"), async (req, res): Promise<void> => {
  const { merchantId } = req.storefront!;
  const limit = pageSize(req);
  const cursor = cursorId(req);
  const updatedSince = parseDate(req.query.updatedSince);

  const filters: SQL[] = [eq(productsTable.merchantId, merchantId)];
  if (cursor !== null) filters.push(lt(productsTable.id, cursor));
  if (updatedSince) filters.push(gte(productsTable.updatedAt, updatedSince));

  const rows = await db.select({
    id: productsTable.id, sku: productsTable.sku, stockQuantity: productsTable.stockQuantity,
    lowStockThreshold: productsTable.lowStockThreshold, trackInventory: productsTable.trackInventory,
    updatedAt: productsTable.updatedAt,
  }).from(productsTable).where(and(...filters)).orderBy(desc(productsTable.id)).limit(limit + 1);

  page(res, rows.map((r) => ({
    id: r.id,
    sku: r.sku ?? "",
    stock: bool(r.trackInventory) ? r.stockQuantity : null,
    lowStockThreshold: r.lowStockThreshold ?? null,
    trackInventory: bool(r.trackInventory),
    updatedAt: r.updatedAt,
  })), limit);
});

/* ── Customers (personal information) ────────────────────────────────────── */

const customerColumns = {
  id: customersTable.id, firstName: customersTable.firstName, lastName: customersTable.lastName,
  company: customersTable.company, email: customersTable.email, phone: customersTable.phone,
  address: customersTable.address, customerGroup: customersTable.customerGroup,
  billingStreet: customersTable.billingStreet, billingCity: customersTable.billingCity,
  billingState: customersTable.billingState, billingPostcode: customersTable.billingPostcode,
  billingCountry: customersTable.billingCountry,
  shippingStreet: customersTable.shippingStreet, shippingCity: customersTable.shippingCity,
  shippingState: customersTable.shippingState, shippingPostcode: customersTable.shippingPostcode,
  shippingCountry: customersTable.shippingCountry,
  loyaltyPoints: customersTable.loyaltyPoints, totalSpent: customersTable.totalSpent,
  visitCount: customersTable.visitCount, agreedToMarketing: customersTable.agreedToMarketing,
  createdAt: customersTable.createdAt, updatedAt: customersTable.updatedAt,
};

type CustomerRow = { [K in keyof typeof customerColumns]: unknown };

/**
 * Deliberately narrower than the table. Portal credentials, internal notes and
 * the warning flags staff write for each other are none of a website's business,
 * so they are not selected at all rather than stripped afterwards.
 */
function customerPayload(r: Record<string, unknown>) {
  const addr = (p: "billing" | "shipping") => ({
    street:   (r[`${p}Street`]   as string | null) ?? "",
    city:     (r[`${p}City`]     as string | null) ?? "",
    state:    (r[`${p}State`]    as string | null) ?? "",
    postcode: (r[`${p}Postcode`] as string | null) ?? "",
    country:  (r[`${p}Country`]  as string | null) ?? "",
  });
  return {
    id: r.id as number,
    firstName: (r.firstName as string | null) ?? "",
    lastName: (r.lastName as string | null) ?? "",
    company: (r.company as string | null) ?? "",
    email: (r.email as string | null) ?? "",
    phone: (r.phone as string | null) ?? "",
    address: (r.address as string | null) ?? "",
    billing: addr("billing"),
    shipping: addr("shipping"),
    customerGroup: (r.customerGroup as string | null) ?? "",
    loyaltyPoints: (r.loyaltyPoints as number) ?? 0,
    totalSpent: num(r.totalSpent as string),
    visitCount: (r.visitCount as number) ?? 0,
    acceptsMarketing: bool(r.agreedToMarketing as string),
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  };
}

router.get("/storefront/v1/customers", requireScope("customers:read"), async (req, res): Promise<void> => {
  const { merchantId } = req.storefront!;
  const limit = pageSize(req);
  const cursor = cursorId(req);
  const updatedSince = parseDate(req.query.updatedSince);
  const search = String(req.query.search ?? "").trim();

  const filters: SQL[] = [eq(customersTable.merchantId, merchantId)];
  if (cursor !== null) filters.push(lt(customersTable.id, cursor));
  if (updatedSince) filters.push(gte(customersTable.updatedAt, updatedSince));
  if (search) {
    const like = `%${search}%`;
    filters.push(or(
      ilike(customersTable.firstName, like), ilike(customersTable.lastName, like),
      ilike(customersTable.email, like), ilike(customersTable.phone, like),
      ilike(customersTable.company, like),
    )!);
  }

  const rows: CustomerRow[] = await db.select(customerColumns).from(customersTable)
    .where(and(...filters)).orderBy(desc(customersTable.id)).limit(limit + 1);
  page(res, rows.map((r) => customerPayload(r as Record<string, unknown>)), limit);
});

router.get("/storefront/v1/customers/:id", requireScope("customers:read"), async (req, res): Promise<void> => {
  const { merchantId } = req.storefront!;
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(404).json({ error: "not_found", message: "Customer not found" }); return; }

  const [row] = await db.select(customerColumns).from(customersTable)
    .where(and(eq(customersTable.id, id), eq(customersTable.merchantId, merchantId))).limit(1);
  if (!row) { res.status(404).json({ error: "not_found", message: "Customer not found" }); return; }
  res.json(customerPayload(row as Record<string, unknown>));
});

/* ── Sales ───────────────────────────────────────────────────────────────── */

const saleColumns = {
  id: transactionsTable.id, receiptNumber: transactionsTable.receiptNumber,
  status: transactionsTable.status, customerId: transactionsTable.customerId,
  subtotal: transactionsTable.subtotal, taxTotal: transactionsTable.taxTotal,
  discountTotal: transactionsTable.discountTotal, total: transactionsTable.total,
  paymentMethod: transactionsTable.paymentMethod, items: transactionsTable.items,
  createdAt: transactionsTable.createdAt,
};

function salePayload(r: {
  id: number; receiptNumber: string; status: string; customerId: number | null;
  subtotal: string; taxTotal: string; discountTotal: string; total: string;
  paymentMethod: string; items: unknown; createdAt: Date;
}) {
  return {
    id: r.id,
    receiptNumber: r.receiptNumber,
    status: r.status,
    customerId: r.customerId,
    subtotal: num(r.subtotal),
    taxTotal: num(r.taxTotal),
    discountTotal: num(r.discountTotal),
    total: num(r.total),
    paymentMethod: r.paymentMethod,
    items: Array.isArray(r.items) ? r.items : [],
    createdAt: r.createdAt,
  };
}

router.get("/storefront/v1/sales", requireScope("sales:read"), async (req, res): Promise<void> => {
  const { merchantId } = req.storefront!;
  const limit = pageSize(req);
  const cursor = cursorId(req);
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  const customerId = Number.parseInt(String(req.query.customerId ?? ""), 10);

  const filters: SQL[] = [eq(transactionsTable.merchantId, merchantId)];
  if (cursor !== null) filters.push(lt(transactionsTable.id, cursor));
  if (from) filters.push(gte(transactionsTable.createdAt, from));
  if (to) filters.push(lt(transactionsTable.createdAt, to));
  if (Number.isFinite(customerId)) filters.push(eq(transactionsTable.customerId, customerId));

  const rows = await db.select(saleColumns).from(transactionsTable)
    .where(and(...filters)).orderBy(desc(transactionsTable.id)).limit(limit + 1);
  page(res, rows.map(salePayload), limit);
});

router.get("/storefront/v1/sales/:id", requireScope("sales:read"), async (req, res): Promise<void> => {
  const { merchantId } = req.storefront!;
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(404).json({ error: "not_found", message: "Sale not found" }); return; }

  const [row] = await db.select(saleColumns).from(transactionsTable)
    .where(and(eq(transactionsTable.id, id), eq(transactionsTable.merchantId, merchantId))).limit(1);
  if (!row) { res.status(404).json({ error: "not_found", message: "Sale not found" }); return; }
  res.json(salePayload(row));
});

/* Anything else under the API base is a typo in the caller's code — answer with
   the same JSON shape as every other error rather than the SPA's 404 HTML. */
router.all("/storefront/v1/*splat", (req, res) => {
  res.status(404).json({ error: "unknown_endpoint", message: `No such endpoint: ${req.method} ${req.path}` });
});

export default router;
