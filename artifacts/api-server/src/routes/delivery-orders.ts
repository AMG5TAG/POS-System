import { Router, type IRouter } from "express";
import { db, deliveryOrdersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { recordPaidOrderAsSale } from "../services/deliveryOrderSale";

const PostDeliveryOrder = z.object({
  orderId: z.string().min(1),
  number: z.string().min(1),
  channel: z.string().default("website"),
  customer: z.string().default(""),
  customerEmail: z.string().default(""),
  phone: z.string().default(""),
  address: z.string().default(""),
  city: z.string().default(""),
  postcode: z.string().default(""),
  state: z.string().default(""),
  shippingMethod: z.string().default(""),
  status: z.string().default("new"),
  placedAt: z.string().default(""),
  total: z.union([z.string(), z.number()]).transform(v => String(v)).default("0"),
  items: z.string().default("[]"),
  notes: z.string().default(""),
});

const PatchDeliveryOrder = z.object({
  channel: z.string(), customer: z.string(), customerEmail: z.string(),
  phone: z.string(), address: z.string(), city: z.string(),
  postcode: z.string(), state: z.string(), shippingMethod: z.string(),
  status: z.string(), placedAt: z.string(),
  total: z.string(),
  items: z.string(), notes: z.string(),
  /* Whether the money is actually in. Moving this to "paid" books the sale. */
  paymentStatus: z.enum(["pending", "paid", "refunded"]),
  paymentProvider: z.string(), paymentRef: z.string(),
}).partial();

const router: IRouter = Router();

router.get("/delivery-orders", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(deliveryOrdersTable).where(eq(deliveryOrdersTable.merchantId, merchantId));
  res.json({ items: items.map(r => ({ ...r, total: parseFloat(r.total as unknown as string) })), total: items.length });
});

router.post("/delivery-orders", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = PostDeliveryOrder.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { orderId, number, channel, customer, customerEmail, phone,
    address, city, postcode, state, shippingMethod, status, placedAt, total, items, notes } = parsed.data;
  const [row] = await db.insert(deliveryOrdersTable).values({
    merchantId, orderId, number, channel, customer, customerEmail, phone,
    address, city, postcode, state, shippingMethod, status, placedAt, total, items, notes,
  }).returning();
  res.status(201).json({ ...row, total: parseFloat(row.total as unknown as string) });
});

router.get("/delivery-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(deliveryOrdersTable)
    .where(and(eq(deliveryOrdersTable.id, id), eq(deliveryOrdersTable.merchantId, merchantId))).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, total: parseFloat(row.total as unknown as string) });
});

router.patch("/delivery-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PatchDeliveryOrder.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(deliveryOrdersTable)
    .set(parsed.data)
    .where(and(eq(deliveryOrdersTable.id, id), eq(deliveryOrdersTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  /* An online order is a claim on revenue until the money is in; marking it paid
     is what books it as a sale. Keyed on the order, so toggling the status back
     and forth never books it twice. Best-effort: the status change is already
     saved and is what the merchant asked for, so a booking failure is logged
     rather than handed back as a failed update. */
  if (parsed.data.paymentStatus === "paid") {
    try {
      await recordPaidOrderAsSale(merchantId, row);
    } catch (err) {
      console.error("Failed to record paid delivery order as a sale", err);
    }
  }

  res.json({ ...row, total: parseFloat(row.total as unknown as string) });
});

router.delete("/delivery-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(deliveryOrdersTable).where(and(eq(deliveryOrdersTable.id, id), eq(deliveryOrdersTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
