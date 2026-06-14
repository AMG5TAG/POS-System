import { Router, type IRouter } from "express";
import { db, serviceJobLinesTable, serviceJobsTable, productsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { maybeQueueImmediateAlert } from "../services/lowStockAlertService";

const router: IRouter = Router();

type Row = typeof serviceJobLinesTable.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const KINDS = new Set(["part", "labour", "misc"]);

/** Whole-unit count of stock a part line consumes (0 for labour/misc). */
function consumedUnits(kind: string, quantity: number): number {
  return kind === "part" ? Math.max(0, Math.round(quantity)) : 0;
}

type StockAlert = {
  id: number; name: string; sku: string | null;
  stockQuantity: number; previousStockQuantity: number;
  lowStockThreshold: number | null; trackInventory: string;
};

/**
 * Apply a stock movement to a part's linked product, mirroring the POS decrement
 * pattern (productsTable.stockQuantity is the source of truth). `deltaUnits` is
 * the change to stock on hand: negative when a part is consumed onto a job,
 * positive when it's returned (line removed or quantity reduced). No-op for
 * untracked products. Returns an alert payload only when stock fell, so the
 * caller can fire a low-stock alert after the transaction commits.
 */
async function applyStockDelta(
  tx: Tx, merchantId: number, productId: number, deltaUnits: number,
): Promise<StockAlert | null> {
  if (!Number.isFinite(productId) || deltaUnits === 0) return null;
  const [p] = await tx.select().from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId))).limit(1);
  if (!p || p.trackInventory !== "true") return null;
  const prev = p.stockQuantity;
  const newQty = Math.max(0, prev + deltaUnits);
  if (newQty === prev) return null;
  await tx.update(productsTable).set({ stockQuantity: newQty }).where(eq(productsTable.id, productId));
  if (deltaUnits >= 0) return null; // alerts only matter when stock decreases
  return {
    id: p.id, name: p.name, sku: p.sku ?? null,
    stockQuantity: newQty, previousStockQuantity: prev,
    lowStockThreshold: p.lowStockThreshold ?? null, trackInventory: p.trackInventory,
  };
}

/** Fire-and-forget low-stock alert; never blocks the response. */
function queueAlert(merchantId: number, alert: StockAlert | null): void {
  if (!alert) return;
  maybeQueueImmediateAlert(merchantId, alert, alert.previousStockQuantity).catch(() => { /* non-blocking */ });
}

function fmt(row: Row) {
  return {
    id: row.id,
    serviceJobId: row.serviceJobId,
    kind: row.kind,
    productId: row.productId ?? null,
    description: row.description,
    quantity: parseFloat(row.quantity),
    unitPrice: parseFloat(row.unitPrice),
    unitCost: parseFloat(row.unitCost),
    taxRate: parseFloat(row.taxRate),
    lineTotal: Math.round(parseFloat(row.quantity) * parseFloat(row.unitPrice) * 100) / 100,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Derive job financial rollups from its line items (tax-inclusive pricing). */
function computeTotals(rows: Row[]) {
  let partsTotal = 0, labourTotal = 0, miscTotal = 0, costTotal = 0, taxTotal = 0;
  for (const r of rows) {
    const qty = parseFloat(r.quantity);
    const price = parseFloat(r.unitPrice);
    const cost = parseFloat(r.unitCost);
    const rate = parseFloat(r.taxRate);
    const line = qty * price;
    if (r.kind === "labour") labourTotal += line;
    else if (r.kind === "misc") miscTotal += line;
    else partsTotal += line;
    costTotal += qty * cost;
    // GST-inclusive: tax portion = line * rate/(100+rate)
    taxTotal += rate > 0 ? line * (rate / (100 + rate)) : 0;
  }
  const total = partsTotal + labourTotal + miscTotal;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    partsTotal: round(partsTotal),
    labourTotal: round(labourTotal),
    miscTotal: round(miscTotal),
    subtotal: round(total - taxTotal),
    taxTotal: round(taxTotal),
    total: round(total),
    costTotal: round(costTotal),
    profit: round(total - taxTotal - costTotal),
  };
}

/** Confirm the job exists and belongs to the caller's merchant. */
async function ownJob(merchantId: number, jobId: number): Promise<boolean> {
  if (!Number.isFinite(jobId)) return false;
  const [job] = await db.select({ id: serviceJobsTable.id }).from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, jobId), eq(serviceJobsTable.merchantId, merchantId))).limit(1);
  return !!job;
}

async function listAndTotals(jobId: number) {
  const rows = await db.select().from(serviceJobLinesTable)
    .where(eq(serviceJobLinesTable.serviceJobId, jobId))
    .orderBy(asc(serviceJobLinesTable.id));
  return { lines: rows.map(fmt), totals: computeTotals(rows) };
}

// GET /service-jobs/:jobId/lines — line items + derived totals for a job.
router.get("/service-jobs/:jobId/lines", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobId = Number(req.params.jobId);
  if (!(await ownJob(merchantId, jobId))) { res.status(404).json({ error: "Service job not found" }); return; }
  res.json(await listAndTotals(jobId));
});

