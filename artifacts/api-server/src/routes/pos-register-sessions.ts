import { Router, type IRouter } from "express";
import { db, posRegisterSessionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/pos-register-sessions", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const registerId = req.query.registerId as string | undefined;
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

router.post("/pos-register-sessions", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { registerId = "default", openedBy = "", openingFloat = "0", openingNotes = "" } = req.body;
  const [row] = await db.insert(posRegisterSessionsTable).values({
    merchantId, registerId, openedBy, openingFloat, openingNotes,
  }).returning();
  res.status(201).json(row);
});

router.patch("/pos-register-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const body = req.body as Partial<typeof posRegisterSessionsTable.$inferInsert>;
  const [row] = await db.update(posRegisterSessionsTable).set(body)
    .where(and(eq(posRegisterSessionsTable.id, id), eq(posRegisterSessionsTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/pos-register-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(posRegisterSessionsTable)
    .where(and(eq(posRegisterSessionsTable.id, id), eq(posRegisterSessionsTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
