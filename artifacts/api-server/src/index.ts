import app from "./app";
import { logger } from "./lib/logger";
import { scheduleRecurringInvoices } from "./services/recurringInvoiceScheduler";
import { scheduleMarketingAutomation } from "./services/marketingAutomationScheduler";
import { scheduleReferralDigest } from "./services/referralDigestScheduler";
import { scheduleLowStockAlerts } from "./services/lowStockAlertScheduler";
import { assertVaultKeyConfigured, invalidateUnreadableVaultEntries, reEncryptVaultEntries } from "./services/tokenVault";

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
