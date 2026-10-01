/**
 * Pre-order products on the POS side — the same rule as the API's
 * lib/pre-orders.ts: on pre-order while the switch is on and the release date
 * (the merchant's local date) hasn't arrived.
 */

type PreOrderFields = { preOrder?: boolean | string | null; preOrderReleaseDate?: string | null };

/** Today as YYYY-MM-DD in the browser's local time (the till's own day). */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isPreOrderActive(p: PreOrderFields | null | undefined, today = localToday()): boolean {
  if (!p) return false;
  const on = p.preOrder === true || p.preOrder === "true";
  const release = p.preOrderReleaseDate?.trim();
  return on && (!release || release > today);
}

/** "12 Nov 2026" for a YYYY-MM-DD, or "" */
export function formatPreOrderDate(d: string | null | undefined): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** Cart ids for deposit lines: negative and unique per product, so they never
 *  collide with a real product or the id 0 every one-off item shares. */
export const depositLineId = (productId: number) => -1_000_000 - productId;
