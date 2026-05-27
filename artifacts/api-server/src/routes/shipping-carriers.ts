import { Router, type IRouter } from "express";
import { db, shippingCarriersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/api/shipping-carriers", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(shippingCarriersTable).where(eq(shippingCarriersTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.put("/api/shipping-carriers/:carrierId/connect", requireAuth, async (req, res): Promise<void> => {
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
