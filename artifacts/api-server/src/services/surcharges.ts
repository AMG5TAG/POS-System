import { db, paymentMethodSurchargesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PassOnSurchargeMap = Map<string, { percent: number; fixed: number }>;

/**
 * Loads the merchant's pass-on surcharge config as a `paymentMethod → {percent,
 * fixed}` map, including only rows that are enabled AND set to pass the cost on
 * to the customer. Surcharge config is merchant-global, so this can be read once
 * (outside any per-sale db.transaction) and reused for every payment leg.
 */
export async function getPassOnSurchargeMap(merchantId: number): Promise<PassOnSurchargeMap> {
  const rows = await db
    .select()
    .from(paymentMethodSurchargesTable)
    .where(eq(paymentMethodSurchargesTable.merchantId, merchantId));
  const map: PassOnSurchargeMap = new Map();
  for (const r of rows) {
    if (r.enabled === "true" && r.passOn === "true") {
      map.set(r.paymentMethod, { percent: parseFloat(r.percent), fixed: parseFloat(r.fixed) });
    }
  }
  return map;
}

/**
 * The customer-facing surcharge for a single payment leg: percent of the amount
 * paid on that leg + the fixed per-transaction fee. Returns 0 when the method
 * has no pass-on surcharge. Collected on top of the amount — it does not reduce
 * the balance owed.
 */
export function surchargeForLeg(map: PassOnSurchargeMap, method: string | undefined, amount: number): number {
  if (!method) return 0;
  const cfg = map.get(method);
  if (!cfg) return 0;
  return round2((cfg.percent / 100) * amount + cfg.fixed);
}
