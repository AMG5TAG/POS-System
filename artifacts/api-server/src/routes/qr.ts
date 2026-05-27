import { Router, type IRouter } from "express";
import { db, qrCodesTable, qrSettingsTable, qrSavedTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/api/qr-codes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(qrCodesTable).where(eq(qrCodesTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/api/qr-codes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { entryId, label, url = "", qrType = "website", content = "{}", settings = "{}" } = req.body;
  if (!entryId || !label) { res.status(400).json({ error: "entryId and label are required" }); return; }
  const [row] = await db.insert(qrCodesTable).values({ merchantId, entryId, label, url, qrType, content, settings }).returning();
  res.status(201).json(row);
});

router.delete("/api/qr-codes/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(qrCodesTable).where(and(eq(qrCodesTable.id, id), eq(qrCodesTable.merchantId, merchantId)));
  res.status(204).end();
});

router.get("/api/qr-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(qrSettingsTable).where(eq(qrSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(qrSettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/api/qr-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Partial<typeof qrSettingsTable.$inferInsert>;
  const [existing] = await db.select().from(qrSettingsTable).where(eq(qrSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(qrSettingsTable).set(body).where(eq(qrSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(qrSettingsTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

router.get("/api/qr-saved-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(qrSavedTemplatesTable).where(eq(qrSavedTemplatesTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/api/qr-saved-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { templateId, name, settings = "{}" } = req.body;
  if (!templateId || !name) { res.status(400).json({ error: "templateId and name are required" }); return; }
  const [row] = await db.insert(qrSavedTemplatesTable).values({ merchantId, templateId, name, settings }).returning();
  res.status(201).json(row);
});

router.delete("/api/qr-saved-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(qrSavedTemplatesTable).where(and(eq(qrSavedTemplatesTable.id, id), eq(qrSavedTemplatesTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
