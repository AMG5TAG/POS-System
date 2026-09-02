import { pgTable, text, serial, timestamp, integer, numeric, date, doublePrecision, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  // Profile picture (storage URL); synced to Google/Outlook contact photos.
  photoUrl: text("photo_url"),
  dateOfBirth: date("date_of_birth"),
  loyaltyPoints: doublePrecision("loyalty_points").notNull().default(0),
  totalSpent: numeric("total_spent", { precision: 10, scale: 2 }).notNull().default("0"),
  visitCount: integer("visit_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // New fields
  company: text("company"),
  abn: text("abn"),
  referredBy: text("referred_by"),
  whatsappSameAsPhone: text("whatsapp_same_as_phone"),
  billingStreet: text("billing_street"),
  billingCity: text("billing_city"),
  billingState: text("billing_state"),
  billingPostcode: text("billing_postcode"),
  billingCountry: text("billing_country"),
  shippingStreet: text("shipping_street"),
  shippingCity: text("shipping_city"),
  shippingState: text("shipping_state"),
  shippingPostcode: text("shipping_postcode"),
  shippingCountry: text("shipping_country"),
  customerGroup: text("customer_group"),
  warningNote: text("warning_note"),
  agreedToMarketing: text("agreed_to_marketing").default("false"),
  portalToken: text("portal_token"),
  /* Customer portal login. The portal was originally token-only — the URL's
     portalToken was the whole credential — which is fine for a link sent to the
     customer but not for a QR printed on a sticker that lives on their device.
     A merchant can require a password (merchants.requirePortalPassword); until a
     customer sets one, portalPasswordHash is null and the token still admits
     them, which is what lets existing portals keep working untouched. */
  portalPasswordHash: text("portal_password_hash"),
  portalPasswordSetAt: timestamp("portal_password_set_at", { withTimezone: true }),
  portalLastLoginAt: timestamp("portal_last_login_at", { withTimezone: true }),
  referralCode: text("referral_code"),
  heardFrom: text("heard_from"),
  heardFromDetails: text("heard_from_details"),
  referredByCustomerId: integer("referred_by_customer_id"),
  tierName: text("tier_name"),
  tierUpdatedAt: timestamp("tier_updated_at", { withTimezone: true }),
}, (t) => [
  index("customers_merchant_id_idx").on(t.merchantId),
  index("customers_merchant_id_created_at_idx").on(t.merchantId, t.createdAt),
]);

export function generateReferralCode(firstName?: string | null, lastName?: string | null): string {
  const f = (firstName ?? "X")[0].toUpperCase();
  const l = (lastName ?? "X")[0].toUpperCase();
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${f}${l}-${suffix}`;
}

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
