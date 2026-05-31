import { Router, type IRouter } from "express";
import { db, suppliersTable } from "@workspace/db";
import { eq, and, ilike, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateSupplierParams, DeleteSupplierParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const { search } = req.query as { search?: string };
  const conditions = [eq(suppliersTable.merchantId, req.session.merchantId!)];
  if (search) conditions.push(or(ilike(suppliersTable.name, `%${search}%`), ilike(suppliersTable.email, `%${search}%`))!);
  const suppliers = await db.select().from(suppliersTable).where(and(...conditions)).orderBy(suppliersTable.name);
  res.json({ items: suppliers, total: suppliers.length });
});

router.post("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const {
    name, accountNumber, website, paymentTerms, notes,
    logoUrl, street, city, state, postcode, country, address,
    contacts,
    raPortalLink, raProcedure,
    creditAccountNumber, creditLimit, creditTerms, creditContactName,
    contactName, email, phone,
  } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [supplier] = await db.insert(suppliersTable).values({
    name, accountNumber, website, paymentTerms, notes,
    logoUrl, street, city, state, postcode, country, address,
    contacts: contacts ? JSON.stringify(contacts) : null,
    raPortalLink, raProcedure,
    creditAccountNumber, creditLimit, creditTerms, creditContactName,
    contactName, email, phone,
    merchantId: req.session.merchantId!,
  }).returning();
  res.status(201).json(supplier);
});

router.patch("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = UpdateSupplierParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const {
    name, accountNumber, website, paymentTerms, notes,
    logoUrl, street, city, state, postcode, country, address,
    contacts,
    raPortalLink, raProcedure,
    creditAccountNumber, creditLimit, creditTerms, creditContactName,
    contactName, email, phone,
  } = req.body;
  const [supplier] = await db.update(suppliersTable).set({
    name, accountNumber, website, paymentTerms, notes,
    logoUrl, street, city, state, postcode, country, address,
    contacts: contacts !== undefined ? (contacts ? JSON.stringify(contacts) : null) : undefined,
    raPortalLink, raProcedure,
    creditAccountNumber, creditLimit, creditTerms, creditContactName,
    contactName, email, phone,
  }).where(and(eq(suppliersTable.id, id), eq(suppliersTable.merchantId, req.session.merchantId!))).returning();
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(supplier);
});

router.delete("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = DeleteSupplierParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  await db.delete(suppliersTable).where(and(eq(suppliersTable.id, id), eq(suppliersTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
