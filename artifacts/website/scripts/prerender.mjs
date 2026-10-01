// Pre-renders every sitemap route to static HTML at build time.
//
// WHY: this is a client-rendered SPA served by a static host with a
// `/* -> /index.html` rewrite, so without this pass every URL ships the exact
// same HTML shell — the homepage's <title>/description, no canonical, no
// JSON-LD. Titles, canonicals and structured data are all written by
// `useEffect` (see src/lib/useSeo.ts), which crawlers only see if they execute
// JavaScript. Google does, on a delayed second pass; Bing, most social
// scrapers and the AI crawlers largely do not.
//
// HOW: the app is bundled once as an IIFE (jsdom cannot execute ES modules),
// then executed against a fresh jsdom document per route. Once React has
// committed and the effects have flushed, the resulting DOM is snapshotted to
// dist/public/<route>/index.html. The original <script type="module"> tag is
// left untouched, so the browser still boots the real Vite bundle and takes
// over exactly as before — the snapshot is purely what a crawler reads first.
//
// Chrome/Puppeteer would be the more faithful renderer, but it cannot launch
// in this Nix image (missing libglib/libnss and friends) and would add a
// ~500 MB download to every deploy. The app renders no canvas, charts or
// animation outside unused shadcn primitives, so jsdom produces equivalent
// markup for a fraction of the cost.
//
// Skip with PRERENDER=0. Failures are fatal by design: silently shipping an
// unrendered site is the exact problem this script exists to prevent.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { readSuburbs, slugify } from "./suburbs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist", "public");
const ORIGIN = "https://koastal.com.au";

// Routes render independently, but each jsdom instance is a full DOM plus a
// React tree, so keep a lid on peak memory.
const CONCURRENCY = Number(process.env.PRERENDER_CONCURRENCY || 8);
// Effects that set <title>/canonical/JSON-LD run after commit; this is the
// ceiling we wait for them, not a fixed sleep.
const SETTLE_TIMEOUT_MS = Number(process.env.PRERENDER_TIMEOUT_MS || 25000);
// How long to keep waiting for a canonical after React has already rendered,
// before accepting the snapshot without one.
const CANONICAL_GRACE_MS = Number(process.env.PRERENDER_CANONICAL_GRACE_MS || 1500);

if (process.env.PRERENDER === "0") {
  console.log("prerender: skipped (PRERENDER=0)");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Routes — read back from the sitemap the prebuild step just generated, so the
// two can never disagree about what exists.
// ---------------------------------------------------------------------------
/**
 * Routes that must ship real HTML but must NOT appear in the sitemap.
 *
 * These pages are `noindex`. That directive is worthless if a crawler cannot
 * see it without executing JavaScript — an unrendered URL falls through the
 * SPA rewrite and serves the homepage's HTML, complete with the homepage's
 * canonical. Prerendering them puts the noindex in the raw markup where it is
 * read immediately, while keeping them out of the sitemap where indexable
 * URLs belong.
 */
function noindexRoutes() {
  const suburbs = readSuburbs();
  return [
    "/search",
    "/site-search",
  ];
}

async function readRoutes() {
  const xml = await readFile(join(DIST, "sitemap.xml"), "utf8");
  const routes = new Set(["/"]);
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const path = m[1].trim().replace(ORIGIN, "") || "/";
    if (path.startsWith("/")) routes.add(path);
  }
  for (const r of noindexRoutes()) routes.add(r);
  return [...routes];
}

// ---------------------------------------------------------------------------
// Bundle the app as a single IIFE. Mirrors the aliases and env that
// vite.config.ts provides; CSS is stubbed because it cannot affect markup.
// ---------------------------------------------------------------------------
const stubCss = {
  name: "stub-css",
  setup(b) {
    b.onResolve({ filter: /\.css$/ }, (a) => ({ path: a.path, namespace: "css-stub" }));
    b.onLoad({ filter: /.*/, namespace: "css-stub" }, () => ({ contents: "", loader: "js" }));
  },
};

