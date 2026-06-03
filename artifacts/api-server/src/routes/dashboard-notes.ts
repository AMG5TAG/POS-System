import { Router, type IRouter } from "express";
import { db, dashboardNotesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const serialize = (row: typeof dashboardNotesTable.$inferSelect) => ({
  id:         row.id,
  merchantId: row.merchantId,
  text:       row.text,
  isCritical: row.isCritical,
  createdAt:  row.createdAt,
  updatedAt:  row.updatedAt,
});

router.get("/dashboard-notes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select()
    .from(dashboardNotesTable)
    .where(eq(dashboardNotesTable.merchantId, merchantId))
    .orderBy(asc(dashboardNotesTable.createdAt));
  res.json({ items: rows.map(serialize) });
});

router.post("/dashboard-notes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { text, isCritical } = req.body as { text: string; isCritical?: boolean };
  if (!text?.trim()) { res.status(400).json({ error: "Text is required" }); return; }
  const [created] = await db
    .insert(dashboardNotesTable)
    .values({ merchantId, text: text.trim(), isCritical: isCritical ?? false })
    .returning();
  res.status(201).json(serialize(created!));
});

router.delete("/dashboard-notes/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(dashboardNotesTable)
    .where(and(eq(dashboardNotesTable.id, id), eq(dashboardNotesTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
