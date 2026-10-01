// Stamps the current "years of experience" number into the static index.html
// social-share meta (og:description) at build time. The on-page React content
// computes this at runtime from src/lib/experience.ts; this script keeps the
// raw HTML meta (which crawlers read without running JS) in sync on every build.
//
// Keep BASE_YEAR / BASE_VALUE / anniversary in sync with src/lib/experience.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE_YEAR = 2026;
const BASE_VALUE = 15;
const ANNIVERSARY_MONTH = 2; // March (0-indexed)
const ANNIVERSARY_DAY = 25;

function getYearsExperience(now = new Date()) {
  const passed =
    now.getMonth() > ANNIVERSARY_MONTH ||
    (now.getMonth() === ANNIVERSARY_MONTH && now.getDate() >= ANNIVERSARY_DAY);
  return Math.max(
    BASE_VALUE,
    BASE_VALUE + (now.getFullYear() - BASE_YEAR) - (passed ? 0 : 1),
  );
}

const years = getYearsExperience();
const htmlPath = join(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
let html = readFileSync(htmlPath, "utf8");

const before = html;
html = html.replace(/Over \d+ years of local experience/g, `Over ${years} years of local experience`);

if (html !== before) {
  writeFileSync(htmlPath, html);
  console.log(`stamp-experience: index.html set to "Over ${years} years of local experience"`);
} else {
  console.log(`stamp-experience: index.html already current (${years} years)`);
}
