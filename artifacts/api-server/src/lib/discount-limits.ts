/* Role discount limits, enforced on the server.
 *
 * Staff & Operations › POS Registers sets, per role, an approval threshold and
 * a hard cap (% of the sale). The till enforced them in the browser only, so a
 * cashier could send any discount straight to the API. The difficulty, and why
 * this waited, is that every kind of discount reaches the server the same way —
 * as a line `discount` — so the server must work out which part a person typed.
 *
 * It does that by allowance: the discounts it can account for itself are
 * subtracted, and only the rest is judged against the role's limit.
 *   - a pricing rule (happy hour, category promo) that applies to the line's
 *     product at this time of day, in business time with a little slack either
 *     side, since the cart was built minutes before it was paid;
 *   - the customer's loyalty tier discount;
 *   - the discount on the quote the sale was imported from.
 * Every allowance is an upper bound, so an honest sale is never caught by the
 * arithmetic; a dishonest one can at most claim a discount that really is on
 * offer. Exceeding the limit is not a refusal: it asks for a manager's PIN
 * (403 manager_approval_required), which the till already answers.
 *
 * No `db` here — lib/discount-authority.ts loads the inputs. Pinned by
 * discount-limits.test.ts. */

export interface RoleLimit { hardCap: number | null; approvalThreshold: number | null }

/** The stored JSON, in either shape the settings page has written: a bare
 *  number (old: the hard cap) or `{ hardCap, approvalThreshold }`. */
export function parseRoleLimits(raw: string | null | undefined): Record<string, RoleLimit> {
  const out: Record<string, RoleLimit> = {};
  let obj: unknown;
  try { obj = JSON.parse(raw || "{}"); } catch { return out; }
  if (!obj || typeof obj !== "object") return out;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  for (const [role, val] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof val === "number") out[role] = { hardCap: num(val), approvalThreshold: null };
    else if (val && typeof val === "object") {
      const v = val as { hardCap?: unknown; approvalThreshold?: unknown };
      out[role] = { hardCap: num(v.hardCap), approvalThreshold: num(v.approvalThreshold) };
    }
  }
  return out;
}

/** The % above which this role needs a manager: the lower of its two limits.
 *  Owners are never limited; null = no limit set. */
export function approvalLimitFor(role: string | undefined, limits: Record<string, RoleLimit>): number | null {
  if (role === "owner") return null;
  const l = role ? limits[role] : undefined;
  if (!l) return null;
  const set = [l.hardCap, l.approvalThreshold].filter((v): v is number => v != null && v >= 0);
  return set.length ? Math.min(...set) : null;
}

export interface PricingRuleLike {
  productId: number | null; categoryId: number | null;
  discountType: string; discountValue: number;
  startTime: string; endTime: string; daysOfWeek: string; isActive: string;
}

/** Minutes of slack on a rule's time window: the cart is built before it is paid. */
export const RULE_SLACK_MINUTES = 30;

/** Day 1–7 (Mon–Sun) and minutes since midnight at `at` in `timeZone`. */
export function localClock(at: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { day: day || 1, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The business-time readings a rule may match: every 5 minutes within the
 *  slack either side of `at`. Worked out once per sale. */
export function saleClocks(at: Date, timeZone: string): Array<{ day: number; minutes: number }> {
  const out: Array<{ day: number; minutes: number }> = [];
  for (let offset = -RULE_SLACK_MINUTES; offset <= RULE_SLACK_MINUTES; offset += 5) {
    out.push(localClock(new Date(at.getTime() + offset * 60_000), timeZone));
  }
  return out;
}

/** Does `rule` apply to this product at any of the sale's clock readings? The
 *  slack is the clock shift (which also carries it across midnight onto the
 *  right day), not a wider window as well. */
function ruleLive(rule: PricingRuleLike, product: { id: number; categoryId: number | null }, clocks: Array<{ day: number; minutes: number }>): boolean {
  if (rule.isActive !== "true") return false;
  if (rule.productId != null && rule.productId !== product.id) return false;
  if (rule.categoryId != null && rule.categoryId !== product.categoryId) return false;
  const days = rule.daysOfWeek.split(",").map((d) => Number(d.trim()));
  const start = toMinutes(rule.startTime), end = toMinutes(rule.endTime);
  return clocks.some(({ day, minutes }) => days.includes(day) && minutes >= start && minutes <= end);
}

/** The most any live rule takes off this line (per unit, times quantity — the
 *  till takes it once per line, so this is an upper bound). */
export function ruleAllowance(
  rules: PricingRuleLike[], product: { id: number; categoryId: number | null; price: number },
  quantity: number, clocks: Array<{ day: number; minutes: number }>,
): number {
  let best = 0;
  for (const r of rules) {
    if (!ruleLive(r, product, clocks)) continue;
    const perUnit = r.discountType === "percent"
      ? product.price * (r.discountValue / 100)
      : Math.min(r.discountValue, product.price);
    best = Math.max(best, perUnit);
  }
  return best * quantity;
}

export interface TierLike { discountPct?: number; pointsRequired?: number; minSpend?: number }

/** The customer's tier discount %, chosen as the till chooses it. */
export function tierDiscountPct(
  programType: string | undefined, tiers: TierLike[],
  customer: { totalSpent: number; loyaltyPoints: number } | null,
): number {
  if (!customer || programType !== "tiered" || !tiers.length) return 0;
  const sorted = [...tiers].sort((a, b) => (b.pointsRequired ?? b.minSpend ?? 0) - (a.pointsRequired ?? a.minSpend ?? 0));
  const tier = sorted.find((t) => t.pointsRequired != null ? customer.loyaltyPoints >= t.pointsRequired : customer.totalSpent >= (t.minSpend ?? 0))
    ?? sorted[sorted.length - 1];
  const pct = Number(tier?.discountPct ?? 0);
  return Number.isFinite(pct) && pct > 0 ? Math.min(pct, 100) : 0;
}

/** The share of the sale (0–100) that no allowance accounts for. */
export function manualDiscountPct(input: { gross: number; discount: number; allowance: number }): number {
  if (!(input.gross > 0)) return 0;
  const manual = Math.max(0, input.discount - input.allowance);
  return (manual / input.gross) * 100;
}

/** True when this sale's manual discount is over the role's limit. */
export function overDiscountLimit(manualPct: number, limitPct: number | null): boolean {
  return limitPct != null && manualPct > limitPct + 0.01;
}
