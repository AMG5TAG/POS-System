import { Router, type IRouter } from "express";
import { db, timeCardSessionsTable } from "@workspace/db";
import { eq, and, desc, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

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

  const [row] = await db.insert(timeCardSessionsTable).values({
    merchantId: mid,
    transactionId: transactionId != null ? parseInt(String(transactionId)) : null,
    productId: productId != null ? parseInt(String(productId)) : null,
    customerId: customerId != null ? parseInt(String(customerId)) : null,
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
