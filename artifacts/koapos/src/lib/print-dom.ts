/* ─── DOM → standalone print document ─────────────────────────────────────────
 * The Print Bridge renders HTML in its own headless Chromium, so it needs a
 * self-contained document rather than a live React tree. The print areas this
 * app already maintains (the A4 service sheet, the 80mm docket) are styled
 * entirely with inline styles precisely so their layout survives being lifted
 * out of the page — this just wraps the serialized markup in a minimal document.
 *
 * Anything referenced by a URL (a logo on a CDN, a webfont) may not resolve on
 * the till, so the renderer falls back to system fonts. Data-URL images — which
 * is what uploaded logos, device photos and captured signatures already are —
 * travel with the markup and print exactly as they look on screen.
 */

const BASE_CSS = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  img, svg { max-width: 100%; }
`;

export interface StandaloneHtmlOpts {
  title?: string;
  /** Extra CSS appended after the reset — e.g. page-break rules for copies. */
  css?: string;
  /** Font stack applied to the document root. */
  fontCss?: string;
}

/** Serialize a print-area element into a complete, self-contained HTML document. */
export function standaloneHtmlFrom(el: HTMLElement | null, opts: StandaloneHtmlOpts = {}): string {
  if (!el) throw new Error("Nothing to print — the print area hasn't rendered yet.");
  return standaloneHtml(el.outerHTML, opts);
}

/** Wrap a markup fragment in a complete, self-contained HTML document. */
export function standaloneHtml(markup: string, opts: StandaloneHtmlOpts = {}): string {
  const title = escapeHtml(opts.title ?? "KoaPOS");
  const font = opts.fontCss ? `body { font-family: ${opts.fontCss}; }` : "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${BASE_CSS}${font}${opts.css ?? ""}</style>
</head>
<body>${markup}</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}
