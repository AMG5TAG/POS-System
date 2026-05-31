import { Router, type IRouter } from "express";
import { db, productPreOrdersTable } from "@workspace/db";
import { eq, and, desc, max } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateProductPreOrderParams, DeleteProductPreOrderParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/pre-orders", requireAuth, async (req, res): Promise<void> => {
  const { search, status } = req.query as { search?: string; status?: string };
  const mid = req.session.merchantId!;
  let rows = await db
    .select()
    .from(productPreOrdersTable)
    .where(eq(productPreOrdersTable.merchantId, mid))
    .orderBy(desc(productPreOrdersTable.createdAt));

  if (status) rows = rows.filter((r) => r.status === status);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.poNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q),
    );
  }
  res.json({
    items: rows.map((r) => ({ ...r, depositAmount: parseFloat(String(r.depositAmount)) })),
    total: rows.length,
  });
});

router.post("/pre-orders", requireAuth, async (req, res): Promise<void> => {
  const mid = req.session.merchantId!;
  const { customerId, customerName, productId, productName, quantity, depositAmount, status, expectedDate, notes } = req.body;
  if (!customerName) { res.status(400).json({ error: "customerName is required" }); return; }
  if (!productName)  { res.status(400).json({ error: "productName is required" }); return; }

  const [maxRow] = await db
    .select({ max: max(productPreOrdersTable.id) })
    .from(productPreOrdersTable)
    .where(eq(productPreOrdersTable.merchantId, mid));
  const nextNum = (maxRow?.max ?? 0) + 1;
  const poNumber = `PRE-${String(nextNum).padStart(4, "0")}`;

  const [order] = await db
    .insert(productPreOrdersTable)
    .values({
      merchantId: mid,
      poNumber,
      customerId: customerId ? parseInt(String(customerId)) : null,
      customerName,
      productId: productId ? parseInt(String(productId)) : null,
      productName,
      quantity: parseInt(String(quantity)) || 1,
      depositAmount: String(parseFloat(String(depositAmount)) || 0),
      status: status ?? "Pending",
      expectedDate: expectedDate ?? null,
      notes: notes ?? null,
    })
    .returning();
  res.status(201).json({ ...order, depositAmount: parseFloat(String(order.depositAmount)) });
});

router.patch("/pre-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = UpdateProductPreOrderParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const mid = req.session.merchantId!;
  const { customerId, customerName, productId, productName, quantity, depositAmount, status, expectedDate, notes } = req.body;
  const [order] = await db
    .update(productPreOrdersTable)
    .set({
      ...(customerId !== undefined && { customerId: customerId ? parseInt(String(customerId)) : null }),
      ...(customerName !== undefined && { customerName }),
      ...(productId !== undefined && { productId: productId ? parseInt(String(productId)) : null }),
      ...(productName !== undefined && { productName }),
      ...(quantity !== undefined && { quantity: parseInt(String(quantity)) || 1 }),
      ...(depositAmount !== undefined && { depositAmount: String(parseFloat(String(depositAmount)) || 0) }),
      ...(status !== undefined && { status }),
      ...(expectedDate !== undefined && { expectedDate }),
      ...(notes !== undefined && { notes }),
    })
    .where(and(eq(productPreOrdersTable.id, id), eq(productPreOrdersTable.merchantId, mid)))
    .returning();
  if (!order) { res.status(404).json({ error: "Pre-order not found" }); return; }
  res.json({ ...order, depositAmount: parseFloat(String(order.depositAmount)) });
});

router.delete("/pre-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = DeleteProductPreOrderParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  await db.delete(productPreOrdersTable).where(
    and(eq(productPreOrdersTable.id, id), eq(productPreOrdersTable.merchantId, req.session.merchantId!)),
  );
  res.sendStatus(204);
});

export default router;
