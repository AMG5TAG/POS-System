import { Router, type IRouter } from "express";
import { db, salesTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const VALID_TYPES = ["Invoice", "Thermal_Receipt", "Quote", "Service_Ticket", "A4_Receipt"] as const;
type TemplateType = (typeof VALID_TYPES)[number];

function defaultRows(merchantId: number) {
  return VALID_TYPES.map((templateType) => ({
    merchantId,
    templateType,
    headerHtml: "",
    footerHtml: "",
    showLogo: true,
    fontFamily: "inter",
    isDefault: true,
    selectedStyle: "professional",
    options: {},
  }));
}

router.get("/sales-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  let rows = await db
    .select()
    .from(salesTemplatesTable)
    .where(eq(salesTemplatesTable.merchantId, merchantId));

  if (rows.length === 0) {
    rows = await db.insert(salesTemplatesTable).values(defaultRows(merchantId)).returning();
  } else if (rows.length < VALID_TYPES.length) {
    const existingTypes = new Set(rows.map((r) => r.templateType));
    const missing = VALID_TYPES.filter((t) => !existingTypes.has(t));
    if (missing.length > 0) {
      const newRows = await db
        .insert(salesTemplatesTable)
        .values(
          missing.map((templateType) => ({
            merchantId,
            templateType,
            headerHtml: "",
            footerHtml: "",
            showLogo: true,
            fontFamily: "inter",
            isDefault: true,
            selectedStyle: "professional",
            options: {},
          })),
        )
        .returning();
      rows = [...rows, ...newRows];
    }
  }

  res.json({ items: rows, total: rows.length });
});

router.get("/sales-templates/active", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select()
    .from(salesTemplatesTable)
    .where(
      and(
        eq(salesTemplatesTable.merchantId, merchantId),
        eq(salesTemplatesTable.isDefault, true),
      ),
    );
  res.json({ items: rows, total: rows.length });
});

router.put("/sales-templates/:templateType", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { templateType } = req.params as { templateType: string };

  if (!VALID_TYPES.includes(templateType as TemplateType)) {
    res
      .status(400)
      .json({ error: `Invalid templateType. Must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }

  const body = req.body as Partial<
    Omit<typeof salesTemplatesTable.$inferInsert, "id" | "merchantId" | "templateType">
  >;

  const [existing] = await db
    .select()
    .from(salesTemplatesTable)
    .where(
      and(
        eq(salesTemplatesTable.merchantId, merchantId),
        eq(salesTemplatesTable.templateType, templateType),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(salesTemplatesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(
        and(
          eq(salesTemplatesTable.merchantId, merchantId),
          eq(salesTemplatesTable.templateType, templateType),
        ),
      )
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(salesTemplatesTable)
      .values({
        merchantId,
        templateType,
        headerHtml: "",
        footerHtml: "",
        showLogo: true,
        fontFamily: "inter",
        isDefault: true,
        selectedStyle: "professional",
        options: {},
        ...body,
      })
      .returning();
    res.status(201).json(created);
  }
});

export default router;
