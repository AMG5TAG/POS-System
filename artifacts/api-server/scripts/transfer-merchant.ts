/**
 * transfer-merchant — safely move ONE merchant's data into a target merchant,
 * within or across environments. Replaces the hand-written restore-merchant4*.ts
 * one-offs with a single parameterized, dry-run-by-default tool that reuses the
 * shared backup/restore building blocks.
 *
 * Safety properties:
 *   1. assertExpectedEnv() refuses to run unless EXPECTED_DB matches the live
 *      DATABASE_URL fingerprint — you cannot wipe the wrong database by accident.
 *   2. Before overwriting an existing target, it takes a durable pre-op backup of
 *      that target (backupMerchantNow) so there is always a rollback point.
 *   3. Dry-run by default: everything runs in one transaction and is rolled back
 *      unless you pass --commit. Post-insert counts are verified inside the tx.
 *
 * Usage (env: EXPECTED_DB, BK_PASS, and for --mode insert: NEW_EMAIL,
 *        NEW_LOGIN_PASSWORD, NEW_BUSINESS_NAME):
 *
 *   # dry-run: restore merchant 4 in place from a stored archive (prod one-off)
 *   EXPECTED_DB=production BK_PASS=... pnpm transfer-merchant \
 *       --archive /<bucket>/.../backups/4/backup-4-...koapos.enc \
 *       --target 4 --mode update --offset 1000000
 *
 *   # commit a live copy of merchant 7's data into existing merchant 9
 *   EXPECTED_DB=development BK_PASS=... pnpm transfer-merchant \
 *       --merchant 7 --target 9 --mode update --allow-remap --commit
 *
 * Flags:
 *   --target <id>        merchant id to write into (required)
 *   --merchant <id>      SOURCE: collect this merchant's data live
 *   --archive <ref|path> SOURCE: an object-storage ref (starts with /) or local file
 *   --mode insert|update insert a new merchants row, or update an existing one (default update)
 *   --offset <n>         shift numeric ids/scoped-FKs by n (cross-env collisions; default 0)
 *   --allow-remap        allow snapshot.merchantId != target (cross-merchant transfer)
 *   --commit             actually commit (default: dry-run, rolled back)
 *   --skip-pre-backup    DANGEROUS: skip the automatic pre-op backup of the target
 */
import { parseArgs } from "node:util";
import bcrypt from "bcryptjs";
import { db, pool, merchantsTable, merchantBackupConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { assertExpectedEnv } from "../src/lib/db-env-guard";
import { collectMerchantData, BACKUP_SCHEMA_VERSION } from "../src/lib/backup-collector";
import type { BackupSnapshot } from "../src/lib/backup-collector";
import { extractArchive } from "../src/lib/backup-archive";
import { downloadServerCopy } from "../src/lib/backup-storage/server";
import { backupMerchantNow } from "../src/services/backupService";
import { restoreSnapshot } from "../src/services/restoreService";
import { decryptToken } from "../src/services/tokenVault";

class DryRunRollback extends Error {}

function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    target: { type: "string" },
    merchant: { type: "string" },
    archive: { type: "string" },
    mode: { type: "string", default: "update" },
    offset: { type: "string", default: "0" },
    "allow-remap": { type: "boolean", default: false },
    commit: { type: "boolean", default: false },
    "skip-pre-backup": { type: "boolean", default: false },
  },
});

const target = Number(values.target);
if (!Number.isInteger(target) || target <= 0) fail("--target <merchantId> is required");

const mode = values.mode;
if (mode !== "insert" && mode !== "update") fail("--mode must be 'insert' or 'update'");

const offset = Number(values.offset);
if (!Number.isInteger(offset)) fail("--offset must be an integer");

const allowRemap = values["allow-remap"];
const commit = values.commit;
const skipPreBackup = values["skip-pre-backup"];
const BK_PASS = process.env.BK_PASS;

if (!values.merchant && !values.archive) fail("specify a source: --merchant <id> or --archive <ref|path>");
if (values.merchant && values.archive) fail("specify only one source: --merchant or --archive");

/** Resolve the source snapshot from a live merchant or an encrypted archive. */
async function loadSnapshot(): Promise<BackupSnapshot> {
  if (values.merchant) {
    const sourceId = Number(values.merchant);
    if (!Number.isInteger(sourceId) || sourceId <= 0) fail("--merchant must be a positive integer");
    console.log(`Collecting live snapshot of merchant ${sourceId}...`);
    return collectMerchantData(sourceId);
  }
  if (!BK_PASS) fail("BK_PASS is required to decrypt --archive");
  const ref = values.archive!;
  if (ref.startsWith("/")) {
    // Object-storage ref produced by uploadServer.
    console.log(`Downloading archive from object storage: ${ref}`);
    const dl = await downloadServerCopy(ref);
    try {
      return await extractArchive<BackupSnapshot>(dl.path, BK_PASS);
    } finally {
      await dl.cleanup();
    }
  }
  console.log(`Reading local archive: ${ref}`);
  return extractArchive<BackupSnapshot>(ref, BK_PASS);
}

