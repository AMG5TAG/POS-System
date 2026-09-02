/**
 * Join structured address/billing parts into a single free-text address line.
 * Trims each part, drops blanks, and comma-separates — the canonical way the API
 * derives the denormalised `address` column from the structured billing fields.
 */
export function formatAddressParts(...parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
}
