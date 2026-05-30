/**
 * Shared social-link helpers used across all print paths:
 * thermal receipts, A4 invoices/quotes, service job sheets, and
 * the management-templates preview components.
 */

interface PlatformMeta {
  label: string;
}

const PLATFORM_META: Record<string, PlatformMeta> = {
  facebook:  { label: "Facebook" },
  instagram: { label: "Instagram" },
  twitter:   { label: "Twitter" },
  x:         { label: "X" },
  linkedin:  { label: "LinkedIn" },
  youtube:   { label: "YouTube" },
  tiktok:    { label: "TikTok" },
  pinterest: { label: "Pinterest" },
  snapchat:  { label: "Snapchat" },
  threads:   { label: "Threads" },
  reddit:    { label: "Reddit" },
  whatsapp:  { label: "WhatsApp" },
  wechat:    { label: "WeChat" },
};

/**
 * Returns a friendly platform label for a social key.
 * e.g. "facebook" → "Facebook", "my_custom" → "My_custom"
 */
export function getSocialLabel(key: string): string {
  const meta = PLATFORM_META[key.toLowerCase()];
  if (meta) return meta.label;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Extracts a short display handle from a social URL or raw string.
 * - "https://instagram.com/mystore"   → "@mystore"
 * - "https://facebook.com/yourstore"  → "@yourstore"
 * - "https://linkedin.com/company/co" → "@co"
 * - "@myhandle"                       → "@myhandle" (passthrough)
 * - "myhandle"                        → "@myhandle"
 * - A bare domain (no path) is returned unchanged.
 */
export function getSocialHandle(value: string): string {
  if (!value) return value;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!path) return trimmed;
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    if (!last) return trimmed;
    return last.startsWith("@") ? last : `@${last}`;
  } catch {
    // Not a URL — treat as a raw handle
    if (trimmed.startsWith("@")) return trimmed;
    // If it looks like a domain, return as-is
    if (/^[\w.-]+\.[a-z]{2,}$/i.test(trimmed)) return trimmed;
    return `@${trimmed}`;
  }
}

/**
 * Converts a raw social-links map to an array of display pairs.
 * Only entries with a non-empty value are included.
 */
export function formatSocialEntries(
  links: Record<string, string> | undefined | null,
): Array<{ label: string; handle: string }> {
  if (!links) return [];
  return Object.entries(links)
    .filter(([, v]) => v)
    .map(([k, v]) => ({
      label: getSocialLabel(k),
      handle: getSocialHandle(String(v)),
    }));
}
