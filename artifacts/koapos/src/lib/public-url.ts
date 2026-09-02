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
 * The value a service job's QR encodes. Deliberately NOT the Tech App url: a
 * sticker is printed once and then lives on the device, so whatever is in the
 * ink must stay valid for the whole job. This resolver is stable for the life of
 * the job and picks the destination at scan time — the Tech App while the job is
 * open, the customer's portal once it is completed (see routes/qr.ts).
 *
 * Needs no username: the server resolves the merchant from the job.
 */
export function serviceJobQrUrl(jobId: number | string): string {
  return `${publicOrigin()}/api/qr/j/${jobId}`;
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
