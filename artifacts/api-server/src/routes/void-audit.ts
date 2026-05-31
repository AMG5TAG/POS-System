import { Router, type IRouter } from "express";
import { db, voidAuditLog } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { z } from "zod/v4";

const router: IRouter = Router();

const CreateVoidAuditBody = z.object({
  productId:   z.number().int().optional().nullable(),
  productName: z.string().min(1),
  quantity:    z.number().int().min(1).default(1),
  unitPrice:   z.number().optional().nullable(),
  action:      z.enum(["void", "discount_override"]).default("void"),
  reason:      z.string().optional().nullable(),
  staffId:     z.number().int().optional().nullable(),
  staffName:   z.string().optional().nullable(),
});

const ListVoidAuditQuery = z.object({
  days:   z.coerce.number().int().min(1).max(365).default(30),
  limit:  z.coerce.number().int().min(1).max(500).default(200),
  action: z.enum(["void", "discount_override"]).optional(),
});

// GET /void-audit
router.get("/void-audit", requireAuth, async (req, res): Promise<void> => {
  const q = ListVoidAuditQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const merchantId = req.session.merchantId!;
  const since = new Date(Date.now() - q.data.days * 86400_000);
  const conditions = [
    eq(voidAuditLog.merchantId, merchantId),
    gte(voidAuditLog.createdAt, since),
  ];
  if (q.data.action) conditions.push(eq(voidAuditLog.action, q.data.action));

  const rows = await db.select().from(voidAuditLog)
    .where(and(...conditions))
    .orderBy(desc(voidAuditLog.createdAt))
    .limit(q.data.limit);

  res.json(rows.map(r => ({
    ...r,
    unitPrice: r.unitPrice != null ? parseFloat(String(r.unitPrice)) : null,
    createdAt: r.createdAt.toISOString(),
  })));
});

// POST /void-audit
router.post("/void-audit", requireAuth, async (req, res): Promise<void> => {
  const b = CreateVoidAuditBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: b.error.message }); return; }
  const merchantId = req.session.merchantId!;
  const [row] = await db.insert(voidAuditLog).values({
    merchantId,
    productId:   b.data.productId ?? null,
    productName: b.data.productName,
    quantity:    b.data.quantity,
    unitPrice:   b.data.unitPrice != null ? String(b.data.unitPrice) : null,
    action:      b.data.action,
    reason:      b.data.reason ?? null,
    staffId:     b.data.staffId ?? null,
    staffName:   b.data.staffName ?? null,
  }).returning();
  res.status(201).json({
    ...row,
    unitPrice: row.unitPrice != null ? parseFloat(String(row.unitPrice)) : null,
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
