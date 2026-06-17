import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Per-merchant automatic sync schedule for pushing customers → account contacts
 * and appointments → account calendar (Sync → Customer Sync).
 *
 * Frequency values: "disabled" | "instant" | "8h" | "24h" | "monthly".
 *  - "instant" is event-driven: a sync is triggered shortly after a customer
 *    (contacts) or appointment (calendar) is created/updated.
 *  - "8h" | "24h" | "monthly" are handled by the polling auto-sync scheduler,
 *    which runs a sync once the interval has elapsed since the last run.
 *
 * `*Provider` is which connected account to target
 * ("google_contacts" | "microsoft_contacts").
 */
export const merchantAutoSyncSettingsTable = pgTable("merchant_auto_sync_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().unique().references(() => merchantsTable.id, { onDelete: "cascade" }),

  contactsProvider: text("contacts_provider").notNull().default(""),
  contactsFrequency: text("contacts_frequency").notNull().default("disabled"),
  contactsIncludeNotes: boolean("contacts_include_notes").notNull().default(false),
  contactsLastSyncAt: timestamp("contacts_last_sync_at", { withTimezone: true }),

  calendarProvider: text("calendar_provider").notNull().default(""),
  calendarFrequency: text("calendar_frequency").notNull().default("disabled"),
  calendarLastSyncAt: timestamp("calendar_last_sync_at", { withTimezone: true }),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MerchantAutoSyncSettings = typeof merchantAutoSyncSettingsTable.$inferSelect;
