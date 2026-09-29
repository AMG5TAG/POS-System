import { Router, type IRouter } from "express";
import { db, customerSettingsTable, customersTable } from "@workspace/db";
import { and, eq, isNull, or, inArray } from "drizzle-orm";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function fmt(row: typeof customerSettingsTable.$inferSelect) {
  return {
    groups:                 JSON.parse(row.groups              || "[]"),
    requiredFields:         JSON.parse(row.requiredFields      || "{}"),
    heardFromSources:       JSON.parse(row.heardFromSources    || "[]"),
    defaultGroup:           row.defaultGroup,
    loyaltyPointsPerDollar: row.loyaltyPointsPerDollar,
    enableLoyalty:          row.enableLoyalty === "true",
    weeklyDigestOptIn:      row.weeklyDigestOptIn === "true",
    weeklyDigestSendDay:    row.weeklyDigestSendDay,
    referralSettings:       JSON.parse(row.referralSettings    || "{}"),
    groupPricing:           JSON.parse(row.groupPricing        || "[]"),
    defaultCustomerImageUrl: row.defaultCustomerImageUrl,
    updatedAt:              row.updatedAt,
  };
}

const DEFAULT_GROUPS = [
  { id: "standard",  name: "Standard",   description: "Regular customers on standard pricing",                  color: "#3b82f6" },
  { id: "vip",       name: "VIP",        description: "High-value customers with exclusive benefits",           color: "#f59e0b" },
  { id: "wholesale", name: "Wholesale",  description: "Wholesale / reseller customers with discounted pricing", color: "#8b5cf6" },
  { id: "trade",     name: "Trade",      description: "Trade account holders",                                  color: "#10b981" },
  { id: "staff",     name: "Staff",      description: "Team members and staff accounts",                        color: "#ef4444" },
];

const DEFAULT_HEARD_FROM_SOURCES = [
  { id: "google",       name: "Google",       requiresDetails: false },
  { id: "social-media", name: "Social Media", requiresDetails: false },
  { id: "friend",       name: "Friend",       requiresDetails: true  },
  { id: "other",        name: "Other",        requiresDetails: true  },
];

const DEFAULTS = {
  groups:                 DEFAULT_GROUPS,
  requiredFields:         { email: false, phone: false, dateOfBirth: false, company: false, abn: false, billingAddress: false },
  heardFromSources:       DEFAULT_HEARD_FROM_SOURCES,
  defaultGroup:           "Standard",
  loyaltyPointsPerDollar: 1,
  enableLoyalty:          true,
  weeklyDigestOptIn:      false,
  weeklyDigestSendDay:    1,
  referralSettings:       {},
  groupPricing:           [],
  defaultCustomerImageUrl: "",
};

router.get("/customer-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(customerSettingsTable).where(eq(customerSettingsTable.merchantId, merchantId));
  res.json(row ? fmt(row) : DEFAULTS);
});

router.put("/customer-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Record<string, unknown>;

  const rawSendDay = Number(body.weeklyDigestSendDay ?? 1);
  const sendDay = Number.isInteger(rawSendDay) && rawSendDay >= 0 && rawSendDay <= 6 ? rawSendDay : 1;

  const data = {
    groups:                 JSON.stringify(body.groups              ?? DEFAULT_GROUPS),
    requiredFields:         JSON.stringify(body.requiredFields      ?? {}),
    heardFromSources:       JSON.stringify(body.heardFromSources    ?? []),
    defaultGroup:           String(body.defaultGroup ?? "Standard"),
    loyaltyPointsPerDollar: Number(body.loyaltyPointsPerDollar ?? 1),
    enableLoyalty:          String(body.enableLoyalty === false ? "false" : "true"),
    weeklyDigestOptIn:      String(body.weeklyDigestOptIn === true ? "true" : "false"),
    weeklyDigestSendDay:    sendDay,
    referralSettings:       JSON.stringify(body.referralSettings ?? {}),
    groupPricing:           JSON.stringify(Array.isArray(body.groupPricing) ? body.groupPricing : []),
    defaultCustomerImageUrl: String(body.defaultCustomerImageUrl ?? ""),
  };

  const [existing] = await db.select({ id: customerSettingsTable.id }).from(customerSettingsTable).where(eq(customerSettingsTable.merchantId, merchantId));
  let row;
  if (existing) {
    [row] = await db.update(customerSettingsTable).set(data).where(eq(customerSettingsTable.merchantId, merchantId)).returning();
  } else {
    [row] = await db.insert(customerSettingsTable).values({ merchantId, ...data }).returning();
  }
  res.json(fmt(row!));
});

/* Stamp the default customer image onto existing customers as their own photo.
   Only customers with no photo, or still carrying the previous default (sent by
   the page that just replaced it), are touched — a photo set for a particular
   customer is never overwritten. Stamped photos then travel with the customer
   (exports, iCloud contacts) even if the default changes later. */
router.post("/customer-settings/apply-default-image", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(customerSettingsTable).where(eq(customerSettingsTable.merchantId, merchantId));
  const image = row?.defaultCustomerImageUrl?.trim() ?? "";
  if (!image) { res.status(400).json({ error: "Set a default customer image first." }); return; }

  const previous = typeof req.body?.previousUrl === "string" ? req.body.previousUrl.trim() : "";
  const replaceable = previous && previous !== image ? ["", previous] : [""];
  const updated = await db
    .update(customersTable)
    .set({ photoUrl: image })
    .where(and(
      eq(customersTable.merchantId, merchantId),
      or(isNull(customersTable.photoUrl), inArray(customersTable.photoUrl, replaceable)),
    ))
    .returning({ id: customersTable.id });
  res.json({ updated: updated.length });
});

export default router;
