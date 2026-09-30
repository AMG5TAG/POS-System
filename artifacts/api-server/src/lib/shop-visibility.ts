import { productsTable, categoriesTable } from "@workspace/db";
import { and, eq, sql, type SQL } from "drizzle-orm";

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
