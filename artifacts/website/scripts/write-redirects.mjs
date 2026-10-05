// Writes a static redirect stub for every legacy URL in redirects.mjs.
//
// Runs after the prerender pass. The old paths appear in neither the sitemap
// nor the prerender route list, so these stubs never overwrite a real page.

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { redirectPairs } from "./redirects.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "..", "dist", "public");
const ORIGIN = "https://koastal.com.au";

// No robots directive here on purpose: a redirect stub must stay crawlable for
// the canonical to consolidate the old URL's ranking signals onto the new one.
// noindex would block exactly the consolidation this exists to achieve.
function stub(to) {
  const url = `${ORIGIN}${to}`;
  return `<!DOCTYPE html>
<html lang="en-AU">
  <head>
    <meta charset="UTF-8" />
    <title>Redirecting to ${to}</title>
    <link rel="canonical" href="${url}" />
    <meta http-equiv="refresh" content="0; url=${to}" />
    <script>window.location.replace(${JSON.stringify(to)} + window.location.search + window.location.hash);</script>
  </head>
  <body>
    <p>This page has moved to <a href="${to}">${url}</a>.</p>
  </body>
</html>
`;
}

async function main() {
  const pairs = redirectPairs();
  for (const [from, to] of pairs) {
    const out = join(DIST, from.replace(/^\//, ""), "index.html");
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, stub(to), "utf8");
  }
  // Read by artifacts/koapos/server.mjs to answer with a real 301.
  await writeFile(join(DIST, "redirects.json"), JSON.stringify(Object.fromEntries(pairs)), "utf8");
  console.log(`redirects: wrote ${pairs.length} redirect stubs -> ${DIST}`);
}

main().catch((err) => {
  console.error(`redirects: ${err.message}`);
  process.exit(1);
});
