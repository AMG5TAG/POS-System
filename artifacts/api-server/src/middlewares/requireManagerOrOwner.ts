import { Request, Response, NextFunction } from "express";

export function requireManagerOrOwner(req: Request, res: Response, next: NextFunction): void {
  const role = req.session?.staffRole;
  // Whitelist the allowed roles rather than blacklisting "cashier": an unknown
  // or undefined role must be denied, not implicitly permitted.
  if (role !== "owner" && role !== "manager") {
    res.status(403).json({ error: "Forbidden: manager or owner role required" });
    return;
  }
  next();
}
