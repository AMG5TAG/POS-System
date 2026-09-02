import { Router, type IRouter } from "express";
import { db, timeCardSessionsTable, transactionsTable, productsTable, customersTable } from "@workspace/db";
import { eq, and, desc, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/** Confirm a client-supplied FK id belongs to this merchant, returning the id or
 *  null on mismatch — so a client can't attach another merchant's transaction /
 *  product / customer to a time-card session. */
async function scopedFk(
  table: typeof transactionsTable | typeof productsTable | typeof customersTable,
  merchantId: number,
  raw: unknown,
): Promise<number | null> {
  if (raw == null) return null;
  const id = parseInt(String(raw), 10);
  if (!Number.isFinite(id)) return null;
  const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.merchantId, merchantId)));
  return row ? id : null;
}

/* Recompute elapsed seconds for a running session up to `now`, returning the
   fields to persist for a given transition. */
function applyTransition(
  row: { status: string; elapsedSeconds: number; runningSince: Date | null },
  action: "start" | "pause" | "stop",
): { status: string; elapsedSeconds: number; runningSince: Date | null } {
  const now = Date.now();
  const liveElapsed =
    row.status === "running" && row.runningSince
      ? row.elapsedSeconds + Math.max(0, Math.round((now - new Date(row.runningSince).getTime()) / 1000))
      : row.elapsedSeconds;

  if (action === "start") {
    if (row.status === "running") return { status: row.status, elapsedSeconds: row.elapsedSeconds, runningSince: row.runningSince };
    return { status: "running", elapsedSeconds: row.elapsedSeconds, runningSince: new Date(now) };
  }
  if (action === "pause") {
    return { status: "paused", elapsedSeconds: liveElapsed, runningSince: null };
  }
  // stop
  return { status: "stopped", elapsedSeconds: liveElapsed, runningSince: null };
}

router.get("/time-card-sessions", requireAuth, async (req, res): Promise<void> => {
  const mid = req.session.merchantId!;
  const { active } = req.query as { active?: string };
  let rows = await db
    .select()
    .from(timeCardSessionsTable)
    .where(active === "true"
      ? and(eq(timeCardSessionsTable.merchantId, mid), ne(timeCardSessionsTable.status, "stopped"))
      : eq(timeCardSessionsTable.merchantId, mid))
    .orderBy(desc(timeCardSessionsTable.createdAt));
  res.json({ items: rows, total: rows.length });
});

router.post("/time-card-sessions", requireAuth, async (req, res): Promise<void> => {
  const mid = req.session.merchantId!;
  const { transactionId, productId, customerId, customerName, label, purchasedSeconds } = req.body;
  if (!label) { res.status(400).json({ error: "label is required" }); return; }
  if (!purchasedSeconds || purchasedSeconds <= 0) { res.status(400).json({ error: "purchasedSeconds must be > 0" }); return; }

  // Validate FK refs belong to this merchant; drop cross-tenant ids to null.
  const [safeTransactionId, safeProductId, safeCustomerId] = await Promise.all([
    scopedFk(transactionsTable, mid, transactionId),
    scopedFk(productsTable, mid, productId),
    scopedFk(customersTable, mid, customerId),
  ]);

  const [row] = await db.insert(timeCardSessionsTable).values({
    merchantId: mid,
    transactionId: safeTransactionId,
    productId: safeProductId,
    customerId: safeCustomerId,
    customerName: customerName || "Walk-in",
    label,
    purchasedSeconds: Math.round(Number(purchasedSeconds)),
    status: "ready",
    elapsedSeconds: 0,
    runningSince: null,
  }).returning();
  res.status(201).json(row);
});

router.patch("/time-card-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const mid = req.session.merchantId!;
  const action = req.body?.action as "start" | "pause" | "stop" | undefined;
  if (!action || !["start", "pause", "stop"].includes(action)) {
    res.status(400).json({ error: "action must be start, pause or stop" }); return;
  }

  const [existing] = await db.select().from(timeCardSessionsTable)
    .where(and(eq(timeCardSessionsTable.id, id), eq(timeCardSessionsTable.merchantId, mid)));
  if (!existing) { res.status(404).json({ error: "Time card session not found" }); return; }

  const next = applyTransition(existing, action);
  const [row] = await db.update(timeCardSessionsTable)
    .set(next)
    .where(and(eq(timeCardSessionsTable.id, id), eq(timeCardSessionsTable.merchantId, mid)))
    .returning();
  res.json(row);
});

router.delete("/time-card-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(timeCardSessionsTable).where(
    and(eq(timeCardSessionsTable.id, id), eq(timeCardSessionsTable.merchantId, req.session.merchantId!)),
  );
  res.sendStatus(204);
});

export default router;
