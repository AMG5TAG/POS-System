import { Router, type IRouter } from "express";
import { db, stickerTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function fmt(row: typeof stickerTemplatesTable.$inferSelect) {
  return {
    id:          row.templateId,
    name:        row.name,
    description: row.description,
    typeId:      row.typeId,
    sizeId:      row.sizeId,
    fields:      JSON.parse(row.fields || "{}") as Record<string, unknown>,
    isDefault:   row.isDefault === "true",
    createdAt:   row.createdAt.getTime(),
    updatedAt:   row.updatedAt.getTime(),
  };
}

router.get("/sticker-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db.select().from(stickerTemplatesTable).where(eq(stickerTemplatesTable.merchantId, merchantId));
  res.json(rows.map(fmt));
});

router.post("/sticker-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Record<string, unknown>;
  const templateId = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();

  const [row] = await db.insert(stickerTemplatesTable).values({
    merchantId,
    templateId,
    name:        String(body.name        ?? ""),
    description: String(body.description ?? ""),
    typeId:      String(body.typeId      ?? ""),
    sizeId:      String(body.sizeId      ?? ""),
    fields:      JSON.stringify(body.fields ?? {}),
    isDefault:   body.isDefault ? "true" : "false",
  }).returning();

  res.status(201).json(fmt(row!));
});

router.put("/sticker-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = req.params.id as string;
  const body = req.body as Record<string, unknown>;

  const updates: Partial<typeof stickerTemplatesTable.$inferInsert> = {};
  if (body.name        !== undefined) updates.name        = String(body.name);
  if (body.description !== undefined) updates.description = String(body.description);
  if (body.typeId      !== undefined) updates.typeId      = String(body.typeId);
  if (body.sizeId      !== undefined) updates.sizeId      = String(body.sizeId);
  if (body.fields      !== undefined) updates.fields      = JSON.stringify(body.fields);
  if (body.isDefault   !== undefined) updates.isDefault   = body.isDefault ? "true" : "false";

  const [row] = await db.update(stickerTemplatesTable)
    .set(updates)
    .where(and(eq(stickerTemplatesTable.templateId, id), eq(stickerTemplatesTable.merchantId, merchantId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(fmt(row));
});

router.delete("/sticker-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = req.params.id as string;
  await db.delete(stickerTemplatesTable)
    .where(and(eq(stickerTemplatesTable.templateId, id), eq(stickerTemplatesTable.merchantId, merchantId)));
  res.status(204).send();
});

router.post("/sticker-templates/:id/set-default", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = req.params.id as string;

  const [target] = await db.select().from(stickerTemplatesTable)
    .where(and(eq(stickerTemplatesTable.templateId, id), eq(stickerTemplatesTable.merchantId, merchantId)));
  if (!target) { res.status(404).json({ error: "Template not found" }); return; }

  const newIsDefault = target.isDefault !== "true";

  if (newIsDefault) {
    await db.update(stickerTemplatesTable)
      .set({ isDefault: "false" })
      .where(and(eq(stickerTemplatesTable.merchantId, merchantId), eq(stickerTemplatesTable.typeId, target.typeId)));
  }

  await db.update(stickerTemplatesTable)
    .set({ isDefault: newIsDefault ? "true" : "false" })
    .where(and(eq(stickerTemplatesTable.templateId, id), eq(stickerTemplatesTable.merchantId, merchantId)));

  const rows = await db.select().from(stickerTemplatesTable).where(eq(stickerTemplatesTable.merchantId, merchantId));
  res.json(rows.map(fmt));
});

export default router;
