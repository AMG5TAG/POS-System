/* ─── HTML → PDF → printer ────────────────────────────────────────────────────
 * Paper documents (A4 job sheets, purchase orders, reports) can't go out as
 * ESC/POS, so the bridge renders them the same way the browser would and hands
 * the resulting PDF to a named queue silently.
 *
 *   1. HTML → PDF with headless Chromium. Edge ships with Windows 10/11, so
 *      there is normally nothing to install. Page size comes from an injected
 *      `@page` rule, which Chrome honours in --print-to-pdf.
 *   2. PDF → printer with whichever silent PDF printer is available
 *      (SumatraPDF, PDFtoPrinter, the shell "printto" verb, or CUPS `lp`).
 */
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BridgeConfig } from "./config.js";
import { isWindows, run } from "./exec.js";

export type PaperSize = "A4" | "A4-landscape" | "A5" | "Letter" | "80mm" | "58mm" | "auto";

/**
 * Default page length for a thermal roll when the caller doesn't measure one.
 * Chrome's --print-to-pdf ignores `size: <width> auto` and silently falls back to
 * US Letter, so a roll has to be given an explicit length; callers that know how
 * tall the document is should pass `heightMm`.
 */
const DEFAULT_ROLL_HEIGHT_MM = 200;

/** Printable width inside each roll, after the printer's own margins. */
const ROLL_WIDTH_MM: Record<"80mm" | "58mm", number> = { "80mm": 72, "58mm": 48 };

/**
 * The `@page` rule for a paper preset. Chrome honours named sizes (`A4 portrait`)
 * and explicit two-value dimensions, but not `auto` — see DEFAULT_ROLL_HEIGHT_MM.
 * `auto` here means "leave whatever the document declares".
 */
function pageCss(paper: Exclude<PaperSize, "auto">, heightMm?: number): string {
  if (paper === "80mm" || paper === "58mm") {
    const width = ROLL_WIDTH_MM[paper];
    const height = clampRollHeight(heightMm);
    // No margins, and the body is pinned to the printable width so nothing
    // spills into a second column.
    return `@page { size: ${width}mm ${height}mm; margin: 0; } html, body { width: ${width}mm; margin: 0; padding: 0; }`;
  }
  const named: Record<"A4" | "A4-landscape" | "A5" | "Letter", string> = {
    A4: "A4 portrait",
    "A4-landscape": "A4 landscape",
    A5: "A5 portrait",
    Letter: "Letter portrait",
  };
  const margin = paper === "A5" ? "8mm" : "10mm";
  return `@page { size: ${named[paper]}; margin: ${margin}; }`;
}

function clampRollHeight(heightMm: number | undefined): number {
  if (!Number.isFinite(heightMm)) return DEFAULT_ROLL_HEIGHT_MM;
  return Math.max(20, Math.min(2000, Math.round(heightMm as number)));
}

const WINDOWS_CHROME_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const DARWIN_CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const LINUX_CHROME_CANDIDATES = [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  "/snap/bin/chromium",
];

const WINDOWS_PDF_PRINTER_CANDIDATES = [
  "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe",
  "C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe",
  path.join(process.env.LOCALAPPDATA || "", "SumatraPDF", "SumatraPDF.exe"),
  path.join(process.env.ProgramFiles || "", "KoaPOS", "SumatraPDF.exe"),
  path.join(process.env.ProgramFiles || "", "KoaPOS", "PDFtoPrinter.exe"),
];

function firstExisting(paths: string[]): string {
  return paths.find((p) => p && existsSync(p)) ?? "";
}

export function findChrome(cfg: BridgeConfig): string {
  if (cfg.chromePath && existsSync(cfg.chromePath)) return cfg.chromePath;
  if (isWindows) return firstExisting(WINDOWS_CHROME_CANDIDATES);
  if (process.platform === "darwin") return firstExisting(DARWIN_CHROME_CANDIDATES);
  return firstExisting(LINUX_CHROME_CANDIDATES);
}

export function findPdfPrinter(cfg: BridgeConfig): string {
  if (cfg.pdfPrinterPath && existsSync(cfg.pdfPrinterPath)) return cfg.pdfPrinterPath;
  if (!isWindows) return "";
  return firstExisting(WINDOWS_PDF_PRINTER_CANDIDATES);
}