async function bundleApp() {
  const result = await build({
    entryPoints: [resolve(ROOT, "src", "main.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    jsx: "automatic",
    write: false,
    logLevel: "silent",
    absWorkingDir: ROOT,
    plugins: [stubCss],
    loader: {
      ".png": "empty", ".jpg": "empty", ".jpeg": "empty",
      ".svg": "empty", ".gif": "empty", ".webp": "empty",
    },
    alias: {
      "@": resolve(ROOT, "src"),
      "@assets": resolve(ROOT, "..", "..", "attached_assets"),
    },
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.env.MODE": '"production"',
      "import.meta.env.DEV": "false",
      "import.meta.env.PROD": "true",
      "import.meta.env.SSR": "false",
      "import.meta.env.BASE_URL": JSON.stringify("/"), // always served at the root (vite.config.ts)
    },
  });
  return result.outputFiles[0].text;
}

// ---------------------------------------------------------------------------
// jsdom implements neither matchMedia nor scrollTo, both of which the app
// calls on mount (ThemeToggle, use-mobile, useSeo). Without them React throws
// during render and the snapshot is an empty <div id="root">.
// ---------------------------------------------------------------------------
const SHIMS = `
window.matchMedia = window.matchMedia || function (q) {
  return { matches:false, media:q, onchange:null,
    addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){},
    dispatchEvent(){ return false; } };
};
window.scrollTo = window.scrollTo || function(){};
window.scroll = window.scroll || function(){};
if (!window.IntersectionObserver) {
  window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} takeRecords(){ return []; } };
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
}
`;

function renderRoute(shellHtml, bundleSource, route) {
  return new Promise((resolvePromise) => {
    // The app's own console noise is not this script's problem; real failures
    // surface as an empty #root, which is checked below.
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", () => {});

    const dom = new JSDOM(shellHtml, {
      url: `${ORIGIN}${route}`,
      runScripts: "dangerously",
      pretendToBeVisual: true, // supplies requestAnimationFrame
      virtualConsole,
    });
    const { window } = dom;

    let done = false;
    const finish = (ok, reason) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      let html = null;
      if (ok) {
        try {
          // The IIFE we injected to drive the render must never reach the
          // snapshot — inlining 2.3 MB of bundle source into all 280 files
          // would dwarf the page it is meant to help.
          for (const el of window.document.querySelectorAll("script[data-prerender]")) {
            el.remove();
          }
          window.document.documentElement.setAttribute("data-prerendered", "");
          html = "<!DOCTYPE html>\n" + window.document.documentElement.outerHTML;
        } catch { ok = false; reason = "snapshot failed"; }
      }
      try { window.close(); } catch {}
      resolvePromise({ route, ok, reason, html });
    };

    const timer = setTimeout(() => finish(false, `timed out after ${SETTLE_TIMEOUT_MS}ms`), SETTLE_TIMEOUT_MS);

    try {
      window.eval(SHIMS);
      const script = window.document.createElement("script");
      script.setAttribute("data-prerender", "");
      script.textContent = bundleSource;
      window.document.body.appendChild(script);
    } catch (e) {
      return finish(false, `bundle threw: ${e.message}`);
    }

    // Ready when React has committed content. useSeo's canonical is the last
    // SEO effect to land, so we prefer to wait for it — but not every page
    // calls useSeo (AboutPage currently does not), and a page that never
    // writes one must still prerender rather than hang until the timeout.
    let contentSince = 0;
    const poll = setInterval(() => {
      const doc = window.document;
      const root = doc.getElementById("root");
      if (!root || root.childElementCount === 0) return;
      if (!contentSince) contentSince = Date.now();

      const hasCanonical = !!doc.querySelector('link[rel="canonical"]');
      const isNoindex = /noindex/i.test(
        doc.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "",
      );
      // noindex pages strip their canonical on purpose, so they are ready as
      // soon as the robots directive has been written.
      const settled = hasCanonical || isNoindex;
      const graceExpired = Date.now() - contentSince > CANONICAL_GRACE_MS;
      if (!settled && !graceExpired) return;

      clearInterval(poll);
      // One more macrotask so trailing effects (JSON-LD) flush.
      setTimeout(() => finish(true, settled ? undefined : "no canonical"), 25);
    }, 20);
  });
}

