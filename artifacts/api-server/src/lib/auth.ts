import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

declare module "express-session" {
  interface SessionData {
    merchantId?: number;
    staffRole?: "owner" | "manager" | "cashier";
    staffId?: number;
    /** Active store/branch for multi-location merchants (defaults to the merchant's default location). */
    locationId?: number;
  }
}
