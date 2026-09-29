import type { Request, Response, NextFunction } from "express";
import { legacyDomains, publicOrigin } from "../lib/publicUrl";

/**
 * The app moved domains (see legacyDomains in lib/publicUrl.ts). A page load or
 * QR scan arriving on an old domain is sent to the same path on the current
 * one, so printed stickers and old links keep working. Only GET/HEAD: a
 * redirected POST would silently drop its body.
 */
export function legacyDomainRedirect(req: Request, res: Response, next: NextFunction): void {
  if ((req.method === "GET" || req.method === "HEAD") && legacyDomains().includes(req.hostname.toLowerCase())) {
    res.redirect(301, `${publicOrigin()}${req.originalUrl}`);
    return;
  }
  next();
}
