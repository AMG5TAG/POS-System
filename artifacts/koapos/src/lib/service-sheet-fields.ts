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

/* ─── QR alignment ────────────────────────────────────────────────────────────
 * Where the QR blocks sit on a service ticket, set once on the Service Ticket
 * template (Management › Templates) and obeyed by every renderer: the A4 report
 * HTML, the A4 `ServiceJobSheet`, the 80mm `ServiceJobDocket`, the ESC/POS
 * encoder and the template preview. It lives here for the same reason the status
 * labels do — five copies of a layout rule is five chances for the roll and the
 * sheet to disagree.
 *
 * It governs BOTH QRs a ticket can carry (the job QR and the merchant's custom
 * QR), because a merchant asking for their codes to line up means all of them.
 */

/** The three alignments a merchant can pick. */
export type ServiceQrAlign = "left" | "center" | "right";

/**
 * Resolve the saved template value, falling back to the paper's own default.
 *
 * Unset is not "left": the A4 sheet corners its QR bottom-left while the 80mm
 * roll centres it, and both were deliberate. A single stored default would
 * silently re-align one of them for every merchant who never asked, so each
 * renderer passes the default it has always used and only an explicit choice
 * overrides it.
 */
export function serviceQrAlign(
  saved: string | null | undefined,
  fallback: ServiceQrAlign,
): ServiceQrAlign {
  return saved === "left" || saved === "center" || saved === "right" ? saved : fallback;
}

/** `justify-content` for the A4 blocks, which lay the QR and its caption in a row. */
export const QR_JUSTIFY: Record<ServiceQrAlign, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

/** `margin` that pushes a fixed-width block (the docket's custom QR image) to
 *  the chosen side. `text-align` cannot move a block-level image. */
export const QR_BLOCK_MARGIN: Record<ServiceQrAlign, string> = {
  left: "0 auto 0 0",
  center: "0 auto",
  right: "0 0 0 auto",
};
