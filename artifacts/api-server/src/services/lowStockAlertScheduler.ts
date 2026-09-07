import { sendDigestForAllMerchants } from "./lowStockAlertService";
import type { Logger } from "pino";
import { trackedInterval } from "../lib/shutdown";

export function scheduleLowStockAlerts(logger: Logger): void {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  sendDigestForAllMerchants(logger).catch((err) =>
    logger.error({ err }, "Low-stock digest startup run error"),
  );
  trackedInterval(
    () =>
      sendDigestForAllMerchants(logger).catch((err) =>
        logger.error({ err }, "Low-stock digest scheduled run error"),
      ),
    ONE_DAY,
  );
  logger.info("Low-stock alert scheduler started (daily digest check)");
}
