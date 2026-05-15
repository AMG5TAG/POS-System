import { Router, type IRouter } from "express";
import { db, productsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { ListInventoryQueryParams, UpdateInventoryParams, UpdateInventoryBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/inventory", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListInventoryQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { lowStock } = queryParams.data;

  let products = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.merchantId, req.session.merchantId!), eq(productsTable.trackInventory, "true")));

  if (lowStock) {
    products = products.filter((p) => {
      const threshold = p.lowStockThreshold ?? 5;
      return p.stockQuantity <= threshold;
    });
  }

  res.json(
    products.map((p) => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku ?? null,
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold ?? null,
      isLowStock: p.stockQuantity <= (p.lowStockThreshold ?? 5),
    }))
  );
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

  res.json({
    productId: product.id,
    productName: product.name,
    sku: product.sku ?? null,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold ?? null,
    isLowStock: product.stockQuantity <= (product.lowStockThreshold ?? 5),
  });
});

export default router;
