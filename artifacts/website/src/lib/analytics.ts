// Google Analytics (GA4) helpers.
//
// The gtag.js library and the initial `gtag('config', …)` call live in
// index.html. That config sets `send_page_view: false`, so every page_view —
// including the first load — is sent from here. That gives us one consistent
// source of truth that also covers client-side (SPA) navigation, which the
// stock snippet does not track on its own.

export const GA_MEASUREMENT_ID = "G-639QEPSKTL";

type GtagArgs =
  | ["js", Date]
  | ["config", string, Record<string, unknown>?]
  | ["event", string, Record<string, unknown>?]
  | ["set", Record<string, unknown>];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: GtagArgs) => void;
  }
}

function gtag(...args: GtagArgs): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag(...args);
}

/**
 * Send a GA4 page_view for the current URL. Safe to call on every route change;
 * reads the live document title and location so it reflects the page the user
 * actually landed on after navigation.
 */
export function trackPageView(path?: string): void {
  const page_path = path ?? window.location.pathname + window.location.search;
  gtag("event", "page_view", {
    page_path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

/** Send an arbitrary GA4 event (e.g. a button click or form submission). */
export function trackEvent(
  name: string,
  params: Record<string, unknown> = {},
): void {
  gtag("event", name, params);
}

export type ContactMethod = "phone" | "email" | "whatsapp";

/**
 * Send a GA4 `contact_click` event. Reported with a `method` dimension so a
 * single event covers phone / email / WhatsApp and can be broken down in GA.
 */
export function trackContactClick(
  method: ContactMethod,
  url: string,
  linkText?: string,
): void {
  trackEvent("contact_click", {
    method,
    link_url: url,
    ...(linkText ? { link_text: linkText } : {}),
  });
}
