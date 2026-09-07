import { Router, type IRouter } from "express";
import { db, paymentMethodSurchargesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Payment methods that may carry a surcharge. Mirrors ALL_PAYMENT_METHODS on the
// client; "split" is excluded because its cost is attributed to the underlying
// tendered methods, not the split itself.
const SURCHARGEABLE_METHODS = new Set([
  "cash", "eftpos", "card", "direct_deposit", "voucher", "store_credit", "laybuy", "loyalty",
]);

type Row = typeof paymentMethodSurchargesTable.$inferSelect;

function fmt(r: Row) {
  return {
    paymentMethod: r.paymentMethod,
    percent: parseFloat(r.percent),
    fixed: parseFloat(r.fixed),
    passOn: r.passOn === "true",
    enabled: r.enabled === "true",
  };
}

// GET /payment-surcharges — all configured surcharge rows for the merchant.
// Methods without a row simply aren't returned; the client fills defaults.
router.get("/payment-surcharges", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select()
    .from(paymentMethodSurchargesTable)
    .where(eq(paymentMethodSurchargesTable.merchantId, merchantId));
  res.json({ items: rows.map(fmt) });
});

// PUT /payment-surcharges — bulk upsert. Body: { items: [{ paymentMethod, percent, fixed, passOn, enabled }] }
router.put("/payment-surcharges", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  for (const it of items) {
    const paymentMethod = String(it?.paymentMethod ?? "");
    if (!SURCHARGEABLE_METHODS.has(paymentMethod)) continue;

    const percent = Math.max(0, Math.min(100, Number(it?.percent) || 0));
    const fixed = Math.max(0, Number(it?.fixed) || 0);
    const passOn = it?.passOn === true || it?.passOn === "true" ? "true" : "false";
    const enabled = it?.enabled === true || it?.enabled === "true" ? "true" : "false";

    const values = {
      merchantId,
      paymentMethod,
      percent: String(percent),
      fixed: String(fixed),
      passOn,
      enabled,
    };

    const [existing] = await db
      .select()
      .from(paymentMethodSurchargesTable)
      .where(and(
        eq(paymentMethodSurchargesTable.merchantId, merchantId),
        eq(paymentMethodSurchargesTable.paymentMethod, paymentMethod),
      ))
      .limit(1);

    if (existing) {
      await db
        .update(paymentMethodSurchargesTable)
        .set({ percent: values.percent, fixed: values.fixed, passOn, enabled })
        .where(eq(paymentMethodSurchargesTable.id, existing.id));
    } else {
      await db.insert(paymentMethodSurchargesTable).values(values);
    }
  }

  const rows = await db
    .select()
    .from(paymentMethodSurchargesTable)
    .where(eq(paymentMethodSurchargesTable.merchantId, merchantId));
  res.json({ items: rows.map(fmt) });
});

export default router;
