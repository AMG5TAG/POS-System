import { Router, type IRouter } from "express";
import { db, posSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/pos-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db
    .select()
    .from(posSettingsTable)
    .where(eq(posSettingsTable.merchantId, merchantId))
    .limit(1);
  if (!row) {
    const [created] = await db
      .insert(posSettingsTable)
      .values({ merchantId })
      .returning();
    res.json(created);
    return;
  }
  res.json(row);
});

router.put("/pos-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const {
    enabledPaymentMethods,
    enabledIntegrationPayments,
    gridColumns,
    gridTileSize,
    gridShowPrices,
    gridShowStockBadges,
    gridCartPosition,
    forceStaffLogin,
    staffLoginMessage,
    activeRegisterId,
    hardwareConfig,
    enabledShortcuts,
    roleDiscountLimits,
  } = req.body as Partial<typeof posSettingsTable.$inferInsert>;

  const patch = {
    ...(enabledPaymentMethods !== undefined && { enabledPaymentMethods }),
    ...(enabledIntegrationPayments !== undefined && { enabledIntegrationPayments }),
    ...(gridColumns !== undefined && { gridColumns }),
    ...(gridTileSize !== undefined && { gridTileSize }),
    ...(gridShowPrices !== undefined && { gridShowPrices }),
    ...(gridShowStockBadges !== undefined && { gridShowStockBadges }),
    ...(gridCartPosition !== undefined && { gridCartPosition }),
    ...(forceStaffLogin !== undefined && { forceStaffLogin }),
    ...(staffLoginMessage !== undefined && { staffLoginMessage }),
    ...(activeRegisterId !== undefined && { activeRegisterId }),
    ...(hardwareConfig !== undefined && { hardwareConfig }),
    ...(enabledShortcuts !== undefined && { enabledShortcuts }),
    ...(roleDiscountLimits !== undefined && { roleDiscountLimits }),
  };

  const [existing] = await db
    .select()
    .from(posSettingsTable)
    .where(eq(posSettingsTable.merchantId, merchantId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(posSettingsTable)
      .set(patch)
      .where(eq(posSettingsTable.merchantId, merchantId))
      .returning();
    res.json(updated);
    return;
  }

  const [created] = await db
    .insert(posSettingsTable)
    .values({ merchantId, ...patch })
    .returning();
  res.json(created);
});

export default router;
