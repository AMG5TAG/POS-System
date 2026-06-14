import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/* GST helpers — laybys store no tax breakdown, so for ex-GST/GST-collected
 * figures we treat a layby total as GST-inclusive and back the GST out using
 * the merchant's configured default tax rate (the same rate the POS/invoice
 * UIs default to). Keeps layby figures consistent with POS + invoice sales. */

/** Merchant's default GST rate as a percentage (e.g. 10 for 10% GST).
 *  Falls back to 10 when unset or unparseable. */
export async function getDefaultTaxRate(merchantId: number): Promise<number> {
  const r = await db.execute<{ rate: string | null }>(
    sql`SELECT default_tax_rate AS rate FROM regional_ext_settings WHERE merchant_id = ${merchantId} LIMIT 1`,
  );
  const v = parseFloat(r.rows[0]?.rate ?? "10");
  return Number.isFinite(v) && v >= 0 ? v : 10;
}

/** Split a GST-inclusive total into its ex-GST and GST components at `ratePct`. */
export function splitGstInclusive(total: number, ratePct: number): { exGst: number; gst: number } {
  const exGst = total / (1 + ratePct / 100);
  return { exGst, gst: total - exGst };
}
