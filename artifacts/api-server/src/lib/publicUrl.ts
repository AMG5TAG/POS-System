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
 *   2. pos.koastal.com.au — production default
 *   3. the request host — development fallback only (e.g. localhost)
 *
 * We deliberately never derive public links from REPLIT_DOMAINS: that exposes
 * the internal *.replit.app hostname, which must not appear anywhere in the
 * app. Request headers are only trusted as a dev convenience.
 */
const DEFAULT_PUBLIC_DOMAIN = "pos.koastal.com.au";

/**
 * Domains the app used to live on. They stay attached to the deployment because
 * QR stickers, service sheets and SMS links printed or sent under them are still
 * in circulation; `legacyDomainRedirect` (app.ts) sends their page loads and QR
 * scans on to the current domain. Override with LEGACY_DOMAINS (comma-separated).
 */
export function legacyDomains(): string[] {
  return (process.env.LEGACY_DOMAINS ?? "koapos.com.au,www.koapos.com.au")
    .split(",")
    .map((d) => toHost(d).toLowerCase())
    .filter((d) => d && d !== publicDomain());
}

/**
 * The online shop's hostname (shop.koastal.com.au, SHOP_DOMAIN overrides). It is
 * served by this same server: app.ts picks the shop's build for this host.
 */
export function shopDomain(): string {
  return toHost(process.env.SHOP_DOMAIN?.trim() || "shop.koastal.com.au").toLowerCase();
}

/** The shop's origin, for links in customer emails. */
export function shopOrigin(): string {
  return `https://${shopDomain()}`;
}

/** Reduce a full URL or bare host to just its hostname. */
function toHost(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

/** The public hostname (no scheme), e.g. "pos.koastal.com.au". */
export function publicDomain(req?: { hostname?: string }): string {
  const explicit = process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_DOMAIN?.trim();
  if (explicit) return toHost(explicit);
  if (process.env.NODE_ENV === "production") return DEFAULT_PUBLIC_DOMAIN;
  return req?.hostname ?? DEFAULT_PUBLIC_DOMAIN;
}

/** The public origin (with scheme), e.g. "https://pos.koastal.com.au". */
export function publicOrigin(req?: { hostname?: string }): string {
  return `https://${publicDomain(req)}`;
}

/**
 * A customer's portal address: `/c/<token>` on the merchant's own portal domain
 * when one is configured, else on ours. The token alone identifies the customer
 * (and so the business), so no username is needed — the older
 * `/b/<username>/c/<token>` form still routes, for links already sent. Returns
 * null when the customer has no token: there is no portal to link to.
 *
 * Shared by the status-change SMS (admin and Tech App) and the service-job QR
 * redirect so the three cannot drift apart.
 */
export function customerPortalUrl(
  merchant: { username?: string | null; portalDomain?: string | null } | null | undefined,
  portalToken: string | null | undefined,
  req?: { hostname?: string },
): string | null {
  if (!portalToken) return null;
  if (merchant?.portalDomain) return `https://${merchant.portalDomain}/c/${portalToken}`;
  return `${publicOrigin(req)}/c/${portalToken}`;
}

/**
 * Deep link opening a service job in the Tech App. Falls back to the staff
 * Service View when the merchant has no username, since the Tech App cannot
 * exist without one.
 *
 * Only the QR resolver builds this now — a printed sticker encodes the resolver,
 * never this url, so that the ink survives the job changing status.
 */
export function techAppJobUrl(
  username: string | null | undefined,
  jobId: number | string,
  req?: { hostname?: string },
): string {
  const origin = publicOrigin(req);
  return username
    ? `${origin}/a/tech?job=${jobId}`
    : `${origin}/service-jobs/${jobId}`;
}
