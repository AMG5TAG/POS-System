import { Router, type IRouter } from "express";
import { db, suppliersTable } from "@workspace/db";
import { eq, and, ilike, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const { search } = req.query as { search?: string };
  const conditions = [eq(suppliersTable.merchantId, req.session.merchantId!)];
  if (search) conditions.push(or(ilike(suppliersTable.name, `%${search}%`), ilike(suppliersTable.email, `%${search}%`))!);
  const suppliers = await db.select().from(suppliersTable).where(and(...conditions)).orderBy(suppliersTable.name);
  res.json({ items: suppliers, total: suppliers.length });
});

router.post("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const { name, contactName, email, phone, website, address, notes } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [supplier] = await db.insert(suppliersTable).values({ name, contactName, email, phone, website, address, notes, merchantId: req.session.merchantId! }).returning();
  res.status(201).json(supplier);
});

router.patch("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { name, contactName, email, phone, website, address, notes } = req.body;
  const [supplier] = await db.update(suppliersTable).set({ name, contactName, email, phone, website, address, notes }).where(and(eq(suppliersTable.id, id), eq(suppliersTable.merchantId, req.session.merchantId!))).returning();
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(supplier);
});

router.delete("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(suppliersTable).where(and(eq(suppliersTable.id, id), eq(suppliersTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
