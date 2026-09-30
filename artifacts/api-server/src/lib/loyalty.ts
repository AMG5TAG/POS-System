/**
 * Loyalty rules shared by the till (routes/transactions.ts) and the online shop
 * (routes/shop.ts). One function decides what a sale earns so the shop's
 * "You'll earn…" can never promise a different figure from the one the sale
 * actually credits. No `db` here: callers load the settings row and pass it in.
 */

export type LoyaltyConfig = Record<string, unknown>;

export type LoyaltyPromotion = {
  id: string; name: string; type: string; active: boolean;
  multiplier?: number; bonusAmount?: number;
  categoryId?: number | null; productId?: number | null;
  minSpend?: number | null; startDate?: string | null; endDate?: string | null;
};

export type EarnLine = { productId: number; totalPrice: number; excludeFromLoyalty: boolean; categoryId: number | null };
export type EarnCustomer = { customerGroup: string | null; totalSpent: string; loyaltyPoints: number; dateOfBirth: string | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Money-valued programs: the balance is dollars of credit. */
export const isMonetaryProgram = (type: string) => type === "cashback" || type === "tiered" || type === "custom";

/**
 * What a sale earns. Units follow the program: dollars for cashback/tiered/
 * custom (capped at the sale total), whole points for points, one stamp per
 * sale for stamp. Nothing is earned without a customer, when paying with
 * loyalty, when the program is off, or for an excluded customer group.
 */
export function loyaltyEarnedFor(input: {
  programType: string; config: LoyaltyConfig; programOn: boolean;
  customer: EarnCustomer | null; paymentMethod?: string;
  lines: EarnLine[]; total: number; now?: Date;
}): number {
  const { programType, config, programOn, customer, lines, total } = input;
  const now = input.now ?? new Date();
  if (!customer || input.paymentMethod === "loyalty" || !programOn) return 0;

  const excluded = ((config.excludedCustomerGroups as string[]) ?? []).map((g) => g.toLowerCase());
  const groupName = (customer.customerGroup ?? "").toLowerCase();
  if (groupName && excluded.includes(groupName)) return 0;

  // Eligible spend = sale total minus lines whose product is excludeFromLoyalty.
  const eligibleTotal = round2(lines.reduce((s, it) => (it.excludeFromLoyalty ? s : s + it.totalPrice), 0));

  let baseEarned = 0;
  switch (programType) {
    case "cashback": {
      const rate = (config.cashbackRate as number) ?? 0.01;
      baseEarned = eligibleTotal * rate;
      break;
    }
    case "points": {
      const ppd = (config.pointsPerDollar as number) ?? 1;
      baseEarned = eligibleTotal * ppd;
      break;
    }
    case "tiered": {
      const tier = currentTier(config, customer);
      baseEarned = eligibleTotal * (tier?.rate ?? 0.01) * (tier?.bonusMultiplier ?? 1);
      break;
    }
    case "stamp": {
      baseEarned = eligibleTotal > 0 ? 1 : 0;
      break;
    }
    case "custom": {
      const rate = (config.customValue as number) ?? 0.01;
      baseEarned = eligibleTotal * rate;
      break;
    }
    default: baseEarned = 0;
  }

  // Active promotions: the best multiplier and the best bonus apply.
  const promotions = (config.promotions ?? []) as LoyaltyPromotion[];
  const today = now.toISOString().slice(0, 10);
  const activePromos = promotions.filter((p) => {
    if (!p.active) return false;
    const inRange = (!p.startDate || p.startDate <= today) && (!p.endDate || p.endDate >= today);
    if (!inRange) return false;
    if (p.type === "spend_threshold" && (p.minSpend == null || total < p.minSpend)) return false;
    if (p.type === "category_bonus" && p.categoryId != null) {
      if (!lines.some((it) => it.categoryId === p.categoryId)) return false;
    }
    if (p.type === "product_bonus" && p.productId != null) {
      return lines.some((it) => it.productId === p.productId);
    }
    if (p.type === "birthday") {
      const dob = customer.dateOfBirth;
      if (!dob) return false;
      const d = new Date(dob);
      return d.getMonth() + 1 === now.getMonth() + 1 && d.getDate() === now.getDate();
    }
    return true;
  });
  const bestMultiplier = activePromos.length > 0 ? Math.max(...activePromos.map((p) => p.multiplier ?? 1)) : 1;
  const bestBonus = activePromos.length > 0 ? Math.max(...activePromos.map((p) => p.bonusAmount ?? 0)) : 0;
  const finalEarned = baseEarned * bestMultiplier + bestBonus;

  // Money never exceeds what was paid; points and stamps are whole counts.
  return isMonetaryProgram(programType)
    ? round2(Math.max(0, Math.min(finalEarned, total)))
    : Math.max(0, Math.floor(finalEarned));
}

type Tier = { name: string; minSpend?: number; pointsRequired?: number; rate?: number; bonusMultiplier?: number; description?: string };

export function currentTier(config: LoyaltyConfig, customer: { totalSpent: string; loyaltyPoints: number }): Tier | undefined {
  const tiers = (config.tiers ?? []) as Tier[];
  const spent = parseFloat(customer.totalSpent);
  const pts = customer.loyaltyPoints ?? 0;
  const sorted = [...tiers].sort((a, b) => (b.pointsRequired ?? b.minSpend ?? 0) - (a.pointsRequired ?? a.minSpend ?? 0));
  return sorted.find((t) => (t.pointsRequired != null ? pts >= t.pointsRequired : spent >= (t.minSpend ?? 0))) ?? sorted[sorted.length - 1];
}

/* ── How the program reads to a customer ─────────────────────────────── */

const UNIT_KEY: Record<string, string> = { cashback: "cashbackUnit", points: "pointsUnit", tiered: "tieredUnit", stamp: "stampUnit", custom: "customUnit" };
const UNIT_DEFAULT: Record<string, string> = { cashback: "Credit", points: "Points", tiered: "Credit", stamp: "Stamps", custom: "Rewards" };

export function loyaltyUnit(programType: string, config: LoyaltyConfig): string {
  const naming = (config.naming ?? {}) as Record<string, string>;
  return naming[UNIT_KEY[programType] ?? ""]?.trim() || UNIT_DEFAULT[programType] || "Points";
}

export function loyaltyName(programType: string, config: LoyaltyConfig): string {
  const naming = (config.naming ?? {}) as Record<string, string>;
  return naming.programName?.trim() || `${loyaltyUnit(programType, config)} rewards`;
}

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;
const pct = (r: number) => `${Math.round(r * 10000) / 100}%`;

/** A balance or an amount earned, in the program's own terms: "$4.20 Koastal Koins", "120 Points", "3 Stamps". */
export function formatLoyalty(programType: string, config: LoyaltyConfig, value: number): string {
  const unit = loyaltyUnit(programType, config);
  if (isMonetaryProgram(programType)) return `$${round2(value).toFixed(2)} ${unit}`;
  const n = Math.floor(value);
  return `${n.toLocaleString("en-AU")} ${unit}`;
}

/** What the shop's rewards section says: the program's name, the earn rule as
 *  "X for every $Y spent", and the other rules that apply. Read from the POS
 *  loyalty settings, so changing them there changes the website. */
export function loyaltyProgramInfo(programType: string, config: LoyaltyConfig, enabled: boolean) {
  const unit = loyaltyUnit(programType, config);
  const details: string[] = [];
  let headline = "";
  switch (programType) {
    case "cashback": {
      const r = (config.cashbackRate as number) ?? 0.01;
      headline = `Earn ${money(r * 100)} in ${unit} for every $100 you spend (${pct(r)} back).`;
      break;
    }
    case "custom": {
      const r = (config.customValue as number) ?? 0.01;
      headline = `Earn ${money(r * 100)} in ${unit} for every $100 you spend (${pct(r)} back).`;
      break;
    }
    case "points": {
      const ppd = (config.pointsPerDollar as number) ?? 1;
      const dpp = (config.dollarPerPoint as number) ?? 0.01;
      headline = ppd >= 1
        ? `Earn ${ppd} ${unit} for every $1 you spend.`
        : `Earn 1 ${unit.replace(/s$/, "")} for every ${money(1 / ppd)} you spend.`;
      details.push(`Each ${unit.replace(/s$/, "")} is worth ${money(dpp)} off a future purchase.`);
      break;
    }
    case "stamp": {
      const need = (config.stampsRequired as number) ?? 10;
      const reward = (config.stampRewardValue as number) ?? 10;
      headline = `Get a stamp every time you shop — collect ${need} and get ${money(reward)} off.`;
      break;
    }
    case "tiered": {
      const tiers = ((config.tiers ?? []) as Tier[]).slice().sort((a, b) => (a.pointsRequired ?? a.minSpend ?? 0) - (b.pointsRequired ?? b.minSpend ?? 0));
      const first = tiers[0];
      headline = first ? `Earn ${pct((first.rate ?? 0.01) * (first.bonusMultiplier ?? 1))} back in ${unit} on every purchase — and more as you move up a tier.` : `Earn ${unit} on every purchase.`;
      for (const t of tiers) {
        const from = t.minSpend ? `from ${money(t.minSpend)} spent` : "from your first purchase";
        details.push(`${t.name}: ${pct((t.rate ?? 0.01) * (t.bonusMultiplier ?? 1))} back, ${from}${t.description ? ` — ${t.description}` : ""}.`);
      }
      break;
    }
  }
  if (isMonetaryProgram(programType)) details.push(`Spend your ${unit} like cash on anything in store or online.`);
  const expiry = config.expiryValue as number | undefined;
  if (expiry && config.expiryMode === "daysSinceLastPurchase") details.push(`${unit} stay active as long as you shop with us at least once every ${expiry} days.`);
  const promos = ((config.promotions ?? []) as LoyaltyPromotion[]).filter((p) => p.active);
  const birthday = promos.find((p) => p.type === "birthday");
  if (birthday) {
    const extra = birthday.multiplier && birthday.multiplier > 1 ? `${birthday.multiplier}× ${unit}` : birthday.bonusAmount ? `a bonus of ${formatLoyalty(programType, config, birthday.bonusAmount)}` : `bonus ${unit}`;
    details.push(`Shop on your birthday and get ${extra}. Add your birthday in your account.`);
  }
  return { enabled, type: programType, name: loyaltyName(programType, config), unit, monetary: isMonetaryProgram(programType), headline, details, birthdayBonus: !!birthday };
}