async function main(): Promise<void> {
  assertExpectedEnv();

  const snapshot = await loadSnapshot();
  console.log(
    `Snapshot: merchantId=${snapshot.merchantId} schemaVersion=${snapshot.schemaVersion} exportedAt=${snapshot.exportedAt}`,
  );
  if (snapshot.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    console.warn(
      `WARNING: snapshot schemaVersion ${snapshot.schemaVersion} != current ${BACKUP_SCHEMA_VERSION}.`,
    );
  }
  if (snapshot.merchantId !== target && !allowRemap) {
    fail(
      `snapshot belongs to merchant ${snapshot.merchantId} but target is ${target}. ` +
        "Pass --allow-remap to transfer across merchants.",
    );
  }

  // Confirm the target's existence matches the chosen mode.
  const [existing] = await db
    .select({ id: merchantsTable.id, status: merchantsTable.status, email: merchantsTable.email })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, target));

  if (mode === "update" && !existing) {
    fail(`merchant ${target} does not exist; use --mode insert to create it.`);
  }
  if (mode === "insert" && existing) {
    fail(`merchant ${target} already exists; use --mode update to overwrite it.`);
  }

  // Pre-op backup of the target (only meaningful when it already has data).
  if (existing && !skipPreBackup) {
    const [cfg] = await db
      .select({ enc: merchantBackupConfigsTable.encryptionPasswordEnc })
      .from(merchantBackupConfigsTable)
      .where(eq(merchantBackupConfigsTable.merchantId, target));
    const backupPassword = cfg?.enc ? decryptToken(cfg.enc) : BK_PASS;
    if (!backupPassword) {
      fail(
        "no backup password available for the pre-op backup (set BK_PASS or configure the " +
          "merchant's backup password). Re-run with --skip-pre-backup to override (dangerous).",
      );
    }
    console.log(`Taking pre-op backup of merchant ${target} (rollback point)...`);
    const pre = await backupMerchantNow(target, "pre-restore", backupPassword);
    console.log(`Pre-op backup stored: ${pre.serverRef}`);
  } else if (existing && skipPreBackup) {
    console.warn("WARNING: --skip-pre-backup set; proceeding WITHOUT a rollback point.");
  } else {
    console.log("Target has no existing row; no pre-op backup needed (insert mode).");
  }

  const passwordHash =
    mode === "insert" || process.env.NEW_LOGIN_PASSWORD
      ? await bcrypt.hash(requireLoginPasswordFor(mode), 10)
      : null;

  let report!: Awaited<ReturnType<typeof restoreSnapshot>>;
  try {
    await db.transaction(async (tx) => {
      // 1. Handle the merchants row (the snapshot never contains it — merchants
      // is not a merchant-scoped table).
      if (mode === "insert") {
        await tx.insert(merchantsTable).values({
          id: target,
          email: requireEnv("NEW_EMAIL"),
          passwordHash: passwordHash!,
          businessName: requireEnv("NEW_BUSINESS_NAME"),
          status: "active",
          emailVerifiedAt: new Date(),
        });
      } else {
        const set: Record<string, unknown> = { status: "active", updatedAt: new Date() };
        if (process.env.NEW_EMAIL) set.email = process.env.NEW_EMAIL;
        if (passwordHash) {
          set.passwordHash = passwordHash;
          set.emailVerifiedAt = new Date();
        }
        await tx.update(merchantsTable).set(set).where(eq(merchantsTable.id, target));
      }

      // 2. Wipe + repopulate the scoped data inside the same transaction.
      report = await restoreSnapshot({
        tx,
        targetMerchantId: target,
        snapshot,
        idOffset: offset,
        allowMerchantRemap: allowRemap,
        verifyCounts: true,
      });

      // 3. Dry-run: roll the whole thing back.
      if (!commit) throw new DryRunRollback();
    });
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
  }

  printReport(report, commit);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) fail(`${name} is required for --mode insert`);
  return v;
}

function requireLoginPasswordFor(m: string): string {
  const v = process.env.NEW_LOGIN_PASSWORD;
  if (!v) {
    if (m === "insert") fail("NEW_LOGIN_PASSWORD is required for --mode insert");
    fail("NEW_LOGIN_PASSWORD must be set when changing the login password");
  }
  return v;
}

function printReport(report: Awaited<ReturnType<typeof restoreSnapshot>>, committed: boolean): void {
  const tableCount = Object.keys(report.insertedByTable).length;
  console.log("");
  for (const [name, n] of Object.entries(report.deletedByTable)) {
    console.log(`  deleted ${String(n).padStart(5)} from ${name}`);
  }
  if (report.skippedTables.length) {
    console.warn(`  ! snapshot tables not in current scope (skipped): ${report.skippedTables.join(", ")}`);
  }
  console.log(
    `Verified ${report.totalInserted} rows across ${tableCount} tables ` +
      `(deleted ${report.totalDeleted}), offset=${offset}.`,
  );
  if (committed) {
    console.log(`\nCOMMITTED. Merchant ${target} now holds the transferred data.`);
  } else {
    console.log("\nDRY RUN OK (rolled back). Re-run with --commit to apply.");
  }
}

main()
  .catch((err) => {
    console.error("\nTRANSFER FAILED (rolled back):", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
