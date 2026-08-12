import { pgTable, text, serial, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

/**
 * Follow Up (Marketing → Follow Up) — chases customers a set time *after* a
 * service job or appointment was completed ("how did the repair go?", "time for
 * your next service"). The due list is computed on the fly from
 * `service_jobs.completed_at` / `appointments.scheduled_at`; only the merchant's
 * window preference, the message templates, and the send history live here.
 */

/** Reusable email/SMS message bodies with `{{shortcode}}` placeholders. */
export const followUpTemplatesTable = pgTable("follow_up_templates", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:       text("name").notNull(),
  // "email" | "sms" | "both" — which channels this template can be sent on.
  channel:    text("channel").notNull().default("email"),
  // Email subject line; ignored for SMS sends.
  subject:    text("subject").notNull().default(""),
  // Email body (HTML) — also used as the SMS body once tags are stripped.
  body:       text("body").notNull().default(""),
  // Optional dedicated SMS body; falls back to a plain-text render of `body`.
  smsBody:    text("sms_body").notNull().default(""),
  // Text "true"/"false" — the template pre-selected when opening the send dialog.
  isDefault:  text("is_default").notNull().default("false"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("follow_up_templates_merchant_id_idx").on(t.merchantId),
]);

/**
 * One row per follow-up message dispatched. Doubles as the "already followed up"
 * marker that hides a record from the due list, so failed attempts are recorded
 * too (status "failed") without suppressing a retry.
 */
export const followUpLogTable = pgTable("follow_up_log", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  // "service_job" | "appointment" — which record was followed up.
  sourceType: text("source_type").notNull(),
  sourceId:   integer("source_id").notNull(),
  customerId: integer("customer_id").references(() => customersTable.id),
  templateId: integer("template_id"),
  // "email" | "sms" — one row per channel actually attempted.
  channel:    text("channel").notNull(),
  // "sent" | "failed" | "skipped".
  status:     text("status").notNull().default("sent"),
  recipient:  text("recipient").notNull().default(""),
  subject:    text("subject").notNull().default(""),
  // The rendered message that went out, kept for the history view.
  body:       text("body").notNull().default(""),
  error:      text("error"),
  sentAt:     timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("follow_up_log_merchant_id_idx").on(t.merchantId),
  index("follow_up_log_merchant_source_idx").on(t.merchantId, t.sourceType, t.sourceId),
]);

/** Per-merchant defaults for the Follow Up screen (one row per merchant). */
export const followUpSettingsTable = pgTable("follow_up_settings", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  // "Only show work completed more than {windowValue} {windowUnit} ago".
  windowValue:   integer("window_value").notNull().default(30),
  // "days" | "weeks" | "months".
  windowUnit:    text("window_unit").notNull().default("days"),
  // Text "true"/"false" — which record types feed the due list.
  includeServices:     text("include_services").notNull().default("true"),
  includeAppointments: text("include_appointments").notNull().default("true"),
  // Text "true"/"false" — hide records that already have a successful follow-up.
  hideAlreadySent:     text("hide_already_sent").notNull().default("true"),
  // Text "true"/"false" — block sends to customers who have not opted in to
  // marketing (Spam Act 2003 s 16). On by default; a merchant treating these as
  // transactional service reminders can turn it off.
  requireOptIn:  text("require_opt_in").notNull().default("true"),
  defaultChannel: text("default_channel").notNull().default("email"),
  defaultTemplateId: integer("default_template_id"),
  // Optional review/booking URL exposed to templates as {{review_link}}.
  reviewUrl:     text("review_url").notNull().default(""),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("follow_up_settings_merchant_id_unique").on(t.merchantId),
]);

export type FollowUpTemplate = typeof followUpTemplatesTable.$inferSelect;
export type InsertFollowUpTemplate = typeof followUpTemplatesTable.$inferInsert;
export type FollowUpLogEntry = typeof followUpLogTable.$inferSelect;
export type InsertFollowUpLogEntry = typeof followUpLogTable.$inferInsert;
export type FollowUpSettings = typeof followUpSettingsTable.$inferSelect;
export type InsertFollowUpSettings = typeof followUpSettingsTable.$inferInsert;
