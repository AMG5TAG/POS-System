import { Router, type IRouter } from "express";
import { db, landingPagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";

const PostLandingPage = z.object({
  pageId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().default(""),
  bio: z.string().default(""),
  profileImage: z.string().default(""),
  bgType: z.string().default("gradient"),
  bgColor: z.string().default("#007b7d"),
  bgFrom: z.string().default("#007b7d"),
  bgTo: z.string().default("#1a2340"),
  bgDir: z.string().default("to bottom"),
  bgImage: z.string().default(""),
  btnStyle: z.string().default("pill"),
  btnVariant: z.string().default("filled"),
  btnBg: z.string().default("#ffffff"),
  btnText: z.string().default("#000000"),
  btnBorder: z.string().default("#ffffff"),
  textColor: z.string().default("#ffffff"),
  font: z.string().default("Inter"),
  links: z.string().default("[]"),
});

const PatchLandingPage = z.object({
  slug: z.string(), title: z.string(), subtitle: z.string(), bio: z.string(),
  profileImage: z.string(), bgType: z.string(), bgColor: z.string(),
  bgFrom: z.string(), bgTo: z.string(), bgDir: z.string(), bgImage: z.string(),
  btnStyle: z.string(), btnVariant: z.string(), btnBg: z.string(),
  btnText: z.string(), btnBorder: z.string(), textColor: z.string(),
  font: z.string(), links: z.string(),
}).partial();

const router: IRouter = Router();

router.get("/landing-pages/public/:slug", async (req, res): Promise<void> => {
  const slug = req.params.slug as string;
  const [row] = await db.select().from(landingPagesTable).where(eq(landingPagesTable.slug, slug)).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.get("/landing-pages", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(landingPagesTable).where(eq(landingPagesTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/landing-pages", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = PostLandingPage.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { pageId, slug, title, subtitle, bio, profileImage, bgType, bgColor, bgFrom, bgTo,
    bgDir, bgImage, btnStyle, btnVariant, btnBg, btnText, btnBorder, textColor, font, links } = parsed.data;
  const [row] = await db.insert(landingPagesTable).values({
    merchantId, pageId, slug, title, subtitle, bio, profileImage, bgType, bgColor, bgFrom, bgTo,
    bgDir, bgImage, btnStyle, btnVariant, btnBg, btnText, btnBorder, textColor, font, links,
  }).returning();
  res.status(201).json(row);
});

router.patch("/landing-pages/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const parsed = PatchLandingPage.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(landingPagesTable)
    .set(parsed.data)
    .where(and(eq(landingPagesTable.id, id), eq(landingPagesTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/landing-pages/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(landingPagesTable).where(and(eq(landingPagesTable.id, id), eq(landingPagesTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
