/**
 * Per-app "Add to Home Screen" branding.
 *
 * The whole frontend is a single SPA shell with one static manifest
 * (index.html → /manifest.webmanifest), so out of the box every route would
 * install to the phone home screen as the same generic "KoaPOS" icon that
 * reopens "/". The standalone apps (Tech, Mobile POS, Dashboard, Portal) call
 * this at runtime once they know which business they belong to, swapping in an
 * app-specific name, a start URL that reopens *this* app, and — when the
 * merchant has a logo — that logo as the home-screen icon.
 *
 * iOS reads `apple-touch-icon` / `apple-mobile-web-app-title` from the live DOM
 * at the moment the user taps "Add to Home Screen", so updating them at runtime
 * works. Android/Chrome reads the linked manifest, so we generate an
 * app-specific manifest as a blob URL (with absolute icon/start URLs, since
 * relative URLs don't resolve against a blob: base).
 */

const DEFAULT_THEME = "#ecbe04";

export function setHomeScreenApp(opts: {
  /** Installed app name, e.g. "Acme Repairs POS". */
  name: string;
  /** Path the installed icon reopens. Defaults to the current path. */
  startUrl?: string;
  /** Merchant logo URL for the icon; falls back to the KoaPOS icon. */
  iconUrl?: string | null;
  /** Status-bar / splash theme colour. */
  themeColor?: string;
}): void {
  if (typeof document === "undefined") return;

  const origin = window.location.origin;
  const startUrl = opts.startUrl ?? window.location.pathname;
  const theme = opts.themeColor ?? DEFAULT_THEME;
  const absolute = (u: string) => (/^https?:\/\//.test(u) ? u : origin + u);

  document.title = opts.name;

  const setMeta = (name: string, content: string) => {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!el) { el = document.createElement("meta"); el.setAttribute("name", name); document.head.appendChild(el); }
    el.setAttribute("content", content);
  };
  setMeta("apple-mobile-web-app-title", opts.name);
  setMeta("apple-mobile-web-app-capable", "yes");
  setMeta("mobile-web-app-capable", "yes");
  setMeta("theme-color", theme);

  // iOS home-screen icon — prefer the merchant logo, else the bundled icon.
  let appleIcon = document.head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!appleIcon) { appleIcon = document.createElement("link"); appleIcon.setAttribute("rel", "apple-touch-icon"); document.head.appendChild(appleIcon); }
  appleIcon.setAttribute("href", opts.iconUrl ? absolute(opts.iconUrl) : absolute("/apple-touch-icon.png"));

  // Android/Chrome — app-specific manifest (absolute URLs for blob: resolution).
  const icons: Array<{ src: string; sizes: string; type: string; purpose: string }> = [
    { src: absolute("/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
    { src: absolute("/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
    { src: absolute("/icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
  if (opts.iconUrl) icons.unshift({ src: absolute(opts.iconUrl), sizes: "512x512", type: "image/png", purpose: "any" });

  const manifest = {
    name: opts.name,
    short_name: opts.name.length > 12 ? opts.name.slice(0, 12) : opts.name,
    start_url: absolute(startUrl),
    scope: absolute(startUrl),
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: theme,
    icons,
  };

  let link = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) { link = document.createElement("link"); link.setAttribute("rel", "manifest"); document.head.appendChild(link); }
  const prev = link.getAttribute("href");
  if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
  const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
  link.setAttribute("href", blobUrl);
}
