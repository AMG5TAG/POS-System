/** Escape a string for safe interpolation into HTML text/attribute content.
 *  Use whenever user-controlled data (names, notes, free-text fields) is placed
 *  into an HTML email/document template, to prevent markup/script injection. */
export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}
