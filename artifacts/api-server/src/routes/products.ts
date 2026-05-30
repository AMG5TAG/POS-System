import { Router, type IRouter } from "express";
import { db, productsTable, categoriesTable, digitalCodesTable, productVariantsTable, productPriceHistoryTable, productTypesTable } from "@workspace/db";
import { eq, and, ilike, sql, or, desc, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import multer from "multer";
import { requireAuth } from "../middlewares/requireAuth";
import { parseCsvBuffer, normaliseHeaders } from "../lib/parseCsv";
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
  RenameProductTagBody,
  MergeProductTagsBody,
  DeleteProductTagBody,
  CreateProductVariantBody,
  UpdateProductVariantBody,
  ListProductVariantsParams,
  CreateProductVariantParams,
  UpdateProductVariantParams,
  DeleteProductVariantParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatProduct(
  p: typeof productsTable.$inferSelect,
  category?: typeof categoriesTable.$inferSelect | null,
  productType?: typeof productTypesTable.$inferSelect | null,
) {
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
    productType: productType?.slug ?? "standard",
    productTypeId: p.productTypeId ?? null,
    productTypeName: productType?.name ?? null,
    trackInventory: p.trackInventory === "true",
    stockQuantity: p.stockQuantity,
    lowStockThreshold: p.lowStockThreshold ?? null,
    taxRate: p.taxRate ? parseFloat(p.taxRate) : null,
    isActive: p.isActive === "true",
    excludeFromLoyalty: p.excludeFromLoyalty === "true",
    groupPrices: p.groupPrices ?? {},
    supplier: p.supplier ?? null,
    supplierCode: p.supplierCode ?? null,
    isEpay: p.isEpay === "true",
    tags: p.tags ?? [],
    stockLocation: p.stockLocation ?? null,
    overflowLocation: p.overflowLocation ?? null,
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

  const { search, categoryId, limit = 50, offset = 0, tag } = queryParams.data;
  const brandIdRaw = req.query.brandId ? parseInt(String(req.query.brandId)) : undefined;
  const conditions = [eq(productsTable.merchantId, req.session.merchantId!)];
  if (search) conditions.push(or(
    ilike(productsTable.name, `%${search}%`),
    ilike(productsTable.sku, `%${search}%`),
    ilike(productsTable.barcode, `%${search}%`),
    sql`${productsTable.tags}::text ilike ${'%' + search + '%'}`,
  )!);
  if (categoryId) conditions.push(eq(productsTable.categoryId, categoryId));
  if (brandIdRaw && !isNaN(brandIdRaw)) conditions.push(eq(productsTable.brandId, brandIdRaw));
  if (tag) conditions.push(sql`${productsTable.tags} @> jsonb_build_array(${tag}::text)`);

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

  const [categories, productTypes] = await Promise.all([
    db.select().from(categoriesTable).where(eq(categoriesTable.merchantId, req.session.merchantId!)),
    db.select().from(productTypesTable).where(eq(productTypesTable.merchantId, req.session.merchantId!)),
  ]);
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const ptMap = new Map(productTypes.map((t) => [t.id, t]));

  res.json({
    items: products.map((p) => formatProduct(p, p.categoryId ? catMap.get(p.categoryId) : null, p.productTypeId ? ptMap.get(p.productTypeId) : null)),
    total: Number(countResult.count),
  });
});

