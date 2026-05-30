import type { CSSProperties } from "react";
import { getSocialIconPath, getSocialBrandColor } from "@/lib/social-links";

interface SocialIconProps {
  /** Platform key, e.g. "facebook", "instagram", "x". */
  platform: string;
  /** Icon edge size in px. Defaults to 11. */
  size?: number;
  /**
   * When true, renders the icon in the platform's official brand color instead
   * of inheriting the surrounding text color. Use on color A4/PDF documents;
   * leave false (default) for thermal/monochrome receipts.
   */
  useBrandColor?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders a small inline brand glyph for a social platform. The icon is a
 * single-path SVG (no external requests). By default it inherits the
 * surrounding text colour via `fill="currentColor"`. Pass `useBrandColor` to
 * render in each platform's official brand color on color A4 documents.
 * Returns null when no icon is known for the platform.
 */
export function SocialIcon({ platform, size = 11, useBrandColor = false, className, style }: SocialIconProps) {
  const path = getSocialIconPath(platform);
  if (!path) return null;
  const fill = useBrandColor ? (getSocialBrandColor(platform) ?? "currentColor") : "currentColor";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill}
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: "inline-block", verticalAlign: "-0.125em", flexShrink: 0, ...style }}
    >
      <path d={path} />
    </svg>
  );
}
