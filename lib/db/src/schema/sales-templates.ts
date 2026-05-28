import { pgTable, text, integer, boolean, timestamp, jsonb, uuid, unique } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const SALES_TEMPLATE_TYPES = ["Invoice", "Thermal_Receipt", "Quote", "Service_Ticket"] as const;
export type SalesTemplateType = (typeof SALES_TEMPLATE_TYPES)[number];

export const salesTemplatesTable = pgTable(
  "sales_templates",
  {
    id:            uuid("id").primaryKey().defaultRandom(),
    merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
    templateType:  text("template_type").notNull(),
    headerHtml:    text("header_html").notNull().default(""),
    footerHtml:    text("footer_html").notNull().default(""),
    showLogo:      boolean("show_logo").notNull().default(true),
    fontFamily:    text("font_family").notNull().default("inter"),
    isDefault:     boolean("is_default").notNull().default(true),
    selectedStyle: text("selected_style").notNull().default("professional"),
    options:       jsonb("options").notNull().default({}),
    updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("sales_tpl_merchant_type_uq").on(t.merchantId, t.templateType)],
);

export type SalesTemplate = typeof salesTemplatesTable.$inferSelect;
export type InsertSalesTemplate = typeof salesTemplatesTable.$inferInsert;
