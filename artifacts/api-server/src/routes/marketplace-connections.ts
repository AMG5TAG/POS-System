import { Router, type IRouter } from "express";
import { db, marketplaceConnectionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/api/marketplace-connections", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(marketplaceConnectionsTable).where(eq(marketplaceConnectionsTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.put("/api/marketplace-connections/:marketplaceId", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const marketplaceId = req.params.marketplaceId as string;
  const { connected, connectedAt = "", lastSync = "", productsCount = 0, ordersCount = 0, config = "{}" } = req.body;
  const [existing] = await db.select().from(marketplaceConnectionsTable)
    .where(and(eq(marketplaceConnectionsTable.merchantId, merchantId), eq(marketplaceConnectionsTable.marketplaceId, marketplaceId))).limit(1);
  if (existing) {
    const [updated] = await db.update(marketplaceConnectionsTable)
      .set({ connected, connectedAt, lastSync, productsCount, ordersCount, config })
      .where(and(eq(marketplaceConnectionsTable.merchantId, merchantId), eq(marketplaceConnectionsTable.marketplaceId, marketplaceId))).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(marketplaceConnectionsTable)
    .values({ merchantId, marketplaceId, connected, connectedAt, lastSync, productsCount, ordersCount, config }).returning();
  res.json(created);
});

export default router;
