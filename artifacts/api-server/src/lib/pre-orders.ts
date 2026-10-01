/**
 * Pre-order rules, kept away from `db` so pre-orders.test.ts can pin them.
 *
 * A product is a pre-order product while its `preOrder` switch is on and its
 * release date (the merchant's local date) hasn't arrived; from the release
 * date it sells as a normal product with no one having to switch it off.
 *
 * Selling one at the till opens a pre-order (product_pre_orders) for the
 * customer — paid in full (an ordinary product line, stock going below zero
 * like any oversell) or by deposit (a "Pre-order deposit" line that moves no
 * stock; the balance is taken when the customer collects). Purchase-order
 * receiving then allocates the arriving units to open pre-orders, oldest
 * first, and those that are complete become "Arrived".
 */

export const PRE_ORDER_STATUS = {
  awaiting: "Awaiting stock",
  arrived: "Arrived",
  collected: "Collected",
  shipped: "Shipped",
  cancelled: "Cancelled",
} as const;

/** Still waiting for stock. Pending/Confirmed are the older manual statuses. */
export const AWAITING_STATUSES = ["Awaiting stock", "Pending", "Confirmed"] as const;

/** Waiting for stock or for the customer — i.e. not finished. */
export const OPEN_STATUSES = [...AWAITING_STATUSES, "Arrived", "Ready"] as const;

export function isAwaiting(status: string): boolean {
  return (AWAITING_STATUSES as readonly string[]).includes(status);
}

/** Today's date in a timezone, as YYYY-MM-DD (the form release dates are saved in). */
export function localDate(timezone: string | null | undefined, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

type PreOrderProduct = { preOrder: string | boolean | null | undefined; preOrderReleaseDate: string | null | undefined };

/** Whether a product sells as a pre-order today. No release date = until switched off. */
export function isPreOrderActive(p: PreOrderProduct, today: string): boolean {
  const on = p.preOrder === true || p.preOrder === "true";
  if (!on) return false;
  const release = p.preOrderReleaseDate?.trim();
  return !release || release > today;
}

export type OpenPreOrder = { id: number; quantity: number; allocatedQuantity: number };
export type Allocation = { id: number; add: number; allocatedQuantity: number; complete: boolean };

/**
 * Share `received` units among open pre-orders, oldest first (the caller
 * passes them in that order). Each gets what it still needs until the units
 * run out; one that is now fully covered is `complete`.
 */
export function allocateReceived(openOldestFirst: OpenPreOrder[], received: number): Allocation[] {
  let left = Math.max(0, Math.floor(received));
  const out: Allocation[] = [];
  for (const p of openOldestFirst) {
    if (left <= 0) break;
    const need = Math.max(0, p.quantity - p.allocatedQuantity);
    if (need === 0) continue;
    const add = Math.min(need, left);
    left -= add;
    out.push({ id: p.id, add, allocatedQuantity: p.allocatedQuantity + add, complete: p.allocatedQuantity + add >= p.quantity });
  }
  return out;
}

/** What is still owed on a pre-order. Never negative. */
export function balanceOwing(totalAmount: number, paid: number): number {
  return Math.max(0, Math.round((totalAmount - paid) * 100) / 100);
}

export const preOrderNumber = (id: number) => `PRE-${String(id).padStart(4, "0")}`;

/** The till line that carries a deposit instead of the product itself. */
export type DepositLink = { productId: number; quantity: number };
