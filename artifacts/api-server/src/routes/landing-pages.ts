import { Router, type IRouter } from "express";
import { db, landingPagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/api/landing-pages", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(landingPagesTable).where(eq(landingPagesTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/api/landing-pages", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { pageId, slug, title, subtitle = "", bio = "", profileImage = "", bgType = "gradient",
    bgColor = "#007b7d", bgFrom = "#007b7d", bgTo = "#1a2340", bgDir = "to bottom", bgImage = "",
    btnStyle = "pill", btnVariant = "filled", btnBg = "#ffffff", btnText = "#000000",
    btnBorder = "#ffffff", textColor = "#ffffff", font = "Inter", links = "[]" } = req.body;
  if (!pageId || !slug || !title) { res.status(400).json({ error: "pageId, slug, and title are required" }); return; }
  const [row] = await db.insert(landingPagesTable).values({
    merchantId, pageId, slug, title, subtitle, bio, profileImage, bgType, bgColor, bgFrom, bgTo,
    bgDir, bgImage, btnStyle, btnVariant, btnBg, btnText, btnBorder, textColor, font, links,
  }).returning();
  res.status(201).json(row);
});

router.patch("/api/landing-pages/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const body = req.body as Partial<typeof landingPagesTable.$inferInsert>;
  const [row] = await db.update(landingPagesTable).set(body)
    .where(and(eq(landingPagesTable.id, id), eq(landingPagesTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/api/landing-pages/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(landingPagesTable).where(and(eq(landingPagesTable.id, id), eq(landingPagesTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
