import { Router, type IRouter } from "express";
import { db, posStaffSessionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/pos-staff-sessions", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const registerId = req.query.registerId as string | undefined;
  const items = await db.select()
    .from(posStaffSessionsTable)
    .where(
      and(
        eq(posStaffSessionsTable.merchantId, merchantId),
        registerId ? eq(posStaffSessionsTable.registerId, registerId) : undefined
      )
    )
    .orderBy(desc(posStaffSessionsTable.loggedInAt));
  res.json({ items, total: items.length });
});

router.post("/pos-staff-sessions", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { registerId = "default", staffId, staffName = "", staffPin = "" } = req.body;
  const [row] = await db.insert(posStaffSessionsTable).values({
    merchantId, registerId, staffId, staffName, staffPin,
  }).returning();
  res.status(201).json(row);
});

router.delete("/pos-staff-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(posStaffSessionsTable)
    .where(and(eq(posStaffSessionsTable.id, id), eq(posStaffSessionsTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
