import { Router, type IRouter } from "express";
import { db, customerSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function fmt(row: typeof customerSettingsTable.$inferSelect) {
  return {
    groups:                 JSON.parse(row.groups         || "[]"),
    requiredFields:         JSON.parse(row.requiredFields || "{}"),
    defaultGroup:           row.defaultGroup,
    loyaltyPointsPerDollar: row.loyaltyPointsPerDollar,
    enableLoyalty:          row.enableLoyalty === "true",
    weeklyDigestOptIn:      row.weeklyDigestOptIn === "true",
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

const DEFAULTS = {
  groups:                 DEFAULT_GROUPS,
  requiredFields:         { email: false, phone: false, dateOfBirth: false, company: false, abn: false, billingAddress: false },
  defaultGroup:           "Standard",
  loyaltyPointsPerDollar: 1,
  enableLoyalty:          true,
};

router.get("/customer-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(customerSettingsTable).where(eq(customerSettingsTable.merchantId, merchantId));
  res.json(row ? fmt(row) : DEFAULTS);
});

router.put("/customer-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Record<string, unknown>;

  const data = {
    groups:                 JSON.stringify(body.groups         ?? DEFAULT_GROUPS),
    requiredFields:         JSON.stringify(body.requiredFields ?? {}),
    defaultGroup:           String(body.defaultGroup ?? "Standard"),
    loyaltyPointsPerDollar: Number(body.loyaltyPointsPerDollar ?? 1),
    enableLoyalty:          String(body.enableLoyalty === false ? "false" : "true"),
    weeklyDigestOptIn:      String(body.weeklyDigestOptIn === true ? "true" : "false"),
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

export default router;
