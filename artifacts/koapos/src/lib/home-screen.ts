/**
 * Per-app "Add to Home Screen" branding.
 *
 * The whole frontend is a single SPA shell, so out of the box every route
 * would install to the phone home screen as the same generic "KoaPOS" icon
 * that reopens "/". The standalone apps (Tech, Mobile POS, Dashboard, Portal)
 * call this once they know which business they belong to, so the installed
 * icon carries that business's name and logo.
 *
 * Two halves, because the platforms read different things:
 *
 * - **Android/Chrome** reads the web app manifest, and reads it *once, at
 *   document load*, from the `<link rel="manifest">` in the HTML. Rewriting
 *   that link after React mounts is too late, so the correct manifest URL is
 *   chosen by an inline script in index.html and served per-app by
 *   `/api/pwa/manifest.webmanifest?path=…`. That is what makes the installed
 *   shortcut reopen the app instead of the marketing homepage. This function
 *   only keeps the link in sync if a caller passes a different `startUrl`.
 *
 * - **iOS Safari** reads `apple-touch-icon` / `apple-mobile-web-app-title`
 *   from the live DOM at the moment the user taps "Add to Home Screen", so
 *   updating those at runtime does work — that is this function's main job.
 */

const DEFAULT_THEME = "#ecbe04";

/** URL of the server-rendered manifest for a given app path. */
export function appManifestUrl(startUrl: string): string {
  return `/api/pwa/manifest.webmanifest?path=${encodeURIComponent(startUrl)}`;
}

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

  // Keep the manifest link pointing at this app. index.html already sets it
  // for the known app routes before the browser reads it; this only matters
  // when a caller brands a path the inline script does not recognise. Skip the
  // write when it is already correct, so Chrome is not asked to re-fetch.
  const href = appManifestUrl(startUrl);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) { link = document.createElement("link"); link.setAttribute("rel", "manifest"); document.head.appendChild(link); }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}
