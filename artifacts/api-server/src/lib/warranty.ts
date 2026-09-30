/* Warranty windows, shared by the staff Warranty page (routes/warranties.ts)
   and the online shop's account area (routes/shop.ts). */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Expiry = sale date + duration (months/years). Mirrors the frontend warranty helper. */
export function productWarrantyExpiry(saleDate: Date | string, duration: number, unit: string): Date | null {
  if (!duration || duration <= 0) return null;
  const start = new Date(saleDate);
  if (isNaN(start.getTime())) return null;
  const months = unit === "years" ? duration * 12 : duration;
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  return end;
}

export function productWarrantyLabel(duration: number, unit: string): string {
  if (!duration || duration <= 0) return "";
  const u = unit === "years" ? "year" : "month";
  return `${duration} ${u}${duration === 1 ? "" : "s"} warranty`;
}

/** Repair warranty: completion date + the job's repair-warranty days. */
export function repairWarrantyExpiry(completedAt: Date | string, days: number): Date | null {
  if (!days || days <= 0) return null;
  const start = new Date(completedAt);
  if (isNaN(start.getTime())) return null;
  return new Date(start.getTime() + days * DAY_MS);
}
