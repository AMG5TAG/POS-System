// Builds dist/public/search-index.json: the text of every pre-rendered page,
// for the header's site search (@workspace/site-nav, site-search.ts).
//
// Runs after prerender.mjs, from the HTML it wrote, so the index is exactly
// what a visitor reads, with no second copy of the copy to drift. Routes come
// from the sitemap (the same list prerender used), which already leaves out
// redirect stubs and noindex pages.
//
// Suburb pages carry only their title and description. Their body is the same
// template two hundred times over; indexing it would bury the one real page
// for "data recovery" under every suburb that mentions it.
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { readSuburbs, slugify } from "./suburbs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "..", "dist", "public");
const MAX_TEXT = 3000;

const suburbRoutes = new Set(readSuburbs().map((s) => `/computer-repairs/${slugify(s)}`));
const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
/* textContent runs neighbouring elements together ("Lake MacquarieComing
   Soon"); joining the text nodes with a space keeps the words apart. */
function textOf(node) {
  const doc = node.ownerDocument;
  const walk = doc.createTreeWalker(node, 4 /* NodeFilter.SHOW_TEXT */);
  const parts = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) parts.push(n.nodeValue);
  return clean(parts.join(" ")).replace(/ ([.,;:!?)])/g, "$1");
}

const xml = await readFile(join(DIST, "sitemap.xml"), "utf8");
const routes = [...xml.matchAll(/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/g)].map((m) => m[1] || "/");

const pages = [];
for (const route of routes) {
  const file = route === "/" ? join(DIST, "index.html") : join(DIST, route, "index.html");
  if (!existsSync(file)) continue;
  const { document } = new JSDOM(await readFile(file, "utf8")).window;
  const title = clean(document.title).replace(/\s*\|\s*Koastal Kollective\s*$/i, "");
  const description = clean(document.querySelector('meta[name="description"]')?.getAttribute("content"));
  const area = suburbRoutes.has(route);
  let headings = "";
  let text = "";
  if (!area) {
    // The header, menu and footer are on every page; they are not its content.
    document.querySelectorAll("header, nav, footer, script, style, noscript, iframe, svg, template").forEach((n) => n.remove());
    headings = clean([...document.querySelectorAll("h1, h2, h3")].map(textOf).join(" · "));
    text = document.body ? textOf(document.body).slice(0, MAX_TEXT) : "";
  }
  if (!title) continue;
  pages.push({ path: route, title, description, headings, text, ...(area ? { area: true } : {}) });
}

await writeFile(join(DIST, "search-index.json"), JSON.stringify({ pages }));
console.log(`search-index: ${pages.length} pages`);
