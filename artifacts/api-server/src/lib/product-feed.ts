/**
 * The online shop's product feed — one URL that shopping channels fetch on a
 * schedule (Management › Online Store › Shopping Channels).
 *
 * It is written in Google Merchant Center's RSS 2.0 format because that is the
 * one format every channel the business would list on accepts as-is: Google
 * Shopping, Meta (Facebook & Instagram Shops), Pinterest, TikTok and Microsoft
 * (Bing) Merchant Center. One feed, so the five can't disagree about a price.
 *
 * Nothing here touches `db` or `req` — the route gathers rows, this decides
 * what a channel is told — so the rules are testable on their own
 * (`product-feed.test.ts`). Rules worth knowing:
 *
 *   - The feed carries exactly what the shop shows (`shopVisible`), *including*
 *     out-of-stock products: channels want them marked out_of_stock, not
 *     removed and re-added, which resets their review.
 *   - Services, ePay/gift-card lines, $0 products and products with no web
 *     photo are left out — the channels' policies reject each, and one rejected
 *     item is a warning on the whole account. `feedSkipReason` names why, and
 *     the settings screen shows the counts so the fix is obvious.
 *   - Prices are the shelf price in AUD, GST included, as Australian listings
 *     must be. Variants become their own items sharing an `item_group_id`.
 *   - A barcode is sent as a GTIN only when its check digit is valid; a bad
 *     GTIN gets the item disapproved, whereas no GTIN just sends
 *     `identifier_exists=no`.
 */

export const FEED_MAX_ADDITIONAL_IMAGES = 10;

export interface FeedVariant {
  id: number;
  name: string;
  price: number | null;
  barcode: string | null;
  stockQuantity: number;
  imageUrl: string | null;
  attributes: Record<string, string> | null;
}

export interface FeedProduct {
  id: number;
  name: string;
  description: string | null;
  price: number;
  barcode: string | null;
  brand: string | null;
  imageUrl: string | null;
  /** Gallery after the primary image (`products.media`). */
  media: { type?: string; url?: string }[] | null;
  /** "Phones > Accessories", root first. */
  categoryPath: string | null;
  refurbished: boolean;
  trackInventory: boolean;
  stockQuantity: number;
  /** The product type tracks stock (false for services and similar). */
  typeTracksStock: boolean | null;
  isService: boolean;
  isEpay: boolean;
  weightKg: number | null;
  /** Active pre-order (lib/pre-orders.ts) — release date YYYY-MM-DD, if set. */
  preOrder: { releaseDate: string | null } | null;
  variants: FeedVariant[];
}

export type FeedSkipReason = "service" | "giftCard" | "noPrice" | "noImage";

export interface FeedContext {
  /** Absolute shop base, no trailing slash: https://koastal.com.au/shop */
  shopOrigin: string;
  /** Absolute site origin that `/api/...` paths are resolved against. */
  siteOrigin: string;
  /** Turns a stored upload address into the public shop one (shopMediaUrl). */
  mediaUrl: (url: string) => string;
  title: string;
  /** Fallback brand when a product has none — usually the business name. */
  defaultBrand?: string | null;
}

/** An absolute http(s) URL for an image a channel can fetch, or null (data: URLs, blanks). */
export function absoluteImage(url: string | null | undefined, ctx: Pick<FeedContext, "siteOrigin" | "mediaUrl">): string | null {
  if (!url) return null;
  const u = ctx.mediaUrl(url.trim());
  if (/^https?:\/\//i.test(u)) return u.replace(/^http:\/\//i, "https://");
  if (u.startsWith("/")) return ctx.siteOrigin + u;
  return null;
}

/** Why a product is left out of the feed, or null if it goes in. */
export function feedSkipReason(p: FeedProduct, ctx: Pick<FeedContext, "siteOrigin" | "mediaUrl">): FeedSkipReason | null {
  if (p.isService) return "service";
  if (p.isEpay) return "giftCard";
  if (!(p.price > 0) && !p.variants.some((v) => (v.price ?? 0) > 0)) return "noPrice";
  if (!absoluteImage(p.imageUrl, ctx) && !p.variants.some((v) => absoluteImage(v.imageUrl, ctx))) return "noImage";
  return null;
}

/** A barcode that is a valid GTIN-8/12/13/14 (check digit verified), or null. */
export function validGtin(barcode: string | null | undefined): string | null {
  const d = (barcode ?? "").replace(/[\s-]/g, "");
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(d)) return null;
  if (/^0+$/.test(d)) return null;
  const digits = d.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check ? d : null;
}

