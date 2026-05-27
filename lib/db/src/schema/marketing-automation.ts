import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

export const marketingAutomationRulesTable = pgTable("marketing_automation_rules", {
  id:              serial("id").primaryKey(),
  merchantId:      integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:            text("name").notNull(),
  isActive:        text("is_active").notNull().default("true"),
  triggerEvent:    text("trigger_event").notNull(),
  channel:         text("channel").notNull().default("email"),
  templateId:      text("template_id"),
  templateName:    text("template_name"),
  templateSubject: text("template_subject"),
  templateBody:    text("template_body"),
  lastRunAt:       timestamp("last_run_at", { withTimezone: true }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("mar_merchant_idx").on(t.merchantId),
]);

export const marketingAutomationLogTable = pgTable("marketing_automation_log", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  ruleId:      integer("rule_id").notNull().references(() => marketingAutomationRulesTable.id),
  customerId:  integer("customer_id").references(() => customersTable.id),
  recordType:  text("record_type"),
  recordId:    text("record_id"),
  channel:     text("channel").notNull(),
  status:      text("status").notNull(),
  error:       text("error"),
  sentAt:      timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("mal_merchant_rule_idx").on(t.merchantId, t.ruleId),
  index("mal_record_idx").on(t.ruleId, t.recordId),
]);

export type MarketingAutomationRule = typeof marketingAutomationRulesTable.$inferSelect;
export type MarketingAutomationLog  = typeof marketingAutomationLogTable.$inferSelect;
