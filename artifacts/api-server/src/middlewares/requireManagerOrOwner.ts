import { Request, Response, NextFunction } from "express";

export function requireManagerOrOwner(req: Request, res: Response, next: NextFunction): void {
  const role = req.session?.staffRole;
  if (role === "cashier") {
    res.status(403).json({ error: "Forbidden: manager or owner role required" });
    return;
  }
  next();
}
