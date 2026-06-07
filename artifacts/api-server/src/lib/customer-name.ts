/**
 * Resolve a customer's display name: "First Last", falling back to the
 * company / business name for business-only contacts that have no personal
 * name recorded. Returns null when neither is present.
 */
export function customerDisplayName(
  first?: string | null,
  last?: string | null,
  company?: string | null,
): string | null {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || company?.trim() || null;
}
