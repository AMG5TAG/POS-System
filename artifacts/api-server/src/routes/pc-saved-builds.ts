import { Router, type IRouter } from "express";
import { db, pcSavedBuildsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const serialize = (row: typeof pcSavedBuildsTable.$inferSelect) => ({
  id:            row.id,
  merchantId:    row.merchantId,
  name:          row.name,
  build:         row.build,
  assemblyHours: parseFloat(row.assemblyHours),
  createdAt:     row.createdAt,
  updatedAt:     row.updatedAt,
});

router.get("/pc-saved-builds", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select()
    .from(pcSavedBuildsTable)
    .where(eq(pcSavedBuildsTable.merchantId, merchantId))
    .orderBy(pcSavedBuildsTable.updatedAt);
  res.json({ items: rows.map(serialize) });
});

router.post("/pc-saved-builds", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { name, build, assemblyHours } = req.body as {
    name: string;
    build: Record<string, number | null>;
    assemblyHours: number;
  };
  if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }

  const [existing] = await db
    .select()
    .from(pcSavedBuildsTable)
    .where(and(eq(pcSavedBuildsTable.merchantId, merchantId), eq(pcSavedBuildsTable.name, name.trim())))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(pcSavedBuildsTable)
      .set({ build: build ?? {}, assemblyHours: String(assemblyHours ?? 0) })
      .where(eq(pcSavedBuildsTable.id, existing.id))
      .returning();
    res.status(200).json(serialize(updated!));
    return;
  }

  const [created] = await db
    .insert(pcSavedBuildsTable)
    .values({ merchantId, name: name.trim(), build: build ?? {}, assemblyHours: String(assemblyHours ?? 0) })
    .returning();
  res.status(201).json(serialize(created!));
});

router.delete("/pc-saved-builds/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(pcSavedBuildsTable)
    .where(and(eq(pcSavedBuildsTable.id, id), eq(pcSavedBuildsTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