router.post("/products", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { price, costPrice, taxRate, trackInventory, isActive, excludeFromLoyalty, groupPrices, isEpay: isEpayRaw, tags, productTypeId, ...rest } = parsed.data;

  let ptRecord: typeof productTypesTable.$inferSelect | null = null;

  if (productTypeId != null) {
    const [pt] = await db.select().from(productTypesTable)
      .where(and(eq(productTypesTable.id, productTypeId), eq(productTypesTable.merchantId, req.session.merchantId!)));
    if (!pt) { res.status(400).json({ error: "Product type not found" }); return; }
    ptRecord = pt;
  } else {
    const [pt] = await db.select().from(productTypesTable)
      .where(and(eq(productTypesTable.slug, "standard"), eq(productTypesTable.merchantId, req.session.merchantId!)));
    if (!pt) { res.status(400).json({ error: "No standard product type found; please set up product types first" }); return; }
    ptRecord = pt;
  }

  const [product] = await db
    .insert(productsTable)
    .values({
      ...rest,
      merchantId: req.session.merchantId!,
      productTypeId: ptRecord.id,
      price: price.toString(),
      costPrice: costPrice?.toString(),
      taxRate: taxRate?.toString(),
      trackInventory: trackInventory === false ? "false" : "true",
      isActive: isActive === false ? "false" : "true",
      excludeFromLoyalty: excludeFromLoyalty === true ? "true" : "false",
      isEpay: isEpayRaw === true ? "true" : "false",
      groupPrices: groupPrices ?? null,
      tags: tags ?? null,
    })
    .returning();
  res.status(201).json(formatProduct(product, null, ptRecord));
});

// ── Product Tag Management ─────────────────────────────────────────────────────

router.get("/products/tags", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db.execute<{ name: string; productCount: number }>(sql`
    SELECT elem AS name, COUNT(*)::int AS "productCount"
    FROM products, jsonb_array_elements_text(tags_json) AS t(elem)
    WHERE merchant_id = ${merchantId}
      AND tags_json IS NOT NULL
      AND elem <> ''
    GROUP BY elem
    ORDER BY elem
  `);
  const items = rows.rows;
  res.json({ items, total: items.length });
});

router.post("/products/tags/rename", requireAuth, async (req, res): Promise<void> => {
  const parsed = RenameProductTagBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { oldName, newName } = parsed.data;
  const merchantId = req.session.merchantId!;

  const result = await db.execute(sql`
    UPDATE products
    SET tags_json = (
      SELECT jsonb_agg(
        CASE WHEN elem = ${oldName} THEN ${newName} ELSE elem END
        ORDER BY ordinality
      )
      FROM jsonb_array_elements_text(tags_json) WITH ORDINALITY AS t(elem, ordinality)
    )
    WHERE merchant_id = ${merchantId}
      AND tags_json @> jsonb_build_array(${oldName}::text)
  `);
  res.json({ updated: result.rowCount ?? 0 });
});

router.post("/products/tags/merge", requireAuth, async (req, res): Promise<void> => {
  const parsed = MergeProductTagsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { sourceTags, targetName } = parsed.data;
  if (!sourceTags.length) { res.status(400).json({ error: "sourceTags must not be empty" }); return; }
  const merchantId = req.session.merchantId!;

  const caseParts = sourceTags.map(t => sql`WHEN elem = ${t} THEN ${targetName}`);
  const caseExpr = sql.join(caseParts, sql` `);
  const filterParts = sourceTags.map(t => sql`tags_json @> jsonb_build_array(${t}::text)`);
  const filterOr = sql.join(filterParts, sql` OR `);

  // Inner GROUP BY deduplicates merged tags; MIN(ordinality) preserves
  // first-occurrence order so output matches the old new Set(tags.map(...)) behaviour.
  const result = await db.execute(sql`
    UPDATE products
    SET tags_json = (
      SELECT jsonb_agg(mapped ORDER BY min_ord)
      FROM (
        SELECT CASE ${caseExpr} ELSE elem END AS mapped,
               MIN(ordinality) AS min_ord
        FROM jsonb_array_elements_text(tags_json) WITH ORDINALITY AS t(elem, ordinality)
        GROUP BY 1
      ) deduped
    )
    WHERE merchant_id = ${merchantId}
      AND (${filterOr})
  `);
  res.json({ updated: result.rowCount ?? 0 });
});

router.post("/products/tags/delete", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeleteProductTagBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { name } = parsed.data;
  const merchantId = req.session.merchantId!;

  // COALESCE to '[]'::jsonb when removing the last tag (jsonb_agg on an empty set returns NULL).
  const result = await db.execute(sql`
    UPDATE products
    SET tags_json = COALESCE(
      (
        SELECT jsonb_agg(elem ORDER BY ordinality)
        FROM jsonb_array_elements_text(tags_json) WITH ORDINALITY AS t(elem, ordinality)
        WHERE elem <> ${name}
      ),
      '[]'::jsonb
    )
    WHERE merchant_id = ${merchantId}
      AND tags_json @> jsonb_build_array(${name}::text)
  `);
  res.json({ updated: result.rowCount ?? 0 });
});

