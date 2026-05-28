import { Router, type IRouter } from "express";
import { db, onlineStoreSettingsTable, onlineStoreThirdpartyTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/online-store-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(onlineStoreSettingsTable).where(eq(onlineStoreSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(onlineStoreSettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/online-store-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Partial<typeof onlineStoreSettingsTable.$inferInsert>;
  const [existing] = await db.select().from(onlineStoreSettingsTable).where(eq(onlineStoreSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(onlineStoreSettingsTable).set(body).where(eq(onlineStoreSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(onlineStoreSettingsTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

router.get("/online-store-thirdparty", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(onlineStoreThirdpartyTable).where(eq(onlineStoreThirdpartyTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(onlineStoreThirdpartyTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/online-store-thirdparty", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Partial<typeof onlineStoreThirdpartyTable.$inferInsert>;
  const [existing] = await db.select().from(onlineStoreThirdpartyTable).where(eq(onlineStoreThirdpartyTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(onlineStoreThirdpartyTable).set(body).where(eq(onlineStoreThirdpartyTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(onlineStoreThirdpartyTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

export default router;
