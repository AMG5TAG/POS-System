import type { CSSProperties } from "react";
import { getSocialIconPath } from "@/lib/social-links";

interface SocialIconProps {
  /** Platform key, e.g. "facebook", "instagram", "x". */
  platform: string;
  /** Icon edge size in px. Defaults to 11. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders a small inline brand glyph for a social platform. The icon is a
 * single-path SVG (no external requests) that inherits the surrounding text
 * colour via `fill="currentColor"`, so it survives printing and PDF export.
 * Returns null when no icon is known for the platform.
 */
export function SocialIcon({ platform, size = 11, className, style }: SocialIconProps) {
  const path = getSocialIconPath(platform);
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: "inline-block", verticalAlign: "-0.125em", flexShrink: 0, ...style }}
    >
      <path d={path} />
    </svg>
  );
}
