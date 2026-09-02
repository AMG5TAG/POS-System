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

/* ─── Thermal docket styles ───────────────────────────────────────────────────
 * The Service Ticket template (Management › Templates) offers A4 sheet styles
 * and 80mm docket styles from the same catalogue, so the stored `selectedStyle`
 * decides two things at once: whether a job defaults to the roll, and how dense
 * the docket prints. Both docket renderers — the HTML `ServiceJobDocket` and the
 * ESC/POS encoder — read the density from here so they stay identical.
 */

/** How tightly the 80mm docket packs the same fields onto the roll. */
export type ServiceDocketDensity = "standard" | "compact";

/** Service Ticket style ids that print on an 80mm roll rather than A4. */
export const THERMAL_SERVICE_STYLE_IDS = ["ss-thermal", "ss-thermal-compact"] as const;

/** True when the saved Service Ticket style is one of the 80mm docket styles. */
export function isThermalServiceStyle(style?: string | null): boolean {
  return (THERMAL_SERVICE_STYLE_IDS as readonly string[]).includes(style ?? "");
}

/**
 * Docket density for a stored style id. Anything that isn't the compact thermal
 * style prints standard — including the A4 styles, which still reach the docket
 * when a merchant sets Default Paper to 80mm without picking a thermal style.
 */
export function serviceDocketDensity(style?: string | null): ServiceDocketDensity {
  return style === "ss-thermal-compact" ? "compact" : "standard";
}
