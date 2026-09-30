import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";
import { serviceJobsTable } from "./service-jobs";

/**
 * Mail-in repairs: a customer fills in the shop's Mail-In form and posts their
 * device for free diagnostics. The request lives here until the parcel
 * arrives; "Received" in the POS then creates the service job (serviceJobId)
 * and the request becomes its paper trail.
 *
 * status: awaiting_postage → in_transit (tracking supplied) → received,
 *         or cancelled from either of the first two.
 *
 * The customer's link to add tracking carries a random token; only its
 * SHA-256 is stored (tokenHash). Created by scripts/src/add-mail-in-tables.ts.
 */
export const mailInRequestsTable = pgTable("mail_in_requests", {
  id:               serial("id").primaryKey(),
  merchantId:       integer("merchant_id").notNull().references(() => merchantsTable.id, { onDelete: "cascade" }),
  reference:        text("reference").notNull(),
  tokenHash:        text("token_hash").notNull(),
  status:           text("status").notNull().default("awaiting_postage"),
  customerId:       integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  firstName:        text("first_name").notNull(),
  lastName:         text("last_name"),
  email:            text("email").notNull(),
  phone:            text("phone").notNull(),
  street:           text("street").notNull(),
  suburb:           text("suburb").notNull(),
  state:            text("state").notNull(),
  postcode:         text("postcode").notNull(),
  deviceType:       text("device_type").notNull(),
  brandModel:       text("brand_model").notNull(),
  serialNumber:     text("serial_number"),
  fault:            text("fault").notNull(),
  accessories:      text("accessories"),
  agreedAt:         timestamp("agreed_at", { withTimezone: true }).notNull(),
  trackingCarrier:  text("tracking_carrier"),
  trackingNumber:   text("tracking_number"),
  trackingAddedAt:  timestamp("tracking_added_at", { withTimezone: true }),
  receivedAt:       timestamp("received_at", { withTimezone: true }),
  serviceJobId:     integer("service_job_id").references(() => serviceJobsTable.id, { onDelete: "set null" }),
  staffNotes:       text("staff_notes"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("mail_in_requests_merchant_reference_uniq").on(t.merchantId, t.reference),
  uniqueIndex("mail_in_requests_token_hash_uniq").on(t.tokenHash),
  index("mail_in_requests_merchant_status_idx").on(t.merchantId, t.status),
]);

/** Per-merchant Mail-In page settings. The address and hours are the business's
 *  own (Settings › Business Details); only the wording lives here. */
export const mailInSettingsTable = pgTable("mail_in_settings", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().unique().references(() => merchantsTable.id, { onDelete: "cascade" }),
  enabled:     text("enabled").notNull().default("true"),
  returnText:  text("return_text").notNull().default("Return postage is quoted with your repair. You can also collect it in store."),
  extraNotes:  text("extra_notes"),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MailInRequest = typeof mailInRequestsTable.$inferSelect;
export type MailInSettings = typeof mailInSettingsTable.$inferSelect;
