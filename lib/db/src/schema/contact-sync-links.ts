import { pgTable, text, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

/**
 * contact_sync_links — persistent map of a KoaPOS customer → the contact it
 * created on a connected account (Google / Microsoft).
 *
 * This is what makes contact sync a *true* sync instead of a blind re-push.
 * Without it, sync only matches existing contacts by email, so any customer
 * with a blank/changed email is treated as new and re-created on every run.
 * Once a customer has a link for a provider we update that exact remote contact
 * by its id, never re-creating it.
 *
 * `provider` is "google_contacts" | "microsoft_contacts".
 * `remoteContactId` is the Microsoft contact id, or the Google resourceName
 * ("people/c123…"). `remoteEtag` caches Google's etag (required to update a
 * contact); it is refreshed on each successful sync.
 */
export const contactSyncLinksTable = pgTable("contact_sync_links", {
  id:              serial("id").primaryKey(),
  merchantId:      integer("merchant_id").notNull().references(() => merchantsTable.id, { onDelete: "cascade" }),
  customerId:      integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  provider:        text("provider").notNull(),
  remoteContactId: text("remote_contact_id").notNull(),
  remoteEtag:      text("remote_etag"),
  lastSyncedAt:    timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  customerProviderIdx: uniqueIndex("contact_sync_links_merchant_customer_provider_idx").on(t.merchantId, t.customerId, t.provider),
  merchantProviderIdx: index("contact_sync_links_merchant_provider_idx").on(t.merchantId, t.provider),
}));

export type ContactSyncLink = typeof contactSyncLinksTable.$inferSelect;
export type InsertContactSyncLink = typeof contactSyncLinksTable.$inferInsert;
