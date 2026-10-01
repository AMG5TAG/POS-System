import { Router, type IRouter } from "express";
import { resolvePortalAccess } from "../lib/portalAuth";
import { sendApplePass, sendGoogleWalletLink } from "../lib/wallet-pass";

/**
 * What is left of the customer portal's API. The portal itself moved into the
 * online shop's account area (routes/shop-account.ts); its old /c/<token> links
 * now open that account (POST /shop/auth/token).
 *
 * These two stay addressed by token because staff hand a customer their wallet
 * pass from the customer's record in the POS (customers.tsx › QR / Portal).
 */

const router: IRouter = Router();

router.get("/portal/:token/apple-wallet", async (req, res): Promise<void> => {
  const access = await resolvePortalAccess(req, String(req.params.token));
  if (!access.ok) { res.status(access.status).json(access.body); return; }
  await sendApplePass(res, access.customer);
});

router.get("/portal/:token/google-wallet", async (req, res): Promise<void> => {
  const access = await resolvePortalAccess(req, String(req.params.token));
  if (!access.ok) { res.status(access.status).json(access.body); return; }
  await sendGoogleWalletLink(res, access.customer);
});

export default router;
