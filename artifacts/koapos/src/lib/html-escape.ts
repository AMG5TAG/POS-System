/** Escape a value for interpolation into HTML text or a quoted attribute.
 *
 * Every print popup in the POS is an `about:blank` window opened from the app,
 * so it runs as the POS origin with the staff member's session: markup in a
 * customer's name or an appointment request from the shop is script running as
 * staff. Anything not written by this file's caller goes through `escHtml`. */
export function escHtml(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}
