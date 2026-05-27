import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const posRegistersTable = pgTable("pos_registers", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  registerId: text("register_id").notNull(),
  name:       text("name").notNull(),
  type:       text("type").notNull().default("Cash"),
  staffName:  text("staff_name").notNull().default(""),
  staffEmail: text("staff_email").notNull().default(""),
});

export type PosRegister = typeof posRegistersTable.$inferSelect;
export type InsertPosRegister = typeof posRegistersTable.$inferInsert;
