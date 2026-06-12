/**
 * Pure landing-page link helpers and types — no React, no AppLayout, no app
 * bundle. Shared by the authenticated editor (marketing-landing-pages.tsx) and
 * the PUBLIC landing page renderer (landing-page-public.tsx).
 *
 * Keep this dependency-free: the public page imports from here so an
 * unauthenticated visitor never downloads the whole authenticated app.
 */

export type LinkSize = "small" | "medium" | "large";
export type LinkPlacement = "body" | "bottom";

export interface LandingPageLink {
  id: string; label: string; url: string; emoji: string; enabled: boolean;
  size?: LinkSize;
  /** Render as an icon only (no text label) — for social-media-style buttons. */
  iconOnly?: boolean;
  /** "bottom" renders the link in the icon row at the very bottom of the page. */
  placement?: LinkPlacement;
}

/* Per-link button (pill) sizing → padding + text size. Falls back to medium. */
export const LINK_SIZE_CLASSES: Record<LinkSize, string> = {
  small:  "py-2 px-3 text-xs",
  medium: "py-3 px-4 text-sm",
  large:  "py-4 px-5 text-base",
};

/* Sizing for circular icon-only buttons (the bottom social row). */
export const LINK_ICON_SIZE_CLASSES: Record<LinkSize, string> = {
  small:  "w-9 h-9 text-base",
  medium: "w-11 h-11 text-lg",
  large:  "w-14 h-14 text-2xl",
};

/** Split enabled links into body buttons and the bottom social-icon row. */
export function splitLandingLinks(links: LandingPageLink[]): { body: LandingPageLink[]; bottom: LandingPageLink[] } {
  const enabled = links.filter((l) => l.enabled);
  return {
    body:   enabled.filter((l) => (l.placement ?? "body") !== "bottom"),
    bottom: enabled.filter((l) => l.placement === "bottom"),
  };
}

/** Icon shown for a link: its emoji, else the first letter of the label. */
export function linkIconGlyph(link: LandingPageLink): string {
  return link.emoji?.trim() || link.label.trim().charAt(0).toUpperCase() || "★";
}
