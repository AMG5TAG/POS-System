import { Router, type IRouter } from "express";
import { db, productsTable, categoriesTable, digitalCodesTable, productVariantsTable } from "@workspace/db";
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
    brandId: p.brandId ?? null,
    imageUrl: p.imageUrl ?? null,
    productType: p.productType,
    trackInventory: p.trackInventory === "true",
    stockQuantity: p.stockQuantity,
    lowStockThreshold: p.lowStockThreshold ?? null,
    taxRate: p.taxRate ? parseFloat(p.taxRate) : null,
    isActive: p.isActive === "true",
    excludeFromLoyalty: p.excludeFromLoyalty === "true",
    groupPrices: p.groupPrices ? (() => { try { return JSON.parse(p.groupPrices!); } catch { return {}; } })() : {},
    supplier: p.supplier ?? null,
    supplierCode: p.supplierCode ?? null,
    isEpay: p.isEpay === "true",
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
  const brandIdRaw = req.query.brandId ? parseInt(String(req.query.brandId)) : undefined;
  const conditions = [eq(productsTable.merchantId, req.session.merchantId!)];
  if (search) conditions.push(ilike(productsTable.name, `%${search}%`));
  if (categoryId) conditions.push(eq(productsTable.categoryId, categoryId));
  if (brandIdRaw && !isNaN(brandIdRaw)) conditions.push(eq(productsTable.brandId, brandIdRaw));

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
  const { price, costPrice, taxRate, trackInventory, isActive, excludeFromLoyalty, groupPrices, isEpay: isEpayRaw, ...rest } = parsed.data;
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
      isEpay: isEpayRaw === true ? "true" : "false",
      groupPrices: groupPrices ? JSON.stringify(groupPrices) : null,
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
  const { price, costPrice, taxRate, trackInventory, isActive, excludeFromLoyalty, groupPrices, isEpay: isEpayRaw, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (price !== undefined) updates.price = price.toString();
  if (costPrice !== undefined) updates.costPrice = costPrice.toString();
  if (taxRate !== undefined) updates.taxRate = taxRate.toString();
  if (trackInventory !== undefined) updates.trackInventory = trackInventory ? "true" : "false";
  if (isActive !== undefined) updates.isActive = isActive ? "true" : "false";
  if (excludeFromLoyalty !== undefined) updates.excludeFromLoyalty = excludeFromLoyalty ? "true" : "false";
  if (isEpayRaw !== undefined) updates.isEpay = isEpayRaw ? "true" : "false";
  if (groupPrices !== undefined) updates.groupPrices = JSON.stringify(groupPrices);
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

// ── Product Variants ──────────────────────────────────────────────────────────

function formatVariant(v: typeof productVariantsTable.$inferSelect) {
  return {
    id: v.id, merchantId: v.merchantId, productId: v.productId,
    name: v.name, sku: v.sku ?? null, barcode: v.barcode ?? null,
    price: v.price ? parseFloat(v.price) : null,
    costPrice: v.costPrice ? parseFloat(v.costPrice) : null,
    stockQuantity: v.stockQuantity,
    attributes: v.attributes ? (() => { try { return JSON.parse(v.attributes!); } catch { return {}; } })() : {},
    imageUrl: v.imageUrl ?? null,
    isActive: v.isActive === "true",
    sortOrder: v.sortOrder,
    createdAt: v.createdAt.toISOString(),
  };
}

router.get("/products/:productId/variants", requireAuth, async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const [product] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, req.session.merchantId!)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const variants = await db.select().from(productVariantsTable)
    .where(and(eq(productVariantsTable.productId, productId), eq(productVariantsTable.merchantId, req.session.merchantId!)))
    .orderBy(productVariantsTable.sortOrder, productVariantsTable.name);
  res.json(variants.map(formatVariant));
});

router.post("/products/:productId/variants", requireAuth, async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const [product] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, req.session.merchantId!)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const { name, sku, barcode, price, costPrice, stockQuantity, attributes, imageUrl, isActive, sortOrder } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }
  const [variant] = await db.insert(productVariantsTable).values({
    merchantId: req.session.merchantId!, productId,
    name, sku: sku as string ?? null, barcode: barcode as string ?? null,
    price: price != null ? String(price) : null,
    costPrice: costPrice != null ? String(costPrice) : null,
    stockQuantity: typeof stockQuantity === "number" ? stockQuantity : 0,
    attributes: attributes ? JSON.stringify(attributes) : null,
    imageUrl: imageUrl as string ?? null,
    isActive: isActive === false ? "false" : "true",
    sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
  }).returning();
  res.status(201).json(formatVariant(variant));
});

router.patch("/products/:productId/variants/:id", requireAuth, async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId);
  const id = parseInt(req.params.id);
  if (isNaN(productId) || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, sku, barcode, price, costPrice, stockQuantity, attributes, imageUrl, isActive, sortOrder } = req.body as Record<string, unknown>;
  const update: Partial<typeof productVariantsTable.$inferInsert> = {};
  if (name !== undefined) update.name = name as string;
  if (sku !== undefined) update.sku = sku as string | null;
  if (barcode !== undefined) update.barcode = barcode as string | null;
  if (price !== undefined) update.price = price != null ? String(price) : null;
  if (costPrice !== undefined) update.costPrice = costPrice != null ? String(costPrice) : null;
  if (stockQuantity !== undefined) update.stockQuantity = stockQuantity as number;
  if (attributes !== undefined) update.attributes = attributes ? JSON.stringify(attributes) : null;
  if (imageUrl !== undefined) update.imageUrl = imageUrl as string | null;
  if (isActive !== undefined) update.isActive = isActive === false ? "false" : "true";
  if (sortOrder !== undefined) update.sortOrder = sortOrder as number;
  const [updated] = await db.update(productVariantsTable).set(update)
    .where(and(eq(productVariantsTable.id, id), eq(productVariantsTable.merchantId, req.session.merchantId!)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Variant not found" }); return; }
  res.json(formatVariant(updated));
});

router.delete("/products/:productId/variants/:id", requireAuth, async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId);
  const id = parseInt(req.params.id);
  if (isNaN(productId) || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(productVariantsTable)
    .where(and(eq(productVariantsTable.id, id), eq(productVariantsTable.merchantId, req.session.merchantId!)));
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
