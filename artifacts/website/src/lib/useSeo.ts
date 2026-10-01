import { useEffect } from "react";

const SITE_ORIGIN = "https://koastal.com.au";

interface SeoOptions {
  title: string;
  description: string;
  scrollToTop?: boolean;
  canonicalPath?: string;
  ogImage?: string;
  icon?: string;
  /**
   * Marks the page `noindex, follow` and suppresses the canonical tag.
   * For pages that must never enter the index — the 404 and /search — where a
   * self-referencing canonical would otherwise invite Google to index a URL
   * that has no business being there.
   */
  noindex?: boolean;
}

function setMeta(selector: string, attr: "name" | "property", key: string, value: string): string | null {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  const previous = el ? el.getAttribute("content") : null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
  return previous;
}

function setCanonical(href: string): { existed: boolean; previousHref: string | null } {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const existed = !!link;
  const previousHref = link ? link.getAttribute("href") : null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
  return { existed, previousHref };
}

export function useSeo({ title, description, scrollToTop = true, canonicalPath, ogImage, icon, noindex = false }: SeoOptions) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    // A noindex page must not also claim a canonical: pairing the two tells
    // Google the URL is both the preferred version and not for indexing.
    let canonicalState: { existed: boolean; previousHref: string | null } | null = null;
    let removedCanonicalHref: string | null = null;
    if (noindex) {
      // Not writing a canonical is not enough — index.html ships one pointing
      // at the homepage, and it would otherwise survive on every noindex page.
      const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (existing) {
        removedCanonicalHref = existing.getAttribute("href");
        existing.remove();
      }
    } else {
      const path = canonicalPath ?? window.location.pathname;
      const canonicalHref = `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
      canonicalState = setCanonical(canonicalHref);
    }

    const previousRobots = setMeta(
      'meta[name="robots"]',
      "name",
      "robots",
      noindex ? "noindex, follow" : "index, follow",
    );

    const previousDesc = setMeta(
      'meta[name="description"]',
      "name",
      "description",
      description,
    );
    const previousOgTitle = setMeta(
      'meta[property="og:title"]',
      "property",
      "og:title",
      title,
    );
    const previousOgDesc = setMeta(
      'meta[property="og:description"]',
      "property",
      "og:description",
      description,
    );
    const previousTwTitle = setMeta(
      'meta[name="twitter:title"]',
      "name",
      "twitter:title",
      title,
    );
    const previousTwDesc = setMeta(
      'meta[name="twitter:description"]',
      "name",
      "twitter:description",
      description,
    );

    const ogImgPath = ogImage || `${SITE_ORIGIN}/opengraph.png`;
    const previousOgImg = setMeta(
      'meta[property="og:image"]',
      "property",
      "og:image",
      ogImgPath,
    );
    const previousTwImg = setMeta(
      'meta[name="twitter:image"]',
      "name",
      "twitter:image",
      ogImgPath,
    );

    let previousIconHref: string | null = null;
    let iconExisted = false;
    if (icon) {
      let iconLink = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
      iconExisted = !!iconLink;
      previousIconHref = iconLink ? iconLink.getAttribute("href") : null;
      if (!iconLink) {
        iconLink = document.createElement("link");
        iconLink.setAttribute("rel", "icon");
        iconLink.setAttribute("type", "image/png");
        document.head.appendChild(iconLink);
      }
      iconLink.setAttribute("href", icon);
    }

    if (scrollToTop) {
      window.scrollTo(0, 0);
    }

    return () => {
      document.title = previousTitle;
      const restore = (selector: string, prev: string | null) => {
        const el = document.head.querySelector<HTMLMetaElement>(selector);
        if (!el) return;
        if (prev !== null) el.setAttribute("content", prev);
      };
      restore('meta[name="description"]', previousDesc);
      restore('meta[property="og:title"]', previousOgTitle);
      restore('meta[property="og:description"]', previousOgDesc);
      restore('meta[name="twitter:title"]', previousTwTitle);
      restore('meta[name="twitter:description"]', previousTwDesc);
      restore('meta[property="og:image"]', previousOgImg);
      restore('meta[name="twitter:image"]', previousTwImg);
      restore('meta[name="robots"]', previousRobots);
      if (removedCanonicalHref !== null) {
        setCanonical(removedCanonicalHref);
      }
      const canonicalLink = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (canonicalLink && canonicalState) {
        if (canonicalState.existed && canonicalState.previousHref !== null) {
          canonicalLink.setAttribute("href", canonicalState.previousHref);
        } else if (!canonicalState.existed) {
          canonicalLink.remove();
        }
      }
      const iconLink = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (iconLink && icon) {
        if (iconExisted && previousIconHref !== null) {
          iconLink.setAttribute("href", previousIconHref);
        } else if (!iconExisted) {
          iconLink.remove();
        }
      }
    };
  }, [title, description, scrollToTop, canonicalPath, icon, noindex]);
}
