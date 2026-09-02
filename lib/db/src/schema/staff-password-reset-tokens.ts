import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { staffTable } from "./staff";

/**
 * Set-password / reset tokens for staff email sign-in. Used both when an owner
 * or manager invites a staff member to enable email login (first password set)
 * and for the staff "forgot password" flow. Mirrors password_reset_tokens but
 * keyed to a staff member rather than a merchant.
 */
export const staffPasswordResetTokensTable = pgTable("staff_password_reset_tokens", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StaffPasswordResetToken = typeof staffPasswordResetTokensTable.$inferSelect;
