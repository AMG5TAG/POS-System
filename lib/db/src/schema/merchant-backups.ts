import {
  bigint,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * A single configured storage destination for a merchant's backups.
 * Secret credential fields are encrypted under the server's VAULT_ENCRYPTION_KEY
 * (via tokenVault.encryptToken) and stored as `*Enc` strings — never plaintext.
 */
export interface BackupStorageDestination {
  id: string;
  type: "local" | "s3" | "gcs" | "sftp" | "onedrive" | "nextcloud";
  // local
  directory?: string;
  // s3
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKeyEnc?: string;
  // gcs
  projectId?: string;
  gcsBucket?: string;
  serviceAccountJsonEnc?: string;
  // sftp
  host?: string;
  port?: number;
  username?: string;
  remotePath?: string;
  passwordEnc?: string;
  // onedrive / nextcloud — uploads use the merchant's connected integration
  // (OneDrive access token / Nextcloud app password); only the folder is stored.
  folder?: string;
}

/**
 * Where a completed backup archive landed, per destination. The `server` type
 * is the always-on durable copy in the platform's object storage, written for
 * every backup regardless of the merchant's configured destinations (which are
 * the user-selectable types). It is not a configurable destination.
 */
export interface BackupLocation {
  type: "server" | "local" | "s3" | "gcs" | "sftp" | "onedrive" | "nextcloud";
  ref: string;
}

export const merchantBackupConfigsTable = pgTable("merchant_backup_configs", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id")
    .notNull()
    .unique()
    .references(() => merchantsTable.id, { onDelete: "cascade" }),
  /** Disabled | daily | weekly | monthly. */
  frequency: text("frequency").notNull().default("disabled"),
  /** bcrypt hash of the encryption password — used to verify on restore / show "is set". */
  encryptionPasswordHash: text("encryption_password_hash"),
  /** VAULT-encrypted plaintext of the encryption password — lets background backups encrypt without prompting. */
  encryptionPasswordEnc: text("encryption_password_enc"),
  /** Array of storage destinations; secret fields encrypted under VAULT_ENCRYPTION_KEY. */
  destinations: jsonb("destinations")
    .$type<BackupStorageDestination[]>()
    .notNull()
    .default([]),
  lastBackupAt: timestamp("last_backup_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type MerchantBackupConfig = typeof merchantBackupConfigsTable.$inferSelect;

export const merchantBackupsTable = pgTable("merchant_backups", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id")
    .notNull()
    .references(() => merchantsTable.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  /** pending | completed | failed. */
  status: text("status").notNull().default("pending"),
  /** Whether this run was triggered manually or by the scheduler. */
  trigger: text("trigger").notNull().default("manual"),
  /** Comma-joined list of destination types the archive was written to. */
  storageType: text("storage_type"),
  /** Canonical local path of the encrypted archive (used for restore). */
  filePath: text("file_path"),
  /** All destination references (type + ref). */
  locations: jsonb("locations").$type<BackupLocation[]>().notNull().default([]),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  errorMessage: text("error_message"),
});

export type MerchantBackup = typeof merchantBackupsTable.$inferSelect;
