import type { Request } from "express";

/* A new session id on sign-in, keeping what the session already holds.
 *
 * Every login issues a fresh id, so an id planted in the browser beforehand
 * (session fixation) is never the one that becomes signed in. The POS and shop
 * logins use a plain regenerate, which also empties the session. The Tech App
 * and Mobile POS can't: they share the POS's origin and cookie, so emptying it
 * would sign the owner out of the POS the moment a technician PINs into the
 * Tech App in the same browser. Their contents are carried to the new id
 * instead — nothing the old id held is lost, and the old id holds nothing. */
export async function rotateSessionKeeping(req: Request): Promise<void> {
  const carried: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req.session as unknown as Record<string, unknown>)) {
    if (k !== "cookie") carried[k] = v;
  }
  await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  Object.assign(req.session as unknown as Record<string, unknown>, carried);
}
