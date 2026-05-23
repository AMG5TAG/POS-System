import { Router, type IRouter } from "express";
import { db, loyaltySettingsTable, customersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateLoyaltySettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_CONFIG = {
  cashbackRate: 0.01,
  pointsPerDollar: 1,
  dollarPerPoint: 0.01,
  tiers: [
    { name: "Bronze", minSpend: 0, rate: 0.01, pointsRequired: 0, discountPct: 0, freeShipping: false, bonusMultiplier: 1, description: "" },
    { name: "Silver", minSpend: 500, rate: 0.02, pointsRequired: 500, discountPct: 2, freeShipping: false, bonusMultiplier: 1.2, description: "Free priority support" },
    { name: "Gold",   minSpend: 1000, rate: 0.03, pointsRequired: 1000, discountPct: 5, freeShipping: true, bonusMultiplier: 1.5, description: "Free shipping + 5% off" },
  ],
  stampsRequired: 10,
  stampRewardValue: 10,
  customDescription: "",
  customValue: 0.01,
  excludedCustomerGroups: [] as string[],
  expiryMode: "none" as "none" | "daysSinceLastPurchase" | "fixedDays" | "endOfYear" | "fixedDate",
  expiryValue: null as number | null,
  promotions: [] as unknown[],
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
    promotions:             (cfg.promotions as unknown[])          ?? DEFAULT_CONFIG.promotions,
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

/* — Top loyalty earners — */
router.get("/loyalty/leaderboard", requireAuth, async (req, res): Promise<void> => {
  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.merchantId, req.session.merchantId!))
    .orderBy(desc(customersTable.loyaltyPoints))
    .limit(10);

  const [settingsRow] = await db
    .select()
    .from(loyaltySettingsTable)
    .where(eq(loyaltySettingsTable.merchantId, req.session.merchantId!));
  const tiers = ((settingsRow?.config as Record<string, unknown>)?.tiers ?? []) as Array<{
    name: string; minSpend?: number; pointsRequired?: number; rate?: number;
    discountPct?: number; freeShipping?: boolean; bonusMultiplier?: number; description?: string;
  }>;
  const sortedTiers = [...tiers].sort((a, b) => (b.pointsRequired ?? b.minSpend ?? 0) - (a.pointsRequired ?? a.minSpend ?? 0));

  function getTier(customer: typeof customersTable.$inferSelect) {
    const tier = sortedTiers.find((t) => {
      if (t.pointsRequired != null) return customer.loyaltyPoints >= t.pointsRequired;
      return (customer.totalSpent ? parseFloat(customer.totalSpent) : 0) >= (t.minSpend ?? 0);
    });
    return tier ?? sortedTiers[sortedTiers.length - 1] ?? null;
  }

  function pointsUntilNext(customer: typeof customersTable.$inferSelect, currentTierName: string | null) {
    const currentIdx = sortedTiers.findIndex((t) => t.name === currentTierName);
    const next = sortedTiers[currentIdx - 1];
    if (!next) return null;
    if (next.pointsRequired != null) return Math.max(0, next.pointsRequired - customer.loyaltyPoints);
    const minSpend = next.minSpend ?? 0;
    const spent = customer.totalSpent ? parseFloat(customer.totalSpent) : 0;
    return Math.max(0, Math.ceil(minSpend - spent));
  }

  const items = customers.map((c, i) => {
    const tier = getTier(c);
    return {
      rank: i + 1,
      customer: {
        id: c.id,
        merchantId: c.merchantId,
        firstName: c.firstName ?? null,
        lastName: c.lastName ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        address: c.address ?? null,
        notes: c.notes ?? null,
        dateOfBirth: c.dateOfBirth ?? null,
        loyaltyPoints: c.loyaltyPoints,
        totalSpent: parseFloat(c.totalSpent),
        visitCount: c.visitCount,
        createdAt: c.createdAt.toISOString(),
        company: c.company ?? null,
        abn: c.abn ?? null,
        referredBy: c.referredBy ?? null,
        whatsappSameAsPhone: c.whatsappSameAsPhone ?? null,
        billingStreet: c.billingStreet ?? null,
        billingCity: c.billingCity ?? null,
        billingState: c.billingState ?? null,
        billingPostcode: c.billingPostcode ?? null,
        billingCountry: c.billingCountry ?? null,
        shippingStreet: c.shippingStreet ?? null,
        shippingCity: c.shippingCity ?? null,
        shippingState: c.shippingState ?? null,
        shippingPostcode: c.shippingPostcode ?? null,
        shippingCountry: c.shippingCountry ?? null,
        customerGroup: c.customerGroup ?? null,
        warningNote: c.warningNote ?? null,
        agreedToMarketing: c.agreedToMarketing ?? null,
        portalToken: c.portalToken ?? null,
      },
      currentTier: tier?.name ?? null,
      pointsUntilNextTier: pointsUntilNext(c, tier?.name ?? null),
    };
  });

  res.json({ items });
});

export default router;
