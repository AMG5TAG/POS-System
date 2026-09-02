import { Router, type IRouter } from "express";
import { db, productReviewsTable, productsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";

/*
 * Merchant-facing moderation for storefront product reviews. Public submission
 * and listing live in online-store-checkout.ts; these endpoints let the owner
 * hide spam or remove reviews. All scoped to the authenticated merchant.
 */

const router: IRouter = Router();

router.get("/product-reviews", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select({
      id: productReviewsTable.id,
      productId: productReviewsTable.productId,
      productName: productsTable.name,
      authorName: productReviewsTable.authorName,
      authorEmail: productReviewsTable.authorEmail,
      rating: productReviewsTable.rating,
      title: productReviewsTable.title,
      body: productReviewsTable.body,
      status: productReviewsTable.status,
      verified: productReviewsTable.verified,
      createdAt: productReviewsTable.createdAt,
    })
    .from(productReviewsTable)
    .leftJoin(productsTable, eq(productReviewsTable.productId, productsTable.id))
    .where(eq(productReviewsTable.merchantId, merchantId))
    .orderBy(desc(productReviewsTable.createdAt));
  res.json({
    items: rows.map((r) => ({
      ...r,
      productName: r.productName ?? "(deleted product)",
      verified: r.verified === "true",
      createdAt: r.createdAt.toISOString(),
    })),
    total: rows.length,
  });
});

const PatchBody = z.object({ status: z.enum(["approved", "hidden"]) });

router.patch("/product-reviews/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid status" }); return; }
  const [row] = await db.update(productReviewsTable)
    .set({ status: parsed.data.status })
    .where(and(eq(productReviewsTable.id, id), eq(productReviewsTable.merchantId, merchantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: row.id, status: row.status });
});

router.delete("/product-reviews/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(productReviewsTable)
    .where(and(eq(productReviewsTable.id, id), eq(productReviewsTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
