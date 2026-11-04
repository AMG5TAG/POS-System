import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sitemapPath = resolve(__dirname, "..", "public", "sitemap.xml");
// The TV pages' sitemap is written into the build by build-tv-pages.mjs.
const tvSitemapPath = resolve(__dirname, "..", "dist", "public", "sitemap-tv.xml");

const HOST = "koastal.com.au";
const KEY = "eeda10763814fc6c86ebe7e144a23d67";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/IndexNow";
const BATCH_SIZE = 10000;

function extractUrls(xml) {
  const matches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
  return matches.map((m) => m.replace(/<\/?loc>/g, "").trim()).filter(Boolean);
}

async function submitBatch(urlList) {
  const body = JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList,
  });
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body,
  });
  return { status: res.status, ok: res.ok || res.status === 202 };
}

async function main() {
  // Inside KoaPOS every `pnpm run build` builds this package, and a ping is an
  // outward-facing call to real search engines. Only the production deploy
  // build sets this (artifacts/koapos/.replit-artifact/artifact.toml).
  if (process.env.INDEXNOW_SUBMIT !== "1") {
    console.log("[indexnow] INDEXNOW_SUBMIT is not 1 — skipping submission (deploy builds only).");
    return;
  }
  let xml;
  try {
    xml = readFileSync(sitemapPath, "utf8");
  } catch (err) {
    console.warn(`[indexnow] sitemap.xml not found at ${sitemapPath} — skipping submission.`);
    return;
  }

  let tvXml = "";
  try {
    tvXml = readFileSync(tvSitemapPath, "utf8");
  } catch { /* no TV pages built */ }

  const urls = [...extractUrls(xml), ...extractUrls(tvXml)];
  if (urls.length === 0) {
    console.warn("[indexnow] No <loc> URLs found in sitemap — skipping submission.");
    return;
  }

  console.log(`[indexnow] Submitting ${urls.length} URLs to ${ENDPOINT} for ${HOST}`);

  let submitted = 0;
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    try {
      const { status, ok } = await submitBatch(batch);
      if (ok) {
        submitted += batch.length;
        console.log(`[indexnow] Batch ${i / BATCH_SIZE + 1}: ${batch.length} URLs accepted (HTTP ${status}).`);
      } else {
        console.warn(`[indexnow] Batch ${i / BATCH_SIZE + 1} returned HTTP ${status}.`);
      }
    } catch (err) {
      console.warn(`[indexnow] Batch ${i / BATCH_SIZE + 1} failed: ${err.message}`);
    }
  }

  console.log(`[indexnow] Done. ${submitted}/${urls.length} URLs submitted successfully.`);
  console.log("[indexnow] Participating engines: Bing, Yandex, Naver, Seznam, Yep.");
}

main().catch((err) => {
  console.warn(`[indexnow] Submission script error (non-fatal): ${err.message}`);
});
