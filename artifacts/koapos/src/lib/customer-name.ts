/**
 * Resolve a customer's display name: "First Last", falling back to the
 * company / business name for business-only contacts that have no personal
 * name recorded, then to `fallback` (default "Unknown").
 *
 * Use this everywhere a customer is shown on sales, invoices, quotes,
 * receipts etc. so business customers never appear as "Unknown".
 */
export function customerDisplayName(
  c:
    | { firstName?: string | null; lastName?: string | null; company?: string | null }
    | null
    | undefined,
  fallback = "Unknown",
): string {
  if (!c) return fallback;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.company?.trim() || fallback;
}
