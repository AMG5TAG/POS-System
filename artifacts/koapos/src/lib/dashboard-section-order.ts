/**
 * Metadata and helpers for the dashboard's reorderable content sections.
 *
 * The custom order is persisted server-side per merchant on `dashboard_config`
 * (see `useDashboardConfig`), so it syncs across a merchant's devices alongside
 * the show/hide visibility flags.
 */
export type DashboardSectionId = "serviceJobs" | "panels" | "calendar" | "referralRevenue";

export const DASHBOARD_SECTIONS: { id: DashboardSectionId; label: string; description: string }[] = [
  { id: "serviceJobs",     label: "Service Jobs & Metrics",       description: "Status tiles, business metrics and the overdue-jobs banner" },
  { id: "panels",          label: "Notifications & Service Panel", description: "Sticky notes / alerts and the live service-jobs list" },
  { id: "calendar",        label: "Calendar",                      description: "Monthly calendar of sales, appointments and birthdays" },
  { id: "referralRevenue", label: "Top Channels by Revenue",       description: "Highest-earning referral sources" },
];

export const DEFAULT_SECTION_ORDER: DashboardSectionId[] = DASHBOARD_SECTIONS.map((s) => s.id);
const KNOWN = new Set<DashboardSectionId>(DEFAULT_SECTION_ORDER);

/**
 * Coerce a stored/received value into a valid section order: keep only known
 * ids (dedup, preserving stored order), then append any known sections missing
 * from it — so a null/partial value or a section added in a later release still
 * yields a complete, sensible order.
 */
export function sanitizeSectionOrder(stored: unknown): DashboardSectionId[] {
  const kept: DashboardSectionId[] = [];
  const seen = new Set<DashboardSectionId>();
  if (Array.isArray(stored)) {
    for (const x of stored) {
      const id = x as DashboardSectionId;
      if (typeof x === "string" && KNOWN.has(id) && !seen.has(id)) {
        kept.push(id);
        seen.add(id);
      }
    }
  }
  for (const id of DEFAULT_SECTION_ORDER) if (!seen.has(id)) kept.push(id);
  return kept;
}
