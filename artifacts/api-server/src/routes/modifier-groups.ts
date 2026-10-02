import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { Router, type IRouter } from "express";
import { db, modifierGroupsTable, modifiersTable, productModifierGroupsTable, productsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { z } from "zod/v4";

const router: IRouter = Router();

/* ── GET /modifier-groups ────────────────────────────────────────────────── */
router.get("/modifier-groups", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const groups = await db.select().from(modifierGroupsTable)
    .where(and(eq(modifierGroupsTable.merchantId, merchantId), eq(modifierGroupsTable.isActive, "true")))
    .orderBy(modifierGroupsTable.id);

  const allModifiers = await db.select().from(modifiersTable)
    .where(and(eq(modifiersTable.merchantId, merchantId), eq(modifiersTable.isActive, "true")))
    .orderBy(modifiersTable.sortOrder);

  const grouped = groups.map(g => ({
    ...g,
    isRequired: g.isRequired === "true",
    modifiers: allModifiers
      .filter(m => m.groupId === g.id)
      .map(m => ({ ...m, priceAdjustment: parseFloat(m.priceAdjustment ?? "0"), isDefault: m.isDefault === "true" })),
  }));

  res.json({ groups: grouped });
});

/* ── POST /modifier-groups ───────────────────────────────────────────────── */
router.post("/modifier-groups", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = z.object({
    name: z.string().min(1),
    isRequired: z.boolean().optional(),
    minSelections: z.number().int().min(0).optional(),
    maxSelections: z.number().int().min(1).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [group] = await db.insert(modifierGroupsTable).values({
    merchantId,
    name: d.name,
    isRequired: d.isRequired ? "true" : "false",
    minSelections: d.minSelections ?? 0,
    maxSelections: d.maxSelections ?? 1,
  }).returning();
  res.status(201).json({ ...group, isRequired: group.isRequired === "true", modifiers: [] });
});

/* ── PATCH /modifier-groups/:id ──────────────────────────────────────────── */
router.patch("/modifier-groups/:id", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const groupId = parseInt(String(req.params.id), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const merchantId = req.session.merchantId!;
  const parsed = z.object({
    name: z.string().min(1).optional(),
    isRequired: z.boolean().optional(),
    minSelections: z.number().int().min(0).optional(),
    maxSelections: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [group] = await db.update(modifierGroupsTable).set({
    ...(d.name          !== undefined && { name: d.name }),
    ...(d.isRequired    !== undefined && { isRequired: d.isRequired ? "true" : "false" }),
    ...(d.minSelections !== undefined && { minSelections: d.minSelections }),
    ...(d.maxSelections !== undefined && { maxSelections: d.maxSelections }),
    ...(d.isActive      !== undefined && { isActive: d.isActive ? "true" : "false" }),
    updatedAt: new Date(),
  }).where(and(eq(modifierGroupsTable.id, groupId), eq(modifierGroupsTable.merchantId, merchantId)))
    .returning();
  if (!group) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...group, isRequired: group.isRequired === "true" });
});

/* ── DELETE /modifier-groups/:id ─────────────────────────────────────────── */
router.delete("/modifier-groups/:id", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const groupId = parseInt(String(req.params.id), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const merchantId = req.session.merchantId!;
  // Confirm the group belongs to this merchant before deleting child rows keyed
  // only on groupId, otherwise another merchant's modifiers/links could be wiped.
  const [owned] = await db.select({ id: modifierGroupsTable.id }).from(modifierGroupsTable)
    .where(and(eq(modifierGroupsTable.id, groupId), eq(modifierGroupsTable.merchantId, merchantId)));
  if (!owned) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(modifiersTable).where(eq(modifiersTable.groupId, groupId));
  await db.delete(productModifierGroupsTable).where(eq(productModifierGroupsTable.groupId, groupId));
  await db.delete(modifierGroupsTable)
    .where(and(eq(modifierGroupsTable.id, groupId), eq(modifierGroupsTable.merchantId, merchantId)));
  res.json({ success: true });
});

/* ── POST /modifier-groups/:groupId/modifiers ────────────────────────────── */
router.post("/modifier-groups/:groupId/modifiers", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const groupId = parseInt(String(req.params.groupId), 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid groupId" }); return; }
  const merchantId = req.session.merchantId!;
  const parsed = z.object({
    name: z.string().min(1),
    priceAdjustment: z.number().optional(),
    isDefault: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [ownGroup] = await db.select({ id: modifierGroupsTable.id }).from(modifierGroupsTable)
    .where(and(eq(modifierGroupsTable.id, groupId), eq(modifierGroupsTable.merchantId, merchantId)));
  if (!ownGroup) { res.status(404).json({ error: "Modifier group not found" }); return; }
  const d = parsed.data;
  const [modifier] = await db.insert(modifiersTable).values({
    groupId,
    merchantId,
    name: d.name,
    priceAdjustment: String(d.priceAdjustment ?? 0),
    isDefault: d.isDefault ? "true" : "false",
    sortOrder: d.sortOrder ?? 0,
  }).returning();
  res.status(201).json({
    ...modifier,
    priceAdjustment: parseFloat(modifier.priceAdjustment ?? "0"),
    isDefault: modifier.isDefault === "true",
  });
});

/* ── PATCH /modifiers/:id ────────────────────────────────────────────────── */
router.patch("/modifiers/:id", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const modifierId = parseInt(String(req.params.id), 10);
  if (isNaN(modifierId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const merchantId = req.session.merchantId!;
  const parsed = z.object({
    name: z.string().min(1).optional(),
    priceAdjustment: z.number().optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [modifier] = await db.update(modifiersTable).set({
    ...(d.name            !== undefined && { name: d.name }),
    ...(d.priceAdjustment !== undefined && { priceAdjustment: String(d.priceAdjustment) }),
    ...(d.isDefault       !== undefined && { isDefault: d.isDefault ? "true" : "false" }),
    ...(d.isActive        !== undefined && { isActive: d.isActive ? "true" : "false" }),
    ...(d.sortOrder       !== undefined && { sortOrder: d.sortOrder }),
  }).where(and(eq(modifiersTable.id, modifierId), eq(modifiersTable.merchantId, merchantId)))
    .returning();
  if (!modifier) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    ...modifier,
    priceAdjustment: parseFloat(modifier.priceAdjustment ?? "0"),
    isDefault: modifier.isDefault === "true",
  });
});

/* ── DELETE /modifiers/:id ───────────────────────────────────────────────── */
router.delete("/modifiers/:id", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const modifierId = parseInt(String(req.params.id), 10);
  if (isNaN(modifierId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const merchantId = req.session.merchantId!;
  await db.delete(modifiersTable)
    .where(and(eq(modifiersTable.id, modifierId), eq(modifiersTable.merchantId, merchantId)));
  res.json({ success: true });
});

/* ── GET /products/:productId/modifier-groups ────────────────────────────── */
router.get("/products/:productId/modifier-groups", requireAuth, async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const merchantId = req.session.merchantId!;
  const links = await db.select().from(productModifierGroupsTable)
    .where(and(
      eq(productModifierGroupsTable.productId, productId),
      eq(productModifierGroupsTable.merchantId, merchantId),
    ));
  res.json({ groupIds: links.map(l => l.groupId) });
});

/* ── POST /products/:productId/modifier-groups ───────────────────────────── */
router.post("/products/:productId/modifier-groups", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  const merchantId = req.session.merchantId!;
  const parsed = z.object({ groupId: z.number().int() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  // Both ends must be this business's before any link is touched.
  const [prod] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)));
  const [grp] = await db.select({ id: modifierGroupsTable.id }).from(modifierGroupsTable)
    .where(and(eq(modifierGroupsTable.id, parsed.data.groupId), eq(modifierGroupsTable.merchantId, merchantId)));
  if (!prod || !grp) { res.status(404).json({ error: "Product or modifier group not found" }); return; }
  await db.delete(productModifierGroupsTable).where(
    and(
      eq(productModifierGroupsTable.productId, productId),
      eq(productModifierGroupsTable.groupId, parsed.data.groupId),
      eq(productModifierGroupsTable.merchantId, merchantId),
    )
  );
  await db.insert(productModifierGroupsTable).values({ productId, groupId: parsed.data.groupId, merchantId });
  res.status(201).json({ success: true });
});

/* ── DELETE /products/:productId/modifier-groups/:groupId ───────────────── */
router.delete("/products/:productId/modifier-groups/:groupId", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId), 10);
  const groupId   = parseInt(String(req.params.groupId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid productId" }); return; }
  if (isNaN(groupId)) { res.status(400).json({ error: "Invalid groupId" }); return; }
  const merchantId = req.session.merchantId!;
  await db.delete(productModifierGroupsTable).where(
    and(
      eq(productModifierGroupsTable.productId, productId),
      eq(productModifierGroupsTable.groupId, groupId),
      eq(productModifierGroupsTable.merchantId, merchantId),
    )
  );
  res.json({ success: true });
});

export default router;
