import { Router, type IRouter } from "express";
import { db, stockTakesTable, stockTakeLinesTable, productsTable, categoriesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/* ── helpers ────────────────────────────────────────────────────────────── */

function formatLine(l: typeof stockTakeLinesTable.$inferSelect) {
  const variance = l.countedQty !== null ? l.countedQty - l.systemQty : null;
  return {
    id:           l.id,
    productId:    l.productId,
    productName:  l.productName,
    sku:          l.sku ?? null,
    categoryId:   l.categoryId ?? null,
    categoryName: l.categoryName ?? null,
    systemQty:    l.systemQty,
    countedQty:   l.countedQty ?? null,
    variance,
  };
}

function formatTake(
  t: typeof stockTakesTable.$inferSelect,
  lines: (typeof stockTakeLinesTable.$inferSelect)[]
) {
  const fmtLines = lines.map(formatLine);
  const counted  = fmtLines.filter(l => l.countedQty !== null).length;
  return {
    id:           t.id,
    merchantId:   t.merchantId,
    staffId:      t.staffId ?? null,
    status:       t.status,
    notes:        t.notes ?? null,
    startedAt:    t.startedAt.toISOString(),
    appliedAt:    t.appliedAt?.toISOString() ?? null,
    lines:        fmtLines,
    totalLines:   fmtLines.length,
    countedLines: counted,
  };
}

/* ── List ──────────────────────────────────────────────────────────────── */

router.get("/stock-takes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  const takes = await db
    .select()
    .from(stockTakesTable)
    .where(eq(stockTakesTable.merchantId, merchantId))
    .orderBy(stockTakesTable.startedAt);

  // Fetch all lines for all takes in one query
  const takeIds = takes.map(t => t.id);
  const allLines = takeIds.length
    ? await db
        .select()
        .from(stockTakeLinesTable)
        .where(inArray(stockTakeLinesTable.stockTakeId, takeIds))
        .orderBy(stockTakeLinesTable.productName)
    : [];

  const linesByTake = new Map<number, (typeof stockTakeLinesTable.$inferSelect)[]>();
  for (const l of allLines) {
    const arr = linesByTake.get(l.stockTakeId) ?? [];
    arr.push(l);
    linesByTake.set(l.stockTakeId, arr);
  }

  const items = takes.map(t => formatTake(t, linesByTake.get(t.id) ?? []));
  res.json({ items, total: items.length });
});

/* ── Create / Start ────────────────────────────────────────────────────── */

router.post("/stock-takes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const notes      = typeof req.body?.notes === "string" ? req.body.notes.trim() : null;
  const catFilter  = req.body?.categoryId ? Number(req.body.categoryId) : null;

  // Check no open take exists
  const [existing] = await db
    .select({ id: stockTakesTable.id })
    .from(stockTakesTable)
    .where(and(eq(stockTakesTable.merchantId, merchantId), eq(stockTakesTable.status, "open")));

  if (existing) {
    res.status(409).json({ error: "A stock take is already in progress. Submit or discard it first." });
    return;
  }

  // Snapshot tracked products (excluding service-type products)
  const productRows = await db
    .select({
      id:           productsTable.id,
      name:         productsTable.name,
      sku:          productsTable.sku,
      categoryId:   productsTable.categoryId,
      stockQuantity: productsTable.stockQuantity,
    })
    .from(productsTable)
    .where(and(
      eq(productsTable.merchantId, merchantId),
      eq(productsTable.trackInventory, "true"),
      eq(productsTable.isActive, "true"),
      catFilter ? eq(productsTable.categoryId, catFilter) : undefined,
    ))
    .orderBy(productsTable.name);

  if (productRows.length === 0) {
    res.status(400).json({ error: "No tracked products found to include in the stock take." });
    return;
  }

  // Build a category name lookup
  const catIds = [...new Set(productRows.flatMap(p => p.categoryId ? [p.categoryId] : []))];
  const catRows = catIds.length
    ? await db.select({ id: categoriesTable.id, name: categoriesTable.name })
        .from(categoriesTable)
        .where(inArray(categoriesTable.id, catIds))
    : [];
  const catMap = new Map(catRows.map(c => [c.id, c.name]));

  const [take] = await db
    .insert(stockTakesTable)
    .values({ merchantId, staffId: req.session.staffId ?? null, notes, status: "open" })
    .returning();

  const lineValues = productRows.map(p => ({
    stockTakeId:  take.id,
    merchantId,
    productId:    p.id,
    productName:  p.name,
    sku:          p.sku ?? null,
    categoryId:   p.categoryId ?? null,
    categoryName: p.categoryId ? (catMap.get(p.categoryId) ?? null) : null,
    systemQty:    p.stockQuantity,
    countedQty:   null,
  }));

  const lines = await db
    .insert(stockTakeLinesTable)
    .values(lineValues)
    .returning();

  const sorted = [...lines].sort((a, b) => a.productName.localeCompare(b.productName));
  res.status(201).json(formatTake(take, sorted));
});

