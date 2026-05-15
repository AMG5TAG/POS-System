import { Router, type IRouter } from "express";
import { db, invoicesTable, customersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function fmt(inv: typeof invoicesTable.$inferSelect) {
  return {
    ...inv,
    subtotal: parseFloat(inv.subtotal),
    taxTotal: parseFloat(inv.taxTotal),
    total: parseFloat(inv.total),
    dueDate: inv.dueDate?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

router.get("/invoices", requireAuth, async (req, res): Promise<void> => {
  const { status, limit = 50, offset = 0 } = req.query as Record<string, string>;
  const conditions = [eq(invoicesTable.merchantId, req.session.merchantId!)];
  if (status) conditions.push(eq(invoicesTable.status, status));
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(invoicesTable).where(and(...conditions));
  const items = await db.select().from(invoicesTable).where(and(...conditions)).orderBy(desc(invoicesTable.createdAt)).limit(parseInt(limit as string)).offset(parseInt(offset as string));
  res.json({ items: items.map(fmt), total: Number(countResult.count) });
});

router.post("/invoices", requireAuth, async (req, res): Promise<void> => {
  const { customerId, dueDate, notes, items: lineItems } = req.body as { customerId?: number; dueDate?: string; notes?: string; items?: Array<{ description: string; quantity: number; unitPrice: number; taxRate?: number }> };
  const lines = lineItems ?? [];
  const subtotal = lines.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxTotal = lines.reduce((s, i) => s + i.quantity * i.unitPrice * ((i.taxRate ?? 0) / 100), 0);
  const total = subtotal + taxTotal;
  const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(invoicesTable).where(eq(invoicesTable.merchantId, req.session.merchantId!));
  const invNumber = `INV-${String(Number(countRow.count) + 1).padStart(4, "0")}`;
  const [inv] = await db.insert(invoicesTable).values({
    merchantId: req.session.merchantId!,
    customerId: customerId ?? null,
    invoiceNumber: invNumber,
    status: "draft",
    subtotal: String(subtotal),
    taxTotal: String(taxTotal),
    total: String(total),
    dueDate: dueDate ? new Date(dueDate) : null,
    notes: notes ?? null,
  }).returning();
  res.status(201).json(fmt(inv));
});

router.patch("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { status, notes, dueDate } = req.body as { status?: string; notes?: string; dueDate?: string };
  const updates: Record<string, unknown> = {};
  if (status) { updates.status = status; if (status === "paid") updates.paidAt = new Date(); }
  if (notes !== undefined) updates.notes = notes;
  if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
  const [inv] = await db.update(invoicesTable).set(updates).where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, req.session.merchantId!))).returning();
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(fmt(inv));
});

router.delete("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
