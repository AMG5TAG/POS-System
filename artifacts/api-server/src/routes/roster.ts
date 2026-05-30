import { Router, type IRouter } from "express";
import { db, rosterShiftsTable, leaveRequestsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/* ─── Roster Shifts ─────────────────────────────────────────────────────── */

router.get("/roster-shifts", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(rosterShiftsTable).where(eq(rosterShiftsTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/roster-shifts", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { shiftId, staffId, date, startTime = "09:00", endTime = "17:00", note = "" } = req.body as {
    shiftId: string; staffId: string; date: string;
    startTime?: string; endTime?: string; note?: string;
  };
  if (!shiftId || !staffId || !date) {
    res.status(400).json({ error: "shiftId, staffId, and date are required" });
    return;
  }
  const [row] = await db.insert(rosterShiftsTable)
    .values({ merchantId, shiftId, staffId, date, startTime, endTime, note })
    .returning();
  res.status(201).json(row);
});

router.delete("/roster-shifts/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id ?? ""), 10);
  await db.delete(rosterShiftsTable)
    .where(and(eq(rosterShiftsTable.id, id), eq(rosterShiftsTable.merchantId, merchantId)));
  res.status(204).end();
});

/* ─── Leave Requests ────────────────────────────────────────────────────── */

router.get("/leave-requests", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/leave-requests", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const {
    requestId, staffId, staffName, type = "annual",
    startDate, endDate, reason = "", status = "pending",
  } = req.body as {
    requestId: string; staffId: string; staffName: string; type?: string;
    startDate: string; endDate: string; reason?: string; status?: string;
  };
  if (!requestId || !staffId || !staffName || !startDate || !endDate) {
    res.status(400).json({ error: "requestId, staffId, staffName, startDate, and endDate are required" });
    return;
  }
  const [row] = await db.insert(leaveRequestsTable)
    .values({ merchantId, requestId, staffId, staffName, type, startDate, endDate, reason, status })
    .returning();
  res.status(201).json(row);
});

router.patch("/leave-requests/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id ?? ""), 10);
  const { status } = req.body as { status: string };
  if (!status) { res.status(400).json({ error: "status is required" }); return; }
  const [row] = await db.update(leaveRequestsTable)
    .set({ status })
    .where(and(eq(leaveRequestsTable.id, id), eq(leaveRequestsTable.merchantId, merchantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
