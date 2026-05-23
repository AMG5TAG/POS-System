import { Router, type IRouter } from "express";
import { db, loyaltySettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateLoyaltySettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_CONFIG = {
  cashbackRate: 0.01,
  pointsPerDollar: 1,
  dollarPerPoint: 0.01,
  tiers: [
    { name: "Bronze", minSpend: 0,    rate: 0.01 },
    { name: "Silver", minSpend: 500,  rate: 0.02 },
    { name: "Gold",   minSpend: 1000, rate: 0.03 },
  ],
  stampsRequired: 10,
  stampRewardValue: 10,
  customDescription: "",
  customValue: 0.01,
  excludedCustomerGroups: [] as string[],
  expiryMode: "none" as "none" | "daysSinceLastPurchase" | "fixedDays" | "endOfYear" | "fixedDate",
  expiryValue: null as number | null,
};

function formatSettings(row: typeof loyaltySettingsTable.$inferSelect) {
  const cfg = (row.config ?? {}) as Record<string, unknown>;
  return {
    programType:            row.programType,
    isEnabled:              row.isEnabled === "true",
    cashbackRate:           (cfg.cashbackRate as number)           ?? DEFAULT_CONFIG.cashbackRate,
    pointsPerDollar:        (cfg.pointsPerDollar as number)        ?? DEFAULT_CONFIG.pointsPerDollar,
    dollarPerPoint:         (cfg.dollarPerPoint as number)         ?? DEFAULT_CONFIG.dollarPerPoint,
    tiers:                  (cfg.tiers as typeof DEFAULT_CONFIG.tiers) ?? DEFAULT_CONFIG.tiers,
    stampsRequired:         (cfg.stampsRequired as number)         ?? DEFAULT_CONFIG.stampsRequired,
    stampRewardValue:       (cfg.stampRewardValue as number)       ?? DEFAULT_CONFIG.stampRewardValue,
    customDescription:      (cfg.customDescription as string)      ?? DEFAULT_CONFIG.customDescription,
    customValue:            (cfg.customValue as number)            ?? DEFAULT_CONFIG.customValue,
    excludedCustomerGroups: (cfg.excludedCustomerGroups as string[]) ?? DEFAULT_CONFIG.excludedCustomerGroups,
    expiryMode:             (cfg.expiryMode as typeof DEFAULT_CONFIG.expiryMode) ?? DEFAULT_CONFIG.expiryMode,
    expiryValue:            (cfg.expiryValue as number | null)     ?? DEFAULT_CONFIG.expiryValue,
  };
}

router.get("/loyalty/settings", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(loyaltySettingsTable)
    .where(eq(loyaltySettingsTable.merchantId, req.session.merchantId!));

  if (!row) {
    res.json({
      programType:            "cashback",
      isEnabled:              true,
      ...DEFAULT_CONFIG,
    });
    return;
  }

  res.json(formatSettings(row));
});

router.put("/loyalty/settings", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateLoyaltySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { programType, isEnabled, ...configFields } = parsed.data;

  const [existing] = await db
    .select()
    .from(loyaltySettingsTable)
    .where(eq(loyaltySettingsTable.merchantId, req.session.merchantId!));

  const config = { ...(((existing?.config ?? {}) as object)), ...configFields };

  let row: typeof loyaltySettingsTable.$inferSelect;
  if (existing) {
    [row] = await db
      .update(loyaltySettingsTable)
      .set({
        programType,
        isEnabled: isEnabled ? "true" : "false",
        config,
      })
      .where(eq(loyaltySettingsTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(loyaltySettingsTable)
      .values({
        merchantId: req.session.merchantId!,
        programType,
        isEnabled: isEnabled ? "true" : "false",
        config,
      })
      .returning();
  }

  res.json(formatSettings(row));
});

export default router;
