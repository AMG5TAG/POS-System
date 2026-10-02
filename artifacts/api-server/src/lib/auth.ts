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
    /** The EFFECTIVE role every server-side role check reads. On a shared till
     *  this follows whoever PIN-signed in for the day, not who typed the
     *  password (middlewares/staffRoles.ts). */
    staffRole?: "owner" | "manager" | "cashier";
    staffId?: number;
    /** How the session was opened: the owner's password ("owner") or a staff
     *  member's own email login ("staff-email"). Absent on sessions opened
     *  before this was recorded, which were all owner logins. */
    authKind?: "owner" | "staff-email";
    /** For a staff-email session: who signed in, so ending a till day session
     *  hands the session back to them rather than leaving it nobody's. */
    loginStaffId?: number;
    /** A manager/owner PIN entered at this till for a one-off approval
     *  (POST /staff/verify-pin with requireManager). Short-lived. */
    managerApproval?: { staffId: number; staffName: string; until: number };
    /** Active store/branch for multi-location merchants (defaults to the merchant's default location). */
    locationId?: number;
  }
}

/** A staff row's role as a session role: anything unrecognised is a cashier. */
export function sessionRole(r: string | null | undefined): "owner" | "manager" | "cashier" {
  return r === "owner" || r === "manager" ? r : "cashier";
}
