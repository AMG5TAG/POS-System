import { Router, type IRouter } from "express";
import {
  db,
  onlineStoreSettingsTable,
  merchantsTable,
  productsTable,
  categoriesTable,
  discountsTable,
  customersTable,
  deliveryOrdersTable,
  productReviewsTable,
} from "@workspace/db";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { formatAddressParts } from "../lib/address";
import { z } from "zod/v4";
import { sendEmail } from "../services/email";

/*
 * Public, unauthenticated storefront commerce endpoints for the website builder.
 * Mirrors the public store endpoint in online-store.ts (resolve by merchant
 * username; only published "builder" stores are served). No session required —
 * these are hit by anonymous shoppers, so every figure is recomputed server-side
 * from the database. The client price is never trusted.
 *
 *   GET  /online-store/public/b/:username/o/:slug/catalog
 *   POST /online-store/public/b/:username/o/:slug/checkout
 */

const router: IRouter = Router();

type StoreContext = {
  merchantId: number;
  storeName: string;
  features: Record<string, boolean>;
  updatedAt: Date;
};

/** Resolve a published builder store by merchant username, or null. */
async function resolvePublishedStore(username: string): Promise<StoreContext | null> {
  const u = username.trim().toLowerCase();
  if (!u) return null;
  const [merchant] = await db
    .select({ id: merchantsTable.id })
    .from(merchantsTable)
    .where(eq(merchantsTable.username, u))
    .limit(1);
  if (!merchant) return null;
  const [row] = await db
    .select()
    .from(onlineStoreSettingsTable)
    .where(eq(onlineStoreSettingsTable.merchantId, merchant.id))
    .limit(1);
  if (!row || row.published !== "true" || row.mode !== "builder") return null;
  let features: Record<string, boolean> = {};
  try { features = JSON.parse(row.features) as Record<string, boolean>; } catch { /* default empty */ }
  return { merchantId: merchant.id, storeName: row.storeName || "Online Store", features, updatedAt: row.updatedAt };
}

/* ── sitemap.xml (crawlable discovery for the store) ─────────────────────── */

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
}

