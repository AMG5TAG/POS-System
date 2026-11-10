/**
 * Suggest tags for a new product from the tags the business already uses
 * (Inventory › Tags). A tag is suggested when it appears as a whole word or
 * phrase in the product's text — name, the supplier's short description,
 * brand, category — case-insensitively, so "Memory" matches "16GB memory" but
 * "Data" never matches "Database". Most-used tags first, capped, so the
 * products end up tagged the way the rest of the catalogue already is.
 * Pinned by tag-suggest.test.ts.
 */

export interface TagCount { name: string; productCount: number }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function suggestTags(text: string, tags: readonly TagCount[], max = 8): string[] {
  const hay = text.replace(/\s+/g, " ");
  if (!hay.trim()) return [];
  const hits = tags.filter((t) => {
    const name = t.name.trim();
    if (name.length < 2) return false;
    return new RegExp(`(?<![A-Za-z0-9])${escapeRe(name)}(?![A-Za-z0-9])`, "i").test(hay);
  });
  return hits
    .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((t) => t.name.trim());
}
