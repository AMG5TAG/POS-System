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
 *   the website's other domains    the website (koasoft.com.au etc.; its app
 *   (WEBSITE_DOMAINS)              picks a landing page from the hostname)
 *   anything else                  the POS (pos.koastal.com.au, koapos.com.au)
 *
 * Dependency-free on purpose: it only ever serves built files, and it has to
 * start fast on an autoscale cold start.
 */
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 19141;

const toHost = (v) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "");
const list = (v) => v.split(",").map(toHost).filter(Boolean);

const siteHost = toHost(process.env.SITE_DOMAIN || "koastal.com.au");
const websiteHosts = new Set([
  siteHost,
  ...list(process.env.WEBSITE_DOMAINS ?? [
    "koasoft.com.au", "www.koasoft.com.au",
    "koastalkollective.com.au", "www.koastalkollective.com.au",
    "toukleycomputerrepairs.com.au", "www.toukleycomputerrepairs.com.au",
    "toukleyphonerepairs.com.au", "www.toukleyphonerepairs.com.au",
  ].join(",")),
]);

const SHOP_PREFIX = "/shop";

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

function send(req, res, file, cacheControl) {
  res.writeHead(200, {
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
  if (file && file !== index) {
    const html = file.endsWith(".html");
    send(req, res, file, urlPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : html ? "no-cache" : "public, max-age=3600");
  } else if (urlPath.startsWith("/assets/")) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  } else {
    send(req, res, index, "no-cache"); // client-side route
  }
}

createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  const url = new URL(req.url || "/", "http://x");
  const host = toHost(req.headers.host || "");

  try {
    if (host === `www.${siteHost}`) {
      redirect(res, `https://${siteHost}${url.pathname}${url.search}`);
    } else if (websiteHosts.has(host)) {
      if (url.pathname === SHOP_PREFIX) {
        redirect(res, `${SHOP_PREFIX}/${url.search}`);
      } else if (url.pathname.startsWith(`${SHOP_PREFIX}/`)) {
        serveSite(req, res, sites.shop, url.pathname.slice(SHOP_PREFIX.length));
      } else {
        serveSite(req, res, sites.website, url.pathname, { prerendered: true });
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
