import { Router, type IRouter } from "express";
import { db, businessProfileTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function fmt(row: typeof businessProfileTable.$inferSelect) {
  return {
    abn:          row.abn,
    tagline:      row.tagline,
    description:  row.description,
    openingDate:  row.openingDate,
    categories:   JSON.parse(row.categories  || "[]"),
    logo:         row.logo,
    brandFont:    row.brandFont,
    brandColors:  JSON.parse(row.brandColors  || "[]"),
    bgColors:     JSON.parse(row.bgColors     || "[]"),
    textColors:   JSON.parse(row.textColors   || "[]"),
    contactEmail: row.contactEmail,
    website:      row.website,
    state:        row.state,
    postcode:     row.postcode,
    openingHours: JSON.parse(row.openingHours || "{}"),
    paymentTypes: JSON.parse(row.paymentTypes || "[]"),
    socialLinks:  JSON.parse(row.socialLinks  || "{}"),
    customLinks:  JSON.parse(row.customLinks  || "[]"),
    updatedAt:    row.updatedAt,
  };
}

const DEFAULTS = {
  abn: "", tagline: "", description: "", openingDate: "",
  categories: [], logo: "", brandFont: "",
  brandColors: ["#efbf04", "#374151", "#6b7280", "#d1d5db"],
  bgColors: ["#ffffff", "#f9fafb", "#f3f4f6"],
  textColors: ["#111827", "#6b7280"],
  contactEmail: "", website: "", state: "", postcode: "",
  openingHours: {} as Record<string, unknown>,
  paymentTypes: ["Cash", "EFTPOS", "Mastercard", "Visa"],
  socialLinks: { facebook: "", instagram: "", twitter: "", linkedin: "", youtube: "", tiktok: "" },
  customLinks: [] as unknown[],
};

router.get("/business-profile", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId));
  res.json(row ? fmt(row) : DEFAULTS);
});

router.put("/business-profile", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Record<string, unknown>;

  const data = {
    abn:          String(body.abn          ?? ""),
    tagline:      String(body.tagline      ?? ""),
    description:  String(body.description  ?? ""),
    openingDate:  String(body.openingDate  ?? ""),
    categories:   JSON.stringify(body.categories  ?? []),
    logo:         String(body.logo         ?? ""),
    brandFont:    String(body.brandFont    ?? ""),
    brandColors:  JSON.stringify(body.brandColors  ?? []),
    bgColors:     JSON.stringify(body.bgColors     ?? []),
    textColors:   JSON.stringify(body.textColors   ?? []),
    contactEmail: String(body.contactEmail ?? ""),
    website:      String(body.website      ?? ""),
    state:        String(body.state        ?? ""),
    postcode:     String(body.postcode     ?? ""),
    openingHours: JSON.stringify(body.openingHours ?? {}),
    paymentTypes: JSON.stringify(body.paymentTypes ?? []),
    socialLinks:  JSON.stringify(body.socialLinks  ?? {}),
    customLinks:  JSON.stringify(body.customLinks  ?? []),
  };

  const [existing] = await db.select({ id: businessProfileTable.id }).from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId));
  let row;
  if (existing) {
    [row] = await db.update(businessProfileTable).set(data).where(eq(businessProfileTable.merchantId, merchantId)).returning();
  } else {
    [row] = await db.insert(businessProfileTable).values({ merchantId, ...data }).returning();
  }
  res.json(fmt(row!));
});

export default router;
