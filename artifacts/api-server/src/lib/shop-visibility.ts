import { db, productsTable, categoriesTable, shopSettingsTable } from "@workspace/db";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { localDate } from "./pre-orders";

/**
 * Whether a product is on the online shop — the one rule for every shop query
 * and for the Online Store screens' counts. A product is listed when it is
 * active, its own `show_online` is on, and neither its category nor any
 * category above it is hidden (`categories.show_online`). Hiding a category
 * therefore hides its subcategories and any product added to it later.
 */
export function shopVisible(merchantId: number): SQL {
  return and(
    eq(productsTable.merchantId, merchantId),
    eq(productsTable.isActive, "true"),
    eq(productsTable.showOnline, "true"),
    notInHiddenCategory(merchantId),
  )!;
}

/** True for a product with no category, or whose category and ancestors are all shown. */
export function notInHiddenCategory(merchantId: number): SQL {
  return sql`(${productsTable.categoryId} IS NULL OR ${productsTable.categoryId} NOT IN (
    WITH RECURSIVE hidden AS (
      SELECT id FROM ${categoriesTable}
      WHERE ${categoriesTable.merchantId} = ${merchantId} AND ${categoriesTable.showOnline} <> 'true'
      UNION
      SELECT c.id FROM ${categoriesTable} c JOIN hidden h ON c.parent_id = h.id
    )
    SELECT id FROM hidden
  ))`;
}

/**
 * In stock, as the shop shows it: a product type that doesn't track stock
 * (services) is always available, as is a product not tracking inventory or
 * one on pre-order (sold before its stock exists, so never "out of stock").
 * Written as a subquery so it works whether or not the caller joins
 * product_types.
 */
export function inStockSql(today = localDate("Australia/Sydney")): SQL {
  return sql`(${productsTable.trackInventory} <> 'true' OR ${productsTable.stockQuantity} > 0 OR EXISTS (
    SELECT 1 FROM product_types pt WHERE pt.id = ${productsTable.productTypeId} AND pt.track_stock = false
  ) OR (
    ${productsTable.preOrder} = 'true' AND (${productsTable.preOrderReleaseDate} IS NULL OR ${productsTable.preOrderReleaseDate} > ${today})
  ))`;
}

/** Whether the merchant has chosen to leave out-of-stock products out of listings. */
export async function shopHidesOutOfStock(merchantId: number): Promise<boolean> {
  const [row] = await db.select({ v: shopSettingsTable.hideOutOfStock }).from(shopSettingsTable)
    .where(eq(shopSettingsTable.merchantId, merchantId)).limit(1);
  return row?.v === "true";
}

/**
 * What the shop *lists* — catalogue, search, category counts, related products,
 * "Just purchased": shopVisible, less out-of-stock products when the merchant
 * hides them. Product pages, carts and wishlists use shopVisible alone, so a
 * link a shopper already has keeps working and shows "Out of stock".
 */
export function shopListable(merchantId: number, hideOutOfStock: boolean): SQL {
  return hideOutOfStock ? and(shopVisible(merchantId), inStockSql())! : shopVisible(merchantId);
}
