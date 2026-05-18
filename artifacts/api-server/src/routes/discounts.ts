import { Router, type IRouter } from "express";
import { db, discountsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateDiscountBody,
  ValidateDiscountCodeBody,
  UpdateDiscountParams,
  UpdateDiscountBody,
  DeleteDiscountParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function fmt(d: typeof discountsTable.$inferSelect) {
  return {
    id: d.id,
    name: d.name,
    code: d.code ?? null,
    type: d.type,
    value: parseFloat(d.value),
    minOrderAmount: d.minOrderAmount ? parseFloat(d.minOrderAmount) : null,
    maxUses: d.maxUses ?? null,
    usedCount: d.usedCount,
    applicableTo: d.applicableTo,
    productIds: Array.isArray(d.productIds) ? d.productIds : [],
    categoryIds: Array.isArray(d.categoryIds) ? d.categoryIds : [],
    startDate: d.startDate ?? null,
    endDate: d.endDate ?? null,
    isActive: d.isActive,
    createdAt: d.createdAt.toISOString(),
  };
}

// GET /discounts
router.get("/discounts", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const rows = await db.select().from(discountsTable)
    .where(eq(discountsTable.merchantId, merchantId))
    .orderBy(desc(discountsTable.createdAt));
  res.json(rows.map(fmt));
});

// POST /discounts
router.post("/discounts", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const body = CreateDiscountBody.parse(req.body);
  const [row] = await db.insert(discountsTable).values({
    merchantId,
    name: body.name,
    code: body.code ?? null,
    type: body.type,
    value: String(body.value),
    minOrderAmount: body.minOrderAmount ? String(body.minOrderAmount) : null,
    maxUses: body.maxUses ?? null,
    applicableTo: body.applicableTo ?? "all",
    productIds: body.productIds ?? [],
    categoryIds: body.categoryIds ?? [],
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
    isActive: body.isActive ?? "true",
  }).returning();
  res.status(201).json(fmt(row));
});

// POST /discounts/validate — MUST be before /:id routes
router.post("/discounts/validate", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const body = ValidateDiscountCodeBody.parse(req.body);
  const now = new Date().toISOString().slice(0, 10);
  const [row] = await db.select().from(discountsTable)
    .where(and(eq(discountsTable.merchantId, merchantId), eq(discountsTable.code, body.code)));
  if (!row) { res.status(404).json({ error: "Invalid discount code" }); return; }
  if (row.isActive !== "true") { res.status(400).json({ error: "Discount is inactive" }); return; }
  if (row.endDate && row.endDate < now) { res.status(400).json({ error: "Discount has expired" }); return; }
  if (row.startDate && row.startDate > now) { res.status(400).json({ error: "Discount not yet active" }); return; }
  if (row.maxUses && row.usedCount >= row.maxUses) { res.status(400).json({ error: "Discount usage limit reached" }); return; }
  if (body.orderAmount !== undefined && row.minOrderAmount && body.orderAmount < parseFloat(row.minOrderAmount)) {
    res.status(400).json({ error: `Minimum order amount is $${row.minOrderAmount}` }); return;
  }
  res.json(fmt(row));
});

// PUT /discounts/:id
router.put("/discounts/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = UpdateDiscountParams.parse({ id: Number(req.params.id) });
  const body = UpdateDiscountBody.parse(req.body);
  await db.update(discountsTable).set({
    ...(body.name ? { name: body.name } : {}),
    code: body.code ?? null,
    ...(body.type ? { type: body.type } : {}),
    ...(body.value !== undefined ? { value: String(body.value) } : {}),
    minOrderAmount: body.minOrderAmount ? String(body.minOrderAmount) : null,
    maxUses: body.maxUses ?? null,
    ...(body.applicableTo ? { applicableTo: body.applicableTo } : {}),
    ...(body.productIds !== undefined ? { productIds: body.productIds } : {}),
    ...(body.categoryIds !== undefined ? { categoryIds: body.categoryIds } : {}),
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
    ...(body.isActive ? { isActive: body.isActive } : {}),
  }).where(and(eq(discountsTable.id, id), eq(discountsTable.merchantId, merchantId)));
  const [row] = await db.select().from(discountsTable).where(eq(discountsTable.id, id));
  res.json(fmt(row));
});

// DELETE /discounts/:id
router.delete("/discounts/:id", requireAuth, async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { id } = DeleteDiscountParams.parse({ id: Number(req.params.id) });
  await db.delete(discountsTable)
    .where(and(eq(discountsTable.id, id), eq(discountsTable.merchantId, merchantId)));
  res.json({ success: true });
});

export default router;
