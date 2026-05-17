import { Router, type IRouter } from "express";
import { db, productsTable, categoriesTable, digitalCodesTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListProductsQueryParams,
  CreateProductBody,
  GetProductParams,
  UpdateProductParams,
  UpdateProductBody,
  DeleteProductParams,
  CreateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryBody,
  DeleteCategoryParams,
  ListDigitalCodesParams,
  CreateDigitalCodeParams,
  CreateDigitalCodeBody,
  DeleteDigitalCodeParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatProduct(p: typeof productsTable.$inferSelect, category?: typeof categoriesTable.$inferSelect | null) {
  return {
    id: p.id,
    merchantId: p.merchantId,
    name: p.name,
    description: p.description ?? null,
    price: parseFloat(p.price),
    costPrice: p.costPrice ? parseFloat(p.costPrice) : null,
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    categoryId: p.categoryId ?? null,
    category: category
      ? {
          id: category.id, merchantId: category.merchantId, name: category.name,
          color: category.color ?? null, icon: category.icon ?? null,
          parentId: category.parentId ?? null, sortOrder: category.sortOrder,
          createdAt: category.createdAt.toISOString(),
        }
      : undefined,
    imageUrl: p.imageUrl ?? null,
    productType: p.productType,
    trackInventory: p.trackInventory === "true",
    stockQuantity: p.stockQuantity,
    lowStockThreshold: p.lowStockThreshold ?? null,
    taxRate: p.taxRate ? parseFloat(p.taxRate) : null,
    isActive: p.isActive === "true",
    excludeFromLoyalty: p.excludeFromLoyalty === "true",
    createdAt: p.createdAt.toISOString(),
  };
}

function formatCategory(c: typeof categoriesTable.$inferSelect) {
  return {
    id: c.id,
    merchantId: c.merchantId,
    name: c.name,
    color: c.color ?? null,
    icon: c.icon ?? null,
    parentId: c.parentId ?? null,
    sortOrder: c.sortOrder,
    createdAt: c.createdAt.toISOString(),
  };
}

function formatDigitalCode(d: typeof digitalCodesTable.$inferSelect) {
  return {
    id: d.id,
    merchantId: d.merchantId,
    productId: d.productId,
    code: d.code,
    isUsed: d.isUsed === "true",
    usedAt: d.usedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

// ── Categories ────────────────────────────────────────────────────────────────

router.get("/categories", requireAuth, async (req, res): Promise<void> => {
  const cats = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.merchantId, req.session.merchantId!))
    .orderBy(categoriesTable.sortOrder, categoriesTable.name);
  res.json(cats.map(formatCategory));
});

router.post("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [cat] = await db
    .insert(categoriesTable)
    .values({ ...parsed.data, merchantId: req.session.merchantId! })
    .returning();
  res.status(201).json(formatCategory(cat));
});

router.patch("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [cat] = await db
    .update(categoriesTable)
    .set(parsed.data)
    .where(and(eq(categoriesTable.id, params.data.id), eq(categoriesTable.merchantId, req.session.merchantId!)))
    .returning();
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  res.json(formatCategory(cat));
});

router.delete("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db
    .delete(categoriesTable)
    .where(and(eq(categoriesTable.id, params.data.id), eq(categoriesTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

// ── Products ──────────────────────────────────────────────────────────────────

router.get("/products", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListProductsQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const { search, categoryId, limit = 50, offset = 0 } = queryParams.data;
  const conditions = [eq(productsTable.merchantId, req.session.merchantId!)];
  if (search) conditions.push(ilike(productsTable.name, `%${search}%`));
  if (categoryId) conditions.push(eq(productsTable.categoryId, categoryId));

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(productsTable)
    .where(and(...conditions));

  const products = await db
    .select()
    .from(productsTable)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(productsTable.name);

  const categories = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.merchantId, req.session.merchantId!));
  const catMap = new Map(categories.map((c) => [c.id, c]));

  res.json({
    items: products.map((p) => formatProduct(p, p.categoryId ? catMap.get(p.categoryId) : null)),
    total: Number(countResult.count),
  });
});

router.post("/products", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { price, costPrice, taxRate, trackInventory, isActive, excludeFromLoyalty, ...rest } = parsed.data;
  const [product] = await db
    .insert(productsTable)
    .values({
      ...rest,
      merchantId: req.session.merchantId!,
      price: price.toString(),
      costPrice: costPrice?.toString(),
      taxRate: taxRate?.toString(),
      trackInventory: trackInventory === false ? "false" : "true",
      isActive: isActive === false ? "false" : "true",
      excludeFromLoyalty: excludeFromLoyalty === true ? "true" : "false",
    })
    .returning();
  res.status(201).json(formatProduct(product));
});

router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.merchantId, req.session.merchantId!)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  let category = null;
  if (product.categoryId) {
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, product.categoryId));
    category = cat ?? null;
  }
  res.json(formatProduct(product, category));
});

router.patch("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { price, costPrice, taxRate, trackInventory, isActive, excludeFromLoyalty, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (price !== undefined) updates.price = price.toString();
  if (costPrice !== undefined) updates.costPrice = costPrice.toString();
  if (taxRate !== undefined) updates.taxRate = taxRate.toString();
  if (trackInventory !== undefined) updates.trackInventory = trackInventory ? "true" : "false";
  if (isActive !== undefined) updates.isActive = isActive ? "true" : "false";
  if (excludeFromLoyalty !== undefined) updates.excludeFromLoyalty = excludeFromLoyalty ? "true" : "false";
  const [product] = await db
    .update(productsTable)
    .set(updates)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.merchantId, req.session.merchantId!)))
    .returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(formatProduct(product));
});

router.delete("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db
    .delete(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

// ── Digital Codes ─────────────────────────────────────────────────────────────

router.get("/products/:productId/digital-codes", requireAuth, async (req, res): Promise<void> => {
  const params = ListDigitalCodesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const codes = await db
    .select()
    .from(digitalCodesTable)
    .where(and(eq(digitalCodesTable.productId, params.data.productId), eq(digitalCodesTable.merchantId, req.session.merchantId!)))
    .orderBy(digitalCodesTable.createdAt);
  res.json(codes.map(formatDigitalCode));
});

router.post("/products/:productId/digital-codes", requireAuth, async (req, res): Promise<void> => {
  const params = CreateDigitalCodeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CreateDigitalCodeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [code] = await db
    .insert(digitalCodesTable)
    .values({ ...parsed.data, productId: params.data.productId, merchantId: req.session.merchantId! })
    .returning();
  res.status(201).json(formatDigitalCode(code));
});

router.delete("/digital-codes/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteDigitalCodeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db
    .delete(digitalCodesTable)
    .where(and(eq(digitalCodesTable.id, params.data.id), eq(digitalCodesTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
