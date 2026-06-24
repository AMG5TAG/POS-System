import type { Browser } from "puppeteer";
import { existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Renders an HTML string to a PDF Buffer using a shared headless-Chromium
 * instance. A single browser is launched lazily and reused across requests;
 * each render gets its own page.
 *
 * Throws if Chromium can't be launched (e.g. the binary isn't installed in the
 * runtime). Callers that must not fail outright should catch and fall back.
 */

let browserPromise: Promise<Browser> | null = null;

/**
 * Locate a Chromium executable for Puppeteer to drive. Puppeteer only ships a
 * bundled Chromium when `puppeteer install` has run; in slim/Nix runtimes that
 * download is often skipped, so `launch()` with no path fails and every PDF
 * falls back to the (template-unfaithful) legacy renderer. We therefore look,
 * in order, for an explicit override, a Chromium on PATH, then a recent build
 * in the Nix store, before deferring to Puppeteer's own bundled binary.
 */
function resolveChromiumExecutable(): string | undefined {
  // 1. Explicit operator override always wins.
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;

  // 1b. Replit provisions a Playwright Chromium and exposes its path; reuse it
  //     rather than relying on Puppeteer's (often-absent) bundled download.
  const replitChromium = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (replitChromium && existsSync(replitChromium)) return replitChromium;

  // 2. A Chromium/Chrome on PATH (standard Linux/container installs).
  for (const name of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
    try {
      const p = execSync(`command -v ${name} 2>/dev/null`, { encoding: "utf8" }).trim();
      if (p && existsSync(p)) return p;
    } catch { /* not found — keep looking */ }
  }

  // 3. Nix store (Replit/NixOS deployments): pick the highest-version chromium
  //    that's recent enough for Puppeteer's DevTools protocol (≥ v120).
  try {
    const base = "/nix/store";
    const builds = readdirSync(base)
      .map((d) => ({ d, v: Number(d.match(/-chromium-(\d+)\./)?.[1] ?? 0) }))
      .filter((x) => x.v >= 120 && !x.d.includes("sandbox"))
      .sort((a, b) => b.v - a.v);
    for (const { d } of builds) {
      const p = `${base}/${d}/bin/chromium`;
      if (existsSync(p)) return p;
    }
  } catch { /* not a Nix runtime — fall through */ }

  // 4. Defer to Puppeteer's bundled Chromium (may be absent).
  return undefined;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = (await import("puppeteer")).default;
      return puppeteer.launch({
        headless: true,
        // --no-sandbox is required to run Chromium as root in most containers.
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--font-render-hinting=none",
        ],
        executablePath: resolveChromiumExecutable(),
      });
    })().catch((err) => {
      // Reset so a later call can retry rather than caching the rejection.
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
    const pdf = await page.pdf({
      printBackground: true,
      // Honour the document's own @page size/margins so the PDF matches the
      // in-app print preview exactly.
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => { /* ignore */ });
  }
}

/** Close the shared browser (e.g. on graceful shutdown). */
export async function closePdfBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  if (b) await b.close().catch(() => { /* ignore */ });
}
