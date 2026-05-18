import { Router, type IRouter } from "express";
import { db, productBundlesTable, productBundleItemsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateProductBundleBody,
  UpdateProductBundleParams,
  UpdateProductBundleBody,
  DeleteProductBundleParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type BundleRow = typeof productBundlesTable.$inferSelect;
type BundleItemRow = typeof productBundleItemsTable.$inferSelect;

function fmt(b: BundleRow, items: BundleItemRow[] = []) {
  return {
    id: b.id,
    name: b.name,
    description: b.description ?? null,
    price: parseFloat(b.price),
    sku: b.sku ?? null,
    isActive: b.isActive,
    items: items.map((i) => ({ id: i.id, productId: i.productId, productName: i.productName, quantity: i.quantity })),
    createdAt: b.createdAt.toISOString(),
  };
}

async function getBundleWithItems(id: number, merchantId: number) {
  const [b] = await db.select().from(productBundlesTable)
    .where(and(eq(productBundlesTable.id, id), eq(productBundlesTable.merchantId, merchantId)));
  if (!b) return null;
  const items = await db.select().from(productBundleItemsTable).where(eq(productBundleItemsTable.bundleId, id));
  return fmt(b, items);
}

// GET /product-bundles
router.get("/product-bundles", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const bundles = await db.select().from(productBundlesTable)
    .where(eq(productBundlesTable.merchantId, merchantId))
    .orderBy(desc(productBundlesTable.createdAt));
  const results = await Promise.all(bundles.map(async (b) => {
    const items = await db.select().from(productBundleItemsTable).where(eq(productBundleItemsTable.bundleId, b.id));
    return fmt(b, items);
  }));
  res.json(results);
});

// POST /product-bundles
router.post("/product-bundles", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const body = CreateProductBundleBody.parse(req.body);
  const [b] = await db.insert(productBundlesTable).values({
    merchantId,
    name: body.name,
    description: body.description ?? null,
    price: String(body.price ?? 0),
    sku: body.sku ?? null,
    isActive: body.isActive ?? "true",
  }).returning();
  if (body.items?.length) {
    await db.insert(productBundleItemsTable).values(
      body.items.map((i) => ({
        bundleId: b.id,
        productId: i.productId ?? 0,
        productName: i.productName ?? "",
        quantity: i.quantity ?? 1,
      }))
    );
  }
  const result = await getBundleWithItems(b.id, merchantId);
  res.status(201).json(result);
});

// PUT /product-bundles/:id
router.put("/product-bundles/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = UpdateProductBundleParams.parse({ id: Number(req.params.id) });
  const body = UpdateProductBundleBody.parse(req.body);
  await db.update(productBundlesTable).set({
    ...(body.name ? { name: body.name } : {}),
    description: body.description ?? null,
    ...(body.price !== undefined ? { price: String(body.price) } : {}),
    sku: body.sku ?? null,
    ...(body.isActive ? { isActive: body.isActive } : {}),
  }).where(and(eq(productBundlesTable.id, id), eq(productBundlesTable.merchantId, merchantId)));
  if (body.items !== undefined) {
    await db.delete(productBundleItemsTable).where(eq(productBundleItemsTable.bundleId, id));
    if (body.items.length) {
      await db.insert(productBundleItemsTable).values(
        body.items.map((i) => ({
          bundleId: id,
          productId: i.productId ?? 0,
          productName: i.productName ?? "",
          quantity: i.quantity ?? 1,
        }))
      );
    }
  }
  const result = await getBundleWithItems(id, merchantId);
  res.json(result);
});

// DELETE /product-bundles/:id
router.delete("/product-bundles/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = DeleteProductBundleParams.parse({ id: Number(req.params.id) });
  await db.delete(productBundleItemsTable).where(eq(productBundleItemsTable.bundleId, id));
  await db.delete(productBundlesTable)
    .where(and(eq(productBundlesTable.id, id), eq(productBundlesTable.merchantId, merchantId)));
  res.json({ success: true });
});

export default router;
