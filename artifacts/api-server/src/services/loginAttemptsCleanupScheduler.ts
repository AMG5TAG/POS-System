import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { Logger } from "pino";

async function cleanupLoginAttempts(logger: Logger): Promise<void> {
  const result = await db.execute<{ count: string }>(sql`
    WITH deleted AS (
      DELETE FROM login_attempts
      WHERE
        (locked_until IS NULL AND fail_count = 0)
        OR locked_until < NOW() - INTERVAL '1 day'
      RETURNING 1
    )
    SELECT COUNT(*)::text AS count FROM deleted
  `);
  const count = parseInt(result.rows[0]?.count ?? "0", 10);
  if (count > 0) {
    logger.info({ count }, "Login attempts cleanup: removed stale rows");
  }
}

export function scheduleLoginAttemptsCleanup(logger: Logger): void {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  cleanupLoginAttempts(logger).catch((err) =>
    logger.error({ err }, "Login attempts cleanup startup run error"),
  );
  setInterval(
    () =>
      cleanupLoginAttempts(logger).catch((err) =>
        logger.error({ err }, "Login attempts cleanup scheduled run error"),
      ),
    ONE_DAY,
  );
  logger.info("Login attempts cleanup scheduler started (daily)");
}
