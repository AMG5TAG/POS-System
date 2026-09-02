import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const merchantsTable = pgTable("merchants", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  country: text("country").default("AU"),
  currency: text("currency").notNull().default("AUD"),
  timezone: text("timezone").default("Australia/Sydney"),
  logoUrl: text("logo_url"),
  username: text("username").unique(),
  portalDomain: text("portal_domain").unique(),
  /* When "true", a customer who has set a portal password must supply it — the
     portalToken in the URL then identifies the account rather than granting it.
     Defaults off so existing portals (and every link already sent to a customer)
     keep working exactly as before until a merchant opts in. */
  requirePortalPassword: text("require_portal_password").notNull().default("false"),
  loginNotifyEmail: text("login_notify_email").notNull().default("false"),
  loginNotifyEmailFailed: text("login_notify_email_failed").notNull().default("false"),
  loginNotifyEmailNewLocation: text("login_notify_email_new_location").notNull().default("true"),
  loginNotifyFailedLastSentAt: timestamp("login_notify_failed_last_sent_at", { withTimezone: true }),
  securityAlertEmail: text("security_alert_email").notNull().default("true"),
  passwordChangeAlertEmail: text("password_change_alert_email").notNull().default("true"),
  lastAuthEventsViewedAt: timestamp("last_auth_events_viewed_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  partnerReferralCode: text("partner_referral_code").unique(),
  tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
  tosAcceptedIp: text("tos_accepted_ip"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  isDemoAccount: text("is_demo_account").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  priceMonthly: text("price_monthly").notNull().default("0"),
  priceYearly: text("price_yearly").notNull().default("0"),
  maxRegisters: integer("max_registers"),
  maxStaff: integer("max_staff"),
  features: text("features").array().notNull().default([]),
  isPopular: text("is_popular").notNull().default("false"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modulesTable = pgTable("modules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  priceMonthly: text("price_monthly").notNull().default("0"),
  category: text("category").notNull(),
  icon: text("icon").notNull().default("Package"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  planId: integer("plan_id").notNull().references(() => plansTable.id),
  status: text("status").notNull().default("active"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: text("cancel_at_period_end").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const merchantModulesTable = pgTable("merchant_modules", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  moduleId: integer("module_id").notNull().references(() => modulesTable.id),
  enabledAt: timestamp("enabled_at", { withTimezone: true }).notNull().defaultNow(),
});

export const merchantIntegrationsTable = pgTable("merchant_integrations", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  integrationKey: text("integration_key").notNull(),
  status: text("status").notNull().default("disconnected"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  credentials: text("credentials"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const loginAttemptsTable = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  failCount: integer("fail_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  accountHoldUntil: timestamp("account_hold_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMerchantSchema = createInsertSchema(merchantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchantsTable.$inferSelect;
export type Plan = typeof plansTable.$inferSelect;
export type Module = typeof modulesTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type MerchantModule = typeof merchantModulesTable.$inferSelect;
