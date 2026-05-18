import { Router, type IRouter } from "express";
import { db, priceTiersTable, productPriceTiersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreatePriceTierBody,
  UpdatePriceTierParams,
  UpdatePriceTierBody,
  DeletePriceTierParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type TierRow = typeof priceTiersTable.$inferSelect;
type PPTRow = typeof productPriceTiersTable.$inferSelect;

function fmt(t: TierRow, overrides: PPTRow[] = []) {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    discountType: t.discountType,
    discountValue: parseFloat(t.discountValue),
    isActive: t.isActive,
    productOverrides: overrides.map((o) => ({ id: o.id, productId: o.productId, price: parseFloat(o.price) })),
    createdAt: t.createdAt.toISOString(),
  };
}

async function getTierWithOverrides(id: number, merchantId: number) {
  const [t] = await db.select().from(priceTiersTable)
    .where(and(eq(priceTiersTable.id, id), eq(priceTiersTable.merchantId, merchantId)));
  if (!t) return null;
  const overrides = await db.select().from(productPriceTiersTable).where(eq(productPriceTiersTable.tierId, id));
  return fmt(t, overrides);
}

// GET /price-tiers
router.get("/price-tiers", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const tiers = await db.select().from(priceTiersTable)
    .where(eq(priceTiersTable.merchantId, merchantId))
    .orderBy(desc(priceTiersTable.createdAt));
  const results = await Promise.all(tiers.map(async (t) => {
    const overrides = await db.select().from(productPriceTiersTable).where(eq(productPriceTiersTable.tierId, t.id));
    return fmt(t, overrides);
  }));
  res.json(results);
});

// POST /price-tiers
router.post("/price-tiers", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const body = CreatePriceTierBody.parse(req.body);
  const [t] = await db.insert(priceTiersTable).values({
    merchantId,
    name: body.name,
    description: body.description ?? null,
    discountType: body.discountType,
    discountValue: String(body.discountValue),
    isActive: body.isActive ?? "true",
  }).returning();
  if (body.productOverrides?.length) {
    await db.insert(productPriceTiersTable).values(
      body.productOverrides.map((o) => ({ tierId: t.id, productId: o.productId ?? 0, price: String(o.price ?? 0) }))
    );
  }
  const result = await getTierWithOverrides(t.id, merchantId);
  res.status(201).json(result);
});

// PUT /price-tiers/:id
router.put("/price-tiers/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = UpdatePriceTierParams.parse({ id: Number(req.params.id) });
  const body = UpdatePriceTierBody.parse(req.body);
  await db.update(priceTiersTable).set({
    ...(body.name ? { name: body.name } : {}),
    description: body.description ?? null,
    ...(body.discountType ? { discountType: body.discountType } : {}),
    ...(body.discountValue !== undefined ? { discountValue: String(body.discountValue) } : {}),
    ...(body.isActive ? { isActive: body.isActive } : {}),
  }).where(and(eq(priceTiersTable.id, id), eq(priceTiersTable.merchantId, merchantId)));
  if (body.productOverrides !== undefined) {
    await db.delete(productPriceTiersTable).where(eq(productPriceTiersTable.tierId, id));
    if (body.productOverrides.length) {
      await db.insert(productPriceTiersTable).values(
        body.productOverrides.map((o) => ({ tierId: id, productId: o.productId ?? 0, price: String(o.price ?? 0) }))
      );
    }
  }
  const result = await getTierWithOverrides(id, merchantId);
  res.json(result);
});

// DELETE /price-tiers/:id
router.delete("/price-tiers/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = DeletePriceTierParams.parse({ id: Number(req.params.id) });
  await db.delete(productPriceTiersTable).where(eq(productPriceTiersTable.tierId, id));
  await db.delete(priceTiersTable)
    .where(and(eq(priceTiersTable.id, id), eq(priceTiersTable.merchantId, merchantId)));
  res.json({ success: true });
});

export default router;
