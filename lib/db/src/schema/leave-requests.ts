import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const leaveRequestsTable = pgTable("leave_requests", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  requestId:  text("request_id").notNull(),
  staffId:    text("staff_id").notNull(),
  staffName:  text("staff_name").notNull(),
  type:       text("type").notNull().default("annual"),
  startDate:  text("start_date").notNull(),
  endDate:    text("end_date").notNull(),
  reason:     text("reason").notNull().default(""),
  status:     text("status").notNull().default("pending"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;
export type InsertLeaveRequest = typeof leaveRequestsTable.$inferInsert;