/* ── CSV Import ──────────────────────────────────────────────────────────────── */

const PRODUCT_HEADER_MAP: Record<string, string> = {
  name: "name",             product_name: "name",
  category: "category",    category_name: "category",
  price: "price",           selling_price: "price",
  cost_price: "costPrice",  cost: "costPrice",  costprice: "costPrice",
  sku: "sku",               sku_number: "sku",  item_code: "sku",
  barcode: "barcode",       upc: "barcode",  ean: "barcode",
  stock_quantity: "stockQuantity", stock: "stockQuantity",
  quantity: "stockQuantity", qty: "stockQuantity",
  track_inventory: "trackInventory", track: "trackInventory", trackinventory: "trackInventory",
};

const uploadMemoryProducts = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// IMPORTANT: registered before /products/:id so "import" is not captured as :id param
router.post("/products/import", requireAuth, uploadMemoryProducts.single("file"), async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  if (!req.file) {
    res.status(400).json({ error: "No CSV file uploaded (field name: file)" }); return;
  }

  // ── Parse CSV server-side ──────────────────────────────────────────────────
  let rawRows: Record<string, string>[];
  try {
    const parsed = parseCsvBuffer(req.file.buffer);
    if (parsed.length === 0) { res.status(400).json({ error: "CSV file is empty or has no data rows" }); return; }
    const firstKeys = Object.keys(parsed[0]);
    const normKeys  = normaliseHeaders(firstKeys, PRODUCT_HEADER_MAP);
    rawRows = parsed.map((row) => {
      const out: Record<string, string> = {};
      firstKeys.forEach((k, i) => { out[normKeys[i]] = row[k] ?? ""; });
      return out;
    });
  } catch (err) {
    req.log.error({ err }, "Product CSV parse failed");
    res.status(400).json({ error: "Failed to parse CSV file" }); return;
  }

  const [standardType] = await db
    .select()
    .from(productTypesTable)
    .where(and(eq(productTypesTable.slug, "standard"), eq(productTypesTable.merchantId, merchantId)));
  if (!standardType) {
    res.status(400).json({ error: "Standard product type not found — set up product types first" }); return;
  }

  const existingSkuRows = await db
    .select({ sku: productsTable.sku })
    .from(productsTable)
    .where(eq(productsTable.merchantId, merchantId));
  const existingSkus = new Set(
    existingSkuRows.map((r) => r.sku?.toLowerCase().trim()).filter(Boolean) as string[],
  );

  const catRows = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.merchantId, merchantId));
  const catByName = new Map(catRows.map((c) => [c.name.toLowerCase().trim(), c]));

  // ── Validate rows ──────────────────────────────────────────────────────────
  const errors: { row: number; message: string }[] = [];
  const seenSkus = new Set<string>(); // within-file duplicate tracking

  type ValidRow = {
    name: string; categoryName: string; priceRaw: number; costRaw: number;
    sku: string; barcode: string; stockQty: number; trackInv: boolean;
  };
  const toInsert: ValidRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row          = rawRows[i];
    const rowNum       = i + 1;
    const name         = (row.name         ?? "").trim();
    const categoryName = (row.category     ?? "").trim();
    const priceRaw     = parseFloat(row.price ?? "");
    const costStr      = (row.costPrice ?? "").trim();
    const costRaw      = costStr !== "" ? parseFloat(costStr) : NaN;
    const sku          = (row.sku      ?? "").trim();
    const barcode      = (row.barcode  ?? "").trim();
    const stockQty     = Math.max(0, parseInt(row.stockQuantity ?? "0") || 0);
    const trackStr     = (row.trackInventory ?? "true").toLowerCase().trim();
    const trackInv     = !["false", "no", "0"].includes(trackStr);

    if (!name) {
      errors.push({ row: rowNum, message: "Product name is required" }); continue;
    }
    if (isNaN(priceRaw) || priceRaw < 0) {
      errors.push({ row: rowNum, message: "Price must be a valid number ≥ 0" }); continue;
    }
    if (sku && existingSkus.has(sku.toLowerCase())) {
      errors.push({ row: rowNum, message: `SKU already exists: ${sku}` }); continue;
    }
    if (sku && seenSkus.has(sku.toLowerCase())) {
      errors.push({ row: rowNum, message: `Duplicate SKU in file: ${sku}` }); continue;
    }
    if (sku) seenSkus.add(sku.toLowerCase());

    toInsert.push({ name, categoryName, priceRaw, costRaw, sku, barcode, stockQty, trackInv });
    if (sku) existingSkus.add(sku.toLowerCase());
  }

  if (toInsert.length === 0) {
    res.json({ imported: 0, skipped: rawRows.length, errors }); return;
  }

  // ── Resolve / create categories ────────────────────────────────────────────
  for (const r of toInsert) {
    if (!r.categoryName) continue;
    if (catByName.has(r.categoryName.toLowerCase())) continue;
    try {
      const [newCat] = await db.insert(categoriesTable).values({ merchantId, name: r.categoryName }).returning();
      catByName.set(r.categoryName.toLowerCase(), newCat);
    } catch { /* ignore — product will be imported without category */ }
  }

  // ── Bulk insert all valid products ─────────────────────────────────────────
  const insertValues: (typeof productsTable.$inferInsert)[] = toInsert.map((r) => ({
    merchantId,
    name:           r.name,
    price:          r.priceRaw.toString(),
    costPrice:      !isNaN(r.costRaw) ? r.costRaw.toString() : null,
    sku:            r.sku     || null,
    barcode:        r.barcode || null,
    categoryId:     r.categoryName ? (catByName.get(r.categoryName.toLowerCase())?.id ?? null) : null,
    stockQuantity:  r.stockQty,
    trackInventory: r.trackInv ? "true" : "false",
    isActive:       "true",
    productTypeId:  standardType.id,
  }));

  let imported = 0;
  const skipped = rawRows.length - toInsert.length;

  try {
    await db.insert(productsTable).values(insertValues);
    imported = insertValues.length;
  } catch (err) {
    req.log.error({ err }, "Product CSV bulk insert failed");
    res.status(500).json({ error: "Database error during bulk insert" }); return;
  }

  res.json({ imported, skipped, errors });
});

