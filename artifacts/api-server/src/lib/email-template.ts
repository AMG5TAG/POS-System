/* ─── Email template resolution ───────────────────────────────────────────────
 * The invoice email body is the **Email** template's document (Management ›
 * Templates › Emails). Resolving the saved row here, on the server, is what lets
 * a background send — auto-send, the reminder/overdue scheduler — carry the
 * merchant's wording: those callers pass no template payload at all.
 *
 * A caller's payload still wins field by field, which is how the send dialog
 * applies a subject typed for one email. An empty string from a caller means
 * "nothing typed", not "clear the saved value", so blanks are dropped before the
 * merge — otherwise a send dialog with an untouched field would erase wording
 * the merchant configured.
 *
 * The attached PDF is a different document and keeps its own template (Invoice).
 */

/** The saved Email row, as far as this needs it. */
export interface EmailTemplateRow {
  selectedStyle?: string | null;
  footerHtml?: string | null;
  showLogo?: boolean | null;
  options?: unknown;
}

/** Business profile columns the email is branded from (JSON stored as text). */
export interface EmailBrandingRow {
  brandColors?: string | null;
  logo?: string | null;
  website?: string | null;
  contactEmail?: string | null;
  tagline?: string | null;
  socialLinks?: string | null;
}

export interface ResolvedEmailTemplate {
  templateId: string;
  subjectLine?: string;
  customGreeting?: string;
  customMessage?: string;
  customSignOff?: string;
  thankYouMsg?: string;
  footerText?: string;
  showGstBreakdown: boolean;
  showWebsite: boolean;
  showSocialLinks: boolean;
  showLogo: boolean;
  brandColor?: string;
  logo?: string;
  website?: string;
  contactEmail?: string;
  tagline?: string;
  socialLinks?: Record<string, string>;
}

/** Non-blank string, or undefined so a `??`/`||` fallback downstream applies. */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}

/** The merchant's saved email wording, style and branding. */
export function savedEmailTemplate(row: EmailTemplateRow | undefined, bp: EmailBrandingRow | undefined): ResolvedEmailTemplate {
  const opts = (row?.options ?? {}) as Record<string, unknown>;
  return {
    templateId:       row?.selectedStyle || "e-pro",
    subjectLine:      str(opts.subjectLine),
    customGreeting:   str(opts.customGreeting),
    customMessage:    str(opts.customMessage),
    customSignOff:    str(opts.customSignOff),
    thankYouMsg:      str(opts.thankYouMsg),
    footerText:       str(row?.footerHtml) ?? str(opts.footerText),
    // Undefined means the merchant never touched it, so keep the on-by-default
    // behaviour these two have always had; false is a real choice.
    showGstBreakdown: opts.showGstBreakdown !== undefined ? Boolean(opts.showGstBreakdown) : true,
    showWebsite:      opts.showWebsite !== undefined ? Boolean(opts.showWebsite) : true,
    showSocialLinks:  Boolean(opts.showSocialLinks),
    showLogo:         row ? row.showLogo !== false : true,
    brandColor:       parseJson<string[]>(bp?.brandColors, [])[0],
    logo:             bp?.logo || undefined,
    website:          bp?.website || undefined,
    contactEmail:     bp?.contactEmail || undefined,
    tagline:          bp?.tagline || undefined,
    socialLinks:      bp?.socialLinks ? parseJson<Record<string, string>>(bp.socialLinks, {}) : undefined,
  };
}

/**
 * Layer a caller's payload over the saved template, ignoring its blanks.
 *
 * Overlapping keys keep this module's types (a caller may legitimately send a
 * null there, which is dropped anyway); keys only the caller knows about are
 * carried through for the route to use.
 */
export function mergeEmailTemplate<T extends object>(
  saved: ResolvedEmailTemplate,
  caller: T | null | undefined,
): ResolvedEmailTemplate & Omit<T, keyof ResolvedEmailTemplate> {
  const typed = Object.fromEntries(
    Object.entries(caller ?? {}).filter(([, v]) => v !== "" && v != null),
  );
  return { ...saved, ...typed } as ResolvedEmailTemplate & Omit<T, keyof ResolvedEmailTemplate>;
}
