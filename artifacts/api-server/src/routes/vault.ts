import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { getVaultStatus } from "../services/tokenVault";

const router: IRouter = Router();

/**
 * GET /vault/status
 *
 * Returns the encryption health of this merchant's OAuth token vault:
 * how many entries are readable under the current key, how many are pending
 * a key-rotation migration, and how many are invalid (require reconnection).
 *
 * Auth: any authenticated merchant session (data is scoped to the caller's merchantId).
 */
router.get("/vault/status", requireAuth, async (req, res): Promise<void> => {
  try {
    const status = await getVaultStatus(req.session.merchantId!);
    res.json(status);
  } catch (err) {
    req.log.error({ err }, "Failed to retrieve vault status");
    res.status(500).json({ error: "Failed to retrieve vault status" });
  }
});

export default router;
