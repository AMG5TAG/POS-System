import { Router, type IRouter } from "express";
import { db, posStaffSessionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { z } from "zod";

const router: IRouter = Router();

router.get("/pos-staff-sessions", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const registerId = req.query.registerId;
  if (registerId !== undefined && typeof registerId !== "string") { res.status(400).json({ error: "Invalid registerId" }); return; }
  const items = await db.select()
    .from(posStaffSessionsTable)
    .where(
      and(
        eq(posStaffSessionsTable.merchantId, merchantId),
        registerId ? eq(posStaffSessionsTable.registerId, registerId as string) : undefined
      )
    )
    .orderBy(desc(posStaffSessionsTable.loggedInAt));
  res.json({ items, total: items.length });
});

const CreatePosStaffSessionBody = z.object({
  registerId: z.string().optional(),
  staffId:    z.number().int().positive("staffId must be a positive integer"),
  staffName:  z.string().optional(),
  staffPin:   z.string().optional(),
});

router.post("/pos-staff-sessions", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = CreatePosStaffSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" }); return; }
  const { registerId = "default", staffId, staffName = "", staffPin = "" } = parsed.data;
  const [row] = await db.insert(posStaffSessionsTable).values({
    merchantId, registerId, staffId, staffName, staffPin,
  }).returning();
  res.status(201).json(row);
});

router.delete("/pos-staff-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(posStaffSessionsTable)
    .where(and(eq(posStaffSessionsTable.id, id), eq(posStaffSessionsTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
