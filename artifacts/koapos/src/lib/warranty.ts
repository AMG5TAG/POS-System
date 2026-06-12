/**
 * Product warranty helpers. Warranty is stored on a product as a duration
 * (number) + unit ("months" | "years") and runs from the date of sale.
 *
 * Warranty is computed at read/print time from the product's current setting
 * (sold line items carry productId), so the POS sale path is never touched.
 */

export type WarrantyUnit = "months" | "years";

/** Human label for a receipt/invoice, e.g. "2 years warranty". Empty when none. */
export function warrantyLabel(duration?: number | null, unit?: string | null): string {
  if (!duration || duration <= 0) return "";
  const u = unit === "years" ? "year" : "month";
  return `${duration} ${u}${duration === 1 ? "" : "s"} warranty`;
}

/** Expiry date = sale date + duration. Returns null when there's no warranty. */
export function warrantyExpiry(saleDate: string | Date, duration?: number | null, unit?: string | null): Date | null {
  if (!duration || duration <= 0) return null;
  const start = new Date(saleDate);
  if (isNaN(start.getTime())) return null;
  const months = unit === "years" ? duration * 12 : duration;
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  return end;
}

/** True when the warranty period has not yet elapsed. */
export function isUnderWarranty(
  saleDate: string | Date,
  duration?: number | null,
  unit?: string | null,
  now: Date = new Date(),
): boolean {
  const end = warrantyExpiry(saleDate, duration, unit);
  return !!end && end.getTime() >= now.getTime();
}
