/* ─── Custom QR in an email body ──────────────────────────────────────────────
 * The Custom QR a merchant configures in Management › Templates (uploaded, or
 * picked from Marketing › QR Codes) rendered as an email-safe block.
 *
 * The image comes from the same saved template row that puts the QR on the
 * attached PDF, so the two always show the same code.
 *
 * Note on data: URLs — an uploaded image is stored as a data: URL, and several
 * mail clients (Gmail among them) refuse to load those. That is already true of
 * the business logo in these same emails, so the QR follows the same rule rather
 * than inventing a second one: it renders wherever the logo renders. A hosted
 * https image (or a code picked from Marketing, then hosted) always displays.
 */
import { escapeHtml } from "./html-escape";

/** Only sources a mail client can actually fetch — never a javascript: payload. */
const SAFE_SRC = /^(https?:|data:image\/)/;

export interface CustomQrTemplateOpts {
  showCustomQr?: unknown;
  customQrImage?: unknown;
  customQrCaption?: unknown;
}

/**
 * Centred QR block for an email body, or "" when the template has no QR to show.
 * `opts` is the saved template row's `options` JSON.
 */
export function customQrEmailBlock(opts: CustomQrTemplateOpts): string {
  if (!opts.showCustomQr) return "";
  const src = typeof opts.customQrImage === "string" ? opts.customQrImage.trim() : "";
  if (!src || !SAFE_SRC.test(src)) return "";
  const caption = typeof opts.customQrCaption === "string" ? opts.customQrCaption.trim() : "";
  return `<div style="margin-top:24px;text-align:center;">
      <img src="${escapeHtml(src)}" alt="QR code" width="96" height="96" style="width:96px;height:96px;object-fit:contain;display:inline-block;"/>
      ${caption ? `<div style="margin-top:6px;font-size:11px;color:#888;">${escapeHtml(caption)}</div>` : ""}
    </div>`;
}
