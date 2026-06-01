import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const accountHoldTokensTable = pgTable("account_hold_tokens", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccountHoldToken = typeof accountHoldTokensTable.$inferSelect;
