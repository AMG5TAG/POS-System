import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { Router, type IRouter } from "express";
import { db, shippingCarriersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/* Carrier API keys and webhook secrets are write-only: responses carry a
   placeholder, and sending the placeholder back leaves the stored value. */
const MASK = "****";
type CarrierRow = typeof shippingCarriersTable.$inferSelect;
const publicCarrier = (r: CarrierRow) => ({ ...r, apiKey: r.apiKey ? MASK : null, webhookSecret: r.webhookSecret ? MASK : null });

router.get("/shipping-carriers", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(shippingCarriersTable).where(eq(shippingCarriersTable.merchantId, merchantId));
  res.json({ items: items.map(publicCarrier), total: items.length });
});

router.get("/shipping-carriers/:carrierId", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const carrierId = req.params.carrierId as string;
  const [row] = await db.select().from(shippingCarriersTable)
    .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId))).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(publicCarrier(row));
});

router.patch("/shipping-carriers/:carrierId", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const carrierId = req.params.carrierId as string;
  const { apiKey, webhookSecret, config } = req.body as Partial<{ apiKey: string; webhookSecret: string; config: string }>;
  const update: Partial<{ apiKey: string; webhookSecret: string; config: string }> = {};
  if (apiKey !== undefined && apiKey !== MASK) update.apiKey = apiKey;
  if (webhookSecret !== undefined && webhookSecret !== MASK) update.webhookSecret = webhookSecret;
  if (config !== undefined) update.config = config;
  const [existing] = await db.select().from(shippingCarriersTable)
    .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId))).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(shippingCarriersTable).set(update)
    .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId))).returning();
  res.json(publicCarrier(row!));
});

router.delete("/shipping-carriers/:carrierId", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const carrierId = req.params.carrierId as string;
  await db.delete(shippingCarriersTable)
    .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId)));
  res.status(204).end();
});

router.put("/shipping-carriers/:carrierId/connect", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const carrierId = req.params.carrierId as string;
  const { connected } = req.body as { connected: boolean };
  const connectedStr = String(connected);
  const [existing] = await db.select().from(shippingCarriersTable)
    .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId))).limit(1);
  if (existing) {
    const [updated] = await db.update(shippingCarriersTable).set({ connected: connectedStr })
      .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId))).returning();
    res.json(publicCarrier(updated!)); return;
  }
  const [created] = await db.insert(shippingCarriersTable).values({ merchantId, carrierId, connected: connectedStr }).returning();
  res.json(publicCarrier(created!));
});

export default router;
