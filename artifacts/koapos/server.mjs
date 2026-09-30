/*
 * Production server for every path the deployment does not send to /api.
 *
 * Replit routes a deployment by PATH, never by host: "/" is this artifact on
 * every domain attached to the deployment, and the API server only ever sees
 * /api. So this is the one place a request's domain can choose a front end —
 * the online shop's build on SHOP_DOMAIN (default shop.koastal.com.au), the
 * POS's everywhere else. That is what lets the shop live at the root of its own
 * domain instead of under /shop.
 *
 * Dependency-free on purpose: it only ever serves two directories of built
 * files, and it has to start fast on an autoscale cold start.
 */
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 19141;

const toHost = (v) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "");
const shopHost = toHost(process.env.SHOP_DOMAIN || "shop.koastal.com.au");

const sites = {
  pos: path.resolve(process.env.SPA_DIST_DIR?.trim() || path.join(here, "dist/public")),
  shop: path.resolve(process.env.SHOP_DIST_DIR?.trim() || path.join(here, "../shop/dist/public")),
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

createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  const url = new URL(req.url || "/", "http://x");
  const isShop = toHost(req.headers.host || "") === shopHost;

  /* The shop briefly lived under /shop on its own domain, and set-password
     emails went out carrying that path. Send them to the same page at the root. */
  if (isShop && /^\/shop(\/|$)/.test(url.pathname)) {
    res.writeHead(301, { Location: (url.pathname.slice(5) || "/") + url.search }).end();
    return;
  }

  const root = isShop ? sites.shop : sites.pos;
  const index = path.join(root, "index.html");
  const file = url.pathname === "/" ? null : fileIn(root, url.pathname);

  try {
    // Only /assets is content-hashed by Vite, so only it may be cached for good.
    // index.html names those hashes: caching it would pin a till to the last deploy.
    if (file && file !== index) {
      send(req, res, file, url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    } else if (url.pathname.startsWith("/assets/")) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    } else {
      send(req, res, index, "no-cache"); // client-side route
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Serving POS from ${sites.pos}, shop (${shopHost}) from ${sites.shop} on :${port}`);
});
