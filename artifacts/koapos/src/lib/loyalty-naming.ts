/* ── Loyalty naming ──────────────────────────────────────────────────────────
 * Single source of truth for the merchant's custom loyalty names, configured in
 * Management ▸ Customers ▸ Loyalty ▸ Naming and stored on
 * loyalty_settings.config.naming. Every surface that shows a loyalty program
 * name or unit (POS earn, customer display, receipts, transaction history,
 * referrals) should resolve labels through here so the configured names are
 * always used instead of hardcoded "pts" / "Loyalty" defaults.
 */
import { formatCurrency } from "@/lib/utils";

export type LoyaltyProgramType = "cashback" | "points" | "tiered" | "stamp" | "custom";

const PROGRAM_TYPES: LoyaltyProgramType[] = ["cashback", "points", "tiered", "stamp", "custom"];

/** Fallbacks mirroring NAMING_DEFAULTS in the Loyalty management screen. */
const UNIT_DEFAULTS: Record<LoyaltyProgramType, string> = {
  cashback: "Credits", points: "Points", tiered: "Credits", stamp: "Stamps", custom: "Rewards",
};
const PROGRAM_DEFAULTS: Record<LoyaltyProgramType, string> = {
  cashback: "Cash Back", points: "Points", tiered: "Tiered Cash Back", stamp: "Stamp Card", custom: "Custom",
};
const UNIT_KEYS: Record<LoyaltyProgramType, string> = {
  cashback: "cashbackUnit", points: "pointsUnit", tiered: "tieredUnit", stamp: "stampUnit", custom: "customUnit",
};

/** Programs whose balance/earn is a dollar value (shown as currency, not a unit count). */
const CURRENCY_TYPES = new Set<LoyaltyProgramType>(["cashback", "tiered", "custom"]);

type LoyaltyLike = {
  programType?: string | null;
  naming?: {
    programName?: string; cashbackUnit?: string; pointsUnit?: string;
    stampUnit?: string; tieredUnit?: string; customUnit?: string;
  } | null;
} | null | undefined;

export function loyaltyProgramType(loyalty: LoyaltyLike): LoyaltyProgramType {
  const t = (loyalty?.programType ?? "points") as LoyaltyProgramType;
  return PROGRAM_TYPES.includes(t) ? t : "points";
}

/** True when amounts are dollar values (cashback / tiered / custom) rather than counts. */
export function isCurrencyLoyalty(loyalty: LoyaltyLike): boolean {
  return CURRENCY_TYPES.has(loyaltyProgramType(loyalty));
}

/** The merchant's custom unit name for the active program (e.g. "Points", "Stamps", "Credits"). */
export function loyaltyUnitName(loyalty: LoyaltyLike): string {
  const type = loyaltyProgramType(loyalty);
  const naming = (loyalty?.naming ?? {}) as Record<string, string | undefined>;
  const configured = naming[UNIT_KEYS[type]];
  return configured && configured.trim() ? configured.trim() : UNIT_DEFAULTS[type];
}

/** The merchant's custom program name, falling back to the program-type label. */
export function loyaltyProgramName(loyalty: LoyaltyLike): string {
  const custom = loyalty?.naming?.programName;
  if (custom && custom.trim()) return custom.trim();
  return PROGRAM_DEFAULTS[loyaltyProgramType(loyalty)] ?? "Loyalty";
}

/** Format an earned/balance amount with the right unit: currency for dollar-value
 *  programs, otherwise the custom unit name (e.g. "10 Points", "1 Stamps"). */
export function formatLoyaltyAmount(loyalty: LoyaltyLike, amount: number): string {
  if (isCurrencyLoyalty(loyalty)) return formatCurrency(amount);
  return `${amount.toLocaleString()} ${loyaltyUnitName(loyalty)}`;
}
