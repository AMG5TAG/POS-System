/* Importing a quote into the till.
 *
 * A quote's discount is part of the price the customer agreed to, so importing
 * its lines alone rings the sale up for more than was quoted. The discount is
 * spread back over the imported lines rather than set as the cart's overall
 * discount, for three reasons: the cart may already hold items that were never
 * on the quote, a line discount is what survives parking and retrieval, and it
 * is what the server already honours per line when the sale is recorded. */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Spread a quote's dollar discount across its lines in proportion to what each
 * line is worth, returning one dollar discount per line.
 *
 * The last line absorbs the rounding remainder so the parts sum to the whole —
 * the same trick the checkout payload uses when it distributes a cart-level
 * discount, and for the same reason: a cent adrift is a cent the till and the
 * quote disagree about. Each share is still clamped to its own line, because a
 * line discount larger than the line is rejected outright when the sale is
 * recorded.
 */
export function distributeQuoteDiscount(lineGross: number[], discountTotal: number): number[] {
  const gross = lineGross.reduce((s, g) => s + Math.max(0, g), 0);
  const total = Math.min(Math.max(discountTotal, 0), gross);
  if (total <= 0 || gross <= 0) return lineGross.map(() => 0);

  const out: number[] = [];
  let allocated = 0;
  for (let idx = 0; idx < lineGross.length; idx++) {
    const g = Math.max(0, lineGross[idx]);
    const share = idx === lineGross.length - 1
      ? round2(total - allocated)
      : round2(total * (g / gross));
    const clamped = Math.min(Math.max(share, 0), g);
    out.push(clamped);
    allocated = round2(allocated + clamped);
  }
  return out;
}
