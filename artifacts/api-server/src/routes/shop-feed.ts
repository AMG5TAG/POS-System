import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { db, productsTable, productVariantsTable, productTypesTable, categoriesTable, brandsTable, merchantsTable, shopSettingsTable, type ProductMediaItem } from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { soleMerchantId } from "../lib/sole-merchant";
import { shopVisible } from "../lib/shop-visibility";
import { shopMediaUrl } from "../lib/shop-media";
import { isPreOrderActive, localDate } from "../lib/pre-orders";
import { shopOrigin, siteDomain } from "../lib/publicUrl";
import { buildProductFeed, type FeedProduct, type FeedResult } from "../lib/product-feed";

/**
 * Shopping channels — the product feed that Google Shopping, Meta (Facebook &
 * Instagram), Pinterest, TikTok and Microsoft Merchant Center fetch from
 * koastal.com.au (format and rules: lib/product-feed.ts).
 *
 *   GET  /shop/feed/<token>.xml   public; the channels fetch this
 *   GET  /online-store/feed       Management › Online Store › Shopping Channels
 *   PUT  /online-store/feed       { enabled, newLink? } — turn on/off, or replace the link
 *
 * The token keeps the whole catalogue from being one anonymous request away
 * and lets the owner cut a channel off by replacing the link. It is not a
 * secret in any stronger sense — every product in it is on the shop already.
 */

const router: IRouter = Router();

async function feedToken(merchantId: number): Promise<string | null> {
  const [row] = await db.select({ t: shopSettingsTable.feedToken }).from(shopSettingsTable)
    .where(eq(shopSettingsTable.merchantId, merchantId)).limit(1);
  return row?.t || null;
}

const feedUrl = (token: string) => `https://${siteDomain()}/api/shop/feed/${token}.xml`;

/** Everything the shop shows, shaped for the feed builder. */
export async function loadFeedProducts(merchantId: number): Promise<FeedProduct[]> {
  const rows = await db
    .select({ p: productsTable, brandName: brandsTable.name, typeTracksStock: productTypesTable.trackStock, isService: productTypesTable.isService })
    .from(productsTable)
    .leftJoin(brandsTable, eq(brandsTable.id, productsTable.brandId))
    .leftJoin(productTypesTable, eq(productTypesTable.id, productsTable.productTypeId))
    .where(shopVisible(merchantId))
    .orderBy(asc(productsTable.id));
  if (rows.length === 0) return [];

  const cats = await db.select({ id: categoriesTable.id, name: categoriesTable.name, parentId: categoriesTable.parentId })
    .from(categoriesTable).where(eq(categoriesTable.merchantId, merchantId));
  const byId = new Map(cats.map((c) => [c.id, c]));
  const pathOf = (id: number | null): string | null => {
    const names: string[] = [];
    const seen = new Set<number>();
    for (let c = id != null ? byId.get(id) : undefined; c && !seen.has(c.id); c = c.parentId != null ? byId.get(c.parentId) : undefined) {
      seen.add(c.id);
      names.unshift(c.name);
    }
    return names.length ? names.join(" > ") : null;
  };

  const variants = await db.select().from(productVariantsTable)
    .where(and(inArray(productVariantsTable.productId, rows.map((r) => r.p.id)), eq(productVariantsTable.isActive, "true")))
    .orderBy(asc(productVariantsTable.sortOrder), asc(productVariantsTable.id));
  const variantsOf = new Map<number, typeof variants>();
  for (const v of variants) variantsOf.set(v.productId, [...(variantsOf.get(v.productId) ?? []), v]);

  const today = localDate("Australia/Sydney");
  return rows.map(({ p, brandName, typeTracksStock, isService }) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: parseFloat(p.price),
    barcode: p.barcode,
    brand: brandName,
    imageUrl: p.imageUrl,
    media: (p.media ?? []) as ProductMediaItem[],
    categoryPath: pathOf(p.categoryId),
    refurbished: p.isRefurbished === "true",
    trackInventory: p.trackInventory === "true",
    stockQuantity: p.stockQuantity,
    typeTracksStock,
    isService: isService === true,
    isEpay: p.isEpay === "true",
    weightKg: p.weightKg != null ? parseFloat(p.weightKg) : null,
    preOrder: isPreOrderActive(p, today) ? { releaseDate: p.preOrderReleaseDate ?? null } : null,
    variants: (variantsOf.get(p.id) ?? []).map((v) => ({
      id: v.id, name: v.name, price: v.price != null ? parseFloat(v.price) : null, barcode: v.barcode,
      stockQuantity: v.stockQuantity, imageUrl: v.imageUrl, attributes: v.attributes ?? null,
    })),
  }));
}

async function buildFeed(merchantId: number): Promise<FeedResult> {
  const [m] = await db.select({ businessName: merchantsTable.businessName }).from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const name = m?.businessName?.trim() || "Online shop";
  return buildProductFeed(await loadFeedProducts(merchantId), {
    shopOrigin: shopOrigin(),
    siteOrigin: `https://${siteDomain()}`,
    mediaUrl: shopMediaUrl,
    title: name,
    defaultBrand: null,
  });
}

/* Channels fetch daily at most, but a misconfigured one can poll hard; one
   build is shared for a few minutes. */
const CACHE_MS = 5 * 60_000;
let cached: { token: string; at: number; xml: string } | null = null;
export function resetFeedCache() { cached = null; }

router.get("/shop/feed/:file", async (req, res): Promise<void> => {
  const merchantId = await soleMerchantId();
  const given = String(req.params.file ?? "").replace(/\.xml$/i, "");
  const token = merchantId == null ? null : await feedToken(merchantId);
  const ok = token != null && given.length === token.length
    && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
  if (!ok || merchantId == null) { res.status(404).type("text/plain").send("Not found"); return; }
  if (!cached || cached.token !== token || Date.now() - cached.at > CACHE_MS) {
    cached = { token, at: Date.now(), xml: (await buildFeed(merchantId)).xml };
  }
  res.set("Cache-Control", "public, max-age=300");
  res.set("X-Robots-Tag", "noindex");
  res.type("application/xml; charset=utf-8").send(cached.xml);
});

router.get("/online-store/feed", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const token = await feedToken(merchantId);
  const { included, skipped } = await buildFeed(merchantId);
  res.json({ enabled: token != null, url: token ? feedUrl(token) : null, included, skipped });
});

const FeedBody = z.object({ enabled: z.boolean(), newLink: z.boolean().optional() });

router.put("/online-store/feed", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = FeedBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Expected { enabled: boolean, newLink?: boolean }" }); return; }
  const merchantId = req.session.merchantId!;
  const current = await feedToken(merchantId);
  const next = !parsed.data.enabled ? null
    : (current && !parsed.data.newLink) ? current
    : crypto.randomBytes(18).toString("base64url");
  await db.insert(shopSettingsTable).values({ merchantId, feedToken: next })
    .onConflictDoUpdate({ target: shopSettingsTable.merchantId, set: { feedToken: next } });
  resetFeedCache();
  res.json({ enabled: next != null, url: next ? feedUrl(next) : null });
});

export default router;
