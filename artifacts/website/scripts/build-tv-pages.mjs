// Koastal TV Streamer pages: koastal.com.au/tv/<name>
//
// Full-screen display pages for TVs and the Android TV app. Each page is an
// HTML file under artifacts/website/tv/ with its own design: no website
// header, styles or React. tv/<name>.html is /tv/<name>, and folders nest:
// tv/pizzashed/TV1.html is /tv/pizzashed/TV1. This step copies each to
// dist/public/tv/<path>/index.html, which server.mjs already serves per path
// (pageIn), copies every other file (images, CSS, fonts) as it is, so a page
// can use relative links like "assets/menu.css", and writes their sitemap.
//
// They get their own sitemap-tv.xml instead of a place in sitemap.xml on
// purpose: prerender.mjs and build-search-index.mjs read sitemap.xml, and the
// prerender would run the website SPA over /tv/<name>, overwriting the page.
// robots.txt lists both sitemaps, and submit-indexnow.mjs submits both.
//
// Every page is checked, and the build fails rather than ship one that is
// wrong:
//   - the path is the URL: letters, digits and hyphens. URLs are
//     case-sensitive, so /tv/pizzashed/TV1 and /tv/pizzashed/tv1 differ;
//   - <title> ends with "Koastal TV Streamer";
//   - it has a meta description (what Google shows under the title);
//   - it is not noindex.
//
// Injected into every page, so no page can forget them:
//   - a viewport meta, a canonical and the Koastal site icon (the website's
//     /images/favicon.png), if the page has none;
//   - the screen lock: html/body exactly one screen, never scrollable (D-pad
//     focus and scrollIntoView included), no scrollbars, no overscroll;
//   - full screen on the first key press or click in a browser (the Android
//     TV app's WebView is already full screen), and the mouse pointer hidden
//     after 3 s without movement.
//
// Files and folders starting with "_" or "." (the starter template) are never
// published.
//
// Every relative link to a published file (href/src in a page, url() in a page
// or a stylesheet) gets the file's content hash appended: "assets/menu.css" is
// published as "assets/menu.css?v=3f9a1c02be". The server caches those files
// for an hour, so without it a TV kept last hour's stylesheet under a new page
// (prices ran together as "10P$17.9020P$29.90"). A changed file is a new URL,
// so screens pick it up at once.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "tv");
const DIST = join(ROOT, "dist", "public");
const OUT = join(DIST, "tv");
const SITE = "https://koastal.com.au";
const SUFFIX = "Koastal TV Streamer";
const SEGMENT_RE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