// ---------------------------------------------------------------------------
// Post-processing: strip runtime-injected third-party scripts so the snapshot
// does not make the browser load them twice, and drop the prerender bundle if
// it somehow persisted.
// ---------------------------------------------------------------------------
function clean(html) {
  return html.replace(
    /<script[^>]*src="https:\/\/cdn\.trustindex\.io[^"]*"[^>]*>\s*<\/script>/g,
    "",
  );
}

function outputPath(route) {
  if (route === "/") return join(DIST, "index.html");
  return join(DIST, route.replace(/^\/+|\/+$/g, ""), "index.html");
}

// ---------------------------------------------------------------------------
async function main() {
  const shellPath = join(DIST, "index.html");
  if (!existsSync(shellPath)) {
    throw new Error(`no build output at ${DIST} — run the Vite build first`);
  }

  // Every route is rendered on top of dist/public/index.html. After a run that
  // file IS the homepage snapshot, so a second pass would graft the homepage's
  // title, canonical and JSON-LD onto every other route. Fail loudly instead.
  if (/<html[^>]*\sdata-prerendered/.test(await readFile(shellPath, "utf8"))) {
    throw new Error(
      "dist/public/index.html is already prerendered — re-run the Vite build " +
        "first (`pnpm run build`) so the pass starts from a clean shell.",
    );
  }

  const routes = await readRoutes();
  const noindexCount = noindexRoutes().length;
  console.log(
    `prerender: ${routes.length} routes -> ${DIST} ` +
      `(${routes.length - noindexCount} indexable, ${noindexCount} noindex)`,
  );

  const t0 = Date.now();
  const bundleSource = await bundleApp();
  console.log(`prerender: bundled app in ${((Date.now() - t0) / 1000).toFixed(1)}s (${(bundleSource.length / 1024 / 1024).toFixed(1)} MB)`);

  // Read the shell once, before we start overwriting index.html.
  const shellHtml = await readFile(shellPath, "utf8");

  const failures = [];
  const warnings = [];
  let written = 0;
  const queue = [...routes];

  async function worker() {
    while (queue.length) {
      const route = queue.shift();
      const { ok, reason, html } = await renderRoute(shellHtml, bundleSource, route);
      if (!ok) { failures.push({ route, reason }); continue; }
      if (reason === "no canonical") warnings.push(route);
      const out = outputPath(route);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, clean(html), "utf8");
      written++;
      if (written % 25 === 0) console.log(`prerender: ${written}/${routes.length}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, routes.length) }, worker));

  if (failures.length) {
    console.log(`prerender: retrying ${failures.length} failed route(s) serially`);
    const retry = failures.splice(0, failures.length);
    for (const { route } of retry) {
      const { ok, reason, html } = await renderRoute(shellHtml, bundleSource, route);
      if (!ok) { failures.push({ route, reason }); continue; }
      if (reason === "no canonical") warnings.push(route);
      const out = outputPath(route);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, clean(html), "utf8");
      written++;
    }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`prerender: wrote ${written}/${routes.length} routes in ${secs}s`);

  if (warnings.length) {
    console.warn(
      `\nprerender: ${warnings.length} route(s) rendered without a canonical ` +
        `(the page never calls useSeo, so it also has no title or description ` +
        `of its own):`,
    );
    for (const r of warnings) console.warn(`  ${r}`);
  }

  if (failures.length) {
    console.error(`\nprerender: ${failures.length} route(s) failed:`);
    for (const f of failures.slice(0, 20)) console.error(`  ${f.route} — ${f.reason}`);
    if (failures.length > 20) console.error(`  ...and ${failures.length - 20} more`);
    throw new Error("prerender failed — refusing to ship an unrendered build");
  }
}

main().catch((err) => {
  console.error(`\nprerender: ${err.message}`);
  console.error("Set PRERENDER=0 to bypass (the site will ship client-rendered only).");
  process.exit(1);
});
