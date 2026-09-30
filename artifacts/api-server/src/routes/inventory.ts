import { Router, type IRouter } from "express";
import { db, productsTable, productTypesTable } from "@workspace/db";
import { eq, and, ne, sql, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { ListInventoryQueryParams, UpdateInventoryParams, UpdateInventoryBody } from "@workspace/api-zod";
import { maybeQueueImmediateAlert } from "../services/lowStockAlertService";

const router: IRouter = Router();

router.get("/inventory", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListInventoryQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { lowStock, search, limit = 50, offset = 0 } = queryParams.data;
  const merchantId = req.session.merchantId!;

  const [serviceType] = await db.select({ id: productTypesTable.id })
    .from(productTypesTable)
    .where(and(
      eq(productTypesTable.merchantId, merchantId),
      eq(productTypesTable.slug, "service"),
    ));

  const baseWhere = and(
    eq(productsTable.merchantId, merchantId),
    serviceType ? ne(productsTable.productTypeId, serviceType.id) : undefined,
    lowStock ? eq(productsTable.trackInventory, "true") : undefined,
    lowStock ? sql`${productsTable.stockQuantity} <= COALESCE(${productsTable.lowStockThreshold}, 5)` : undefined,
    search ? ilike(productsTable.name, `%${search}%`) : undefined,
  );

  const [products, countResult] = await Promise.all([
    db.select()
      .from(productsTable)
      .where(baseWhere)
      .orderBy(productsTable.name)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<string>`count(*)` })
      .from(productsTable)
      .where(baseWhere),
  ]);

  const formatItem = (p: typeof products[0]) => {
    const tracked = p.trackInventory === "true";
    return {
      productId: p.id,
      productName: p.name,
      sku: p.sku ?? null,
      trackInventory: tracked,
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold ?? null,
      isLowStock: tracked && p.stockQuantity <= (p.lowStockThreshold ?? 5),
    };
  };

  res.json({
    items: products.map(formatItem),
    total: Number(countResult[0]?.count ?? 0),
  });
});

/* Inventory › Overview figures, over the whole catalogue. The page used to
   fetch the first 500 products and count those, so every figure stopped at
   500. Low stock and inventory value leave out services, as the inventory
   list does; value is retail price × stock on hand, ignoring negative stock. */
router.get("/inventory/overview", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db
    .select({
      total:      sql<number>`count(*)::int`,
      active:     sql<number>`count(*) FILTER (WHERE ${productsTable.isActive} = 'true')::int`,
      lowStock:   sql<number>`count(*) FILTER (WHERE (${productTypesTable.slug} IS DISTINCT FROM 'service') AND ${productsTable.trackInventory} = 'true' AND ${productsTable.stockQuantity} <= COALESCE(${productsTable.lowStockThreshold}, 5))::int`,
      value:      sql<string>`COALESCE(SUM(CASE WHEN ${productTypesTable.slug} IS DISTINCT FROM 'service' THEN ${productsTable.price} * GREATEST(${productsTable.stockQuantity}, 0) ELSE 0 END), 0)`,
    })
    .from(productsTable)
    .leftJoin(productTypesTable, eq(productTypesTable.id, productsTable.productTypeId))
    .where(eq(productsTable.merchantId, merchantId));
  res.json({
    totalProducts: row?.total ?? 0,
    activeProducts: row?.active ?? 0,
    lowStock: row?.lowStock ?? 0,
    inventoryValue: Math.round(parseFloat(row?.value ?? "0") * 100) / 100,
  });
});

router.patch("/inventory/:productId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateInventoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateInventoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { stockQuantity: parsed.data.stockQuantity };
  if (parsed.data.lowStockThreshold !== undefined) updates.lowStockThreshold = parsed.data.lowStockThreshold;

  // Read old stock before updating so we can detect threshold crossings for alerts.
  const [before] = await db
    .select({ stockQuantity: productsTable.stockQuantity })
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.productId), eq(productsTable.merchantId, req.session.merchantId!)));

  const [product] = await db
    .update(productsTable)
    .set(updates)
    .where(and(eq(productsTable.id, params.data.productId), eq(productsTable.merchantId, req.session.merchantId!)))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const tracked = product.trackInventory === "true";

  maybeQueueImmediateAlert(req.session.merchantId!, {
    id: product.id,
    name: product.name,
    sku: product.sku ?? null,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold ?? null,
    trackInventory: product.trackInventory,
  }, before?.stockQuantity ?? product.stockQuantity).catch(() => { /* non-blocking */ });

  res.json({
    productId: product.id,
    productName: product.name,
    sku: product.sku ?? null,
    trackInventory: tracked,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold ?? null,
    isLowStock: tracked && product.stockQuantity <= (product.lowStockThreshold ?? 5),
  });
});

export default router;
