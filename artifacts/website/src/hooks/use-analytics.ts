import { useEffect } from "react";
import { useLocation } from "wouter";

import {
  trackPageView,
  trackContactClick,
  type ContactMethod,
} from "@/lib/analytics";

/**
 * Fires a GA4 page_view whenever the wouter location changes — including the
 * first render. This is what makes analytics work for a client-side SPA: the
 * gtag snippet in index.html only counts the initial document load, so without
 * this hook every in-app navigation would go untracked.
 *
 * Mount it once, high in the tree, inside the Router context.
 */
export function usePageTracking(): void {
  const [location] = useLocation();

  useEffect(() => {
    trackPageView();
  }, [location]);
}

function contactMethodFromHref(href: string): ContactMethod | null {
  if (href.startsWith("tel:")) return "phone";
  if (href.startsWith("mailto:")) return "email";
  if (/(?:wa\.me|whatsapp\.com|whatsapp:)/i.test(href)) return "whatsapp";
  return null;
}

/**
 * Tracks clicks on every contact link on the site — phone (`tel:`), email
 * (`mailto:`) and WhatsApp (`wa.me`) — via a single delegated listener on the
 * document. Using delegation instead of per-link handlers means it covers all
 * of the site's contact links (and any added later) without touching each one.
 *
 * Mount once, high in the tree.
 */
export function useContactLinkTracking(): void {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href") ?? "";
      const method = contactMethodFromHref(href);
      if (!method) return;

      const linkText = anchor.textContent?.trim().slice(0, 100) || undefined;
      trackContactClick(method, href, linkText);
    }

    // Capture phase so the event is recorded even if a handler calls
    // stopPropagation() before it would bubble to the document.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}
