import { Router, type IRouter } from "express";
import { db, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Per-app web app manifest.
 *
 * The frontend is one SPA shell, so index.html can only ever carry a single
 * static `<link rel="manifest">`. That static manifest says
 * `start_url: "/"`, which is why every standalone app (Tech, Mobile POS,
 * Dashboard, Portal) used to install to the phone home screen as a shortcut
 * that reopened the marketing homepage and its dashboard login instead of the
 * app itself.
 *
 * Browsers read the manifest **once, at document load**, from the URL in the
 * HTML — swapping the link to a generated `blob:` manifest after React mounts
 * is too late (and `blob:` manifests are not reliably fetched at all). So the
 * manifest has to be a real, same-origin URL that is already correct when the
 * page loads: a tiny inline script in index.html points the link here with
 * the current path, and this endpoint answers with a manifest whose
 * `start_url`/`scope` reopen *that* app, branded with the merchant's name and
 * logo.
 *
 * Public and unauthenticated — the browser fetches manifests without
 * credentials. It only ever echoes back a path the caller already had.
 */

const router: IRouter = Router();

const DEFAULT_THEME = "#ecbe04";
const PORTAL_THEME = "#f59e0b";
const MAX_PATH_LENGTH = 512;

type AppRoute = {
  re: RegExp;
  /** Whether capture group 1 is a business username (vs. an opaque token). */
  hasUsername: boolean;
  /** Appended to the business name, e.g. "Acme Repairs Tech". */
  suffix: string;
  /** Used when there is no business to brand with. */
  fallbackName: string;
  themeColor: string;
};

/* Mirrors the standalone-app routes in the frontend's App.tsx. Anything not
   listed here is a normal page and gets the plain KoaPOS manifest. */
const APP_ROUTES: AppRoute[] = [
  // /b/:username/t/techapp — /t/webapp is the legacy alias kept for printed QRs.
  { re: /^\/b\/([^/]+)\/t\/(?:techapp|webapp)$/, hasUsername: true, suffix: "Tech", fallbackName: "KoaPOS Tech", themeColor: DEFAULT_THEME },
  { re: /^\/b\/([^/]+)\/t\/posapp$/, hasUsername: true, suffix: "POS", fallbackName: "KoaPOS POS", themeColor: DEFAULT_THEME },
  { re: /^\/b\/([^/]+)\/c\/[^/]+$/, hasUsername: true, suffix: "", fallbackName: "KoaPOS", themeColor: PORTAL_THEME },
  { re: /^\/c\/[^/]+$/, hasUsername: false, suffix: "", fallbackName: "KoaPOS", themeColor: PORTAL_THEME },
  { re: /^\/d\/[^/]+$/, hasUsername: false, suffix: "Dashboard", fallbackName: "KoaPOS Dashboard", themeColor: DEFAULT_THEME },
];

/**
 * Reduce a caller-supplied `?path=` to a bare, same-origin absolute path.
 * `start_url` is built from this, so anything that could resolve off-origin
 * ("//evil.example", "https://…", "\\evil") collapses to "/".
 */
export function sanitiseAppPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > MAX_PATH_LENGTH) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  try {
    // Resolving against a dummy origin normalises "." / ".." and drops any
    // query string or fragment, so the installed icon never pins to one job.
    return new URL(raw, "https://manifest.invalid").pathname;
  } catch {
    return "/";
  }
}

export function matchAppRoute(path: string): { route: AppRoute; username: string | null } | null {
  for (const route of APP_ROUTES) {
    const m = route.re.exec(path);
    if (!m) continue;
    const username = route.hasUsername && m[1] ? decodeURIComponent(m[1]) : null;
    return { route, username };
  }
  return null;
}

async function findActiveMerchant(username: string) {
  const [m] = await db
    .select({
      businessName: merchantsTable.businessName,
      logoUrl: merchantsTable.logoUrl,
      status: merchantsTable.status,
    })
    .from(merchantsTable)
    .where(eq(merchantsTable.username, username.toLowerCase()));
  return m && m.status === "active" ? m : null;
}

type Icon = { src: string; sizes: string; type?: string; purpose: string };

/* Root-relative icon/start URLs resolve against this endpoint's origin, which
   is the same origin the app is served from. */
function buildIcons(logoUrl: string | null): Icon[] {
  const icons: Icon[] = [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
  // The merchant logo goes first so it wins the icon pick; no `type` is
  // declared because the upload may be PNG, JPEG or SVG.
  if (logoUrl) icons.unshift({ src: logoUrl, sizes: "512x512", purpose: "any" });
  return icons;
}

function shortName(name: string): string {
  return name.length > 12 ? name.slice(0, 12).trim() : name;
}

router.get("/pwa/manifest.webmanifest", async (req, res): Promise<void> => {
  const path = sanitiseAppPath(req.query.path);
  const matched = matchAppRoute(path);

  let name = "KoaPOS";
  let logoUrl: string | null = null;
  let themeColor = DEFAULT_THEME;
  let startUrl = "/";

  if (matched) {
    const { route, username } = matched;
    startUrl = path;
    themeColor = route.themeColor;
    name = route.fallbackName;

    const merchant = username ? await findActiveMerchant(username) : null;
    if (merchant) {
      name = route.suffix ? `${merchant.businessName} ${route.suffix}` : merchant.businessName;
      logoUrl = merchant.logoUrl ?? null;
    }
  }

  res.type("application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({
    // An explicit id keeps each business's app a distinct installed app.
    id: startUrl,
    name,
    short_name: shortName(name),
    description: "KoaPOS — point of sale and business apps.",
    start_url: startUrl,
    scope: startUrl,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: themeColor,
    icons: buildIcons(logoUrl),
  });
});

export default router;