router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.merchantId, req.session.merchantId!)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const [category, ptRecord] = await Promise.all([
    product.categoryId ? db.select().from(categoriesTable).where(eq(categoriesTable.id, product.categoryId)).then(([c]) => c ?? null) : Promise.resolve(null),
    product.productTypeId ? db.select().from(productTypesTable).where(eq(productTypesTable.id, product.productTypeId)).then(([t]) => t ?? null) : Promise.resolve(null),
  ]);
  res.json(formatProduct(product, category, ptRecord));
});

// ── Bulk update ────────────────────────────────────────────────────────────────
// IMPORTANT: must be registered before /products/:id to avoid ":id" matching "bulk"

const BulkProductsBody = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  action: z.enum(["price_percent", "price_flat", "set_category", "set_track_inventory", "delete"]),
  value: z.number().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  trackInventory: z.boolean().nullable().optional(),
});

router.patch("/products/bulk", requireAuth, async (req, res): Promise<void> => {
  const parsed = BulkProductsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { ids, action, value, categoryId, trackInventory } = parsed.data;
  const merchantId = req.session.merchantId!;

  // Verify ownership — only operate on IDs that belong to this merchant
  const owned = await db
    .select({ id: productsTable.id, price: productsTable.price })
    .from(productsTable)
    .where(and(inArray(productsTable.id, ids), eq(productsTable.merchantId, merchantId)));

  const validIds = owned.map((p) => p.id);
  if (validIds.length === 0) { res.json({ updated: 0, deleted: 0 }); return; }

  if (action === "delete") {
    await db.delete(productsTable)
      .where(and(inArray(productsTable.id, validIds), eq(productsTable.merchantId, merchantId)));
    res.json({ updated: 0, deleted: validIds.length });
    return;
  }

  if (action === "price_percent") {
    if (value == null) { res.status(400).json({ error: "value is required for price_percent" }); return; }
    const idList = sql.join(validIds.map((id) => sql`${id}`), sql`, `);
    await db.execute(sql`
      UPDATE products
      SET price = GREATEST(0, ROUND(price::numeric * (1 + ${value}::numeric / 100.0), 2))
      WHERE id IN (${idList})
        AND merchant_id = ${merchantId}
    `);
    res.json({ updated: validIds.length, deleted: 0 });
    return;
  }

  if (action === "price_flat") {
    if (value == null) { res.status(400).json({ error: "value is required for price_flat" }); return; }
    const idList = sql.join(validIds.map((id) => sql`${id}`), sql`, `);
    await db.execute(sql`
      UPDATE products
      SET price = GREATEST(0, ROUND(price::numeric + ${value}::numeric, 2))
      WHERE id IN (${idList})
        AND merchant_id = ${merchantId}
    `);
    res.json({ updated: validIds.length, deleted: 0 });
    return;
  }

  if (action === "set_category") {
    await db.update(productsTable)
      .set({ categoryId: categoryId ?? null })
      .where(and(inArray(productsTable.id, validIds), eq(productsTable.merchantId, merchantId)));
    res.json({ updated: validIds.length, deleted: 0 });
    return;
  }

  if (action === "set_track_inventory") {
    if (trackInventory == null) { res.status(400).json({ error: "trackInventory is required" }); return; }
    await db.update(productsTable)
      .set({ trackInventory: trackInventory ? "true" : "false" })
      .where(and(inArray(productsTable.id, validIds), eq(productsTable.merchantId, merchantId)));
    res.json({ updated: validIds.length, deleted: 0 });
    return;
  }

  res.status(400).json({ error: "Unknown action" });
});

