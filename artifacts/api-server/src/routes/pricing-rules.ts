import { Router, type IRouter } from "express";
import { db, pricingRulesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { z } from "zod/v4";

const router: IRouter = Router();

const PricingRuleBody = z.object({
  name:          z.string().min(1),
  productId:     z.number().int().nullable().optional(),
  categoryId:    z.number().int().nullable().optional(),
  discountType:  z.enum(["percent", "fixed"]),
  discountValue: z.number().min(0),
  startTime:     z.string().regex(/^\d{2}:\d{2}$/),
  endTime:       z.string().regex(/^\d{2}:\d{2}$/),
  daysOfWeek:    z.string().min(1),
  label:         z.string().nullable().optional(),
  isActive:      z.boolean().optional(),
});

router.get("/pricing-rules", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rules = await db.select().from(pricingRulesTable)
    .where(eq(pricingRulesTable.merchantId, merchantId))
    .orderBy(pricingRulesTable.id);
  res.json({ rules: rules.map(r => ({ ...r, discountValue: parseFloat(r.discountValue ?? "0") })) });
});

router.post("/pricing-rules", requireAuth, async (req, res): Promise<void> => {
  const parsed = PricingRuleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const merchantId = req.session.merchantId!;
  const d = parsed.data;
  const [rule] = await db.insert(pricingRulesTable).values({
    merchantId,
    name:          d.name,
    productId:     d.productId ?? null,
    categoryId:    d.categoryId ?? null,
    discountType:  d.discountType,
    discountValue: String(d.discountValue),
    startTime:     d.startTime,
    endTime:       d.endTime,
    daysOfWeek:    d.daysOfWeek,
    label:         d.label ?? null,
    isActive:      d.isActive !== false ? "true" : "false",
  }).returning();
  res.status(201).json({ ...rule, discountValue: parseFloat(rule.discountValue ?? "0") });
});

router.patch("/pricing-rules/:id", requireAuth, async (req, res): Promise<void> => {
  const ruleId = parseInt(String(req.params.id), 10);
  const merchantId = req.session.merchantId!;
  const parsed = PricingRuleBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [rule] = await db.update(pricingRulesTable).set({
    ...(d.name          !== undefined && { name: d.name }),
    ...(d.productId     !== undefined && { productId: d.productId }),
    ...(d.categoryId    !== undefined && { categoryId: d.categoryId }),
    ...(d.discountType  !== undefined && { discountType: d.discountType }),
    ...(d.discountValue !== undefined && { discountValue: String(d.discountValue) }),
    ...(d.startTime     !== undefined && { startTime: d.startTime }),
    ...(d.endTime       !== undefined && { endTime: d.endTime }),
    ...(d.daysOfWeek    !== undefined && { daysOfWeek: d.daysOfWeek }),
    ...(d.label         !== undefined && { label: d.label }),
    ...(d.isActive      !== undefined && { isActive: d.isActive ? "true" : "false" }),
    updatedAt: new Date(),
  }).where(and(eq(pricingRulesTable.id, ruleId), eq(pricingRulesTable.merchantId, merchantId)))
    .returning();
  if (!rule) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...rule, discountValue: parseFloat(rule.discountValue ?? "0") });
});

router.delete("/pricing-rules/:id", requireAuth, async (req, res): Promise<void> => {
  const ruleId = parseInt(String(req.params.id), 10);
  const merchantId = req.session.merchantId!;
  await db.delete(pricingRulesTable)
    .where(and(eq(pricingRulesTable.id, ruleId), eq(pricingRulesTable.merchantId, merchantId)));
  res.json({ success: true });
});

export default router;
