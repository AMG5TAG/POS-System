import { Router, type IRouter } from "express";
import { db, posFavouritesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/pos-favourites", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const registerId = req.query.registerId;
  if (registerId !== undefined && typeof registerId !== "string") { res.status(400).json({ error: "Invalid registerId" }); return; }
  const [row] = await db.select()
    .from(posFavouritesTable)
    .where(
      and(
        eq(posFavouritesTable.merchantId, merchantId),
        registerId ? eq(posFavouritesTable.registerId, registerId as string) : eq(posFavouritesTable.registerId, "default")
      )
    )
    .limit(1);
  if (!row) {
    const [created] = await db.insert(posFavouritesTable).values({ merchantId, registerId: (registerId as string | undefined) || "default" }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/pos-favourites", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { registerId = "default", productIds } = req.body;
  const [existing] = await db.select()
    .from(posFavouritesTable)
    .where(and(eq(posFavouritesTable.merchantId, merchantId), eq(posFavouritesTable.registerId, registerId)))
    .limit(1);
  if (existing) {
    const [updated] = await db.update(posFavouritesTable).set({ productIds })
      .where(and(eq(posFavouritesTable.merchantId, merchantId), eq(posFavouritesTable.registerId, registerId))).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(posFavouritesTable).values({ merchantId, registerId, productIds }).returning();
  res.json(created);
});

export default router;
