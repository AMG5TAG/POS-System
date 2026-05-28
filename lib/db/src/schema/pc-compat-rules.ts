import { pgTable, text, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const pcCompatRulesTable = pgTable(
  "pc_compat_rules",
  {
    id:         serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    ruleKey:    text("rule_key").notNull(),
    partType:   text("part_type").notNull().default(""),
    socket:     text("socket").notNull().default(""),
    specs:      text("specs").notNull().default(""),
    updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("pc_compat_rules_merchant_key_uq").on(t.merchantId, t.ruleKey)],
);

export type PcCompatRule = typeof pcCompatRulesTable.$inferSelect;
export type InsertPcCompatRule = typeof pcCompatRulesTable.$inferInsert;
