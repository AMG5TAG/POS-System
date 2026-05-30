import { Router, type IRouter } from "express";
import { db, lowStockAlertSettingsTable, lowStockAlertLogTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { z } from "zod/v4";

const router: IRouter = Router();

function fmt(row: typeof lowStockAlertSettingsTable.$inferSelect) {
  return {
    id: row.id,
    merchantId: row.merchantId,
    enabled: row.enabled,
    emailAddresses: JSON.parse(row.emailAddresses ?? "[]") as string[],
    mode: row.mode,
    globalThreshold: row.globalThreshold ?? null,
  };
}

function fmtLog(row: typeof lowStockAlertLogTable.$inferSelect) {
  return {
    id: row.id,
    merchantId: row.merchantId,
    sentAt: row.sentAt.toISOString(),
    mode: row.mode,
    itemCount: row.itemCount,
    emailAddresses: JSON.parse(row.emailAddresses ?? "[]") as string[],
    items: JSON.parse(row.items ?? "[]"),
  };
}

router.get("/low-stock-alert-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [existing] = await db.select().from(lowStockAlertSettingsTable).where(eq(lowStockAlertSettingsTable.merchantId, merchantId));
  if (existing) {
    res.json(fmt(existing));
    return;
  }
  const [created] = await db.insert(lowStockAlertSettingsTable).values({ merchantId }).returning();
  res.json(fmt(created!));
});

const UpdateSchema = z.object({
  enabled: z.string().optional(),
  emailAddresses: z.array(z.string().email()).optional(),
  mode: z.enum(["immediate", "digest"]).optional(),
  globalThreshold: z.number().int().min(0).nullable().optional(),
});

router.put("/low-stock-alert-settings", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const merchantId = req.session.merchantId!;
  const data = parsed.data;

  const updates: Record<string, unknown> = {};
  if (data.enabled !== undefined) updates.enabled = data.enabled;
  if (data.emailAddresses !== undefined) updates.emailAddresses = JSON.stringify(data.emailAddresses);
  if (data.mode !== undefined) updates.mode = data.mode;
  if ("globalThreshold" in data) updates.globalThreshold = data.globalThreshold ?? null;

  const [existing] = await db.select({ id: lowStockAlertSettingsTable.id }).from(lowStockAlertSettingsTable).where(eq(lowStockAlertSettingsTable.merchantId, merchantId));
  if (existing) {
    await db.update(lowStockAlertSettingsTable).set(updates).where(eq(lowStockAlertSettingsTable.merchantId, merchantId));
  } else {
    await db.insert(lowStockAlertSettingsTable).values({ merchantId, ...updates });
  }

  const [row] = await db.select().from(lowStockAlertSettingsTable).where(eq(lowStockAlertSettingsTable.merchantId, merchantId));
  res.json(fmt(row!));
});

router.get("/low-stock-alert-log", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const limit = Math.min(parseInt(req.query["limit"] as string ?? "20"), 100);
  const offset = parseInt(req.query["offset"] as string ?? "0");

  const [rows, countResult] = await Promise.all([
    db.select().from(lowStockAlertLogTable)
      .where(eq(lowStockAlertLogTable.merchantId, merchantId))
      .orderBy(desc(lowStockAlertLogTable.sentAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<string>`count(*)` }).from(lowStockAlertLogTable).where(eq(lowStockAlertLogTable.merchantId, merchantId)),
  ]);

  res.json({ items: rows.map(fmtLog), total: Number(countResult[0]?.count ?? 0) });
});

export default router;
