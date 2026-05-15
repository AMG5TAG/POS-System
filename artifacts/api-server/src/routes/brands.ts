import { Router, type IRouter } from "express";
import { db, brandsTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/brands", requireAuth, async (req, res): Promise<void> => {
  const { search } = req.query as { search?: string };
  const conditions = [eq(brandsTable.merchantId, req.session.merchantId!)];
  if (search) conditions.push(ilike(brandsTable.name, `%${search}%`));
  const brands = await db.select().from(brandsTable).where(and(...conditions)).orderBy(brandsTable.name);
  res.json({ items: brands, total: brands.length });
});

router.post("/brands", requireAuth, async (req, res): Promise<void> => {
  const { name, description, website } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [brand] = await db.insert(brandsTable).values({ name, description, website, merchantId: req.session.merchantId! }).returning();
  res.status(201).json(brand);
});

router.patch("/brands/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { name, description, website } = req.body;
  const [brand] = await db.update(brandsTable).set({ name, description, website }).where(and(eq(brandsTable.id, id), eq(brandsTable.merchantId, req.session.merchantId!))).returning();
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }
  res.json(brand);
});

router.delete("/brands/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(brandsTable).where(and(eq(brandsTable.id, id), eq(brandsTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
