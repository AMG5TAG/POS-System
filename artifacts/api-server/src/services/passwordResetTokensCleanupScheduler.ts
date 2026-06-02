import { db } from "@workspace/db";
import { passwordResetTokensTable } from "@workspace/db/schema";
import { lt, sql } from "drizzle-orm";
import type { Logger } from "pino";

/**
 * Delete password_reset_tokens rows that expired more than 7 days ago.
 * Used tokens are deleted immediately on use (in the reset-password handler),
 * so this job is primarily a safety net for unused tokens that were never
 * redeemed and have long since expired.
 */
async function cleanupPasswordResetTokens(logger: Logger): Promise<void> {
  const result = await db
    .delete(passwordResetTokensTable)
    .where(
      lt(
        passwordResetTokensTable.expiresAt,
        sql`NOW() - INTERVAL '7 days'`,
      ),
    )
    .returning({ id: passwordResetTokensTable.id });

  const count = result.length;
  if (count > 0) {
    logger.info({ count }, "Password reset tokens cleanup: removed expired rows");
  }
}

export function schedulePasswordResetTokensCleanup(logger: Logger): void {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  cleanupPasswordResetTokens(logger).catch((err) =>
    logger.error({ err }, "Password reset tokens cleanup startup run error"),
  );
  setInterval(
    () =>
      cleanupPasswordResetTokens(logger).catch((err) =>
        logger.error({ err }, "Password reset tokens cleanup scheduled run error"),
      ),
    ONE_DAY,
  );
  logger.info("Password reset tokens cleanup scheduler started (daily)");
}