router.get("/online-store/public/b/:username/o/:slug/sitemap.xml", async (req, res): Promise<void> => {
  const username = String(req.params.username || "");
  const slug = String(req.params.slug || "");
  const store = await resolvePublishedStore(username);
  if (!store) { res.status(404).type("text/plain").send("Not found"); return; }

  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol || "https";
  const host = req.headers.host || "koapos.com.au";
  const loc = `${proto}://${host}/b/${encodeURIComponent(username)}/o/${encodeURIComponent(slug)}`;
  const lastmod = store.updatedAt.toISOString().slice(0, 10);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${escapeXml(loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq></url>\n` +
    `</urlset>\n`;
  res.type("application/xml").send(xml);
});

/* ── GET catalog ─────────────────────────────────────────────────────────── */

router.get("/online-store/public/b/:username/o/:slug/catalog", async (req, res): Promise<void> => {
  const store = await resolvePublishedStore(String(req.params.username || ""));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }

  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      description: productsTable.description,
      price: productsTable.price,
      imageUrl: productsTable.imageUrl,
      sku: productsTable.sku,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      trackInventory: productsTable.trackInventory,
      stockQuantity: productsTable.stockQuantity,
      taxRate: productsTable.taxRate,
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(and(eq(productsTable.merchantId, store.merchantId), eq(productsTable.isActive, "true")));

  // Per-product review summary (approved only), merged onto each catalog item.
  const summaryRows = await db
    .select({
      productId: productReviewsTable.productId,
      avg: sql<string>`avg(${productReviewsTable.rating})`,
      cnt: sql<string>`count(*)`,
    })
    .from(productReviewsTable)
    .where(and(eq(productReviewsTable.merchantId, store.merchantId), eq(productReviewsTable.status, "approved")))
    .groupBy(productReviewsTable.productId);
  const summary = new Map(summaryRows.map((r) => [r.productId, { avg: Math.round(parseFloat(r.avg) * 10) / 10, cnt: Number(r.cnt) }]));

  res.json({
    storeName: store.storeName,
    checkoutEnabled: store.features.checkout !== false,
    reviewsEnabled: store.features.reviews === true,
    items: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      price: parseFloat(p.price),
      imageUrl: p.imageUrl ?? "",
      sku: p.sku ?? "",
      categoryId: p.categoryId,
      categoryName: p.categoryName ?? "",
      // In-stock signal only — never leak exact counts to anonymous shoppers.
      inStock: p.trackInventory !== "true" || p.stockQuantity > 0,
      avgRating: summary.get(p.id)?.avg ?? 0,
      reviewCount: summary.get(p.id)?.cnt ?? 0,
    })),
  });
});

/* ── Product reviews (public list + submit) ─────────────────────────────── */

router.get("/online-store/public/b/:username/o/:slug/products/:productId/reviews", async (req, res): Promise<void> => {
  const store = await resolvePublishedStore(String(req.params.username || ""));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }
  const productId = parseInt(String(req.params.productId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid product" }); return; }

  const rows = await db.select().from(productReviewsTable)
    .where(and(
      eq(productReviewsTable.merchantId, store.merchantId),
      eq(productReviewsTable.productId, productId),
      eq(productReviewsTable.status, "approved"),
    ))
    .orderBy(desc(productReviewsTable.createdAt));

  const count = rows.length;
  const average = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
  res.json({
    summary: { average, count },
    items: rows.map((r) => ({
      id: r.id, authorName: r.authorName || "Anonymous", rating: r.rating,
      title: r.title, body: r.body, verified: r.verified === "true",
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

const ReviewBody = z.object({
  authorName: z.string().trim().min(1).max(120),
  authorEmail: z.string().trim().email().max(320),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(140).default(""),
  body: z.string().trim().min(1).max(4000),
});

router.post("/online-store/public/b/:username/o/:slug/products/:productId/reviews", async (req, res): Promise<void> => {
  const store = await resolvePublishedStore(String(req.params.username || ""));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }
  if (store.features.reviews !== true) { res.status(403).json({ error: "Reviews are not enabled for this store" }); return; }
  const productId = parseInt(String(req.params.productId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid product" }); return; }

  const parsed = ReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid review", detail: parsed.error.issues[0]?.message }); return; }
  const body = parsed.data;

  // Product must belong to this merchant and be active.
  const [product] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, store.merchantId), eq(productsTable.isActive, "true")))
    .limit(1);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  // "Verified" = the author's email belongs to a customer who has ordered here.
  const [order] = await db.select({ id: deliveryOrdersTable.id }).from(deliveryOrdersTable)
    .where(and(eq(deliveryOrdersTable.merchantId, store.merchantId), eq(deliveryOrdersTable.customerEmail, body.authorEmail)))
    .limit(1);

  const [row] = await db.insert(productReviewsTable).values({
    merchantId: store.merchantId,
    productId,
    authorName: body.authorName,
    authorEmail: body.authorEmail,
    rating: body.rating,
    title: body.title,
    body: body.body,
    status: "approved",
    verified: order ? "true" : "false",
  }).returning();

  res.status(201).json({
    id: row.id, authorName: row.authorName, rating: row.rating,
    title: row.title, body: row.body, verified: row.verified === "true",
    createdAt: row.createdAt.toISOString(),
  });
});

/* ── POST checkout ───────────────────────────────────────────────────────── */

const CheckoutBody = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive(),
    qty: z.number().int().positive().max(999),
  })).min(1),
  customer: z.object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().max(50).default(""),
  }),
  address: z.object({
    line: z.string().trim().max(300).default(""),
    city: z.string().trim().max(120).default(""),
    state: z.string().trim().max(120).default(""),
    postcode: z.string().trim().max(20).default(""),
  }).default({ line: "", city: "", state: "", postcode: "" }),
  discountCode: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).default(""),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

router.post("/online-store/public/b/:username/o/:slug/checkout", async (req, res): Promise<void> => {
  const store = await resolvePublishedStore(String(req.params.username || ""));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }
  if (store.features.checkout === false) { res.status(403).json({ error: "Online checkout is not enabled for this store" }); return; }

  const parsed = CheckoutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid checkout details", detail: parsed.error.issues[0]?.message }); return; }
  const body = parsed.data;

  // Load the real products (merchant-scoped, active) and recompute everything.
  const ids = [...new Set(body.items.map((i) => i.productId))];
  const products = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.merchantId, store.merchantId), inArray(productsTable.id, ids), eq(productsTable.isActive, "true")));
  const byId = new Map(products.map((p) => [p.id, p]));

  type Line = { productId: number; name: string; qty: number; price: number; taxRate: number; lineTotal: number };
  const lines: Line[] = [];
  for (const item of body.items) {
    const p = byId.get(item.productId);
    if (!p) { res.status(409).json({ error: "One or more products are no longer available." }); return; }
    if (p.trackInventory === "true" && p.stockQuantity < item.qty) {
      res.status(409).json({ error: `"${p.name}" only has ${p.stockQuantity} left in stock.` });
      return;
    }
    const price = parseFloat(p.price);
    lines.push({
      productId: p.id,
      name: p.name,
      qty: item.qty,
      price,
      taxRate: p.taxRate ? parseFloat(p.taxRate) : 0,
      lineTotal: round2(price * item.qty),
    });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

  // ── Discount (reuses the same rules as the POS discount engine) ──
  let discountTotal = 0;
  let appliedCode = "";
  let discountRow: typeof discountsTable.$inferSelect | undefined;
  if (body.discountCode) {
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await db.select().from(discountsTable)
      .where(and(eq(discountsTable.merchantId, store.merchantId), eq(discountsTable.code, body.discountCode)));
    if (!row || row.isActive !== "true") { res.status(400).json({ error: "Invalid or inactive discount code." }); return; }
    if (row.endDate && row.endDate < today) { res.status(400).json({ error: "This discount has expired." }); return; }
    if (row.startDate && row.startDate > today) { res.status(400).json({ error: "This discount isn't active yet." }); return; }
    if (row.maxUses && row.usedCount >= row.maxUses) { res.status(400).json({ error: "This discount has reached its usage limit." }); return; }
    if (row.minOrderAmount && subtotal < parseFloat(row.minOrderAmount)) {
      res.status(400).json({ error: `Spend at least $${row.minOrderAmount} to use this code.` }); return;
    }
    discountTotal = row.type === "percentage"
      ? round2(subtotal * (parseFloat(row.value) / 100))
      : Math.min(parseFloat(row.value), subtotal);
    discountTotal = round2(discountTotal);
    appliedCode = row.code ?? body.discountCode;
    discountRow = row;
  }

  const total = round2(Math.max(0, subtotal - discountTotal));
  // Prices are GST-inclusive (AU retail convention); report the included GST,
  // scaled down by the discount so it never exceeds the amount actually charged.
  const ratio = subtotal > 0 ? total / subtotal : 1;
  const taxTotal = round2(lines.reduce((s, l) => {
    const inclGst = l.taxRate > 0 ? l.lineTotal - l.lineTotal / (1 + l.taxRate / 100) : 0;
    return s + inclGst * ratio;
  }, 0));

  const orderNumber = `WEB-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const nameParts = body.customer.name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? body.customer.name;
  const lastName = nameParts.slice(1).join(" ");
  const addressStr = formatAddressParts(body.address.line, body.address.city, body.address.state, body.address.postcode);

  // ── Persist atomically: decrement stock, bump discount usage, write order ──
  try {
    await db.transaction(async (tx) => {
      for (const l of lines) {
        const p = byId.get(l.productId)!;
        if (p.trackInventory === "true") {
          await tx.update(productsTable)
            .set({ stockQuantity: sql`${productsTable.stockQuantity} - ${l.qty}` })
            .where(and(eq(productsTable.id, l.productId), eq(productsTable.merchantId, store.merchantId)));
        }
      }
      if (discountRow) {
        await tx.update(discountsTable)
          .set({ usedCount: sql`${discountsTable.usedCount} + 1` })
          .where(eq(discountsTable.id, discountRow.id));
      }
      // Upsert customer by email within this merchant.
      const [existingCustomer] = await tx.select().from(customersTable)
        .where(and(eq(customersTable.merchantId, store.merchantId), eq(customersTable.email, body.customer.email)))
        .limit(1);
      if (existingCustomer) {
        await tx.update(customersTable).set({
          totalSpent: sql`${customersTable.totalSpent} + ${total}`,
          visitCount: sql`${customersTable.visitCount} + 1`,
          ...(body.customer.phone ? { phone: body.customer.phone } : {}),
          ...(addressStr ? {
            address: addressStr,                       // denormalised free-text kept for backward-compatible reads
            billingStreet:   body.address.line || null,
            billingCity:     body.address.city || null,
            billingState:    body.address.state || null,
            billingPostcode: body.address.postcode || null,
          } : {}),
        }).where(eq(customersTable.id, existingCustomer.id));
      } else {
        await tx.insert(customersTable).values({
          merchantId: store.merchantId,
          firstName, lastName: lastName || null,
          email: body.customer.email,
          phone: body.customer.phone || null,
          address: addressStr || null,               // denormalised free-text kept for backward-compatible reads
          billingStreet:   body.address.line || null,
          billingCity:     body.address.city || null,
          billingState:    body.address.state || null,
          billingPostcode: body.address.postcode || null,
          totalSpent: String(total),
          visitCount: 1,
        });
      }
      await tx.insert(deliveryOrdersTable).values({
        merchantId: store.merchantId,
        orderId: orderNumber,
        number: orderNumber,
        channel: "Online Store",
        customer: body.customer.name,
        customerEmail: body.customer.email,
        phone: body.customer.phone,
        address: body.address.line,
        city: body.address.city,
        state: body.address.state,
        postcode: body.address.postcode,
        status: "pending",
        placedAt: new Date().toISOString(),
        total: String(total),
        items: JSON.stringify(lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price }))),
        notes: body.notes,
        subtotal: String(subtotal),
        discountCode: appliedCode,
        discountTotal: String(discountTotal),
        taxTotal: String(taxTotal),
        shippingTotal: "0",
        currency: "AUD",
        paymentStatus: "pending",
        paymentProvider: "manual",
        paymentRef: "",
      });
    });
  } catch {
    res.status(500).json({ error: "Could not place your order. Please try again." });
    return;
  }

  // ── Confirmation email (best-effort; never blocks the order) ──
  void sendEmail(store.merchantId, {
    to: body.customer.email,
    subject: `Order confirmed — ${orderNumber}`,
    html: buildConfirmationHtml({ storeName: store.storeName, orderNumber, lines, subtotal, discountTotal, appliedCode, total }),
  }).catch(() => { /* email failure must not fail the order */ });

  res.status(201).json({
    orderNumber, subtotal, discountTotal, taxTotal, total,
    currency: "AUD", paymentStatus: "pending",
  });
});

