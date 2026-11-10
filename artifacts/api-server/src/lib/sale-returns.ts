/**
 * Returns and swaps against a completed sale — the money rules, with no `db`
 * in sight (routes/transactions.ts applies them). Pinned by
 * `sale-returns.test.ts`.
 *
 * A return is its own completed transaction, linked to the sale by
 * `transactions.return_of_transaction_id`:
 *  - each returned item is a NEGATIVE line (`quantity` < 0, `totalPrice` < 0)
 *    carrying `returnOfLine` (its index in the original sale's items) and the
 *    original `costPrice`, so revenue, GST, COGS and product performance net
 *    off in the report views with no special case;
 *  - each swap item is an ordinary positive line;
 *  - `total` is the net: negative when money goes back to the customer.
 *
 * A line refunds what was actually paid for it (its `totalPrice`, after line
 * discounts — every discount in this app is a line discount), pro rata per
 * unit; the return that takes a line's last unit refunds whatever of the line
 * is left, so the parts always sum to exactly what was paid.
 */

export interface SaleLine {
  productId?: number;
  productName?: string;
  quantity: number;
  unitPrice?: number;
  totalPrice: number;
  taxAmount?: number;
  costPrice?: number;
  giftCardIssue?: boolean;
  preOrderDeposit?: unknown;
  digitalCodes?: string[];
  serials?: string[];
  returnOfLine?: number;
  restocked?: boolean;
}

export interface ReturnableLine {
  index: number;
  productId: number;
  productName: string;
  quantity: number;
  returned: number;
  remaining: number;
  /** Refund for one unit (the last unit may differ by a cent — see header). */
  unitRefund: number;
  /** Why this line can't be returned here, or null when it can. */
  blockedReason: string | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Lines that can't come back through a return: they need the full refund (or nothing). */
export function nonReturnableReason(line: SaleLine): string | null {
  if (line.giftCardIssue) return "Gift cards are refunded with the whole sale";
  if (line.preOrderDeposit) return "Pre-order deposits are refunded from Pre-Orders";
  if (line.digitalCodes?.length) return "Digital codes can't be returned";
  if (!line.productId || line.productId <= 0) return "Custom items can't be returned here";
  if (!(line.quantity > 0)) return "Not a sold item";
  return null;
}

/** Per original line: what has been returned already (across earlier returns) and what's left. */
function returnedSoFar(index: number, priorReturns: SaleLine[][]): { qty: number; refunded: number; tax: number } {
  let qty = 0, refunded = 0, tax = 0;
  for (const items of priorReturns) {
    for (const l of items) {
      if (l.returnOfLine !== index || !(l.quantity < 0)) continue;
      qty += -l.quantity;
      refunded += -(l.totalPrice ?? 0);
      tax += -(l.taxAmount ?? 0);
    }
  }
  return { qty, refunded: round2(refunded), tax: round2(tax) };
}

export function returnableLines(original: SaleLine[], priorReturns: SaleLine[][]): ReturnableLine[] {
  return original.map((line, index) => {
    const done = returnedSoFar(index, priorReturns);
    const remaining = Math.max(0, line.quantity - done.qty);
    return {
      index,
      productId: line.productId ?? 0,
      productName: line.productName ?? "Item",
      quantity: line.quantity,
      returned: done.qty,
      remaining,
      unitRefund: line.quantity > 0 ? round2(line.totalPrice / line.quantity) : 0,
      blockedReason: nonReturnableReason(line) ?? (remaining === 0 ? "Already returned" : null),
    };
  });
}

/**
 * The negative line for returning `qty` of original line `index`. Throws a
 * message (shown to staff) when the line can't take that many back.
 */
export function buildReturnLine(original: SaleLine[], priorReturns: SaleLine[][], index: number, qty: number, restock: boolean): SaleLine {
  const line = original[index];
  if (!line) throw new Error(`Line ${index + 1} isn't on this sale`);
  const blocked = nonReturnableReason(line);
  if (blocked) throw new Error(`${line.productName ?? "That item"}: ${blocked}`);
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Return quantities must be whole numbers above zero");
  const done = returnedSoFar(index, priorReturns);
  const remaining = line.quantity - done.qty;
  if (qty > remaining) throw new Error(`${line.productName ?? "That item"}: only ${remaining} left to return`);

  // The last unit(s) take whatever of the line is left, so a line refunds
  // exactly what was paid for it however it's split across returns.
  const last = qty === remaining;
  const refund = last ? round2(line.totalPrice - done.refunded) : round2((line.totalPrice * qty) / line.quantity);
  const lineTax = line.taxAmount ?? 0;
  const tax = last ? round2(lineTax - done.tax) : round2((lineTax * qty) / line.quantity);
  return {
    productId: line.productId,
    productName: line.productName,
    quantity: -qty,
    unitPrice: line.unitPrice ?? round2(line.totalPrice / line.quantity),
    totalPrice: -refund,
    taxAmount: -tax,
    ...(line.costPrice != null ? { costPrice: line.costPrice } : {}),
    returnOfLine: index,
    restocked: restock,
  };
}

/**
 * Loyalty to take back for a refund: the share of what the sale earned that
 * the refunded amount bears to the sale total. Points programmes earn whole
 * points, so they round to whole points.
 */
export function loyaltyToTakeBack(earned: number, refund: number, saleTotal: number): number {
  if (!(earned > 0) || !(refund > 0) || !(saleTotal > 0)) return 0;
  const share = Math.min(earned, (earned * refund) / saleTotal);
  return Number.isInteger(earned) ? Math.round(share) : round2(share);
}

/** Tenders a return can settle with. Gift cards, loyalty and splits are not offered. */
export const RETURN_METHODS_BLOCKED = new Set(["loyalty", "gift_card", "split", "exchange"]);

export function returnMethodError(method: string): string | null {
  const m = method.trim();
  if (!m) return "Choose how the difference is settled";
  if (RETURN_METHODS_BLOCKED.has(m)) return `A return can't be settled by ${m.replace("_", " ")}`;
  if (!/^[a-z0-9_ -]{1,40}$/i.test(m)) return "Unknown payment method";
  return null;
}

/** What the original payment method suggests for paying a refund back. */
export function defaultRefundMethod(originalMethod: string): string {
  return RETURN_METHODS_BLOCKED.has(originalMethod) ? "store_credit" : originalMethod;
}