/** Plain text from a product description that may hold HTML from the editor. */
export function plainText(html: string | null | undefined, max = 5000): string {
  const text = (html ?? "")
    .replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

const INVALID_XML = /[^\x09\x0A\x0D\x20-퟿-�]/g;
export function xmlEscape(s: string): string {
  return s.replace(INVALID_XML, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const money = (n: number) => `${n.toFixed(2)} AUD`;

function availability(p: FeedProduct, stock: number): { value: string; date?: string } {
  if (p.preOrder) {
    return p.preOrder.releaseDate
      ? { value: "preorder", date: `${p.preOrder.releaseDate}T00:00:00+10:00` }
      : { value: "preorder" };
  }
  const untracked = p.typeTracksStock === false || !p.trackInventory;
  return { value: untracked || stock > 0 ? "in_stock" : "out_of_stock" };
}

/** One <item> per product, or per variant when the product has variants. */
export function feedItems(p: FeedProduct, ctx: FeedContext): string[] {
  const link = `${ctx.shopOrigin}/product/${p.id}`;
  const description = plainText(p.description) || p.name;
  const brand = (p.brand ?? "").trim() || (ctx.defaultBrand ?? "").trim() || null;
  const gallery = (p.media ?? [])
    .filter((m) => m && m.type !== "video")
    .map((m) => absoluteImage(m.url, ctx))
    .filter((u): u is string => !!u);
  const mainImage = absoluteImage(p.imageUrl, ctx);

  const base = (fields: [string, string | null | undefined][]) =>
    "    <item>\n" +
    fields.filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `      <${k}>${xmlEscape(String(v))}</${k}>`).join("\n") +
    "\n    </item>";

  const common = (title: string, image: string | null, extra: string[]): [string, string | null | undefined][] => [
    ["title", title.slice(0, 150)],
    ["g:description", description],
    ["link", link],
    ["g:image_link", image],
    ...extra.filter((u) => u !== image).slice(0, FEED_MAX_ADDITIONAL_IMAGES).map((u): [string, string] => ["g:additional_image_link", u]),
    ["g:condition", p.refurbished ? "refurbished" : "new"],
    ["g:brand", brand],
    ["g:product_type", p.categoryPath],
    ["g:shipping_weight", p.weightKg != null && p.weightKg > 0 ? `${p.weightKg} kg` : null],
  ];

  if (p.variants.length === 0) {
    const a = availability(p, p.stockQuantity);
    const gtin = validGtin(p.barcode);
    return [base([
      ["g:id", `P${p.id}`],
      ...common(p.name, mainImage, gallery),
      ["g:price", money(p.price)],
      ["g:availability", a.value],
      ["g:availability_date", a.date],
      ["g:gtin", gtin],
      ["g:identifier_exists", gtin ? null : "no"],
    ])];
  }

  return p.variants
    .filter((v) => (v.price ?? p.price) > 0)
    .map((v) => {
      const a = availability(p, v.stockQuantity);
      const gtin = validGtin(v.barcode);
      const image = absoluteImage(v.imageUrl, ctx) ?? mainImage;
      const attrs = v.attributes ?? {};
      const attr = (re: RegExp) => Object.entries(attrs).find(([k]) => re.test(k))?.[1] ?? null;
      return base([
        ["g:id", `P${p.id}-V${v.id}`],
        ["g:item_group_id", `P${p.id}`],
        ...common(`${p.name} - ${v.name}`, image, [mainImage, ...gallery].filter((u): u is string => !!u)),
        ["g:price", money(v.price ?? p.price)],
        ["g:availability", a.value],
        ["g:availability_date", a.date],
        ["g:gtin", gtin],
        ["g:identifier_exists", gtin ? null : "no"],
        ["g:color", attr(/^colou?r$/i)],
        ["g:size", attr(/^size$/i)],
        ["g:material", attr(/^material$/i)],
      ]);
    });
}

export interface FeedResult {
  xml: string;
  included: number;
  skipped: Record<FeedSkipReason, number>;
}

export function buildProductFeed(products: FeedProduct[], ctx: FeedContext): FeedResult {
  const skipped: Record<FeedSkipReason, number> = { service: 0, giftCard: 0, noPrice: 0, noImage: 0 };
  const items: string[] = [];
  for (const p of products) {
    const reason = feedSkipReason(p, ctx);
    if (reason) { skipped[reason]++; continue; }
    items.push(...feedItems(p, ctx));
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(ctx.title)}</title>
    <link>${xmlEscape(ctx.shopOrigin)}</link>
    <description>${xmlEscape(`Products from ${ctx.title}`)}</description>
${items.join("\n")}
  </channel>
</rss>
`;
  return { xml, included: items.length, skipped };
}
