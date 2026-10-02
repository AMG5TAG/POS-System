import type { Request, Response } from "express";
import { servedContentType } from "./safe-content-type";
import { db, productsTable, productVariantsTable, categoriesTable, type ProductMediaItem } from "@workspace/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { shopVisible } from "./shop-visibility";

/**
 * Public media for the online shop.
 *
 * Uploaded files live at /api/storage/objects/merchants/<id>/…, which needs a
 * POS staff session — so a shopper got a 401 for every uploaded product photo
 * and the shop quietly showed its placeholder. The shop instead links
 * /api/shop/media/merchants/<id>/…, which serves a file ONLY while it belongs
 * to something the shop is showing: a listed product's image or gallery, one
 * of its variants, or a shown category. Nothing else in storage becomes
 * public, and no stored object or its ACL is changed.
 */

const STAFF_PREFIX = "/api/storage/objects/";
const SHOP_PREFIX = "/api/shop/media/";

/** Rewrite a stored upload's address to the shop's public one; any other URL (https, data:) is left alone. */
export function shopMediaUrl<T extends string | null | undefined>(url: T): T {
  return (typeof url === "string" && url.startsWith(STAFF_PREFIX) ? SHOP_PREFIX + url.slice(STAFF_PREFIX.length) : url) as T;
}

const TTL_MS = 60_000;
const MISS_REFRESH_MS = 10_000; // a just-added image appears within seconds, without a DB query per bad request
let cache: { merchantId: number; at: number; paths: Set<string> } | null = null;

async function loadPaths(merchantId: number): Promise<Set<string>> {
  const paths = new Set<string>();
  const add = (u: string | null | undefined) => { if (u && u.startsWith(STAFF_PREFIX)) paths.add(u.slice(STAFF_PREFIX.length)); };
  const products = await db.select({ id: productsTable.id, imageUrl: productsTable.imageUrl, media: productsTable.media })
    .from(productsTable).where(shopVisible(merchantId));
  for (const p of products) {
    add(p.imageUrl);
    for (const m of (p.media ?? []) as ProductMediaItem[]) add(m?.url);
  }
  const ids = products.map((p) => p.id);
  if (ids.length) {
    const variants = await db.select({ imageUrl: productVariantsTable.imageUrl }).from(productVariantsTable)
      .where(and(inArray(productVariantsTable.productId, ids), isNotNull(productVariantsTable.imageUrl)));
    variants.forEach((v) => add(v.imageUrl));
  }
  const cats = await db.select({ imageUrl: categoriesTable.imageUrl }).from(categoriesTable)
    .where(and(eq(categoriesTable.merchantId, merchantId), eq(categoriesTable.showOnline, "true"), isNotNull(categoriesTable.imageUrl)));
  cats.forEach((c) => add(c.imageUrl));
  return paths;
}

export async function isShopMedia(merchantId: number, path: string): Promise<boolean> {
  const now = Date.now();
  const fresh = cache && cache.merchantId === merchantId && now - cache.at < TTL_MS;
  if (fresh && cache!.paths.has(path)) return true;
  if (!fresh || now - cache!.at >= MISS_REFRESH_MS) {
    cache = { merchantId, at: now, paths: await loadPaths(merchantId) };
    return cache.paths.has(path);
  }
  return false;
}

/** Test hook. */
export function resetShopMediaCache() { cache = null; }

/** Parse a single `bytes=a-b` range against a file size; null when absent or unsatisfiable. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start: number, end: number;
  if (m[1] === "") { const n = Number(m[2]); start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

const storage = new ObjectStorageService();

/** Stream a public shop file, honouring Range so video can seek (iOS Safari refuses to play without it). */
export async function serveShopMedia(req: Request, res: Response, merchantId: number, path: string): Promise<void> {
  if (!path.startsWith(`merchants/${merchantId}/`) || path.includes("..") || !(await isShopMedia(merchantId, path))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  try {
    const file = await storage.getObjectEntityFile(`/objects/${path}`);
    const [meta] = await file.getMetadata();
    const size = Number(meta.size ?? 0);
    // Served on koastal.com.au, beside the shopper's session: never as a page.
    const served = servedContentType(meta.contentType as string | undefined);
    res.setHeader("Content-Type", served.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!served.inline) res.setHeader("Content-Disposition", "attachment");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    if (meta.etag) res.setHeader("ETag", String(meta.etag));
    const range = parseRange(req.header("range"), size);
    if (range === "invalid") {
      res.status(416).setHeader("Content-Range", `bytes */${size}`);
      res.end();
      return;
    }
    if (range) {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
      res.setHeader("Content-Length", String(range.end - range.start + 1));
      if (req.method === "HEAD") { res.end(); return; }
      file.createReadStream({ start: range.start, end: range.end }).on("error", () => res.destroy()).pipe(res);
      return;
    }
    if (size) res.setHeader("Content-Length", String(size));
    if (req.method === "HEAD") { res.end(); return; }
    file.createReadStream().on("error", () => res.destroy()).pipe(res);
  } catch (e) {
    if (e instanceof ObjectNotFoundError) { res.status(404).json({ error: "Not found" }); return; }
    throw e;
  }
}

/** How the shop plays a product video: an uploaded/direct file in a <video>,
 *  or a YouTube/Vimeo embed (with its thumbnail where one is predictable). */
export function describeVideo(url: string): { provider: "file" | "youtube" | "vimeo"; embedUrl: string | null; thumbnail: string | null } {
  const yt = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  if (yt) return { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`, thumbnail: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` };
  const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vm) return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${vm[1]}`, thumbnail: null };
  return { provider: "file", embedUrl: null, thumbnail: null };
}
