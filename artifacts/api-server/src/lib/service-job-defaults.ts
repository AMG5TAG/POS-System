/**
 * Warranty windows (days) given to new service jobs and reworks.
 *
 * These were per-merchant settings under Management › Service Options. That
 * page was removed for the single-business install, and every job now gets the
 * values the business was already using — 14 days either way.
 */
export const SERVICE_WARRANTY_DEFAULTS = {
  repairWarrantyDays: 14,
  reworkWarrantyDays: 14,
} as const;
