/* ─── QR rendering ────────────────────────────────────────────────────────────
 * Everything needed to turn a saved QR code into pixels: its settings, the
 * payload each QR *type* encodes, the styled-dot options, and the framed SVG →
 * PNG export pipeline.
 *
 * This lives outside the QR generator page because two features render the same
 * codes: Marketing › QR Codes (design, preview, download) and Management ›
 * Templates, where a merchant picks one of their saved codes to print on a
 * receipt, invoice, quote or job sheet. A merchant who redesigns a code expects
 * the printed one to match, so there is exactly one renderer.
 *
 * Browser-only — it rasterises through <img>, <canvas> and FileReader.
 */
import QRCodeStyling, { type Options as QROptions, type DotType, type CornerSquareType, type CornerDotType } from "qr-code-styling";
import { publicOrigin } from "@/lib/public-url";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface QRSettings {
  patternColor: string;
  eyeColor: string;
  eyeDotColor: string;
  /* Frame/border colour for templates that draw one. Empty string follows the
     pattern colour, so existing codes keep their original look. */
  borderColor: string;
  bgColor: string;
  dotStyle: DotType;
  cornerSquareStyle: CornerSquareType;
  cornerDotStyle: CornerDotType;
  template: string;
  size: number;
  level: "L" | "M" | "Q" | "H";
  logoUrl: string;
  logoSize: number;
  /* Optional human-readable fallback code shown beneath the QR by the "code"
     template (7 alphanumeric chars). Empty for every other template. */
  customCode: string;
  /* When true (and the QR type has a URL destination), the QR encodes a redirect
     through /api/qr/r/:id so each scan is logged for Marketing Analytics. */
  trackScans: boolean;
}

export type QRCodeType =
  | "website" | "landing" | "shortlink" | "static" | "dynamic" | "vcard" | "social" | "document"
  | "wifi" | "event" | "email" | "sms" | "micro" | "frame" | "sqrc" | "iqr";

export interface QRTypeContent {
  url?: string;
  text?: string;
  landingId?: string;
  shortlinkId?: string;
  vcName?: string; vcPhone?: string; vcEmail?: string; vcOrg?: string; vcUrl?: string; vcAddress?: string;
  socialPlatform?: string; socialHandle?: string;
  wifiSsid?: string; wifiPass?: string; wifiSec?: "WPA" | "WEP" | "nopass";
  evTitle?: string; evStart?: string; evEnd?: string; evLocation?: string; evDesc?: string;
  emailTo?: string; emailSubject?: string; emailBody?: string;
  smsTo?: string; smsMsg?: string;
}

