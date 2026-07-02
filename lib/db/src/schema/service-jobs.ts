import { pgTable, text, serial, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

export const serviceJobsTable = pgTable("service_jobs", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  staffId: integer("staff_id"),
  jobNumber: text("job_number").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"),
  bookInDate: text("book_in_date").notNull().default(""),
  // Device info
  deviceType: text("device_type"),
  deviceDescription: text("device_description"),
  serialNumber: text("serial_number"),
  condition: text("condition"),
  partnerRepairCode: text("partner_repair_code"),
  // Flags (stored as text "true"/"false")
  isPartnerRepair: text("is_partner_repair").notNull().default("false"),
  isCritical: text("is_critical").notNull().default("false"),
  isUnderWarranty: text("is_under_warranty").notNull().default("false"),
  // Repair/labour warranty (distinct from product warranty): days from completion.
  repairWarrantyDays: integer("repair_warranty_days").notNull().default(0),
  // When the repair was marked completed (anchors the repair-warranty window).
  completedAt: timestamp("completed_at", { withTimezone: true }),
  // If this job is a no-charge rework, the original job it redoes.
  reworkOfJobId: integer("rework_of_job_id"),
  // If this job was opened by reopening a completed job (a fresh, chargeable
  // repair), the original job it continues from. Distinct from reworkOfJobId:
  // a rework is a no-charge redo, a reopen is a new repair linked for history.
  reopenedFromJobId: integer("reopened_from_job_id"),
  // Estimate approval (customer authorised the quoted work before it begins).
  // Set when a linked quote is accepted via the portal or recorded in-store.
  estimateApprovedAt: timestamp("estimate_approved_at", { withTimezone: true }),
  estimateApprovedVia: text("estimate_approved_via"), // "portal" | "in-store"
  // Deposit tracking (soft/advisory): required is copied from the approved quote,
  // paid accumulates deposits collected in-store. Balance = job total − depositPaid.
  depositRequired: numeric("deposit_required", { precision: 10, scale: 2 }),
  depositPaid: numeric("deposit_paid", { precision: 10, scale: 2 }).notNull().default("0"),
  // Mail-in / postal repair tracking.
  isMailIn: text("is_mail_in").notNull().default("false"),
  shippingCarrier: text("shipping_carrier"),
  inboundTracking: text("inbound_tracking"),
  returnTracking: text("return_tracking"),
  returnAddress: text("return_address"),
  // Work detail
  workDescription: text("work_description"),
  additionalEquipment: text("additional_equipment"),
  passwordOrPin: text("password_or_pin"),
  accounts: text("accounts"),
  // Media
  signature: text("signature"),
  photos: text("photos"),
  // Legacy / optional
  description: text("description"),
  estimatedCost: numeric("estimated_cost", { precision: 10, scale: 2 }),
  notes: text("notes"),
  heardFrom: text("heard_from"),
  heardFromDetails: text("heard_from_details"),
  referredByCustomerId: integer("referred_by_customer_id"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("service_jobs_merchant_id_idx").on(t.merchantId),
  index("service_jobs_merchant_id_created_at_idx").on(t.merchantId, t.createdAt),
]);

export const insertServiceJobSchema = createInsertSchema(serviceJobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceJob = z.infer<typeof insertServiceJobSchema>;
export type ServiceJob = typeof serviceJobsTable.$inferSelect;
