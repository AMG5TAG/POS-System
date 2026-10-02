import { Request, Response, NextFunction } from "express";

/* Server-side role gates. Every check reads `session.staffRole`, the EFFECTIVE
 * role: on a shared till the owner's password opens the session but the
 * cashier who PIN-signed in for the day is who is using it, and
 * /staff/verify-pin moves the role to theirs (see routes/staff.ts). The UI
 * hides what a role can't do; these are what actually stop it. */

type Role = "owner" | "manager" | "cashier";

const MANAGER_ROLES: ReadonlySet<Role | undefined> = new Set<Role>(["owner", "manager"]);

/** How long a manager's PIN, entered at the till for one approval, stands in
 *  for their role on that till's session. */
export const MANAGER_APPROVAL_MS = 2 * 60_000;

export function isManagerOrOwner(req: Request): boolean {
  return MANAGER_ROLES.has(req.session?.staffRole);
}

/** A manager or owner PIN was entered at this till in the last two minutes. */
export function hasFreshManagerApproval(req: Request): boolean {
  const a = req.session?.managerApproval;
  return !!a && a.until > Date.now();
}

export function requireManagerOrOwner(req: Request, res: Response, next: NextFunction): void {
  // Whitelist the allowed roles rather than blacklisting "cashier": an unknown
  // or undefined role must be denied, not implicitly permitted.
  if (!isManagerOrOwner(req)) {
    res.status(403).json({ error: "Forbidden: manager or owner role required", code: "manager_required" });
    return;
  }
  next();
}

/** For till actions a cashier may do with a manager standing next to them
 *  (refund, void, issuing credit): a manager/owner session, or a manager PIN
 *  entered at this till moments ago. The 403 carries a code the POS answers
 *  with a PIN prompt and a retry. */
export function requireManagerOrApproval(req: Request, res: Response, next: NextFunction): void {
  if (isManagerOrOwner(req) || hasFreshManagerApproval(req)) { next(); return; }
  res.status(403).json({
    error: "A manager or owner needs to approve this — ask them to enter their PIN.",
    code: "manager_approval_required",
  });
}

export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.staffRole !== "owner") {
    res.status(403).json({ error: "Only the owner can do this", code: "owner_required" });
    return;
  }
  next();
}

/** For a write that mixes everyday fields with sensitive ones (a product's
 *  description vs its price, the till's grid layout vs its payment methods):
 *  touching any of `fields` needs a manager — or, with `allowApproval`, a
 *  manager's PIN at the till. Other fields stay open to every role. */
export function managerOnlyFields(fields: readonly string[], opts: { allowApproval?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const touched = fields.filter((f) => body[f] !== undefined);
    if (touched.length === 0 || isManagerOrOwner(req)) { next(); return; }
    if (opts.allowApproval) {
      requireManagerOrApproval(req, res, next);
      return;
    }
    res.status(403).json({
      error: `Only a manager or owner can change ${touched.join(", ")}`,
      code: "manager_required",
    });
  };
}

/** In a handler, once the stored row is loaded: if any listed field differs
 *  from what is stored, a manager (or a manager's PIN at the till) is needed.
 *  Edit forms resend every field, so "sent" is not "changed" — this compares.
 *  Returns false after sending the 403; the handler should return. */
export function allowSensitiveChanges(
  req: Request,
  res: Response,
  changes: Array<[field: string, sent: unknown, stored: unknown]>,
): boolean {
  const norm = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const numericEq = (a: unknown, b: unknown) =>
    a != null && b != null && a !== "" && b !== "" && !isNaN(Number(a)) && !isNaN(Number(b)) && Number(a) === Number(b);
  const changed = changes
    .filter(([, sent, stored]) => sent !== undefined && !numericEq(sent, stored) && norm(sent) !== norm(stored))
    .map(([f]) => f);
  if (changed.length === 0 || isManagerOrOwner(req) || hasFreshManagerApproval(req)) return true;
  res.status(403).json({
    error: `A manager or owner needs to approve changing ${changed.join(", ")} — ask them to enter their PIN.`,
    code: "manager_approval_required",
  });
  return false;
}