const LOCK = `<style data-tv-lock>
html,body{margin:0!important;padding:0!important;width:100vw!important;height:100vh!important;max-width:100vw!important;max-height:100vh!important;overflow:hidden!important;overscroll-behavior:none!important}
html{scrollbar-width:none}
::-webkit-scrollbar{display:none}
html.tv-idle,html.tv-idle *{cursor:none!important}
</style>
<script data-tv-lock>
(function(){
  var d=document,e=d.documentElement;
  function pin(){if(scrollX||scrollY)scrollTo(0,0);if(d.body&&(d.body.scrollTop||d.body.scrollLeft)){d.body.scrollTop=0;d.body.scrollLeft=0}}
  addEventListener("scroll",pin,{passive:true});
  addEventListener("load",pin);
  function full(){if(!d.fullscreenElement&&e.requestFullscreen){e.requestFullscreen().catch(function(){})}}
  addEventListener("keydown",full,{once:true});
  addEventListener("pointerdown",full,{once:true});
  var t;function idle(){e.classList.remove("tv-idle");clearTimeout(t);t=setTimeout(function(){e.classList.add("tv-idle")},3000)}
  addEventListener("pointermove",idle,{passive:true});idle();
})();
</script>`;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function check(name, html) {
  const problems = [];
  if (!name.split("/").every((seg) => SEGMENT_RE.test(seg))) problems.push(`the path must be letters, digits and hyphens (it is the URL /tv/${name})`);
  if (!/<head[\s>]/i.test(html)) problems.push("has no <head>");
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!title) problems.push("has no <title>");
  else if (!title.endsWith(SUFFIX)) problems.push(`<title> must end with "${SUFFIX}" (it is "${title}")`);
  if (!/<meta[^>]+name=["']description["'][^>]*content=["'][^"']+["']/i.test(html)) problems.push("has no meta description (Google shows it under the title)");
  if (/<meta[^>]+name=["'](?:robots|googlebot)["'][^>]*noindex/i.test(html)) problems.push("is noindex, but TV pages are meant to be found on Google");
  return problems;
}

function build(name, html) {
  const extra = [];
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) extra.push(`<meta name="viewport" content="width=device-width, initial-scale=1">`);
  if (!/<link[^>]+rel=["']canonical["']/i.test(html)) extra.push(`<link rel="canonical" href="${esc(`${SITE}/tv/${name}`)}">`);
  if (!/<link[^>]+rel=["'](?:shortcut )?icon["']/i.test(html)) {
    extra.push(
      `<link rel="icon" type="image/png" sizes="180x180" href="/images/favicon.png">`,
      `<link rel="icon" type="image/png" sizes="512x512" href="/images/icon-512.png">`,
      `<link rel="apple-touch-icon" sizes="180x180" href="/images/favicon.png">`,
    );
  }
  extra.push(LOCK);
  // Last in <head>, so the lock wins over the page's own styles.
  return html.replace(/<\/head>/i, `${extra.join("\n")}\n</head>`);
}

// Every published file under tv/, as paths relative to it ("pizzashed/TV1.html").
function walk(dir, rel = "") {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith("_") && !e.name.startsWith("."))
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`]))
    .sort();
}

const all = walk(SRC);
const files = all.filter((f) => f.endsWith(".html"));
const assets = all.filter((f) => !f.endsWith(".html"));

// What a published file's bytes will be (a stylesheet's after its own links
// are fingerprinted, so a new image changes the stylesheet's hash too).
const outputs = new Map();
function output(rel) {
  if (outputs.has(rel)) return outputs.get(rel);
  if (!assets.includes(rel)) return null;
  outputs.set(rel, null); // guards against a stylesheet that links itself
  let body = readFileSync(join(SRC, rel));
  if (rel.endsWith(".css")) body = Buffer.from(fingerprint(body.toString("utf8"), rel));
  outputs.set(rel, body);
  return body;
}
function fingerprint(text, fromFile) {
  const dir = dirname(fromFile);
  const tag = (ref) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(ref) || ref.includes("?")) return ref;
    const body = output(join(dir, ref).split("\\").join("/"));
    return body ? `${ref}?v=${createHash("sha256").update(body).digest("hex").slice(0, 10)}` : ref;
  };
  return text
    .replace(/\b(href|src)=(["'])([^"']+)\2/g, (_, attr, q, ref) => `${attr}=${q}${tag(ref)}${q}`)
    .replace(/url\((["']?)([^"')]+)\1\)/g, (_, q, ref) => `url(${q}${tag(ref)}${q})`);
}
const failures = [];
const pages = [];
for (const file of files) {
  const name = file.slice(0, -".html".length);
  const html = readFileSync(join(SRC, file), "utf8");
  const problems = check(name, html);
  if (problems.length) failures.push(`  tv/${file}:\n${problems.map((p) => `    - ${p}`).join("\n")}`);
  else pages.push({ name, html: build(name, fingerprint(html, file)) });
}
if (failures.length) {
  console.error(`build-tv-pages: ${failures.length} page(s) not published:\n${failures.join("\n")}`);
  process.exit(1);
}

// Start clean, so a deleted page stops being served.
rmSync(OUT, { recursive: true, force: true });
for (const { name, html } of pages) {
  mkdirSync(join(OUT, name), { recursive: true });
  writeFileSync(join(OUT, name, "index.html"), html);
}
for (const file of assets) {
  mkdirSync(dirname(join(OUT, file)), { recursive: true });
  writeFileSync(join(OUT, file), output(file));
}

const today = new Date().toISOString().slice(0, 10);
mkdirSync(DIST, { recursive: true });
writeFileSync(
  join(DIST, "sitemap-tv.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(({ name }) => `  <url>
    <loc>${SITE}/tv/${name}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`).join("\n")}
</urlset>
`,
);
console.log(`build-tv-pages: ${pages.length} TV page(s)${pages.length ? `: ${pages.map((p) => `/tv/${p.name}`).join(", ")}` : ""}, ${assets.length} asset file(s)`);
