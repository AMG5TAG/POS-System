import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * IP addresses the owner has marked safe from Account › Recent Sign-ins.
 * A successful sign-in from one of these is never flagged as a new location.
 * Created by scripts/src/add-trusted-ips-and-dashboard-devices.ts.
 */
export const trustedIpsTable = pgTable("trusted_ips", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id, { onDelete: "cascade" }),
  ipAddress:  text("ip_address").notNull(),
  label:      text("label"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("trusted_ips_merchant_ip_uniq").on(t.merchantId, t.ipAddress),
]);

export type TrustedIp = typeof trustedIpsTable.$inferSelect;
