import * as schema from "@workspace/db";
import { and, eq } from "drizzle-orm";

/* Ids a request names must be this business's own.
 *
 * Every table is scoped by merchantId, and other businesses' rows are still in
 * the database (see "Single-business install"). A route that stores a
 * client-supplied customer, staff or job id without checking it lets a later
 * read — a calendar, the follow-ups list, an invoice, a reminder scheduler —
 * join through it to the other business's row: their customer's name and
 * contact details shown here, or messaged from here. Checked on write, so the
 * readers never meet a foreign id.
 *
 * `null`/`undefined` mean "not set" and always pass; anything else must be a
 * row of that table with this merchantId. */

// Table names, resolved only when an id is actually checked (a test that
// mocks @workspace/db with a handful of tables can still load the routes).
const TABLES = {
  customerId: ["customersTable", "Customer"],
  referredByCustomerId: ["customersTable", "Referring customer"],
  staffId: ["staffTable", "Staff member"],
  serviceJobId: ["serviceJobsTable", "Service job"],
  categoryId: ["categoriesTable", "Category"],
  brandId: ["brandsTable", "Brand"],
  supplierId: ["suppliersTable", "Supplier"],
} as const;

export type OwnedIdField = keyof typeof TABLES;

/** The error to answer with (400) when any given id is not this business's;
 *  null when they all are. */
export async function foreignIdError(
  merchantId: number,
  ids: Partial<Record<OwnedIdField, unknown>>,
): Promise<string | null> {
  for (const [field, raw] of Object.entries(ids) as Array<[OwnedIdField, unknown]>) {
    if (raw == null || raw === "" || raw === 0 || raw === false) continue; // "not set", as the routes read it
    const [tableName, label] = TABLES[field];
    const table = schema[tableName];
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return `${label} not found`;
    const [row] = await schema.db.select({ id: table.id }).from(table)
      .where(and(eq(table.id, id), eq(table.merchantId, merchantId))).limit(1);
    if (!row) return `${label} not found`;
  }
  return null;
}
