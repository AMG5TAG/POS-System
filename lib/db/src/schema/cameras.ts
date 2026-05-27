import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const ipCamerasTable = pgTable("ip_cameras", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  name: text("name").notNull(),
  streamUrl: text("stream_url").notNull(),
  port: text("port"),
  username: text("username"),
  password: text("password"),
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const cameraSnapshotsTable = pgTable("camera_snapshots", {
  id: serial("id").primaryKey(),
  cameraId: integer("camera_id").notNull().references(() => ipCamerasTable.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  imageData: text("image_data").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  takenBy: text("taken_by"),
  source: text("source").notNull().default("manual"),
});

export const cameraSettingsTable = pgTable("camera_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().unique().references(() => merchantsTable.id),
  pipEnabled: text("pip_enabled").notNull().default("false"),
  pipCameraId: integer("pip_camera_id"),
  allowedRoles: text("allowed_roles").notNull().default("admin,manager,cashier"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
