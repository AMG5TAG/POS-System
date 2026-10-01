import { Router, type IRouter } from "express";
import { db, productsTable, categoriesTable, shopSettingsTable } from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { shopOrigin } from "../lib/publicUrl";
import { shopVisible, notInHiddenCategory, shopListable, shopHidesOutOfStock, inStockSql } from "../lib/shop-visibility";

/**
 * Management › Online Store — the POS side of koastal.com.au/shop.
 *
 * The shop lists a product when it is active, its `show_online` is on and no
 * category above it is hidden (lib/shop-visibility.ts). This is where both
 * flags are set. Only active products are offered: an inactive product is off
 * the shop whatever the flags say.
 */

const router: IRouter = Router();

router.get("/online-store/summary", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const hideOutOfStock = await shopHidesOutOfStock(merchantId);
  const [row] = await db
    .select({
      listed: sql<number>`count(*) filter (where ${shopListable(merchantId, hideOutOfStock)})::int`,
      hidden: sql<number>`count(*) filter (where not ${shopVisible(merchantId)})::int`,
      // Listed on the shop but out of stock: hidden too while the option is on.
      outOfStock: sql<number>`count(*) filter (where ${shopVisible(merchantId)} and not ${inStockSql()})::int`,
    })
    .from(productsTable)
    .where(and(eq(productsTable.merchantId, merchantId), eq(productsTable.isActive, "true")));
  res.json({ shopUrl: shopOrigin(), listed: row?.listed ?? 0, hidden: row?.hidden ?? 0, outOfStock: row?.outOfStock ?? 0, hideOutOfStock });
});

const SettingsBody = z.object({ hideOutOfStock: z.boolean() });

router.put("/online-store/settings", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = SettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid settings" }); return; }
  const merchantId = req.session.merchantId!;
  const value = parsed.data.hideOutOfStock ? "true" : "false";
  await db.insert(shopSettingsTable).values({ merchantId, hideOutOfStock: value })
    .onConflictDoUpdate({ target: shopSettingsTable.merchantId, set: { hideOutOfStock: value } });
  res.json({ hideOutOfStock: parsed.data.hideOutOfStock });
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
      categoryShown: sql<boolean>`${notInHiddenCategory(merchantId)}`,
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

/* Categories: hiding one hides its subcategories and every product in them,
   including products added later. */

router.get("/online-store/categories", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const cats = await db
    .select({ id: categoriesTable.id, name: categoriesTable.name, parentId: categoriesTable.parentId, color: categoriesTable.color, icon: categoriesTable.icon, showOnline: categoriesTable.showOnline })
    .from(categoriesTable)
    .where(eq(categoriesTable.merchantId, merchantId))
    .orderBy(categoriesTable.sortOrder, categoriesTable.name); // the Categories page's order
  const counts = await db
    .select({ categoryId: productsTable.categoryId, n: sql<number>`count(*)::int` })
    .from(productsTable)
    .where(and(eq(productsTable.merchantId, merchantId), eq(productsTable.isActive, "true")))
    .groupBy(productsTable.categoryId);
  const countBy = new Map(counts.map((c) => [c.categoryId, c.n]));
  res.json(cats.map((c) => ({ ...c, showOnline: c.showOnline === "true", productCount: countBy.get(c.id) ?? 0 })));
});

router.patch("/online-store/categories", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = SetVisibility.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Expected { ids: number[], showOnline: boolean }" }); return; }
  const merchantId = req.session.merchantId!;
  const updated = await db
    .update(categoriesTable)
    .set({ showOnline: parsed.data.showOnline ? "true" : "false" })
    .where(and(eq(categoriesTable.merchantId, merchantId), inArray(categoriesTable.id, parsed.data.ids)))
    .returning({ id: categoriesTable.id });
  res.json({ updated: updated.length });
});

export default router;
