import { Router, type IRouter } from "express";
import { db, staffTimesheetsTable, staffTable } from "@workspace/db";
import { and, eq, gte, lte, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { matchStaffByPin } from "../lib/staff-pin";

const router: IRouter = Router();

/** Find a merchant's staff member by PIN. PINs are hashed at rest, so we load
 *  the merchant's staff and compare rather than querying `WHERE pin = ?`. */
async function lookupStaffByPin(merchantId: number, pin: string) {
  const staff = await db.select().from(staffTable).where(eq(staffTable.merchantId, merchantId));
  return matchStaffByPin(staff, pin);
}

const serialize = (row: typeof staffTimesheetsTable.$inferSelect) => ({
  id:        row.id,
  staffId:   row.staffId,
  staffName: row.staffName,
  date:      row.date,
  clockIn:   row.clockIn,
  clockOut:  row.clockOut ?? null,
  note:      row.note ?? null,
  createdAt: row.createdAt.toISOString(),
});

router.get("/staff-timesheets", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
  const conditions = [eq(staffTimesheetsTable.merchantId, merchantId)];
  if (startDate) conditions.push(gte(staffTimesheetsTable.date, startDate));
  if (endDate)   conditions.push(lte(staffTimesheetsTable.date, endDate));
  const rows = await db
    .select()
    .from(staffTimesheetsTable)
    .where(and(...conditions))
    .orderBy(staffTimesheetsTable.date, staffTimesheetsTable.clockIn);
  res.json({ items: rows.map(serialize) });
});

// Create entry manually (admin, no PIN required)
router.post("/staff-timesheets", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { staffId, staffName, date, clockIn, clockOut } = req.body as {
    staffId: number; staffName: string; date: string; clockIn: string; clockOut?: string | null;
  };
  if (!staffId || !date || !clockIn) {
    res.status(400).json({ error: "staffId, date and clockIn are required" });
    return;
  }
  const [entry] = await db
    .insert(staffTimesheetsTable)
    .values({ merchantId, staffId, staffName: staffName ?? "", date, clockIn, clockOut: clockOut ?? undefined })
    .returning();
  res.status(201).json(serialize(entry!));
});

// Check staff status by PIN (no mutation)
router.get("/staff-timesheets/status", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { pin } = req.query as { pin?: string };
  if (!pin?.trim()) { res.status(400).json({ error: "PIN is required" }); return; }

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const member = await lookupStaffByPin(merchantId, pin.trim());

  if (!member) { res.status(404).json({ error: "No staff found with that PIN" }); return; }

  const [openEntry] = await db
    .select()
    .from(staffTimesheetsTable)
    .where(
      and(
        eq(staffTimesheetsTable.merchantId, merchantId),
        eq(staffTimesheetsTable.staffId, member.id),
        eq(staffTimesheetsTable.date, dateStr),
        isNull(staffTimesheetsTable.clockOut),
      ),
    )
    .limit(1);

  res.json({
    staffId:      member.id,
    staffName:    member.name,
    clockedIn:    !!openEntry,
    openEntryId:  openEntry?.id ?? null,
    clockInTime:  openEntry?.clockIn ?? null,
  });
});

// Clock in
router.post("/staff-timesheets/clock-in", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { pin } = req.body as { pin?: string };
  if (!pin?.trim()) { res.status(400).json({ error: "PIN is required" }); return; }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const member = await lookupStaffByPin(merchantId, pin.trim());

  if (!member) { res.status(404).json({ error: "No staff found with that PIN" }); return; }

  // Check if already clocked in today
  const [existing] = await db
    .select()
    .from(staffTimesheetsTable)
    .where(
      and(
        eq(staffTimesheetsTable.merchantId, merchantId),
        eq(staffTimesheetsTable.staffId, member.id),
        eq(staffTimesheetsTable.date, dateStr),
        isNull(staffTimesheetsTable.clockOut),
      ),
    )
    .limit(1);

  if (existing) {
    res.status(409).json({ error: `${member.name} is already clocked in at ${existing.clockIn}` });
    return;
  }

  const [entry] = await db
    .insert(staffTimesheetsTable)
    .values({ merchantId, staffId: member.id, staffName: member.name, date: dateStr, clockIn: timeStr })
    .returning();

  res.status(201).json(serialize(entry!));
});

// Clock out
router.post("/staff-timesheets/clock-out", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { pin } = req.body as { pin?: string };
  if (!pin?.trim()) { res.status(400).json({ error: "PIN is required" }); return; }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const member = await lookupStaffByPin(merchantId, pin.trim());

  if (!member) { res.status(404).json({ error: "No staff found with that PIN" }); return; }

  const [openEntry] = await db
    .select()
    .from(staffTimesheetsTable)
    .where(
      and(
        eq(staffTimesheetsTable.merchantId, merchantId),
        eq(staffTimesheetsTable.staffId, member.id),
        eq(staffTimesheetsTable.date, dateStr),
        isNull(staffTimesheetsTable.clockOut),
      ),
    )
    .limit(1);

  if (!openEntry) {
    res.status(409).json({ error: `${member.name} is not currently clocked in` });
    return;
  }

  const [updated] = await db
    .update(staffTimesheetsTable)
    .set({ clockOut: timeStr })
    .where(eq(staffTimesheetsTable.id, openEntry.id))
    .returning();

  res.json(serialize(updated!));
});

router.put("/staff-timesheets/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { clockIn, clockOut, date, note } = req.body as {
    clockIn?: string; clockOut?: string | null; date?: string; note?: string;
  };
  const updates: Partial<typeof staffTimesheetsTable.$inferInsert> = {};
  if (clockIn   !== undefined) updates.clockIn  = clockIn;
  if (clockOut  !== undefined) updates.clockOut = clockOut ?? undefined;
  if (date      !== undefined) updates.date     = date;
  if (note      !== undefined) updates.note     = note;
  const [updated] = await db
    .update(staffTimesheetsTable)
    .set(updates)
    .where(and(eq(staffTimesheetsTable.id, id), eq(staffTimesheetsTable.merchantId, merchantId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(updated));
});

router.delete("/staff-timesheets/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(staffTimesheetsTable)
    .where(and(eq(staffTimesheetsTable.id, id), eq(staffTimesheetsTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
