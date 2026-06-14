import { Router, type IRouter } from "express";
import { db, tradeInsTable, customersTable, productsTable, storeCreditLedgerTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { customerDisplayName } from "../lib/customer-name";

const router: IRouter = Router();

type Row = typeof tradeInsTable.$inferSelect;
const GRADES = new Set(["A", "B", "C", "D"]);

function fmt(row: Row, customerName?: string | null) {
  return {
    id: row.id,
    customerId: row.customerId ?? null,
    customerName: customerName ?? null,
    deviceName: row.deviceName,
    identifier: row.identifier ?? null,
    conditionGrade: row.conditionGrade,
    notes: row.notes ?? null,
    valuationAmount: parseFloat(row.valuationAmount),
    status: row.status,
    payoutMethod: row.payoutMethod ?? null,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    createdProductId: row.createdProductId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function listAll(merchantId: number) {
  const rows = await db.select().from(tradeInsTable)
    .where(eq(tradeInsTable.merchantId, merchantId))
    .orderBy(desc(tradeInsTable.createdAt));
  const ids = [...new Set(rows.map((r) => r.customerId).filter((v): v is number => v != null))];
  const map = new Map<number, string | null>();
  if (ids.length) {
    const cs = await db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId));
    for (const c of cs) map.set(c.id, customerDisplayName(c.firstName, c.lastName, c.company));
  }
  return rows.map((r) => fmt(r, r.customerId ? map.get(r.customerId) : null));
}

async function one(merchantId: number, id: number): Promise<Row | null> {
  const [r] = await db.select().from(tradeInsTable)
    .where(and(eq(tradeInsTable.id, id), eq(tradeInsTable.merchantId, merchantId))).limit(1);
  return r ?? null;
}

// GET /trade-ins
router.get("/trade-ins", requireAuth, async (req, res): Promise<void> => {
  res.json({ items: await listAll(req.session.merchantId!) });
});

// POST /trade-ins — record a trade-in quote.
router.post("/trade-ins", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const deviceName = typeof b.deviceName === "string" ? b.deviceName.trim() : "";
  if (!deviceName) { res.status(400).json({ error: "Device name is required" }); return; }
  await db.insert(tradeInsTable).values({
    merchantId,
    customerId: b.customerId != null ? Number(b.customerId) : null,
    staffId: req.session.staffId ?? null,
    deviceName,
    identifier: typeof b.identifier === "string" && b.identifier.trim() ? b.identifier.trim() : null,
    conditionGrade: typeof b.conditionGrade === "string" && GRADES.has(b.conditionGrade) ? b.conditionGrade : "B",
    notes: typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
    valuationAmount: String(Number(b.valuationAmount) || 0),
  });
  res.status(201).json({ items: await listAll(merchantId) });
});

// POST /trade-ins/:id/accept — pay the customer (cash or store credit).
router.post("/trade-ins/:id/accept", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  const row = await one(merchantId, id);
  if (!row) { res.status(404).json({ error: "Trade-in not found" }); return; }
  if (row.status !== "quoted") { res.status(409).json({ error: "Trade-in already actioned" }); return; }
  const payoutMethod = String((req.body ?? {}).payoutMethod ?? "");
  if (payoutMethod !== "cash" && payoutMethod !== "store_credit") { res.status(400).json({ error: "Invalid payout method" }); return; }

  const amount = parseFloat(row.valuationAmount);
  if (payoutMethod === "store_credit") {
    if (!row.customerId) { res.status(400).json({ error: "A customer is required for store-credit payout" }); return; }
    const [bal] = await db.select({ b: sql<string>`COALESCE(SUM(${storeCreditLedgerTable.amount}),0)` })
      .from(storeCreditLedgerTable).where(eq(storeCreditLedgerTable.customerId, row.customerId));
    const balanceAfter = Math.round((parseFloat(bal?.b ?? "0") + amount) * 100) / 100;
    await db.insert(storeCreditLedgerTable).values({
      merchantId, customerId: row.customerId, type: "issue",
      amount: String(amount), balanceAfter: String(balanceAfter),
      note: `Trade-in: ${row.deviceName}`, staffId: req.session.staffId ?? null,
    });
  }

  await db.update(tradeInsTable)
    .set({ status: "accepted", payoutMethod, acceptedAt: new Date() })
    .where(eq(tradeInsTable.id, id));
  res.json({ items: await listAll(merchantId) });
});

// POST /trade-ins/:id/list-as-stock — create a refurbished product from the trade-in.
router.post("/trade-ins/:id/list-as-stock", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  const row = await one(merchantId, id);
  if (!row) { res.status(404).json({ error: "Trade-in not found" }); return; }
  if (row.createdProductId) { res.status(409).json({ error: "Already listed as stock" }); return; }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const price = Number(b.price);
  if (!Number.isFinite(price) || price <= 0) { res.status(400).json({ error: "A sell price is required" }); return; }

  const [product] = await db.insert(productsTable).values({
    merchantId,
    name: `${row.deviceName} (Refurbished — Grade ${row.conditionGrade})`,
    price: String(price),
    costPrice: row.valuationAmount,
    sku: typeof b.sku === "string" && b.sku.trim() ? b.sku.trim() : null,
    trackInventory: "true",
    stockQuantity: 1,
    isRefurbished: "true",
    description: row.identifier ? `Trade-in unit · ${row.identifier}` : "Trade-in unit",
  }).returning();

  await db.update(tradeInsTable).set({ status: "listed", createdProductId: product.id }).where(eq(tradeInsTable.id, id));
  res.json({ items: await listAll(merchantId), productId: product.id });
});

// DELETE /trade-ins/:id
router.delete("/trade-ins/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  await db.delete(tradeInsTable).where(and(eq(tradeInsTable.id, id), eq(tradeInsTable.merchantId, merchantId)));
  res.json({ items: await listAll(merchantId) });
});

export default router;
