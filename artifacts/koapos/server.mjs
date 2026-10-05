/*
 * Production server for every path the deployment does not send to /api.
 *
 * Replit routes a deployment by PATH, never by host: "/" is this artifact on
 * every domain attached to the deployment, and the API server only ever sees
 * /api. So this is the one place a request's domain can choose a front end:
 *
 *   koastal.com.au (SITE_DOMAIN)   the Koastal Kollective website at "/", and
 *                                  the online shop under /shop
 *   www.koastal.com.au             301 → the same path on koastal.com.au
 *   koastalkollective.com.au       the website (its app picks a landing page
 *   (WEBSITE_DOMAINS)              from the hostname: /about)
 *   anything else                  the POS (pos.koastal.com.au, koapos.com.au)
 *
 * Dependency-free on purpose: it only ever serves built files, and it has to
 * start fast on an autoscale cold start.
 */
import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { productIdFromPath, withProductShare } from "./share-meta.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 19141;

const toHost = (v) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "");
const list = (v) => v.split(",").map(toHost).filter(Boolean);

const siteHost = toHost(process.env.SITE_DOMAIN || "koastal.com.au");
const websiteHosts = new Set([
  siteHost,
  // koasoft.com.au and the two Toukley domains are forwarded at the registrar
  // now, so they never reach this deployment.
  ...list(process.env.WEBSITE_DOMAINS ?? "koastalkollective.com.au,www.koastalkollective.com.au"),
]);

const SHOP_PREFIX = "/shop";

/* Sent with every response, on every host.
 *  - Framing only by our own pages: the POS can't be loaded invisibly inside
 *    another site to trick a signed-in staff member into clicks (clickjacking).
 *    (frame-ancestors is the only CSP directive set — a script policy would
 *    need the GA tag and every inline script audited first.)
 *  - Referrer: the shop's /c/<token> account links must not travel to other
 *    sites in the Referer header.
 *  - HSTS: always HTTPS. Not includeSubDomains — other koastal.com.au hosts
 *    aren't ours to commit. */
const SECURITY_HEADERS = [
  ["Content-Security-Policy", "frame-ancestors 'self'"],
  ["X-Frame-Options", "SAMEORIGIN"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Strict-Transport-Security", "max-age=31536000"],
  ["X-Content-Type-Options", "nosniff"],
];

const sites = {
  pos: path.resolve(process.env.SPA_DIST_DIR?.trim() || path.join(here, "dist/public")),
  shop: path.resolve(process.env.SHOP_DIST_DIR?.trim() || path.join(here, "../shop/dist/public")),
  website: path.resolve(process.env.WEBSITE_DIST_DIR?.trim() || path.join(here, "../website/dist/public")),
};

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".avif": "image/avif",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".map": "application/json",
  ".wasm": "application/wasm", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".pdf": "application/pdf",
};

function fileIn(root, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return null; }
  const abs = path.resolve(root, "." + rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  try { return statSync(abs).isFile() ? abs : null; } catch { return null; }
}

/* The website is pre-rendered: each route is a real HTML file, so /about is
   answered by about/index.html (or about.html), not by the SPA shell. */
function pageIn(root, urlPath) {
  const p = urlPath.replace(/\/+$/, "");
  if (!p) return null;
  return fileIn(root, `${p}/index.html`) || fileIn(root, `${p}.html`);
}

function send(req, res, file, cacheControl, status = 200) {
  res.writeHead(status, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": statSync(file).size,
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).on("error", () => res.destroy()).pipe(res);
}

function redirect(res, location) {
  res.writeHead(301, { Location: location }).end();
}

/* Serve one built SPA. `urlPath` is relative to the build's root. Only /assets
   is content-hashed by Vite, so only it may be cached for good; index.html
   names those hashes, and caching it would pin a browser to the last deploy. */
function serveSite(req, res, root, urlPath, { prerendered = false } = {}) {
  const index = path.join(root, "index.html");
  const file = (urlPath === "/" ? null : fileIn(root, urlPath)) || (prerendered ? pageIn(root, urlPath) : null);
  const notFound = prerendered ? fileIn(root, "/404/index.html") : null;
  if (file && file !== index) {
    const html = file.endsWith(".html");
    send(req, res, file, urlPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : html ? "no-cache" : "public, max-age=3600");
  } else if (urlPath.startsWith("/assets/")) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  } else if (notFound && urlPath !== "/") {
    // Every page of a pre-rendered site is a file, so no file means no page.
    // Answering with the homepage and a 200 made every mistyped or retired URL
    // a soft 404 that Google kept in its index.
    send(req, res, notFound, "no-cache", 404);
  } else {
    send(req, res, index, "no-cache"); // client-side route
  }
}

