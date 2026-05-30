import { Router, type IRouter } from "express";
import { db, staffNotesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const serialize = (row: typeof staffNotesTable.$inferSelect) => ({
  id:          row.id,
  merchantId:  row.merchantId,
  title:       row.title,
  content:     row.content,
  isImportant: row.isImportant === "true",
  isPinned:    row.isPinned === "true",
  visibleTo:   row.visibleTo,
  createdBy:   row.createdBy,
  createdAt:   row.createdAt,
  updatedAt:   row.updatedAt,
});

router.get("/staff-notes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select()
    .from(staffNotesTable)
    .where(eq(staffNotesTable.merchantId, merchantId))
    .orderBy(staffNotesTable.createdAt);
  res.json({ items: rows.map(serialize) });
});

router.post("/staff-notes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { title, content, isImportant, isPinned, visibleTo, createdBy } = req.body as {
    title: string; content: string; isImportant?: boolean; isPinned?: boolean;
    visibleTo?: string; createdBy?: string;
  };
  if (!title?.trim())   { res.status(400).json({ error: "Title is required" }); return; }
  if (!content?.trim()) { res.status(400).json({ error: "Content is required" }); return; }
  const [created] = await db
    .insert(staffNotesTable)
    .values({
      merchantId, title: title.trim(), content: content.trim(),
      isImportant: isImportant ? "true" : "false",
      isPinned:    isPinned    ? "true" : "false",
      visibleTo:   visibleTo ?? "all",
      createdBy:   createdBy ?? "",
    })
    .returning();
  res.status(201).json(serialize(created!));
});

router.put("/staff-notes/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { title, content, isImportant, isPinned, visibleTo } = req.body as {
    title?: string; content?: string; isImportant?: boolean; isPinned?: boolean; visibleTo?: string;
  };
  const updates: Partial<typeof staffNotesTable.$inferInsert> = {};
  if (title   !== undefined) updates.title       = title.trim();
  if (content !== undefined) updates.content     = content.trim();
  if (isImportant !== undefined) updates.isImportant = isImportant ? "true" : "false";
  if (isPinned    !== undefined) updates.isPinned    = isPinned    ? "true" : "false";
  if (visibleTo   !== undefined) updates.visibleTo   = visibleTo;
  const [updated] = await db
    .update(staffNotesTable)
    .set(updates)
    .where(and(eq(staffNotesTable.id, id), eq(staffNotesTable.merchantId, merchantId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(updated));
});

router.delete("/staff-notes/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(staffNotesTable)
    .where(and(eq(staffNotesTable.id, id), eq(staffNotesTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