export interface QREntry {
  id: string;
  label: string;
  url: string;
  qrType?: QRCodeType;
  content?: QRTypeContent;
  createdAt: string;
  settings: QRSettings;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

export const DEFAULT_QR_SETTINGS: QRSettings = {
  patternColor: "#000000",
  eyeColor: "#000000",
  eyeDotColor: "#000000",
  borderColor: "",
  bgColor: "#ffffff",
  dotStyle: "square",
  cornerSquareStyle: "square",
  cornerDotStyle: "square",
  template: "standard",
  size: 256,
  level: "M",
  logoUrl: "",
  logoSize: 0.3,
  customCode: "",
  trackScans: false,
};

/* QR types whose destination is an http(s) URL we can redirect through — the
   only ones a "track scans" dynamic QR makes sense for. */
export const TRACKABLE_QR_TYPES = new Set<QRCodeType>(["website", "landing", "shortlink", "dynamic", "document", "social"]);

/* qrType values written by services/entityQr.ts for the auto-generated product,
   customer and service QR codes. These share the qr_codes table with generator
   codes but are managed on their own pages, so the generator's "Saved QR Codes"
   list filters them out. */
export const ENTITY_QR_TYPES = new Set<string>(["product", "customer", "service"]);

export const QR_FRAME_TEMPLATES = [
  { id: "standard",      label: "Standard",     circle: false },
  { id: "border",        label: "Framed",        circle: false },
  { id: "scan-me-dark",  label: "Scan Me",       circle: false },
  { id: "scan-me-light", label: "Scan Me Light", circle: false },
  { id: "circle",        label: "Circle",        circle: true  },
  { id: "circle-dashed", label: "Dashed Ring",   circle: true  },
  { id: "circle-dots",   label: "Dotted Ring",   circle: true  },
  { id: "dark-circle",   label: "Dark Circle",   circle: true  },
  { id: "circle-ring",   label: "Double Ring",   circle: true  },
  // Custom fallback code beneath the QR (7 alphanumeric chars).
  { id: "code",          label: "Code",          circle: false },
  // Eight additional popular frames.
  { id: "scan-me-top",   label: "Scan Top",      circle: false },
  { id: "pill",          label: "Pill CTA",      circle: false },
  { id: "card",          label: "Card",          circle: false },
  { id: "bold-card",     label: "Bold Card",     circle: false },
  { id: "square-ring",   label: "Double Box",    circle: false },
  { id: "square-dashed", label: "Dashed Box",    circle: false },
  { id: "square-dots",   label: "Dotted Box",    circle: false },
  { id: "corner-ticks",  label: "Corners",       circle: false },
];

/* ── API converters ────────────────────────────────────────────────────── */

export function apiToQrEntry(r: Record<string, unknown>): QREntry {
  let settings = { ...DEFAULT_QR_SETTINGS };
  let content: QRTypeContent = {};
  try { if (r.settings) settings = { ...DEFAULT_QR_SETTINGS, ...JSON.parse(r.settings as string) }; } catch { /* ignore */ }
  try { if (r.content)  content  = JSON.parse(r.content as string); } catch { /* ignore */ }
  return {
    id:        String(r.id ?? ""),
    label:     String(r.label    ?? ""),
    url:       String(r.url      ?? ""),
    qrType:    (String(r.qrType  ?? "website")) as QRCodeType,
    content,
    createdAt: String(r.createdAt ?? new Date().toISOString()),
    settings,
  };
}

/* ── QR data string builder ────────────────────────────────────────────── */

export function buildQRDataString(type: QRCodeType, content: QRTypeContent): string {
  switch (type) {
    case "website":
    case "document":
    case "frame":
    case "dynamic":
    case "landing":
    case "shortlink":
      return (content.url ?? "").trim() || "https://koapos.com";

    case "static":
    case "micro":
    case "sqrc":
    case "iqr":
      return (content.text ?? "").trim() || "Hello";

    case "vcard": {
      // Escape RFC 6350/2426 text-value special characters so commas/semicolons in a
      // name, org or address don't corrupt the field structure (and so scanners parse
      // the card at all).
      const esc = (v: string) => v.trim().replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
      const name = (content.vcName ?? "").trim();
      // vCard 3.0 REQUIRES N (structured name); many phones (esp. iOS) won't import a
      // card without it. Split the display name into given / family on the first space.
      const [given, ...rest] = name.split(/\s+/);
      const family = rest.join(" ");
      const lines = ["BEGIN:VCARD", "VERSION:3.0"];
      lines.push(`N:${esc(family)};${esc(given ?? "")};;;`);
      if (name)              lines.push(`FN:${esc(name)}`);
      if (content.vcPhone)   lines.push(`TEL;TYPE=CELL:${esc(content.vcPhone)}`);
      if (content.vcEmail)   lines.push(`EMAIL;TYPE=INTERNET:${esc(content.vcEmail)}`);
      if (content.vcOrg)     lines.push(`ORG:${esc(content.vcOrg)}`);
      if (content.vcUrl)     lines.push(`URL:${esc(content.vcUrl)}`);
      if (content.vcAddress) lines.push(`ADR;TYPE=WORK:;;${esc(content.vcAddress)};;;;`);
      lines.push("END:VCARD");
      // vCard lines MUST be delimited by CRLF, not bare LF — iOS Camera silently
      // ignores LF-only cards.
      return lines.join("\r\n");
    }

    case "social": {
      const handle = (content.socialHandle ?? "").replace(/^@/, "");
      const platform = content.socialPlatform ?? "instagram";
      const urls: Record<string, string> = {
        instagram: `https://instagram.com/${handle}`,
        facebook:  `https://facebook.com/${handle}`,
        x:         `https://x.com/${handle}`,
        linkedin:  `https://linkedin.com/in/${handle}`,
        tiktok:    `https://tiktok.com/@${handle}`,
        youtube:   `https://youtube.com/@${handle}`,
        pinterest: `https://pinterest.com/${handle}`,
        snapchat:  `https://snapchat.com/add/${handle}`,
      };
      return urls[platform] ?? `https://${platform}.com/${handle}`;
    }

    case "wifi": {
      const sec  = content.wifiSec  ?? "WPA";
      const ssid = content.wifiSsid ?? "";
      const pass = content.wifiPass ?? "";
      return `WIFI:T:${sec};S:${ssid};P:${pass};;`;
    }

    case "event": {
      const fmt = (d: string) => d ? d.replace(/[-T:]/g, "").slice(0, 15) : "";
      const lines = ["BEGIN:VEVENT"];
      if (content.evTitle)    lines.push(`SUMMARY:${content.evTitle}`);
      if (content.evStart)    lines.push(`DTSTART:${fmt(content.evStart)}`);
      if (content.evEnd)      lines.push(`DTEND:${fmt(content.evEnd)}`);
      if (content.evLocation) lines.push(`LOCATION:${content.evLocation}`);
      if (content.evDesc)     lines.push(`DESCRIPTION:${content.evDesc}`);
      lines.push("END:VEVENT");
      return lines.join("\n");
    }

    case "email":
      return `mailto:${content.emailTo ?? ""}?subject=${encodeURIComponent(content.emailSubject ?? "")}&body=${encodeURIComponent(content.emailBody ?? "")}`;

    case "sms":
      return `SMSTO:${content.smsTo ?? ""}:${content.smsMsg ?? ""}`;

    default:
      return "https://koapos.com";
  }
}

/* ── QR options builder ────────────────────────────────────────────────── */

export function buildQROptions(settings: QRSettings, data: string, size: number): QROptions {
  const isCircleTemplate = QR_FRAME_TEMPLATES.find((t) => t.id === settings.template)?.circle ?? false;
  return {
    type: "svg",
    data: data || "https://koapos.com",
    width: size,
    height: size,
    shape: isCircleTemplate ? "circle" : "square",
    dotsOptions: { type: settings.dotStyle, color: settings.patternColor },
    cornersSquareOptions: { type: settings.cornerSquareStyle, color: settings.eyeColor },
    cornersDotOptions: { type: settings.cornerDotStyle, color: settings.eyeDotColor },
    backgroundOptions: { color: settings.bgColor === "transparent" ? "rgba(0,0,0,0)" : settings.bgColor },
    qrOptions: { errorCorrectionLevel: settings.level },
  };
}

/* Resolution the bare QR is rasterised at before being embedded into the framed
   export. Kept generous (and independent of the frame's on-screen size) so the
   embedded QR stays crisp even when the exported file is scaled up for print. */
export const QR_EXPORT_PX = 1024;

export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read QR blob"));
    reader.readAsDataURL(blob);
  });
}

