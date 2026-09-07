import { pgTable, text, serial, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

/**
 * A merchant's uploaded media, one row per distinct file.
 *
 * Content-addressed: new uploads are stored at
 * `/objects/merchants/<merchantId>/assets/<sha256>`, so re-uploading the same
 * bytes resolves to the object that is already there instead of writing a
 * second copy. Several hundred products can therefore share one stored image.
 *
 * Rows are per-merchant, and the merchant id is baked into `objectPath`, so a
 * merchant only ever sees and serves its own uploads — dedup never crosses a
 * tenant boundary.
 */
export const merchantAssetsTable = pgTable("merchant_assets", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  // Hex SHA-256 of the file contents, computed by the client before upload.
  // Null only for legacy objects imported from before content-addressing.
  sha256:      text("sha256"),
  // Normalized storage path, e.g. "/objects/merchants/4/assets/<sha256>".
  objectPath:  text("object_path").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  sizeBytes:   integer("size_bytes").notNull().default(0),
  filename:    text("filename"),
  width:       integer("width"),
  height:      integer("height"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  // Dedup key. Partial, because legacy `uploads/<uuid>` objects imported by
  // the backfill can legitimately share a hash — only content-addressed
  // `assets/<sha256>` objects are guaranteed one-per-hash.
  uniqueIndex("merchant_assets_merchant_sha_idx")
    .on(t.merchantId, t.sha256)
    .where(sql`object_path LIKE '%/assets/%'`),
  uniqueIndex("merchant_assets_object_path_idx").on(t.objectPath),
  index("merchant_assets_merchant_id_idx").on(t.merchantId),
]);

export const insertMerchantAssetSchema = createInsertSchema(merchantAssetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMerchantAsset = z.infer<typeof insertMerchantAssetSchema>;
export type MerchantAsset       = typeof merchantAssetsTable.$inferSelect;
