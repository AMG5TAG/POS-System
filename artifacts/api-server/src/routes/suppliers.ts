import { Router, type IRouter } from "express";
import { db, suppliersTable, productsTable, purchaseOrdersTable, productReturnAuthsTable } from "@workspace/db";
import { eq, and, ilike, or, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireManagerOrApproval, requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
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

/* Merge suppliers into one. Products name their supplier as text
   (products.supplier), so those are renamed to the kept supplier — matched
   case- and space-insensitively, since the name was typed. Purchase orders and
   return authorisations point at the supplier's id and are repointed; a return
   keeps the supplier name printed on it at the time. The merged-away suppliers
   are then deleted. `dryRun` reports the counts and changes nothing. */
const MergeBody = z.object({
  targetId: z.number().int().positive(),
  sourceIds: z.array(z.number().int().positive()).min(1).max(100),
  dryRun: z.boolean().optional(),
});

router.post("/suppliers/merge", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = MergeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Choose a supplier to keep and at least one to merge into it" }); return; }
  const merchantId = req.session.merchantId!;
  const { targetId, dryRun } = parsed.data;
  const sourceIds = [...new Set(parsed.data.sourceIds)].filter((id) => id !== targetId);
  if (sourceIds.length === 0) { res.status(400).json({ error: "Choose at least one other supplier to merge" }); return; }

  const rows = await db.select({ id: suppliersTable.id, name: suppliersTable.name }).from(suppliersTable)
    .where(and(eq(suppliersTable.merchantId, merchantId), inArray(suppliersTable.id, [targetId, ...sourceIds])));
  const target = rows.find((r) => r.id === targetId);
  if (!target || rows.length !== sourceIds.length + 1) { res.status(404).json({ error: "One of those suppliers no longer exists" }); return; }
  const sourceNames = rows.filter((r) => r.id !== targetId).map((r) => r.name.trim().toLowerCase());

  const productMatch = and(
    eq(productsTable.merchantId, merchantId),
    inArray(sql`lower(trim(${productsTable.supplier}))`, sourceNames),
  );
  const poMatch = and(eq(purchaseOrdersTable.merchantId, merchantId), inArray(purchaseOrdersTable.supplierId, sourceIds));
  const raMatch = and(eq(productReturnAuthsTable.merchantId, merchantId), inArray(productReturnAuthsTable.supplierId, sourceIds));

  if (dryRun) {
    const [[p], [po], [ra]] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(productsTable).where(productMatch),
      db.select({ n: sql<number>`count(*)::int` }).from(purchaseOrdersTable).where(poMatch),
      db.select({ n: sql<number>`count(*)::int` }).from(productReturnAuthsTable).where(raMatch),
    ]);
    res.json({ products: p!.n, purchaseOrders: po!.n, returnAuths: ra!.n, suppliersRemoved: sourceIds.length });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const products = await tx.update(productsTable).set({ supplier: target.name }).where(productMatch).returning({ id: productsTable.id });
    const pos = await tx.update(purchaseOrdersTable).set({ supplierId: targetId }).where(poMatch).returning({ id: purchaseOrdersTable.id });
    const ras = await tx.update(productReturnAuthsTable).set({ supplierId: targetId }).where(raMatch).returning({ id: productReturnAuthsTable.id });
    await tx.delete(suppliersTable).where(and(eq(suppliersTable.merchantId, merchantId), inArray(suppliersTable.id, sourceIds)));
    return { products: products.length, purchaseOrders: pos.length, returnAuths: ras.length, suppliersRemoved: sourceIds.length };
  });
  res.json(result);
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

router.delete("/suppliers/:id", requireAuth, requireManagerOrApproval, async (req, res): Promise<void> => {
  const paramsResult = DeleteSupplierParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  await db.delete(suppliersTable).where(and(eq(suppliersTable.id, id), eq(suppliersTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
