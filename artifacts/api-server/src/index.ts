import app from "./app";
import { logger } from "./lib/logger";
import { scheduleRecurringInvoices } from "./services/recurringInvoiceScheduler";
import { scheduleMarketingAutomation } from "./services/marketingAutomationScheduler";
import { scheduleReferralDigest } from "./services/referralDigestScheduler";
import { scheduleLowStockAlerts } from "./services/lowStockAlertScheduler";
import { scheduleLoginAttemptsCleanup } from "./services/loginAttemptsCleanupScheduler";
import { ensureLoginCleanupFunction } from "./services/loginCleanupSetup";
import { ensureReportViews } from "./services/reportViewsSetup";
import { schedulePasswordResetTokensCleanup } from "./services/passwordResetTokensCleanupScheduler";
import { scheduleBackups } from "./services/backupScheduler";
import { scheduleSocialPosts } from "./services/socialPostScheduler";
import { assertVaultKeyConfigured, invalidateUnreadableVaultEntries, reEncryptVaultEntries } from "./services/tokenVault";
import { checkSchemaDrift } from "./services/schemaDriftCheck";

assertVaultKeyConfigured();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Fail fast on schema drift before accepting traffic: a forgotten `db:push`
// leaves the DB missing columns the code selects, which otherwise 500s endpoints
// one by one at runtime. Aborting here surfaces exactly what's missing in the
// boot logs. (Set SKIP_SCHEMA_DRIFT_CHECK=true to override in an emergency.)
async function bootstrap() {
  try {
    await checkSchemaDrift(logger);
  } catch (err) {
    logger.error({ err }, "Startup aborted: database schema drift detected. Run `pnpm db:push` to apply pending migrations.");
    process.exit(1);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  scheduleRecurringInvoices(logger);
  scheduleMarketingAutomation(logger);
  scheduleReferralDigest(logger);
  scheduleLowStockAlerts(logger);
  schedulePasswordResetTokensCleanup(logger);
  scheduleBackups(logger);
  scheduleSocialPosts(logger);
  ensureLoginCleanupFunction(logger).then(() => {
    scheduleLoginAttemptsCleanup(logger);
  }).catch((err) => {
    logger.error({ err }, "Failed to ensure login cleanup DB function; starting scheduler anyway");
    scheduleLoginAttemptsCleanup(logger);
  });
  // Report views can be dropped by a raw `drizzle-kit push` (they're not in
  // the drizzle schema) — recreate them on every boot so the Sales Overview /
  // P&L / Product Performance reports never 500 on a missing view.
  ensureReportViews(logger).catch((err) => {
    logger.error({ err }, "Failed to ensure report views; management reports may be unavailable");
  });
  // Migrate any tokens encrypted under VAULT_ENCRYPTION_KEY_PREVIOUS to the
  // current key first, then invalidate whatever is still unreadable.
  reEncryptVaultEntries()
    .catch((e) => {
      logger.error({ err: e }, "Failed to re-encrypt OAuth vault entries under rotated key");
    })
    .finally(() => {
      invalidateUnreadableVaultEntries().catch((e) => {
        logger.error({ err: e }, "Failed to invalidate unreadable OAuth vault entries");
      });
    });
  });
}

bootstrap();
