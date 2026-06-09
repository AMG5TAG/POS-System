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
