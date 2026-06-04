import type { Browser } from "puppeteer";

/**
 * Renders an HTML string to a PDF Buffer using a shared headless-Chromium
 * instance. A single browser is launched lazily and reused across requests;
 * each render gets its own page.
 *
 * Throws if Chromium can't be launched (e.g. the binary isn't installed in the
 * runtime). Callers that must not fail outright should catch and fall back.
 */

let browserPromise: Promise<Browser> | null = null;

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
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
