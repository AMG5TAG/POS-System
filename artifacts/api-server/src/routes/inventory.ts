import { Router, type IRouter } from "express";
import { db, productsTable, productTypesTable } from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { ListInventoryQueryParams, UpdateInventoryParams, UpdateInventoryBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/inventory", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListInventoryQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { lowStock, limit = 50, offset = 0 } = queryParams.data;
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
