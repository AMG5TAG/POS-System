import { Router, type IRouter } from "express";
import { db, productTypesTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/product-types", requireAuth, async (req, res): Promise<void> => {
  const types = await db
    .select()
    .from(productTypesTable)
    .where(eq(productTypesTable.merchantId, req.session.merchantId!))
    .orderBy(asc(productTypesTable.sortOrder), asc(productTypesTable.name));
  res.json({ items: types, total: types.length });
});

router.post("/product-types/reorder", requireAuth, async (req, res): Promise<void> => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "number")) {
    res.status(400).json({ error: "ids must be an array of integers" });
    return;
  }
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(productTypesTable)
        .set({ sortOrder: i })
        .where(
          and(
            eq(productTypesTable.id, ids[i]),
            eq(productTypesTable.merchantId, req.session.merchantId!)
          )
        );
    }
  });
  res.sendStatus(204);
});

router.post("/product-types", requireAuth, async (req, res): Promise<void> => {
  const { name, slug, description, trackStock, printCode, isActive, sortOrder } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${productTypesTable.sortOrder}), -1)` })
    .from(productTypesTable)
    .where(eq(productTypesTable.merchantId, req.session.merchantId!));

  const [type] = await db.insert(productTypesTable).values({
    name,
    slug: slug || "",
    description: description || "",
    trackStock: trackStock === true || trackStock === "true",
    printCode: printCode === true || printCode === "true",
    isActive: isActive === undefined || isActive === "" ? true : isActive === true || isActive === "true",
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : (maxOrder ?? 0) + 1,
    merchantId: req.session.merchantId!,
  }).returning();
  res.status(201).json(type);
});

router.patch("/product-types/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const { name, slug, description, trackStock, printCode, isActive, sortOrder } = req.body;
  const updates: Partial<typeof productTypesTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug;
  if (description !== undefined) updates.description = description;
  if (trackStock !== undefined) updates.trackStock = trackStock === true || trackStock === "true";
  if (printCode !== undefined) updates.printCode = printCode === true || printCode === "true";
  if (isActive !== undefined) updates.isActive = isActive === true || isActive === "true";
  if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
  const [type] = await db.update(productTypesTable).set(updates).where(and(eq(productTypesTable.id, id), eq(productTypesTable.merchantId, req.session.merchantId!))).returning();
  if (!type) { res.status(404).json({ error: "Product type not found" }); return; }
  res.json(type);
});

router.delete("/product-types/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  await db.delete(productTypesTable).where(and(eq(productTypesTable.id, id), eq(productTypesTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