/* ── Order tracking (public lookup by email + order number) ─────────────── */

const OrderLookupBody = z.object({
  email: z.string().trim().email().max(320),
  orderNumber: z.string().trim().min(3).max(60),
});

router.post("/online-store/public/b/:username/o/:slug/order-lookup", async (req, res): Promise<void> => {
  const store = await resolvePublishedStore(String(req.params.username || ""));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }

  const parsed = OrderLookupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter your email and order number." }); return; }
  const { email, orderNumber } = parsed.data;

  const [row] = await db.select().from(deliveryOrdersTable)
    .where(and(eq(deliveryOrdersTable.merchantId, store.merchantId), eq(deliveryOrdersTable.orderId, orderNumber)))
    .limit(1);
  // Email is checked case-insensitively in app code; both the order number and a
  // matching email are required, so an order number alone never reveals an order.
  if (!row || row.customerEmail.toLowerCase() !== email.toLowerCase()) {
    res.status(404).json({ error: "We couldn't find an order with that email and order number." });
    return;
  }

  let items: { name: string; qty: number; price: number }[] = [];
  try { items = JSON.parse(row.items) as typeof items; } catch { /* leave empty */ }

  res.json({
    orderNumber: row.orderId,
    status: row.status,
    placedAt: row.placedAt || row.createdAt.toISOString(),
    items,
    subtotal: parseFloat(row.subtotal),
    discountTotal: parseFloat(row.discountTotal),
    taxTotal: parseFloat(row.taxTotal),
    total: parseFloat(row.total),
    paymentStatus: row.paymentStatus,
    currency: row.currency,
  });
});

