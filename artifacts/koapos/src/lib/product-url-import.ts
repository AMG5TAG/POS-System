/** Small rules for Import Details (ImportProductDetailsDialog), kept pure for tests. */

/** "12 months", "2 Years Manufacturer", "1 yr" → the form's warranty fields. */
export function parseWarranty(text: string): { duration: string; unit: "months" | "years" } | null {
  const m = text.toLowerCase().match(/(\d+(?:\.\d+)?)\s*-?\s*(years?|yrs?|months?|mths?|mos?)\b/);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (!(n > 0) || n > 100) return null;
  const years = m[2]!.startsWith("y");
  // A fractional year (1.5 years) is stored as months.
  if (years && !Number.isInteger(n)) return { duration: String(Math.round(n * 12)), unit: "months" };
  return { duration: String(Math.round(n)), unit: years ? "years" : "months" };
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

/** An existing brand/category whose name matches, ignoring case, spacing and "&" vs "and". */
export function matchByName<T extends { name: string }>(list: T[], name: string | undefined): T | undefined {
  if (!name?.trim()) return undefined;
  const want = norm(name);
  return list.find((x) => norm(x.name) === want);
}
