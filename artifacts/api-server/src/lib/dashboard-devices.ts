import crypto from "node:crypto";
import { db, dashboardAppDevicesTable } from "@workspace/db";
import { and, eq, lt, gt, sql } from "drizzle-orm";

/**
 * Screen approval for the public Dashboard link.
 *
 * The access code in the URL says which dashboard; this says which *screen*.
 * A browser keeps a random secret in localStorage and sends it with every
 * snapshot request (`X-Dashboard-Device`). The first request from an unknown
 * secret opens a pending request that staff approve or deny from the POS; an
 * approved secret keeps working until revoked. Only the secret's SHA-256 is
 * stored, so a database read can't be replayed as a screen.
 */

export const DEVICE_HEADER = "x-dashboard-device";

/** A waiting screen polls; one that stopped polling this long ago has gone away. */
export const PENDING_LIVE_MS = 2 * 60 * 1000;
/** Pending rows unseen this long are deleted when a new request arrives. */
const PENDING_PRUNE_MS = 15 * 60 * 1000;
/** Cap on live pending requests, so someone holding the code can't flood the POS. */
const MAX_LIVE_PENDING = 10;
/** Approved screens refresh every minute; record that they were seen at most this often. */
const SEEN_WRITE_MS = 5 * 60 * 1000;

export function isValidDeviceSecret(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
}

export function hashDeviceSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function newPairCode(): string {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
}

export type DeviceGate =
  | { state: "approved" }
  | { state: "pending"; pairCode: string }
  | { state: "denied" }
  | { state: "busy" };

/** Resolve (or open) this browser's approval for the merchant's dashboard. */
export async function gateDevice(
  merchantId: number,
  secret: string,
  meta: { ip?: string; userAgent?: string },
): Promise<DeviceGate> {
  const secretHash = hashDeviceSecret(secret);
  const now = new Date();
  const [row] = await db
    .select()
    .from(dashboardAppDevicesTable)
    .where(and(eq(dashboardAppDevicesTable.merchantId, merchantId), eq(dashboardAppDevicesTable.secretHash, secretHash)))
    .limit(1);

  if (row) {
    if (row.status === "denied") return { state: "denied" };
    const stale = now.getTime() - row.lastSeenAt.getTime() > (row.status === "pending" ? 0 : SEEN_WRITE_MS);
    if (stale) {
      await db
        .update(dashboardAppDevicesTable)
        .set({ lastSeenAt: now, ipAddress: meta.ip ?? row.ipAddress, userAgent: meta.userAgent ?? row.userAgent })
        .where(eq(dashboardAppDevicesTable.id, row.id));
    }
    return row.status === "approved" ? { state: "approved" } : { state: "pending", pairCode: row.pairCode };
  }

  await db
    .delete(dashboardAppDevicesTable)
    .where(and(
      eq(dashboardAppDevicesTable.merchantId, merchantId),
      eq(dashboardAppDevicesTable.status, "pending"),
      lt(dashboardAppDevicesTable.lastSeenAt, new Date(now.getTime() - PENDING_PRUNE_MS)),
    ));
  const [{ live }] = await db
    .select({ live: sql<number>`count(*)::int` })
    .from(dashboardAppDevicesTable)
    .where(and(
      eq(dashboardAppDevicesTable.merchantId, merchantId),
      eq(dashboardAppDevicesTable.status, "pending"),
      gt(dashboardAppDevicesTable.lastSeenAt, new Date(now.getTime() - PENDING_LIVE_MS)),
    ));
  if (live >= MAX_LIVE_PENDING) return { state: "busy" };

  const [created] = await db
    .insert(dashboardAppDevicesTable)
    .values({ merchantId, secretHash, pairCode: newPairCode(), ipAddress: meta.ip, userAgent: meta.userAgent })
    .onConflictDoNothing()
    .returning();
  // Lost a race with this browser's own concurrent request: read the winner.
  if (!created) return gateDevice(merchantId, secret, meta);
  return { state: "pending", pairCode: created.pairCode };
}