/** Inject the paper preset just before </head> (or at the top for fragments). */
function withPageCss(html: string, paper: PaperSize, heightMm?: number): string {
  if (paper === "auto") return html;
  const style = `<style id="koapos-bridge-page">${pageCss(paper, heightMm)}</style>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${style}</head>`);
  if (/<html[\s>]/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head>${style}</head>`);
  return `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${html}</body></html>`;
}

async function htmlToPdf(cfg: BridgeConfig, html: string, paper: PaperSize, heightMm: number | undefined, dir: string): Promise<string> {
  const chrome = findChrome(cfg);
  if (!chrome) {
    throw new Error(
      "No Chromium browser found for HTML printing. Install Microsoft Edge or Google Chrome, " +
        "or set \"chromePath\" in the bridge config.",
    );
  }
  const htmlFile = path.join(dir, "doc.html");
  const pdfFile = path.join(dir, "doc.pdf");
  writeFileSync(htmlFile, withPageCss(html, paper, heightMm), "utf8");

  await run(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      `--user-data-dir=${path.join(dir, "profile")}`,
      "--no-pdf-header-footer",
      "--print-to-pdf-no-header",
      "--virtual-time-budget=4000",
      `--print-to-pdf=${pdfFile}`,
      new URL(`file://${htmlFile.replace(/\\/g, "/")}`).href,
    ],
    { timeoutMs: 90_000 },
  );

  if (!existsSync(pdfFile)) throw new Error("Chromium did not produce a PDF for this document.");
  return pdfFile;
}

async function printPdf(cfg: BridgeConfig, pdfFile: string, printerName: string, jobName: string): Promise<void> {
  if (!isWindows) {
    await run("lp", ["-d", printerName, "-t", jobName, pdfFile], { timeoutMs: 90_000 });
    return;
  }

  const tool = findPdfPrinter(cfg);
  if (tool) {
    const exe = path.basename(tool).toLowerCase();
    if (exe.includes("sumatra")) {
      await run(tool, ["-print-to", printerName, "-silent", "-exit-when-done", pdfFile], { timeoutMs: 90_000 });
    } else {
      // PDFtoPrinter.exe <file> "<printer>"
      await run(tool, [pdfFile, printerName], { timeoutMs: 90_000 });
    }
    return;
  }

  // Last resort: the registered PDF handler's "printto" shell verb. Works when
  // Acrobat Reader (or another handler that registers it) is installed.
  try {
    await run(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Start-Process -FilePath $env:KOA_FILE -Verb PrintTo -ArgumentList $env:KOA_PRINTER -PassThru -Wait -WindowStyle Hidden | Out-Null",
      ],
      { timeoutMs: 90_000, env: { KOA_FILE: pdfFile, KOA_PRINTER: `"${printerName}"` } },
    );
  } catch (err) {
    throw new Error(
      "Silent PDF printing needs a helper on Windows. Install SumatraPDF (https://www.sumatrapdfreader.org) " +
        "or drop PDFtoPrinter.exe beside the bridge, then set \"pdfPrinterPath\" in the bridge config. " +
        `Shell fallback failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Render an HTML document and print it silently to `printerName`. */
export async function printHtml(
  cfg: BridgeConfig,
  opts: {
    html: string;
    printerName: string;
    paper: PaperSize;
    copies: number;
    jobName: string;
    /** Page length for a thermal roll, in mm. Ignored for sheet paper. */
    heightMm?: number;
  },
): Promise<void> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "koapos-html-"));
  const pdfFile = await htmlToPdf(cfg, opts.html, opts.paper, opts.heightMm, dir);
  // Copies are looped rather than passed to the tool: SumatraPDF and
  // PDFtoPrinter disagree on the flag, and a loop behaves identically on CUPS.
  for (let i = 0; i < opts.copies; i++) {
    await printPdf(cfg, pdfFile, opts.printerName, opts.copies > 1 ? `${opts.jobName} (${i + 1}/${opts.copies})` : opts.jobName);
  }
}
