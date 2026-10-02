/*
 * Link previews for shop product pages.
 *
 * Facebook, Messenger, iMessage, WhatsApp, Slack and the rest read a page's
 * og: tags from the HTML and never run its JavaScript, so a single-page app
 * cannot set them itself. The shop's index.html carries the default block —
 * Share.png, the koastal.com.au preview image — between <!--share--> markers;
 * for /product/:id this swaps that block for one that leads with the
 * product's main photo and keeps Share.png as the second image.
 *
 * Kept apart from server.mjs (which listens as soon as it is loaded) so it
 * can be tested; dependency-free like that server.
 */

export const SHARE_IMAGE_PATH = "/api/share-image.png";

const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Product descriptions are free text, sometimes HTML: plain words only. */
export function plainSummary(text, max = 200) {
  const t = String(text ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/* A preview image must be an absolute http(s) URL; the shop API hands out
   site-relative /api/shop/media/… links. Anything else (a data: URL) is
   unusable, so the product falls back to Share.png alone. */
export function absoluteImage(url, origin) {
  if (typeof url !== "string" || !url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return `${origin}${url}`;
  return null;
}

/* The block for a product: its photo first, then Share.png. */
export function productShareBlock(product, { origin, pageUrl }) {
  const share = `${origin}${SHARE_IMAGE_PATH}`;
  const photo = absoluteImage(product.imageUrl, origin);
  const title = `${product.name} | Koastal Kollective`;
  const description = plainSummary(product.description) || "Shop online with Koastal Kollective on the Central Coast.";
  const tags = [
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="Koastal Kollective" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(pageUrl)}" />`,
  ];
  if (photo) tags.push(`<meta property="og:image" content="${esc(photo)}" />`);
  tags.push(
    `<meta property="og:image" content="${esc(share)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
  );
  if (typeof product.price === "number" && Number.isFinite(product.price)) {
    tags.push(
      `<meta property="product:price:amount" content="${product.price.toFixed(2)}" />`,
      `<meta property="product:price:currency" content="AUD" />`,
    );
  }
  // Twitter/X shows one image: the product's when there is one.
  tags.push(
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(photo ?? share)}" />`,
  );
  return { title, block: tags.map((t) => `    ${t}`).join("\n") };
}

/* Swap the marked block (and the <title>) in the shop's index.html. Returns
   the page unchanged if the markers are missing, rather than guessing. */
export function withProductShare(html, product, opts) {
  const start = html.indexOf("<!--share-->");
  const end = html.indexOf("<!--/share-->");
  if (start < 0 || end < start) return html;
  const { title, block } = productShareBlock(product, opts);
  const page = html.slice(0, start) + `<!--share-->\n${block}\n    ` + html.slice(end);
  // A function, not a string: "$&" or "$'" in a product name would otherwise
  // be read as a replacement pattern and splice page content into the title.
  return page.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`);
}

/* /product/<id> below the shop's /shop base, else null. */
export function productIdFromPath(shopPath) {
  const m = /^\/product\/(\d+)\/?$/.exec(shopPath);
  return m ? Number(m[1]) : null;
}