/* ── Get one ────────────────────────────────────────────────────────────── */

router.get("/stock-takes/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [take] = await db
    .select()
    .from(stockTakesTable)
    .where(and(eq(stockTakesTable.id, id), eq(stockTakesTable.merchantId, merchantId)));

  if (!take) { res.status(404).json({ error: "Not found" }); return; }

  const lines = await db
    .select()
    .from(stockTakeLinesTable)
    .where(eq(stockTakeLinesTable.stockTakeId, id))
    .orderBy(stockTakeLinesTable.productName);

  res.json(formatTake(take, lines));
});

/* ── Save progress ──────────────────────────────────────────────────────── */

router.patch("/stock-takes/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [take] = await db
    .select()
    .from(stockTakesTable)
    .where(and(eq(stockTakesTable.id, id), eq(stockTakesTable.merchantId, merchantId)));

  if (!take) { res.status(404).json({ error: "Not found" }); return; }
  if (take.status !== "open") {
    res.status(409).json({ error: "Cannot modify a stock take that has already been applied." });
    return;
  }

  const incoming: { productId: number; countedQty: number | null }[] = Array.isArray(req.body?.lines)
    ? req.body.lines
    : [];

  // Upsert counted quantities for each product line
  for (const item of incoming) {
    await db
      .update(stockTakeLinesTable)
      .set({
        countedQty: item.countedQty ?? null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(stockTakeLinesTable.stockTakeId, id),
        eq(stockTakeLinesTable.productId, item.productId),
      ));
  }

  const lines = await db
    .select()
    .from(stockTakeLinesTable)
    .where(eq(stockTakeLinesTable.stockTakeId, id))
    .orderBy(stockTakeLinesTable.productName);

  res.json(formatTake(take, lines));
});

/* ── Submit / Apply ─────────────────────────────────────────────────────── */

router.post("/stock-takes/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [take] = await db
    .select()
    .from(stockTakesTable)
    .where(and(eq(stockTakesTable.id, id), eq(stockTakesTable.merchantId, merchantId)));

  if (!take) { res.status(404).json({ error: "Not found" }); return; }
  if (take.status !== "open") {
    res.status(409).json({ error: "Stock take has already been applied." });
    return;
  }

  const lines = await db
    .select()
    .from(stockTakeLinesTable)
    .where(eq(stockTakeLinesTable.stockTakeId, id));

  const counted = lines.filter(l => l.countedQty !== null);

  if (counted.length === 0) {
    res.status(400).json({ error: "No products have been counted yet. Enter at least one count before submitting." });
    return;
  }

  // Apply variances: update product stock quantities and mark take as applied
  const appliedTake = await db.transaction(async (tx) => {
    for (const line of counted) {
      await tx
        .update(productsTable)
        .set({ stockQuantity: line.countedQty! })
        .where(and(
          eq(productsTable.id, line.productId),
          eq(productsTable.merchantId, merchantId),
        ));
    }

    const [updated] = await tx
      .update(stockTakesTable)
      .set({ status: "applied", appliedAt: new Date() })
      .where(eq(stockTakesTable.id, id))
      .returning();

    return updated;
  });

  const updatedLines = await db
    .select()
    .from(stockTakeLinesTable)
    .where(eq(stockTakeLinesTable.stockTakeId, id))
    .orderBy(stockTakeLinesTable.productName);

  res.json(formatTake(appliedTake, updatedLines));
});

/* ── Delete (discard open take) ─────────────────────────────────────────── */

router.delete("/stock-takes/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [take] = await db
    .select()
    .from(stockTakesTable)
    .where(and(eq(stockTakesTable.id, id), eq(stockTakesTable.merchantId, merchantId)));

  if (!take) { res.status(404).json({ error: "Not found" }); return; }
  if (take.status !== "open") {
    res.status(409).json({ error: "Only open stock takes can be discarded." });
    return;
  }

  await db.delete(stockTakeLinesTable).where(eq(stockTakeLinesTable.stockTakeId, id));
  await db.delete(stockTakesTable).where(eq(stockTakesTable.id, id));

  res.status(204).send();
});

export default router;
