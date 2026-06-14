/* ─── Customer-group default pricing ─────────────────────────────────────────
 * Rules that derive a customer group's price from each product automatically,
 * e.g. Trade = Cost (Inc) + 10%, capped at the RRP. Rules are stored on
 * CustomerSettings (see customer-settings.ts) and resolved by computeGroupPrice
 * both when a product is saved (to fill product.groupPrices) and when applying
 * to existing products in bulk.
 *
 * NOTE on "RRP": products have no dedicated RRP field, so the standard sell
 * price (Product.price, inc GST) is treated as the RRP. Cost (Inc) is derived
 * from costPrice (ex GST) and taxRate.
 */

export type PriceBasis = "cost_inc" | "cost_ex" | "rrp";
export type PriceMode = "markup" | "discount";

export interface GroupPriceFormula {
  /** What the percentage is applied to. */
  basis: PriceBasis;
  /** markup => basis × (1 + pct); discount => basis × (1 − pct). */
  mode: PriceMode;
  percent: number;
  /** Never let the result exceed the product's RRP (standard sell price). */
  capAtRRP: boolean;
}

/** Per-category behaviour within a group's rule. */
export interface CategoryRule {
  categoryId: number;
  /** "exclude" → no group price for this category; "override" → use `formula`. */
  type: "exclude" | "override";
  formula?: GroupPriceFormula;
}

export interface GroupPricingRule {
  groupId: string;
  enabled: boolean;
  /** Default formula applied to every product in the group. */
  formula: GroupPriceFormula;
  /** Category-specific exclusions / overrides. */
  categoryRules: CategoryRule[];
}

/** The product fields the resolver needs. */
export interface PricingProductLike {
  price: number;                 // RRP / standard sell price (inc GST)
  costPrice?: number | null;     // cost (ex GST)
  taxRate?: number | null;       // GST %
  categoryId?: number | null;
}

export const BASIS_LABELS: Record<PriceBasis, string> = {
  cost_inc: "Cost (Inc)",
  cost_ex: "Cost (Ex)",
  rrp: "RRP",
};

export const DEFAULT_GROUP_FORMULA: GroupPriceFormula = {
  basis: "cost_inc",
  mode: "markup",
  percent: 10,
  capAtRRP: true,
};

export interface PricingPreset {
  id: string;
  label: string;
  formula: GroupPriceFormula;
}

/** A few popular ready-made pricing options. */
export const GROUP_PRICE_PRESETS: PricingPreset[] = [
  { id: "cost_inc_10", label: "Cost (Inc) + 10%", formula: { basis: "cost_inc", mode: "markup", percent: 10, capAtRRP: true } },
  { id: "cost_inc_15", label: "Cost (Inc) + 15%", formula: { basis: "cost_inc", mode: "markup", percent: 15, capAtRRP: true } },
  { id: "cost_inc_20", label: "Cost (Inc) + 20%", formula: { basis: "cost_inc", mode: "markup", percent: 20, capAtRRP: true } },
  { id: "cost_ex_20",  label: "Cost (Ex) + 20%",  formula: { basis: "cost_ex",  mode: "markup", percent: 20, capAtRRP: true } },
  { id: "cost_ex_40",  label: "Cost (Ex) + 40%",  formula: { basis: "cost_ex",  mode: "markup", percent: 40, capAtRRP: true } },
  { id: "rrp_less_10", label: "RRP − 10%",        formula: { basis: "rrp",      mode: "discount", percent: 10, capAtRRP: false } },
  { id: "rrp_less_15", label: "RRP − 15%",        formula: { basis: "rrp",      mode: "discount", percent: 15, capAtRRP: false } },
  { id: "rrp_less_20", label: "RRP − 20%",        formula: { basis: "rrp",      mode: "discount", percent: 20, capAtRRP: false } },
  { id: "rrp_less_25", label: "RRP − 25%",        formula: { basis: "rrp",      mode: "discount", percent: 25, capAtRRP: false } },
];

/** Human-readable summary of a formula, e.g. "Cost (Inc) + 10% (max RRP)". */
export function formulaLabel(f: GroupPriceFormula): string {
  const sign = f.mode === "markup" ? "+" : "−";
  return `${BASIS_LABELS[f.basis]} ${sign} ${f.percent}%${f.capAtRRP ? " (max RRP)" : ""}`;
}

/** Returns the preset id matching a formula exactly, or null for a custom one. */
export function matchPresetId(f: GroupPriceFormula): string | null {
  const p = GROUP_PRICE_PRESETS.find(
    (p) =>
      p.formula.basis === f.basis &&
      p.formula.mode === f.mode &&
      p.formula.percent === f.percent &&
      p.formula.capAtRRP === f.capAtRRP,
  );
  return p?.id ?? null;
}

export function makeDefaultRule(groupId: string): GroupPricingRule {
  return { groupId, enabled: false, formula: { ...DEFAULT_GROUP_FORMULA }, categoryRules: [] };
}

/** Cost including GST, derived from ex-GST cost + tax rate. */
export function costInc(product: PricingProductLike): number {
  const ex = product.costPrice ?? 0;
  return ex * (1 + (product.taxRate ?? 0) / 100);
}

function applyFormula(product: PricingProductLike, formula: GroupPriceFormula): number | null {
  const rrp = product.price ?? 0;
  const base =
    formula.basis === "cost_inc" ? costInc(product)
    : formula.basis === "cost_ex" ? (product.costPrice ?? 0)
    : rrp;
  if (!(base > 0)) return null;
  let result = formula.mode === "markup"
    ? base * (1 + formula.percent / 100)
    : base * (1 - formula.percent / 100);
  if (formula.capAtRRP && rrp > 0) result = Math.min(result, rrp);
  if (!(result >= 0)) return null;
  return Math.round(result * 100) / 100;
}

/**
 * Resolve the automatic price for a single product under one group's rule.
 * Returns null when the rule is disabled, the product's category is excluded,
 * or there isn't enough data to compute a price (e.g. no cost).
 */
export function computeGroupPrice(
  product: PricingProductLike,
  rule: GroupPricingRule | undefined,
): number | null {
  if (!rule || !rule.enabled) return null;
  const catRule = product.categoryId != null
    ? rule.categoryRules.find((c) => c.categoryId === product.categoryId)
    : undefined;
  if (catRule?.type === "exclude") return null;
  const formula = catRule?.type === "override" && catRule.formula ? catRule.formula : rule.formula;
  return applyFormula(product, formula);
}

/**
 * Resolve the group-price map for a product across every enabled rule. Groups
 * whose rule yields no price (disabled / excluded / missing cost) are omitted.
 */
export function computeAllGroupPrices(
  product: PricingProductLike,
  rules: GroupPricingRule[] | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rule of rules ?? []) {
    const price = computeGroupPrice(product, rule);
    if (price != null) out[rule.groupId] = price;
  }
  return out;
}