// POST /service-jobs/:jobId/lines — add a part/labour/misc line.
router.post("/service-jobs/:jobId/lines", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobId = Number(req.params.jobId);
  if (!(await ownJob(merchantId, jobId))) { res.status(404).json({ error: "Service job not found" }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const kind = typeof b.kind === "string" && KINDS.has(b.kind) ? b.kind : "part";
  let description = typeof b.description === "string" ? b.description : "";
  let unitPrice = b.unitPrice != null ? Number(b.unitPrice) : 0;
  let unitCost = b.unitCost != null ? Number(b.unitCost) : 0;
  const quantity = b.quantity != null ? Number(b.quantity) : 1;
  const taxRate = b.taxRate != null ? Number(b.taxRate) : 10;
  let productId: number | null = b.productId != null ? Number(b.productId) : null;

  // For a part linked to inventory, default price/cost/description from the product.
  if (productId != null && Number.isFinite(productId)) {
    const [p] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId))).limit(1);
    if (!p) { productId = null; }
    else {
      if (!description) description = p.name;
      if (b.unitPrice == null) unitPrice = p.price != null ? parseFloat(p.price as unknown as string) : 0;
      if (b.unitCost == null) unitCost = p.costPrice != null ? parseFloat(p.costPrice as unknown as string) : 0;
    }
  }

  if (!description.trim() && kind !== "part") {
    res.status(400).json({ error: "Description is required" }); return;
  }

  const qty = Number.isFinite(quantity) ? quantity : 1;
  // Insert the line and consume stock for a tracked part in one atomic step so
  // inventory never drifts from what's been committed to the job.
  let alert: StockAlert | null = null;
  await db.transaction(async (tx) => {
    await tx.insert(serviceJobLinesTable).values({
      merchantId,
      serviceJobId: jobId,
      kind,
      productId,
      description,
      quantity: String(qty),
      unitPrice: String(Number.isFinite(unitPrice) ? unitPrice : 0),
      unitCost: String(Number.isFinite(unitCost) ? unitCost : 0),
      taxRate: String(Number.isFinite(taxRate) ? taxRate : 10),
    });
    if (productId != null) {
      alert = await applyStockDelta(tx, merchantId, productId, -consumedUnits(kind, qty));
    }
  });
  queueAlert(merchantId, alert);
  res.json(await listAndTotals(jobId));
});

// PUT /service-jobs/:jobId/lines/:lineId — edit a line.
router.put("/service-jobs/:jobId/lines/:lineId", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobId = Number(req.params.jobId);
  const lineId = Number(req.params.lineId);
  if (!(await ownJob(merchantId, jobId))) { res.status(404).json({ error: "Service job not found" }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<typeof serviceJobLinesTable.$inferInsert> = {};
  if (typeof b.kind === "string" && KINDS.has(b.kind)) patch.kind = b.kind;
  if (typeof b.description === "string") patch.description = b.description;
  if (b.quantity != null && Number.isFinite(Number(b.quantity))) patch.quantity = String(Number(b.quantity));
  if (b.unitPrice != null && Number.isFinite(Number(b.unitPrice))) patch.unitPrice = String(Number(b.unitPrice));
  if (b.unitCost != null && Number.isFinite(Number(b.unitCost))) patch.unitCost = String(Number(b.unitCost));
  if (b.taxRate != null && Number.isFinite(Number(b.taxRate))) patch.taxRate = String(Number(b.taxRate));

  let notFound = false;
  let alert: StockAlert | null = null;
  await db.transaction(async (tx) => {
    const [old] = await tx.select().from(serviceJobLinesTable)
      .where(and(
        eq(serviceJobLinesTable.id, lineId),
        eq(serviceJobLinesTable.serviceJobId, jobId),
        eq(serviceJobLinesTable.merchantId, merchantId),
      )).limit(1);
    if (!old) { notFound = true; return; }

    await tx.update(serviceJobLinesTable).set(patch)
      .where(eq(serviceJobLinesTable.id, old.id));

    // Reconcile stock: a part edit (quantity or kind) changes how many units the
    // line consumes. Restore the old consumption and apply the new; productId is
    // immutable here, so the product never changes.
    if (old.productId != null) {
      const oldUnits = consumedUnits(old.kind, parseFloat(old.quantity));
      const newKind = patch.kind ?? old.kind;
      const newQty = patch.quantity != null ? parseFloat(patch.quantity) : parseFloat(old.quantity);
      const newUnits = consumedUnits(newKind, newQty);
      alert = await applyStockDelta(tx, merchantId, old.productId, oldUnits - newUnits);
    }
  });
  if (notFound) { res.status(404).json({ error: "Line not found" }); return; }
  queueAlert(merchantId, alert);
  res.json(await listAndTotals(jobId));
});

// DELETE /service-jobs/:jobId/lines/:lineId — remove a line.
router.delete("/service-jobs/:jobId/lines/:lineId", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const jobId = Number(req.params.jobId);
  const lineId = Number(req.params.lineId);
  if (!(await ownJob(merchantId, jobId))) { res.status(404).json({ error: "Service job not found" }); return; }

  await db.transaction(async (tx) => {
    const [old] = await tx.select().from(serviceJobLinesTable)
      .where(and(
        eq(serviceJobLinesTable.id, lineId),
        eq(serviceJobLinesTable.serviceJobId, jobId),
        eq(serviceJobLinesTable.merchantId, merchantId),
      )).limit(1);
    if (!old) return;
    await tx.delete(serviceJobLinesTable).where(eq(serviceJobLinesTable.id, old.id));
    // Removing a part returns its consumed units to stock (positive delta → no alert).
    if (old.productId != null) {
      await applyStockDelta(tx, merchantId, old.productId, consumedUnits(old.kind, parseFloat(old.quantity)));
    }
  });
  res.json(await listAndTotals(jobId));
});

export default router;
