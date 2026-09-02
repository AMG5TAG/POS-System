import { useEffect } from "react";
import type { Page } from "@/pages/app/online-store/shared";
import type { Catalog } from "./storefront-commerce";

/*
 * Client-side SEO for the storefront SPA: sets the document title, meta
 * description, canonical link, Open Graph / Twitter cards and JSON-LD structured
 * data (Store + Product rich results) from the store's own SEO fields. Works for
 * JS-executing crawlers (Google) and improves link unfurls; a sitemap.xml is
 * served separately by the API for discovery.
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

function setJsonLd(id: string, data: unknown | null) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!data) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("script"); el.id = id; el.type = "application/ld+json"; document.head.appendChild(el); }
  el.textContent = JSON.stringify(data);
}

interface SeoOpts {
  enabled: boolean;
  storeName: string;
  tagline: string;
  page: Page | null;
  logoUrl: string;
  catalog: Catalog | null;
}

export function useStorefrontSeo(opts: SeoOpts): void {
  const { enabled, storeName, tagline, page, logoUrl, catalog } = opts;
  const pageId = page?.id ?? "";
  const itemCount = catalog?.items.length ?? 0;

  useEffect(() => {
    if (!enabled) return;
    const canonical = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
    const title = page?.seoTitle?.trim()
      || (page?.name && page.name.toLowerCase() !== "home" ? `${page.name} · ${storeName}` : storeName)
      || "Online Store";
    const desc = page?.seoDescription?.trim() || tagline || "";
    const image = page?.shareImage?.trim() || logoUrl || "";

    const prevTitle = document.title;
    document.title = title;
    upsertMeta("name", "description", desc);
    upsertLink("canonical", canonical);
    upsertMeta("property", "og:site_name", storeName);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", desc);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:image", image);
    upsertMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", desc);
    upsertMeta("name", "twitter:image", image);

    const store = {
      "@context": "https://schema.org",
      "@type": "Store",
      name: storeName,
      url: canonical,
      ...(image ? { logo: image, image } : {}),
      ...(desc ? { description: desc } : {}),
    };
    setJsonLd("ld-store", store);

    const products = (catalog?.items ?? []).slice(0, 30).map((p) => ({
      "@type": "Product",
      name: p.name,
      ...(p.imageUrl ? { image: p.imageUrl } : {}),
      ...(p.sku ? { sku: p.sku } : {}),
      ...(p.description ? { description: p.description } : {}),
      offers: {
        "@type": "Offer",
        price: p.price.toFixed(2),
        priceCurrency: "AUD",
        availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      },
      ...(p.reviewCount > 0
        ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.avgRating, reviewCount: p.reviewCount } }
        : {}),
    }));
    setJsonLd("ld-products", products.length
      ? { "@context": "https://schema.org", "@type": "ItemList", itemListElement: products.map((item, i) => ({ "@type": "ListItem", position: i + 1, item })) }
      : null);

    return () => { document.title = prevTitle; };
    // Re-run when the store identity, active page, or catalogue size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, storeName, tagline, logoUrl, pageId, itemCount]);
}
