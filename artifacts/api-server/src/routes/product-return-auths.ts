import { Router, type IRouter } from "express";
import { db, productReturnAuthsTable } from "@workspace/db";
import { eq, and, desc, max } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

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
        r.customerName.toLowerCase().includes(q) ||
        (r.items ?? "").toLowerCase().includes(q),
    );
  }
  res.json({
    items: rows.map((r) => ({ ...r, refundAmount: parseFloat(String(r.refundAmount)) })),
    total: rows.length,
  });
});

router.post("/return-auths", requireAuth, async (req, res): Promise<void> => {
  const mid = req.session.merchantId!;
  const { customerId, customerName, reason, items, refundAmount, status, notes } = req.body;
  if (!customerName) { res.status(400).json({ error: "customerName is required" }); return; }
  if (!items)        { res.status(400).json({ error: "items is required" }); return; }

  const [maxRow] = await db
    .select({ max: max(productReturnAuthsTable.id) })
    .from(productReturnAuthsTable)
    .where(eq(productReturnAuthsTable.merchantId, mid));
  const nextNum = (maxRow?.max ?? 0) + 1;
  const raNumber = `RA-${String(nextNum).padStart(4, "0")}`;

  const [ra] = await db
    .insert(productReturnAuthsTable)
    .values({
      merchantId: mid,
      raNumber,
      customerId: customerId ? parseInt(String(customerId)) : null,
      customerName,
      reason: reason ?? null,
      items,
      refundAmount: String(parseFloat(String(refundAmount)) || 0),
      status: status ?? "Pending",
      notes: notes ?? null,
    })
    .returning();
  res.status(201).json({ ...ra, refundAmount: parseFloat(String(ra.refundAmount)) });
});

router.patch("/return-auths/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const mid = req.session.merchantId!;
  const { customerId, customerName, reason, items, refundAmount, status, notes } = req.body;
  const [ra] = await db
    .update(productReturnAuthsTable)
    .set({
      ...(customerId !== undefined && { customerId: customerId ? parseInt(String(customerId)) : null }),
      ...(customerName !== undefined && { customerName }),
      ...(reason !== undefined && { reason }),
      ...(items !== undefined && { items }),
      ...(refundAmount !== undefined && { refundAmount: String(parseFloat(String(refundAmount)) || 0) }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
    })
    .where(and(eq(productReturnAuthsTable.id, id), eq(productReturnAuthsTable.merchantId, mid)))
    .returning();
  if (!ra) { res.status(404).json({ error: "Return authorisation not found" }); return; }
  res.json({ ...ra, refundAmount: parseFloat(String(ra.refundAmount)) });
});

router.delete("/return-auths/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  await db.delete(productReturnAuthsTable).where(
    and(eq(productReturnAuthsTable.id, id), eq(productReturnAuthsTable.merchantId, req.session.merchantId!)),
  );
  res.sendStatus(204);
});

export default router;
