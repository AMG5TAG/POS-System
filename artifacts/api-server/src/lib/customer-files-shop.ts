/**
 * Customer files in the shop account ("Your files"; routes/shop-account.ts).
 * No `db` here; pinned by shop-files.test.ts.
 *
 * A file opens in the browser only when its type can't run script on our
 * origin — images, PDF, plain text. Anything else (HTML, SVG, Office files,
 * zips) is always a download, so an uploaded web page can never execute as
 * koastal.com.au.
 */

const INLINE_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/heic", "image/heif",
  "application/pdf", "text/plain",
]);

export function canOpenInline(contentType: string | null | undefined): boolean {
  return INLINE_TYPES.has((contentType ?? "").split(";")[0]!.trim().toLowerCase());
}

/** A Content-Disposition header that survives any filename (quotes, accents, slashes). */
export function contentDisposition(filename: string, inline: boolean): string {
  const clean = filename.replace(/[\r\n"\\/]/g, "_").trim() || "file";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
