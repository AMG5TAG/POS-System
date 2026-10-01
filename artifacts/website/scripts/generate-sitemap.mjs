import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readSuburbs, slugify } from "./suburbs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "..", "public", "sitemap.xml");
const appTsx = resolve(__dirname, "..", "src", "App.tsx");

const SITE = "https://koastal.com.au";

// ---------------------------------------------------------------------------
// Auto-discover static routes from App.tsx
// Picks up every path="..." that does NOT contain a dynamic segment (:param)
// and is not a catch-all or internal-only path.
// ---------------------------------------------------------------------------
const EXCLUDE = new Set(["/not-found", "/search"]);

function extractStaticRoutes(src) {
  const routes = new Set();
  // Match path="..." or path='...' attributes on <Route> elements
  const re = /path=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const p = m[1];
    // Skip dynamic segments, wildcards, and excluded routes
    if (p.includes(":") || p.includes("*") || EXCLUDE.has(p)) continue;
    routes.add(p);
  }
  return [...routes].sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    return a.localeCompare(b);
  });
}

const appSrc = readFileSync(appTsx, "utf8");
const staticRoutes = extractStaticRoutes(appSrc);

// ---------------------------------------------------------------------------
// Suburb dynamic routes  (/computer-repairs/:suburb)
//
// Read straight from the app's own suburb data so the sitemap can never claim
// a URL the router will not resolve. This list used to be duplicated here and
// had drifted by seven suburbs, each of which was being submitted to Google
// and IndexNow on every build while rendering the 404 component at HTTP 200.
// ---------------------------------------------------------------------------
const suburbs = readSuburbs();

const suburbRoutes = suburbs.map((s) => `/computer-repairs/${slugify(s)}`);

// ---------------------------------------------------------------------------
// Build sitemap
// ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const allUrls = [...staticRoutes, ...suburbRoutes];

function priority(path) {
  if (path === "/") return "1.0";
  if (path.startsWith("/computer-repairs/")) return "0.7";
  return "0.8";
}

function changefreq(path) {
  return path.startsWith("/computer-repairs/") ? "monthly" : "weekly";
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (path) => `  <url>
    <loc>${SITE}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq(path)}</changefreq>
    <priority>${priority(path)}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

writeFileSync(outPath, xml, "utf8");
console.log(`Wrote ${allUrls.length} URLs to ${outPath}`);
console.log(`  Static routes auto-detected from App.tsx: ${staticRoutes.length}`);
console.log(`  Suburb routes: ${suburbRoutes.length}`);
