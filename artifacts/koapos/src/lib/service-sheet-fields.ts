/* ─── Service sheet field helpers ─────────────────────────────────────────────
 * Shared by every rendering of a service job — the A4 `ServiceJobSheet`, the
 * 80mm `ServiceJobDocket`, and the ESC/POS encoder behind it.
 *
 * These live here rather than in any one renderer because a job printed on A4
 * and the same job printed on the roll have to say the same thing. When the
 * status table was duplicated per renderer, adding a status in one place quietly
 * left the other printing a title-cased slug.
 */

/** Canonical human-readable labels for service-job status codes. */
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  "in-progress": "In Progress",
  "awaiting-parts": "Awaiting Parts",
  "awaiting-stock": "Awaiting Stock",
  "at-repairer": "At Repairer",
  "awaiting-partner-approval": "Awaiting Partner Approval",
  "partner-replacement": "Partner Replacement",
  "awaiting-customer": "Awaiting Customer",
  "awaiting-pickup": "Completed - Awaiting Pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Display label for a status code, falling back to title case for new codes. */
export function humanizeStatus(s: string): string {
  if (!s) return "";
  return STATUS_LABELS[s] ?? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * A job stores accounts and PINs as two parallel newline-separated lists. Merge
 * them into display lines, pairing by position and dropping blanks so an empty
 * credential never prints as a bare separator.
 *
 * `separator` differs by renderer: the HTML sheets use an en dash, the thermal
 * encoder a hyphen (ESC/POS Font A can't render an en dash).
 */
export function mergeCredentialLines(
  accounts: string | undefined,
  logins: string | undefined,
  separator = "-",
): string[] {
  const accts = (accounts ?? "").split("\n").map((s) => s.trim());
  const pins = (logins ?? "").split("\n").map((s) => s.trim());
  const max = Math.max(accts.length, pins.length);
  return Array.from({ length: max }, (_, i) => {
    const a = accts[i] || "";
    const p = pins[i] || "";
    if (a && p) return `${a} ${separator} ${p}`;
    return a || p;
  }).filter(Boolean);
}
