import { Router, type IRouter } from "express";
import { db, shippingCarriersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/shipping-carriers", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(shippingCarriersTable).where(eq(shippingCarriersTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.get("/shipping-carriers/:carrierId", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const carrierId = req.params.carrierId as string;
  const [row] = await db.select().from(shippingCarriersTable)
    .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId))).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/shipping-carriers/:carrierId", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const carrierId = req.params.carrierId as string;
  const { apiKey, webhookSecret, config } = req.body as Partial<{ apiKey: string; webhookSecret: string; config: string }>;
  const update: Partial<{ apiKey: string; webhookSecret: string; config: string }> = {};
  if (apiKey !== undefined) update.apiKey = apiKey;
  if (webhookSecret !== undefined) update.webhookSecret = webhookSecret;
  if (config !== undefined) update.config = config;
  const [existing] = await db.select().from(shippingCarriersTable)
    .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId))).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(shippingCarriersTable).set(update)
    .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId))).returning();
  res.json(row);
});

router.delete("/shipping-carriers/:carrierId", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const carrierId = req.params.carrierId as string;
  await db.delete(shippingCarriersTable)
    .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId)));
  res.status(204).end();
});

router.put("/shipping-carriers/:carrierId/connect", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const carrierId = req.params.carrierId as string;
  const { connected } = req.body as { connected: boolean };
  const connectedStr = String(connected);
  const [existing] = await db.select().from(shippingCarriersTable)
    .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId))).limit(1);
  if (existing) {
    const [updated] = await db.update(shippingCarriersTable).set({ connected: connectedStr })
      .where(and(eq(shippingCarriersTable.merchantId, merchantId), eq(shippingCarriersTable.carrierId, carrierId))).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(shippingCarriersTable).values({ merchantId, carrierId, connected: connectedStr }).returning();
  res.json(created);
});

export default router;