/* The website's redirects (retired suburb pages, the KoaSOFT and Kollective
   paths), written by its build as redirects.json: path -> path. Answered here
   with a real 301 rather than the build's meta-refresh stubs. Read once. */
let websiteRedirects;
function websiteRedirect(urlPath) {
  if (websiteRedirects === undefined) {
    try {
      websiteRedirects = new Map(Object.entries(JSON.parse(readFileSync(path.join(sites.website, "redirects.json"), "utf8"))));
    } catch {
      websiteRedirects = new Map();
    }
  }
  return websiteRedirects.get(urlPath.replace(/\/+$/, "")) ?? null;
}

/* A product page's link preview needs the product (share-meta.mjs). The API
   is another process in this deployment: try it directly, then through the
   public domain. Answers are cached briefly so a page load costs at most one
   lookup, and anything slow or failing just leaves the default preview. */
const apiOrigins = [process.env.API_INTERNAL_ORIGIN?.trim() || "http://127.0.0.1:8080", `https://${siteHost}`];
const productCache = new Map(); // id -> { at, product | null }
const PRODUCT_TTL_MS = 5 * 60_000;

async function shopProduct(id) {
  const hit = productCache.get(id);
  if (hit && Date.now() - hit.at < PRODUCT_TTL_MS) return hit.product;
  let product = null;
  for (const origin of apiOrigins) {
    try {
      const r = await fetch(`${origin}/api/shop/products/${id}`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) { product = await r.json(); break; }
      if (r.status === 404) break; // not listed: no point asking again
    } catch { /* unreachable or slow: try the next origin */ }
  }
  if (productCache.size > 500) productCache.clear();
  productCache.set(id, { at: Date.now(), product });
  return product;
}

async function serveShopProduct(req, res, id, shopPath) {
  const index = path.join(sites.shop, "index.html");
  let html = readFileSync(index, "utf8");
  const product = await shopProduct(id);
  if (product?.name) {
    html = withProductShare(html, product, { origin: `https://${siteHost}`, pageUrl: `https://${siteHost}${SHOP_PREFIX}${shopPath}` });
  }
  const body = Buffer.from(html);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  const url = new URL(req.url || "/", "http://x");
  const host = toHost(req.headers.host || "");
  for (const [name, value] of SECURITY_HEADERS) res.setHeader(name, value);

  try {
    if (host === `www.${siteHost}`) {
      redirect(res, `https://${siteHost}${url.pathname}${url.search}`);
    } else if (websiteHosts.has(host)) {
      if (url.pathname === SHOP_PREFIX) {
        redirect(res, `${SHOP_PREFIX}/${url.search}`);
      } else if (url.pathname.startsWith(`${SHOP_PREFIX}/`)) {
        const shopPath = url.pathname.slice(SHOP_PREFIX.length);
        const productId = productIdFromPath(shopPath);
        if (productId) {
          serveShopProduct(req, res, productId, shopPath).catch((err) => {
            console.error(err);
            if (!res.headersSent) serveSite(req, res, sites.shop, shopPath);
          });
        } else {
          serveSite(req, res, sites.shop, shopPath);
        }
      } else {
        const moved = websiteRedirect(url.pathname);
        if (moved) {
          redirect(res, `${moved}${url.search}`);
        } else if (url.pathname.length > 1 && url.pathname.endsWith("/") && pageIn(sites.website, url.pathname)) {
          // One URL per page: /about/ → /about, matching the canonical.
          redirect(res, `${url.pathname.replace(/\/+$/, "")}${url.search}`);
        } else {
          serveSite(req, res, sites.website, url.pathname, { prerendered: true });
        }
      }
    } else {
      serveSite(req, res, sites.pos, url.pathname);
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Serving website + shop on ${[...websiteHosts].join(", ")}, POS elsewhere, on :${port}`);
});
