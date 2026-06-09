/**
 * Single source of truth for the app's public-facing domain.
 *
 * Every customer- or staff-visible link (tech app, customer portals, invoice
 * tracking pixels, password-reset emails, …) must be built from this so the
 * app always advertises its real domain.
 *
 * Priority:
 *   1. APP_BASE_URL / PUBLIC_DOMAIN — operator-configured override (full URL or
 *      bare host both accepted)
 *   2. koapos.com.au — production default
 *   3. the request host — development fallback only (e.g. localhost)
 *
 * We deliberately never derive public links from REPLIT_DOMAINS: that exposes
 * the internal *.replit.app hostname, which must not appear anywhere in the
 * app. Request headers are only trusted as a dev convenience.
 */
const DEFAULT_PUBLIC_DOMAIN = "koapos.com.au";

/** Reduce a full URL or bare host to just its hostname. */
function toHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

/** The public hostname (no scheme), e.g. "koapos.com.au". */
export function publicDomain(req?: { hostname?: string }): string {
  const explicit = process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_DOMAIN?.trim();
  if (explicit) return toHost(explicit);
  if (process.env.NODE_ENV === "production") return DEFAULT_PUBLIC_DOMAIN;
  return req?.hostname ?? DEFAULT_PUBLIC_DOMAIN;
}

/** The public origin (with scheme), e.g. "https://koapos.com.au". */
export function publicOrigin(req?: { hostname?: string }): string {
  return `https://${publicDomain(req)}`;
}
