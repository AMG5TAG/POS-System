/* Shop statistics (POS › Management › Online Store › Statistics). Reports
   page views, product views, link clicks, searches and add-to-carts to
   POST /api/shop/track, batched and sent in the background; it can never
   block or break the page — every failure is swallowed.

   A visitor is a random id kept in this browser (`kk-visitor`), so the count is
   of browsers, not people. The API stores no IP address, only a keyed hash
   for counting unique connections (api-server lib/shop-stats.ts). */

type ShopEvent = {
  type: "page_view" | "product_view" | "link_click" | "search" | "add_to_cart";
  path: string;
  productId?: number;
  target?: string;
  label?: string;
  referrer?: string;
};

declare global {
  interface Window { gtag?: (...args: unknown[]) => void }
}

/* Google Analytics (the GA4 property is configured in index.html with
   send_page_view off). The SPA sends page_view itself so client-side route
   changes count, plus GA's recommended view_item / add_to_cart / search. */
function ga(event: string, params: Record<string, unknown>) {
  try { if (typeof window.gtag === "function") window.gtag("event", event, params); } catch { /* never break the shop */ }
}

const KEY = "kk-visitor";
let queue: ShopEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let firstView = true;

function visitorId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "anon-" + Math.random().toString(36).slice(2, 14);
  }
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (queue.length === 0 || typeof fetch !== "function") { queue = []; return; }
  const events = queue.splice(0, 20);
  try {
    void fetch("/api/shop/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: visitorId(), events }),
      keepalive: true,
      credentials: "omit",
    }).catch(() => {});
  } catch { /* never let statistics break the shop */ }
  if (queue.length) flush();
}

function track(e: ShopEvent) {
  queue.push({ ...e, path: e.path.slice(0, 300) });
  if (queue.length >= 20) flush();
  else if (!timer) timer = setTimeout(flush, 1500);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
}

/** The router's path, as the shop names it (without the /shop base). */
export function trackPageView(path: string) {
  // The site that sent the visitor, on their first page only (the API keeps
  // just its host, and only when it isn't one of our own sites).
  const referrer = firstView && document.referrer ? document.referrer.slice(0, 500) : undefined;
  firstView = false;
  track({ type: "page_view", path, referrer });
  ga("page_view", {
    page_path: window.location.pathname + window.location.search,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export const trackProductView = (path: string, productId: number) => {
  track({ type: "product_view", path, productId });
  ga("view_item", { items: [{ item_id: String(productId) }] });
};
export const trackAddToCart = (productId: number) => {
  track({ type: "add_to_cart", path: currentPath(), productId });
  ga("add_to_cart", { items: [{ item_id: String(productId) }] });
};
export const trackSearch = (term: string) => {
  if (!term.trim()) return;
  track({ type: "search", path: currentPath(), target: term.trim().slice(0, 200) });
  ga("search", { search_term: term.trim().slice(0, 100) });
};

function currentPath() {
  return window.location.pathname.replace(/^\/shop(?=\/|$)/, "") || "/";
}

/* Link clicks: every <a> on the page, the shared header and footer included.
   Our own links are recorded as a path, others as the full address. */
export function installLinkTracking(): () => void {
  const onClick = (ev: MouseEvent) => {
    const a = (ev.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    let target: string;
    try {
      const url = new URL(a.href, window.location.href);
      if (!/^https?:$/.test(url.protocol)) target = url.protocol.replace(":", ""); // tel, mailto
      else target = url.origin === window.location.origin ? url.pathname + url.search : url.href;
    } catch { return; }
    const label = (a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
    track({ type: "link_click", path: currentPath(), target: target.slice(0, 500), label: label || undefined });
  };
  document.addEventListener("click", onClick, { capture: true });
  return () => document.removeEventListener("click", onClick, { capture: true });
}