/* Rasterise the bare QR to a PNG data URI.

   The QR must be a *raster* image in the export, NOT qr-code-styling's own SVG
   markup. qr-code-styling draws every dot by painting a solid rectangle through a
   <clipPath>; when that markup is nested inside the frame SVG and the whole thing
   is rasterised via <img> → <canvas> (the PNG path), the nested clip-paths do not
   survive rasterisation — the dots collapse into solid stripes and any outer
   circular clip is lost, so the downloaded QR is garbled and won't scan. The live
   preview escapes this because it renders in the live DOM (append()), where nested
   clip-paths work. Rasterising the QR on its own first (where its clip-path is the
   top-level element and renders correctly) and embedding the result as a flat
   <image> sidesteps the whole class of bug for every template.

   The QR here is bare — the logo is composited separately as a centred <image>
   overlay (see buildFramedQrSvg), so there is no embedded image to load and no CORS
   taint to guard against. */
export async function renderQrPngDataUri(settings: QRSettings, data: string): Promise<string> {
  const blob = await new QRCodeStyling(buildQROptions(settings, data || "https://koapos.com", QR_EXPORT_PX)).getRawData("png");
  if (!blob) throw new Error("QR render failed");
  return blobToDataUri(blob as Blob);
}

/* ── Framed SVG export ─────────────────────────────────────────────────────
   Composes the QR together with its template frame into a single SVG so downloads
   match the live preview (PNG export rasterises this same SVG). The frame itself is
   vector; the QR is embedded as a pre-rasterised <image> (see renderQrPngDataUri
   for why). This mirrors the visual logic of <TemplateWrapper> in SVG primitives. */
