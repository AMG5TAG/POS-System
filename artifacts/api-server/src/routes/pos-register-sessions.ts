import { Router, type IRouter } from "express";
import { db, posRegisterSessionsTable, staffTable } from "@workspace/db";
import { eq, and, desc, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";

const PostPosRegisterSession = z.object({
  registerId: z.string().default("default"),
  staffId: z.number().int().nullable().optional(),
  openedBy: z.string().default(""),
  openingFloat: z.string().default("0"),
  openingNotes: z.string().default(""),
  deviceId: z.string().optional(),
});

/** Confirm a client-supplied staffId belongs to this merchant; null otherwise,
 *  so a stale id attributes the till to nobody rather than tripping the FK. */
async function resolveMerchantStaff(merchantId: number, staffId: number | null | undefined): Promise<number | null> {
  if (staffId == null) return null;
  const [row] = await db
    .select({ id: staffTable.id })
    .from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.merchantId, merchantId)));
  return row ? staffId : null;
}

const PatchPosRegisterSession = z.object({
  openedBy: z.string(), openingFloat: z.string(),
  openingNotes: z.string(), sales: z.string(), txCount: z.number().int(),
  closedAt: z.coerce.date().nullable(),
  cashCounted: z.string().nullable(),
  eftposDeclared: z.string().nullable(),
  paymentTotals: z.string().nullable(),
  closingNotes: z.string().nullable(),
  deviceId: z.string().nullable(),
}).partial();

const router: IRouter = Router();

router.get("/pos-register-sessions", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const registerId = req.query.registerId;
  if (registerId !== undefined && typeof registerId !== "string") { res.status(400).json({ error: "Invalid registerId" }); return; }
  const items = await db.select()
    .from(posRegisterSessionsTable)
    .where(
      and(
        eq(posRegisterSessionsTable.merchantId, merchantId),
        registerId ? eq(posRegisterSessionsTable.registerId, registerId) : undefined
      )
    )
    .orderBy(desc(posRegisterSessionsTable.openedAt));
  res.json({ items, total: items.length });
});

router.get("/pos-register-sessions/open", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const registerId = req.query.registerId;
  if (registerId !== undefined && typeof registerId !== "string") { res.status(400).json({ error: "Invalid registerId" }); return; }
  const items = await db.select()
    .from(posRegisterSessionsTable)
    .where(
      and(
        eq(posRegisterSessionsTable.merchantId, merchantId),
        isNull(posRegisterSessionsTable.closedAt),
        registerId ? eq(posRegisterSessionsTable.registerId, registerId) : undefined
      )
    )
    .orderBy(desc(posRegisterSessionsTable.openedAt));
  res.json({ items, total: items.length });
});

router.post("/pos-register-sessions", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = PostPosRegisterSession.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { registerId, staffId, openedBy, openingFloat, openingNotes, deviceId } = parsed.data;
  const safeStaffId = await resolveMerchantStaff(merchantId, staffId);
  const [row] = await db.insert(posRegisterSessionsTable).values({
    merchantId, registerId, staffId: safeStaffId, openedBy, openingFloat, openingNotes,
    ...(deviceId ? { deviceId } : {}),
  }).returning();
  res.status(201).json(row);
});

router.patch("/pos-register-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PatchPosRegisterSession.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const update = { ...parsed.data };
  // When paymentTotals is provided, keep cashCounted and eftposDeclared in sync
  if (update.paymentTotals) {
    try {
      const totals = JSON.parse(update.paymentTotals) as Record<string, number>;
      if (update.cashCounted === undefined && totals.cash !== undefined)   update.cashCounted   = String(totals.cash);
      if (update.eftposDeclared === undefined && totals.eftpos !== undefined) update.eftposDeclared = String(totals.eftpos);
    } catch { /* malformed JSON — ignore */ }
  }

  const [row] = await db.update(posRegisterSessionsTable)
    .set(update)
    .where(and(eq(posRegisterSessionsTable.id, id), eq(posRegisterSessionsTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/pos-register-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(posRegisterSessionsTable)
    .where(and(eq(posRegisterSessionsTable.id, id), eq(posRegisterSessionsTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
