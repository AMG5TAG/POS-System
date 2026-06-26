import { Router, type IRouter } from "express";
import { db, productReturnAuthsTable } from "@workspace/db";
import { eq, and, desc, max } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateProductReturnAuthParams, DeleteProductReturnAuthParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/return-auths", requireAuth, async (req, res): Promise<void> => {
  const { search, status } = req.query as { search?: string; status?: string };
  const mid = req.session.merchantId!;
  let rows = await db
    .select()
    .from(productReturnAuthsTable)
    .where(eq(productReturnAuthsTable.merchantId, mid))
    .orderBy(desc(productReturnAuthsTable.createdAt));

  if (status) rows = rows.filter((r) => r.status === status);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.raNumber.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q) ||
        (r.items ?? "").toLowerCase().includes(q) ||
        (r.supplierRmaNumber ?? "").toLowerCase().includes(q),
    );
  }
  res.json({ items: rows, total: rows.length });
});

router.post("/return-auths", requireAuth, async (req, res): Promise<void> => {
  const mid = req.session.merchantId!;
  const { supplierId, supplierName, purchaseOrderId, items, quantity, returnItems, attachments, reason, returnType, supplierRmaNumber, trackingNumber, status, notes } = req.body;
  if (!supplierName) { res.status(400).json({ error: "supplierName is required" }); return; }
  if (!items)        { res.status(400).json({ error: "items is required" }); return; }

  const [maxRow] = await db
    .select({ max: max(productReturnAuthsTable.id) })
    .from(productReturnAuthsTable)
    .where(eq(productReturnAuthsTable.merchantId, mid));
  const nextNum = (maxRow?.max ?? 0) + 1;
  const raNumber = `RMA-${String(nextNum).padStart(4, "0")}`;

  const [ra] = await db
    .insert(productReturnAuthsTable)
    .values({
      merchantId: mid,
      raNumber,
      supplierId: supplierId ? parseInt(String(supplierId)) : null,
      supplierName,
      purchaseOrderId: purchaseOrderId != null ? parseInt(String(purchaseOrderId)) : null,
      items,
      quantity: quantity != null ? Math.max(1, parseInt(String(quantity)) || 1) : 1,
      returnItems: returnItems ?? null,
      attachments: attachments ?? null,
      reason: reason ?? null,
      returnType: returnType ?? null,
      supplierRmaNumber: supplierRmaNumber ?? null,
      trackingNumber: trackingNumber ?? null,
      status: status ?? "Draft",
      notes: notes ?? null,
    })
    .returning();
  res.status(201).json(ra);
});

router.patch("/return-auths/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = UpdateProductReturnAuthParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const mid = req.session.merchantId!;
  const { supplierId, supplierName, purchaseOrderId, items, quantity, returnItems, attachments, reason, returnType, supplierRmaNumber, trackingNumber, status, notes } = req.body;
  const [ra] = await db
    .update(productReturnAuthsTable)
    .set({
      ...(supplierId !== undefined && { supplierId: supplierId ? parseInt(String(supplierId)) : null }),
      ...(supplierName !== undefined && { supplierName }),
      ...(purchaseOrderId !== undefined && { purchaseOrderId: purchaseOrderId != null ? parseInt(String(purchaseOrderId)) : null }),
      ...(items !== undefined && { items }),
      ...(quantity !== undefined && { quantity: Math.max(1, parseInt(String(quantity)) || 1) }),
      ...(returnItems !== undefined && { returnItems }),
      ...(attachments !== undefined && { attachments }),
      ...(reason !== undefined && { reason }),
      ...(returnType !== undefined && { returnType }),
      ...(supplierRmaNumber !== undefined && { supplierRmaNumber }),
      ...(trackingNumber !== undefined && { trackingNumber }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
    })
    .where(and(eq(productReturnAuthsTable.id, id), eq(productReturnAuthsTable.merchantId, mid)))
    .returning();
  if (!ra) { res.status(404).json({ error: "Return authorisation not found" }); return; }
  res.json(ra);
});

router.delete("/return-auths/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = DeleteProductReturnAuthParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  await db.delete(productReturnAuthsTable).where(
    and(eq(productReturnAuthsTable.id, id), eq(productReturnAuthsTable.merchantId, req.session.merchantId!)),
  );
  res.sendStatus(204);
});

export default router;
