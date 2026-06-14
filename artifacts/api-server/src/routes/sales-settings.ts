import { Router, type IRouter } from "express";
import { db, salesSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type Row = typeof salesSettingsTable.$inferSelect;

// numeric(…) columns come back as strings from pg; the API contract returns numbers.
const NUMERIC_FIELDS = ["invoiceDefaultTaxRate", "refundRestockingFeePct", "quoteDefaultTaxRate", "quoteDepositPercent"] as const;

function fmt(row: Row) {
  const out: Record<string, unknown> = {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  for (const f of NUMERIC_FIELDS) out[f] = parseFloat(row[f] as unknown as string);
  return out;
}

// Coerce incoming numeric fields back to strings for the numeric() columns.
function normalizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const b = { ...body };
  delete b.id; delete b.merchantId; delete b.createdAt; delete b.updatedAt;
  for (const f of NUMERIC_FIELDS) if (b[f] != null) b[f] = String(b[f]);
  return b;
}

// GET /sales-settings — returns the merchant's row, creating defaults if absent.
router.get("/sales-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(salesSettingsTable).where(eq(salesSettingsTable.merchantId, merchantId)).limit(1);
  if (row) { res.json(fmt(row)); return; }
  const [created] = await db.insert(salesSettingsTable).values({ merchantId }).returning();
  res.json(fmt(created));
});

// PUT /sales-settings — upsert; only provided fields are applied.
router.put("/sales-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = normalizeBody((req.body ?? {}) as Record<string, unknown>);
  const [existing] = await db.select().from(salesSettingsTable).where(eq(salesSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(salesSettingsTable).set(body).where(eq(salesSettingsTable.merchantId, merchantId)).returning();
    res.json(fmt(updated)); return;
  }
  const [created] = await db.insert(salesSettingsTable).values({ merchantId, ...body }).returning();
  res.json(fmt(created));
});

export default router;
