import { Router, type IRouter } from "express";
import { db, productRecallsTable } from "@workspace/db";
import { eq, and, or, ilike, desc, max } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/recalls", requireAuth, async (req, res): Promise<void> => {
  const { search, status } = req.query as { search?: string; status?: string };
  const mid = req.session.merchantId!;
  let rows = await db
    .select()
    .from(productRecallsTable)
    .where(eq(productRecallsTable.merchantId, mid))
    .orderBy(desc(productRecallsTable.createdAt));

  if (status) rows = rows.filter((r) => r.status === status);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.recallId.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q),
    );
  }
  res.json({ items: rows, total: rows.length });
});

router.post("/recalls", requireAuth, async (req, res): Promise<void> => {
  const mid = req.session.merchantId!;
  const { productId, productName, reason, severity, status, affectedBatch, notes } = req.body;
  if (!productName) { res.status(400).json({ error: "productName is required" }); return; }
  if (!reason)      { res.status(400).json({ error: "reason is required" }); return; }

  const [maxRow] = await db
    .select({ max: max(productRecallsTable.id) })
    .from(productRecallsTable)
    .where(eq(productRecallsTable.merchantId, mid));
  const nextNum = (maxRow?.max ?? 0) + 1;
  const recallId = `RC-${String(nextNum).padStart(4, "0")}`;

  const [recall] = await db
    .insert(productRecallsTable)
    .values({
      merchantId: mid,
      recallId,
      productId: productId ? parseInt(String(productId)) : null,
      productName,
      reason,
      severity: severity ?? "Medium",
      status: status ?? "Active",
      affectedBatch: affectedBatch ?? null,
      notes: notes ?? null,
    })
    .returning();
  res.status(201).json(recall);
});

router.patch("/recalls/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const mid = req.session.merchantId!;
  const { productId, productName, reason, severity, status, affectedBatch, notes } = req.body;
  const [recall] = await db
    .update(productRecallsTable)
    .set({
      ...(productId !== undefined && { productId: productId ? parseInt(String(productId)) : null }),
      ...(productName !== undefined && { productName }),
      ...(reason !== undefined && { reason }),
      ...(severity !== undefined && { severity }),
      ...(status !== undefined && { status }),
      ...(affectedBatch !== undefined && { affectedBatch }),
      ...(notes !== undefined && { notes }),
    })
    .where(and(eq(productRecallsTable.id, id), eq(productRecallsTable.merchantId, mid)))
    .returning();
  if (!recall) { res.status(404).json({ error: "Recall not found" }); return; }
  res.json(recall);
});

router.delete("/recalls/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  await db.delete(productRecallsTable).where(
    and(eq(productRecallsTable.id, id), eq(productRecallsTable.merchantId, req.session.merchantId!)),
  );
  res.sendStatus(204);
});

export default router;
