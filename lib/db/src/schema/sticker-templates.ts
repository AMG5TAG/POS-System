import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const stickerTemplatesTable = pgTable("sticker_templates", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  templateId:   text("template_id").notNull(),
  name:         text("name").notNull(),
  description:  text("description").notNull().default(""),
  typeId:       text("type_id").notNull(),
  sizeId:       text("size_id").notNull(),
  fields:       text("fields").notNull().default("{}"),
  isDefault:    text("is_default").notNull().default("false"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type StickerTemplateRow = typeof stickerTemplatesTable.$inferSelect;
export type InsertStickerTemplate = typeof stickerTemplatesTable.$inferInsert;