export async function buildFramedQrSvg(settings: QRSettings, data: string, qrSize: number): Promise<{ svg: string; width: number; height: number }> {
  const qrHref = await renderQrPngDataUri(settings, data);

  // Embed the QR as a flat raster <image> at (x, y), sized to qrSize. Clipping to
  // a circle/rounded-rect is applied by the surrounding <g clip-path> and composes
  // correctly against a raster image (unlike the QR's own nested clip-paths, which
  // do not survive <img> → canvas rasterisation). xlink:href is used for the widest
  // renderer compatibility (the root <svg> declares the xlink namespace).
  const place = (x: number, y: number) =>
    `<image x="${x}" y="${y}" width="${qrSize}" height="${qrSize}" preserveAspectRatio="none" xlink:href="${qrHref}"/>`;

  const tpl     = settings.template;
  // Frame decorations (borders, rings, bars, ticks) use the dedicated border
  // colour, falling back to the pattern colour when unset. The QR dots are drawn
  // separately by StyledQR via settings.patternColor, so they're unaffected.
  const pattern = settings.borderColor || settings.patternColor;
  const bg      = settings.bgColor === "transparent" ? "#ffffff" : settings.bgColor;
  const textOn  = settings.bgColor === "transparent" ? "#ffffff" : settings.bgColor;
  const font    = "system-ui, sans-serif";

  // Frame metrics scale with the QR so proportions match the on-screen preview.
  const s      = qrSize / 240;
  const pad    = Math.round(8 * s);
  const radius = Math.round(16 * s);
  const bw     = Math.max(1, Math.round(3 * s));
  const fs     = Math.round(11 * s);
  const gap    = Math.round(4 * s);
  const innerR = Math.round(8 * s);

  const wrap = (w: number, h: number, body: string) => ({
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
    width: w, height: h,
  });
  const clip = (id: string, shape: string, inner: string, extra = "") =>
    `<defs><clipPath id="${id}">${shape}</clipPath></defs><g clip-path="url(#${id})"${extra}>${inner}</g>`;
  const esc = (str: string) => str.replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));
  const text = (x: number, y: number, fill: string, ls: number, str: string) =>
    `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="${fill}" font-family="${font}" font-size="${fs}" font-weight="700" letter-spacing="${ls}">${esc(str)}</text>`;

  if (tpl === "border") {
    const W = qrSize + 2 * (pad + bw);
    return wrap(W, W,
      `<rect x="${bw / 2}" y="${bw / 2}" width="${W - bw}" height="${W - bw}" rx="${radius}" fill="${bg}" stroke="${pattern}" stroke-width="${bw}"/>` +
      place(pad + bw, pad + bw));
  }

  if (tpl === "scan-me-dark") {
    const barH = Math.round(fs * 1.35) + 2 * Math.round(5 * s);
    const H = qrSize + barH;
    const body = place(0, 0) +
      `<rect x="0" y="${qrSize}" width="${qrSize}" height="${barH}" fill="${pattern}"/>` +
      text(qrSize / 2, qrSize + barH / 2, textOn, 0.15 * fs, "SCAN ME ▲");
    return wrap(qrSize, H, clip("fclip", `<rect width="${qrSize}" height="${H}" rx="${radius}"/>`, body));
  }

  if (tpl === "scan-me-light") {
    const textH = Math.round(fs * 1.35);
    const W = qrSize + 2 * (pad + bw);
    const H = bw * 2 + pad * 2 + qrSize + gap + textH;
    const qrX = (W - qrSize) / 2, qrY = bw + pad;
    return wrap(W, H,
      `<rect x="${bw / 2}" y="${bw / 2}" width="${W - bw}" height="${H - bw}" rx="${radius}" fill="${bg}" stroke="${pattern}" stroke-width="${bw}"/>` +
      clip("fclip", `<rect x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" rx="${innerR}"/>`, place(qrX, qrY)) +
      text(W / 2, qrY + qrSize + gap + textH / 2, pattern, 0.12 * fs, "▲ SCAN ME"));
  }

  if (tpl === "circle") {
    const r = qrSize / 2;
    return wrap(qrSize, qrSize, clip("fclip", `<circle cx="${r}" cy="${r}" r="${r}"/>`, place(0, 0)));
  }

  if (tpl === "circle-dashed" || tpl === "circle-dots") {
    const pad6 = Math.round(6 * s), bwc = Math.max(2, Math.round(3 * s));
    const W = qrSize + 2 * (pad6 + bwc), c = W / 2;
    const dash = tpl === "circle-dots"
      ? `stroke-dasharray="${bwc} ${bwc * 1.8}" stroke-linecap="round"`
      : `stroke-dasharray="${bwc * 3} ${bwc * 2}"`;
    return wrap(W, W,
      clip("fclip", `<circle cx="${c}" cy="${c}" r="${qrSize / 2}"/>`, place(pad6 + bwc, pad6 + bwc)) +
      `<circle cx="${c}" cy="${c}" r="${(W - bwc) / 2}" fill="none" stroke="${pattern}" stroke-width="${bwc}" ${dash}/>`);
  }

  if (tpl === "dark-circle") {
    const pad4 = Math.round(4 * s);
    const W = qrSize + 2 * pad4, c = W / 2;
    return wrap(W, W,
      `<circle cx="${c}" cy="${c}" r="${c}" fill="${pattern}"/>` +
      clip("fclip", `<circle cx="${c}" cy="${c}" r="${qrSize / 2}"/>`, place(pad4, pad4), ` opacity="0.85"`));
  }

  if (tpl === "circle-ring") {
    const pad6 = Math.round(6 * s), bwr = Math.max(2, Math.round(2 * s)), off = Math.round(4 * s);
    const borderBox = qrSize + 2 * pad6 + 2 * bwr;
    const W = borderBox + 2 * (off + bwr), c = W / 2;
    return wrap(W, W,
      clip("fclip", `<circle cx="${c}" cy="${c}" r="${qrSize / 2}"/>`, place(c - qrSize / 2, c - qrSize / 2)) +
      `<circle cx="${c}" cy="${c}" r="${(borderBox - bwr) / 2}" fill="none" stroke="${pattern}" stroke-width="${bwr}"/>` +
      `<circle cx="${c}" cy="${c}" r="${borderBox / 2 + off + bwr / 2}" fill="none" stroke="${pattern}" stroke-width="${bwr}"/>`);
  }

  if (tpl === "code") {
    const codeStr = (settings.customCode || "A1B2C3D").toUpperCase();
    const textH = Math.round(fs * 1.6);
    const W = qrSize + 2 * (pad + bw);
    const H = bw * 2 + pad * 2 + qrSize + gap + textH;
    const qrX = (W - qrSize) / 2, qrY = bw + pad;
    const cfs = Math.round(fs * 1.15);
    return wrap(W, H,
      `<rect x="${bw / 2}" y="${bw / 2}" width="${W - bw}" height="${H - bw}" rx="${radius}" fill="${bg}" stroke="${pattern}" stroke-width="${bw}"/>` +
      clip("fclip", `<rect x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" rx="${innerR}"/>`, place(qrX, qrY)) +
      `<text x="${W / 2}" y="${qrY + qrSize + gap + textH / 2}" text-anchor="middle" dominant-baseline="central" fill="${pattern}" font-family="ui-monospace, monospace" font-size="${cfs}" font-weight="700" letter-spacing="${0.18 * cfs}">${esc(codeStr)}</text>`);
  }

  if (tpl === "scan-me-top") {
    const barH = Math.round(fs * 1.35) + 2 * Math.round(5 * s);
    const H = qrSize + barH;
    const body =
      `<rect x="0" y="0" width="${qrSize}" height="${barH}" fill="${pattern}"/>` +
      text(qrSize / 2, barH / 2, textOn, 0.15 * fs, "SCAN ME ▼") +
      place(0, barH);
    return wrap(qrSize, H, clip("fclip", `<rect width="${qrSize}" height="${H}" rx="${radius}"/>`, body));
  }

  if (tpl === "pill") {
    const pillH = Math.round(fs * 2);
    const pillW = Math.round(qrSize * 0.62);
    const gap2 = Math.round(6 * s);
    const H = qrSize + gap2 + pillH;
    const pillX = (qrSize - pillW) / 2, pillY = qrSize + gap2;
    return wrap(qrSize, H,
      place(0, 0) +
      `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${pattern}"/>` +
      text(qrSize / 2, pillY + pillH / 2, textOn, 0.1 * fs, "SCAN ME"));
  }

  if (tpl === "card") {
    const cpad = Math.round(12 * s);
    const box = qrSize + 2 * cpad;
    const margin = Math.round(12 * s);
    const total = box + margin * 2;
    const cx = margin, cy = margin;
    return {
      svg:
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}">` +
        `<defs><filter id="cardsh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="${Math.round(3 * s)}" stdDeviation="${Math.round(4 * s)}" flood-opacity="0.18"/></filter></defs>` +
        `<rect x="${cx}" y="${cy}" width="${box}" height="${box}" rx="${radius}" fill="${bg}" filter="url(#cardsh)"/>` +
        clip("fclip", `<rect x="${cx + cpad}" y="${cy + cpad}" width="${qrSize}" height="${qrSize}" rx="${innerR}"/>`, place(cx + cpad, cy + cpad)) +
        `</svg>`,
      width: total, height: total,
    };
  }

  if (tpl === "bold-card") {
    const outerPad = Math.round(8 * s), innerPad = Math.round(6 * s);
    const innerBox = qrSize + 2 * innerPad;
    const W = innerBox + 2 * outerPad;
    return wrap(W, W,
      `<rect x="0" y="0" width="${W}" height="${W}" rx="${radius}" fill="${pattern}"/>` +
      `<rect x="${outerPad}" y="${outerPad}" width="${innerBox}" height="${innerBox}" rx="${Math.round(10 * s)}" fill="${bg}"/>` +
      clip("fclip", `<rect x="${outerPad + innerPad}" y="${outerPad + innerPad}" width="${qrSize}" height="${qrSize}" rx="${Math.round(6 * s)}"/>`, place(outerPad + innerPad, outerPad + innerPad)));
  }

  if (tpl === "square-ring") {
    const pad6 = Math.round(6 * s), bwr = Math.max(2, Math.round(2 * s)), off = Math.round(4 * s);
    const borderBox = qrSize + 2 * pad6 + 2 * bwr;
    const W = borderBox + 2 * (off + bwr), c = W / 2, rr = Math.round(6 * s);
    return wrap(W, W,
      clip("fclip", `<rect x="${c - qrSize / 2}" y="${c - qrSize / 2}" width="${qrSize}" height="${qrSize}" rx="${rr}"/>`, place(c - qrSize / 2, c - qrSize / 2)) +
      `<rect x="${(W - borderBox) / 2}" y="${(W - borderBox) / 2}" width="${borderBox}" height="${borderBox}" rx="${rr}" fill="none" stroke="${pattern}" stroke-width="${bwr}"/>` +
      `<rect x="${bwr / 2}" y="${bwr / 2}" width="${W - bwr}" height="${W - bwr}" rx="${rr + off}" fill="none" stroke="${pattern}" stroke-width="${bwr}"/>`);
  }

  if (tpl === "square-dashed" || tpl === "square-dots") {
    const pad6 = Math.round(6 * s), bwc = Math.max(2, Math.round(3 * s));
    const W = qrSize + 2 * (pad6 + bwc), rr = Math.round(8 * s);
    const dash = tpl === "square-dots"
      ? `stroke-dasharray="${bwc} ${bwc * 1.8}" stroke-linecap="round"`
      : `stroke-dasharray="${bwc * 3} ${bwc * 2}"`;
    return wrap(W, W,
      place(pad6 + bwc, pad6 + bwc) +
      `<rect x="${bwc / 2}" y="${bwc / 2}" width="${W - bwc}" height="${W - bwc}" rx="${rr}" fill="none" stroke="${pattern}" stroke-width="${bwc}" ${dash}/>`);
  }

  if (tpl === "corner-ticks") {
    const pd = Math.round(8 * s), tick = Math.round(16 * s), tb = Math.max(2, Math.round(3 * s));
    const W = qrSize + 2 * pd, c = pattern;
    const corners =
      `<rect x="0" y="0" width="${tick}" height="${tb}" fill="${c}"/><rect x="0" y="0" width="${tb}" height="${tick}" fill="${c}"/>` +
      `<rect x="${W - tick}" y="0" width="${tick}" height="${tb}" fill="${c}"/><rect x="${W - tb}" y="0" width="${tb}" height="${tick}" fill="${c}"/>` +
      `<rect x="0" y="${W - tb}" width="${tick}" height="${tb}" fill="${c}"/><rect x="0" y="${W - tick}" width="${tb}" height="${tick}" fill="${c}"/>` +
      `<rect x="${W - tick}" y="${W - tb}" width="${tick}" height="${tb}" fill="${c}"/><rect x="${W - tb}" y="${W - tick}" width="${tb}" height="${tick}" fill="${c}"/>`;
    return wrap(W, W, place(pd, pd) + corners);
  }

  // standard (and any unknown template): rounded-corner clip only.
  return wrap(qrSize, qrSize, clip("fclip", `<rect width="${qrSize}" height="${qrSize}" rx="${radius}"/>`, place(0, 0)));
}

