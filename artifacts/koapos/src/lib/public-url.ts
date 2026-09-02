/**
 * The app's public-facing origin (with scheme), e.g. "https://koapos.com.au".
 *
 * Use this — not `window.location.origin` — whenever a link is printed,
 * embedded in a QR code, or otherwise leaves the app, so it always advertises
 * the real domain rather than the internal hosting host.
 *
 * An operator can override the default via the VITE_PUBLIC_DOMAIN build var
 * (bare host or full URL both accepted).
 */
const DEFAULT_PUBLIC_DOMAIN = "koapos.com.au";

export function publicOrigin(): string {
  const override = import.meta.env.VITE_PUBLIC_DOMAIN?.trim();
  const host = override
    ? override.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    : DEFAULT_PUBLIC_DOMAIN;
  return `https://${host}`;
}

/**
 * Public deep link that opens a service job in the Tech App
 * (/b/:username/t/techapp?job=:id). The `?job=` parameter is also understood by
 * the Tech App's in-app scanner. When no business username is configured the
 * Tech App can't exist, so this falls back to the staff Service View.
 *
 * Single source of truth for the QR target printed on the A4 service sheet,
 * the A4 service report and the repair/service sticker.
 */
export function techAppJobUrl(username: string | null | undefined, jobId: number | string): string {
  const origin = publicOrigin();
  return username
    ? `${origin}/b/${encodeURIComponent(username)}/t/techapp?job=${jobId}`
    : `${origin}/service-jobs/${jobId}`;
}

/**
 * Public, customer-facing product page (/b/:username/p/:productId). This is the
 * target encoded into a product's QR code — scanning it opens a web page showing
 * the product's details. Requires a business username (the public URL namespace);
 * when none is configured there is no public page, so this returns "".
 *
 * Single source of truth for the product QR target used on product stickers and
 * the product QR dialog.
 */
export function publicProductUrl(username: string | null | undefined, productId: number | string): string {
  return username
    ? `${publicOrigin()}/b/${encodeURIComponent(username)}/p/${productId}`
    : "";
}
