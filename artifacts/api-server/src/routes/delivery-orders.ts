import { Router, type IRouter } from "express";
import { db, deliveryOrdersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";

const PatchDeliveryOrder = z.object({
  channel: z.string(), customer: z.string(), customerEmail: z.string(),
  phone: z.string(), address: z.string(), city: z.string(),
  postcode: z.string(), state: z.string(), shippingMethod: z.string(),
  status: z.string(), placedAt: z.string(),
  total: z.string(),
  items: z.string(), notes: z.string(),
}).partial();

const router: IRouter = Router();

router.get("/delivery-orders", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(deliveryOrdersTable).where(eq(deliveryOrdersTable.merchantId, merchantId));
  res.json({ items: items.map(r => ({ ...r, total: parseFloat(r.total as unknown as string) })), total: items.length });
});

router.post("/delivery-orders", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { orderId, number, channel = "website", customer = "", customerEmail = "", phone = "",
    address = "", city = "", postcode = "", state = "", shippingMethod = "",
    status = "new", placedAt = "", total = 0, items = "[]", notes = "" } = req.body;
  if (!orderId || !number) { res.status(400).json({ error: "orderId and number are required" }); return; }
  const [row] = await db.insert(deliveryOrdersTable).values({
    merchantId, orderId, number, channel, customer, customerEmail, phone,
    address, city, postcode, state, shippingMethod, status, placedAt, total, items, notes,
  }).returning();
  res.status(201).json({ ...row, total: parseFloat(row.total as unknown as string) });
});

router.patch("/delivery-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const parsed = PatchDeliveryOrder.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(deliveryOrdersTable)
    .set(parsed.data)
    .where(and(eq(deliveryOrdersTable.id, id), eq(deliveryOrdersTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, total: parseFloat(row.total as unknown as string) });
});

router.delete("/delivery-orders/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(deliveryOrdersTable).where(and(eq(deliveryOrdersTable.id, id), eq(deliveryOrdersTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
