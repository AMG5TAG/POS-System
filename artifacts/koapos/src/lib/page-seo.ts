import { useEffect } from "react";

/*
 * Client-side SEO for a public page: document title, meta description,
 * canonical link and Open Graph / Twitter cards. Improves link unfurls when a
 * public page (e.g. a product QR code's landing page) is shared.
 */

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const sel = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(sel);
  if (!content) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("link"); el.setAttribute("rel", rel); document.head.appendChild(el); }
  el.setAttribute("href", href);
}

interface PageSeoOpts {
  enabled: boolean;
  title: string;
  description: string;
  image: string;
}

export function usePageSeo({ enabled, title, description, image }: PageSeoOpts): void {
  useEffect(() => {
    if (!enabled) return;
    const canonical = window.location.origin + window.location.pathname;
    const prevTitle = document.title;
    document.title = title;
    upsertMeta("name", "description", description);
    upsertLink("canonical", canonical);
    upsertMeta("property", "og:site_name", title);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:image", image);
    upsertMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", image);
    return () => { document.title = prevTitle; };
  }, [enabled, title, description, image]);
}
