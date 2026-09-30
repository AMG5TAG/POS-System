import { Router, type IRouter } from "express";
import { db, productsTable, categoriesTable } from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { shopOrigin } from "../lib/publicUrl";

/**
 * Management › Online Store — the POS side of shop.koastal.com.au.
 *
 * The shop lists a product when it is active AND `show_online` is on
 * (routes/shop.ts). This is where `show_online` is set. Only active products
 * are offered: an inactive product is off the shop whatever the flag says.
 */

const router: IRouter = Router();

router.get("/online-store/summary", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db
    .select({
      listed: sql<number>`count(*) filter (where ${productsTable.showOnline} = 'true')::int`,
      hidden: sql<number>`count(*) filter (where ${productsTable.showOnline} <> 'true')::int`,
    })
    .from(productsTable)
    .where(and(eq(productsTable.merchantId, merchantId), eq(productsTable.isActive, "true")));
  res.json({ shopUrl: shopOrigin(), listed: row?.listed ?? 0, hidden: row?.hidden ?? 0 });
});

router.get("/online-store/products", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      sku: productsTable.sku,
      price: productsTable.price,
      imageUrl: productsTable.imageUrl,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      showOnline: productsTable.showOnline,
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
    .where(and(eq(productsTable.merchantId, merchantId), eq(productsTable.isActive, "true")))
    .orderBy(asc(productsTable.name));
  res.json(rows.map((r) => ({ ...r, price: parseFloat(r.price), showOnline: r.showOnline === "true" })));
});

const SetVisibility = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(10000),
  showOnline: z.boolean(),
});

router.patch("/online-store/products", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = SetVisibility.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Expected { ids: number[], showOnline: boolean }" }); return; }
  const merchantId = req.session.merchantId!;
  const updated = await db
    .update(productsTable)
    .set({ showOnline: parsed.data.showOnline ? "true" : "false" })
    .where(and(eq(productsTable.merchantId, merchantId), inArray(productsTable.id, parsed.data.ids)))
    .returning({ id: productsTable.id });
  res.json({ updated: updated.length });
});

export default router;