function buildConfirmationHtml(o: {
  storeName: string; orderNumber: string;
  lines: { name: string; qty: number; price: number }[];
  subtotal: number; discountTotal: number; appliedCode: string; total: number;
}): string {
  const rows = o.lines.map((l) =>
    `<tr><td style="padding:4px 0">${l.qty}× ${escapeHtml(l.name)}</td><td style="padding:4px 0;text-align:right">$${(l.price * l.qty).toFixed(2)}</td></tr>`,
  ).join("");
  const discountRow = o.discountTotal > 0
    ? `<tr><td style="padding:4px 0">Discount${o.appliedCode ? ` (${escapeHtml(o.appliedCode)})` : ""}</td><td style="padding:4px 0;text-align:right">−$${o.discountTotal.toFixed(2)}</td></tr>`
    : "";
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2>Thanks for your order!</h2>
      <p>We've received your order <strong>${o.orderNumber}</strong> from <strong>${escapeHtml(o.storeName)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
        ${rows}
        <tr><td style="padding:6px 0;border-top:1px solid #eee">Subtotal</td><td style="padding:6px 0;border-top:1px solid #eee;text-align:right">$${o.subtotal.toFixed(2)}</td></tr>
        ${discountRow}
        <tr><td style="padding:6px 0;font-weight:700">Total</td><td style="padding:6px 0;text-align:right;font-weight:700">$${o.total.toFixed(2)}</td></tr>
      </table>
      <p style="font-size:13px;color:#666">Your order is being processed. We'll be in touch about payment and delivery shortly.</p>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export default router;