/* Rasterise a framed SVG string to a PNG blob, or return it verbatim as SVG. */
export async function svgToImageBlob(svg: string, format: "png" | "svg", width: number, height: number): Promise<Blob> {
  if (format === "svg") return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to rasterise SVG"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode PNG"))), "image/png"));
}

/* ── Saved codes ───────────────────────────────────────────────────────── */

/**
 * What a saved QR actually encodes. A tracked code encodes the redirect
 * (/api/qr/r/:id) rather than its destination, so every scan is counted — which
 * is why a printed code must be re-derived here rather than read off `url`.
 */
export function qrEntryData(entry: QREntry): string {
  const tracked = entry.settings.trackScans && TRACKABLE_QR_TYPES.has(entry.qrType ?? "website");
  return tracked ? `${publicOrigin()}/api/qr/r/${entry.id}` : entry.url;
}

/** True for the product/customer/service codes managed on their own pages. */
export function isEntityQr(entry: Pick<QREntry, "qrType">): boolean {
  return ENTITY_QR_TYPES.has(entry.qrType ?? "");
}

/**
 * Render a saved QR — frame, colours, dot style and all — to a PNG data URL,
 * ready to embed in a printed document. `px` is the QR's own edge; the frame
 * adds to it, so the returned image is usually a little larger.
 */
export async function renderQrEntryDataUrl(entry: QREntry, px = 512): Promise<string> {
  const { svg, width, height } = await buildFramedQrSvg(entry.settings, qrEntryData(entry), px);
  const blob = await svgToImageBlob(svg, "png", width, height);
  return blobToDataUri(blob);
}