router.patch("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { price, costPrice, taxRate, trackInventory, isActive, excludeFromLoyalty, groupPrices, isEpay: isEpayRaw, tags, productTypeId, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (price !== undefined) updates.price = price.toString();
  if (costPrice !== undefined) updates.costPrice = costPrice.toString();
  if (taxRate !== undefined) updates.taxRate = taxRate.toString();
  if (trackInventory !== undefined) updates.trackInventory = trackInventory ? "true" : "false";
  if (isActive !== undefined) updates.isActive = isActive ? "true" : "false";
  if (excludeFromLoyalty !== undefined) updates.excludeFromLoyalty = excludeFromLoyalty ? "true" : "false";
  if (isEpayRaw !== undefined) updates.isEpay = isEpayRaw ? "true" : "false";
  if (groupPrices !== undefined) updates.groupPrices = groupPrices;
  if (tags !== undefined) updates.tags = tags;

  let patchPtRecord: typeof productTypesTable.$inferSelect | null = null;
  if (productTypeId != null) {
    const [pt] = await db.select().from(productTypesTable)
      .where(and(eq(productTypesTable.id, productTypeId), eq(productTypesTable.merchantId, req.session.merchantId!)));
    if (!pt) { res.status(400).json({ error: "Product type not found" }); return; }
    updates.productTypeId = pt.id;
    patchPtRecord = pt;
  }

  let product: typeof productsTable.$inferSelect | undefined;
  if (Object.keys(updates).length > 0) {
    [product] = await db
      .update(productsTable)
      .set(updates)
      .where(and(eq(productsTable.id, params.data.id), eq(productsTable.merchantId, req.session.merchantId!)))
      .returning();
  } else {
    [product] = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.id, params.data.id), eq(productsTable.merchantId, req.session.merchantId!)));
  }
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  if (patchPtRecord === null && product.productTypeId) {
    const [pt] = await db.select().from(productTypesTable)
      .where(and(eq(productTypesTable.id, product.productTypeId), eq(productTypesTable.merchantId, req.session.merchantId!)));
    patchPtRecord = pt ?? null;
  }
  res.json(formatProduct(product, null, patchPtRecord));
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
    attributes: v.attributes ?? {},
    imageUrl: v.imageUrl ?? null,
    isActive: v.isActive === "true",
    sortOrder: v.sortOrder,
    createdAt: v.createdAt.toISOString(),
  };
}

