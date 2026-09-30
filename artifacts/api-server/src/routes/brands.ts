import { Router, type IRouter } from "express";
import { db, brandsTable, productsTable, productTypesTable } from "@workspace/db";
import { eq, and, ilike, count, sql, or, notInArray, gt, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateBrandParams, DeleteBrandParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/brands", requireAuth, async (req, res): Promise<void> => {
  const { search } = req.query as { search?: string };
  const conditions = [eq(brandsTable.merchantId, req.session.merchantId!)];
  if (search) conditions.push(ilike(brandsTable.name, `%${search}%`));

  const excludedTypes = await db.select({ id: productTypesTable.id })
    .from(productTypesTable)
    .where(and(
      eq(productTypesTable.merchantId, req.session.merchantId!),
      or(eq(productTypesTable.slug, "service"), eq(productTypesTable.slug, "digital_code")),
    ));
  const excludedIds = excludedTypes.map((t) => t.id);

  const brands = await db
    .select({
      id:           brandsTable.id,
      merchantId:   brandsTable.merchantId,
      name:         brandsTable.name,
      logoUrl:      brandsTable.logoUrl,
      website:      brandsTable.website,
      description:  brandsTable.description,
      createdAt:    brandsTable.createdAt,
      productCount: count(productsTable.id),
      retailValue:  sql<string>`COALESCE(SUM(${productsTable.price}), 0)`,
    })
    .from(brandsTable)
    .leftJoin(
      productsTable,
      and(
        eq(productsTable.brandId, brandsTable.id),
        eq(productsTable.merchantId, req.session.merchantId!),
        eq(productsTable.isActive, "true"),
        gt(productsTable.stockQuantity, 0),
        excludedIds.length > 0 ? notInArray(productsTable.productTypeId, excludedIds) : undefined,
      ),
    )
    .where(and(...conditions))
    .groupBy(brandsTable.id)
    .orderBy(brandsTable.name);

  res.json({
    items: brands.map((b) => ({
      ...b,
      productCount: Number(b.productCount),
      retailValue:  parseFloat(b.retailValue),
    })),
    total: brands.length,
  });
});

router.post("/brands", requireAuth, async (req, res): Promise<void> => {
  const { name, description, website, logoUrl } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [brand] = await db.insert(brandsTable).values({ name, description, website, logoUrl, merchantId: req.session.merchantId! }).returning();
  res.status(201).json(brand);
});

/* Merge brands: every product on a source brand moves to the target, then the
   source brands are deleted. `dryRun` answers with the counts and changes
   nothing, so the page can say exactly what will move before it does. */
const MergeBody = z.object({
  targetId: z.number().int().positive(),
  sourceIds: z.array(z.number().int().positive()).min(1).max(100),
  dryRun: z.boolean().optional(),
});

router.post("/brands/merge", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = MergeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Choose a brand to keep and at least one to merge into it" }); return; }
  const merchantId = req.session.merchantId!;
  const { targetId, dryRun } = parsed.data;
  const sourceIds = [...new Set(parsed.data.sourceIds)].filter((id) => id !== targetId);
  if (sourceIds.length === 0) { res.status(400).json({ error: "Choose at least one other brand to merge" }); return; }

  const found = await db.select({ id: brandsTable.id }).from(brandsTable)
    .where(and(eq(brandsTable.merchantId, merchantId), inArray(brandsTable.id, [targetId, ...sourceIds])));
  if (found.length !== sourceIds.length + 1) { res.status(404).json({ error: "One of those brands no longer exists" }); return; }

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(productsTable)
    .where(and(eq(productsTable.merchantId, merchantId), inArray(productsTable.brandId, sourceIds)));
  if (dryRun) { res.json({ products: n, brandsRemoved: sourceIds.length }); return; }

  const result = await db.transaction(async (tx) => {
    const moved = await tx.update(productsTable).set({ brandId: targetId })
      .where(and(eq(productsTable.merchantId, merchantId), inArray(productsTable.brandId, sourceIds)))
      .returning({ id: productsTable.id });
    await tx.delete(brandsTable).where(and(eq(brandsTable.merchantId, merchantId), inArray(brandsTable.id, sourceIds)));
    return { products: moved.length, brandsRemoved: sourceIds.length };
  });
  res.json(result);
});

router.patch("/brands/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = UpdateBrandParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const { name, description, website, logoUrl } = req.body;
  const [brand] = await db.update(brandsTable).set({ name, description, website, logoUrl }).where(and(eq(brandsTable.id, id), eq(brandsTable.merchantId, req.session.merchantId!))).returning();
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }
  res.json(brand);
});

router.delete("/brands/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = DeleteBrandParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  await db.delete(brandsTable).where(and(eq(brandsTable.id, id), eq(brandsTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