router.get("/products/:productId/variants", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = ListProductVariantsParams.safeParse(req.params);
  if (!paramsParsed.success) { res.status(400).json({ error: paramsParsed.error.message }); return; }
  const { productId } = paramsParsed.data;
  const [product] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, req.session.merchantId!)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const variants = await db.select().from(productVariantsTable)
    .where(and(eq(productVariantsTable.productId, productId), eq(productVariantsTable.merchantId, req.session.merchantId!)))
    .orderBy(productVariantsTable.sortOrder, productVariantsTable.name);
  res.json(variants.map(formatVariant));
});

router.post("/products/:productId/variants", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = CreateProductVariantParams.safeParse(req.params);
  if (!paramsParsed.success) { res.status(400).json({ error: paramsParsed.error.message }); return; }
  const { productId } = paramsParsed.data;
  const [product] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, req.session.merchantId!)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const bodyParsed = CreateProductVariantBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const { name, sku, barcode, price, costPrice, stockQuantity, attributes, imageUrl, isActive, sortOrder } = bodyParsed.data;
  const [variant] = await db.insert(productVariantsTable).values({
    merchantId: req.session.merchantId!, productId,
    name, sku: sku ?? null, barcode: barcode ?? null,
    price: price != null ? String(price) : null,
    costPrice: costPrice != null ? String(costPrice) : null,
    stockQuantity: stockQuantity ?? 0,
    attributes: attributes ?? null,
    imageUrl: imageUrl ?? null,
    isActive: isActive === false ? "false" : "true",
    sortOrder: sortOrder ?? 0,
  }).returning();
  res.status(201).json(formatVariant(variant));
});

router.patch("/products/:productId/variants/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = UpdateProductVariantParams.safeParse(req.params);
  if (!paramsParsed.success) { res.status(400).json({ error: paramsParsed.error.message }); return; }
  const { productId, id } = paramsParsed.data;
  const bodyParsed = UpdateProductVariantBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const { name, sku, barcode, price, costPrice, stockQuantity, attributes, imageUrl, isActive, sortOrder } = bodyParsed.data;
  const update: Partial<typeof productVariantsTable.$inferInsert> = {};
  if (name !== undefined) update.name = name;
  if (sku !== undefined) update.sku = sku ?? null;
  if (barcode !== undefined) update.barcode = barcode ?? null;
  if (price !== undefined) update.price = price != null ? String(price) : null;
  if (costPrice !== undefined) update.costPrice = costPrice != null ? String(costPrice) : null;
  if (stockQuantity !== undefined) update.stockQuantity = stockQuantity;
  if (attributes !== undefined) update.attributes = attributes ?? null;
  if (imageUrl !== undefined) update.imageUrl = imageUrl ?? null;
  if (isActive !== undefined) update.isActive = isActive === false ? "false" : "true";
  if (sortOrder !== undefined) update.sortOrder = sortOrder;
  const [updated] = await db.update(productVariantsTable).set(update)
    .where(and(eq(productVariantsTable.id, id), eq(productVariantsTable.merchantId, req.session.merchantId!)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Variant not found" }); return; }
  res.json(formatVariant(updated));
});

router.delete("/products/:productId/variants/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = DeleteProductVariantParams.safeParse(req.params);
  if (!paramsParsed.success) { res.status(400).json({ error: paramsParsed.error.message }); return; }
  const { productId, id } = paramsParsed.data;
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

// GET /products/:id/pricing-history
router.get("/products/:id/pricing-history", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select()
    .from(productPriceHistoryTable)
    .where(and(eq(productPriceHistoryTable.productId, id), eq(productPriceHistoryTable.merchantId, merchantId)))
    .orderBy(desc(productPriceHistoryTable.changedAt));
  res.json(rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    costPrice: parseFloat(r.costPrice),
    supplierName: r.supplierName ?? null,
    poNumber: r.poNumber ?? null,
    poId: r.poId ?? null,
    changedAt: r.changedAt.toISOString(),
  })));
});

export default router;
