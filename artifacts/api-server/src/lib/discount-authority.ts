import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, posSettingsTable, productsTable, pricingRulesTable, merchantsTable, loyaltySettingsTable, customersTable, quotesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import type { CreateTransactionBody } from "@workspace/api-zod";
import { hasFreshManagerApproval } from "../middlewares/requireManagerOrOwner";
import {
  approvalLimitFor, manualDiscountPct, overDiscountLimit, parseRoleLimits, ruleAllowance, saleClocks, tierDiscountPct,
  type PricingRuleLike, type TierLike,
} from "./discount-limits";

/* Loads what lib/discount-limits.ts judges a sale on, for the two places a
   cashier commits a sale: POST /transactions and POST /payments/:provider/create
   (a terminal/BNPL sale is finalised later by a webhook with no session, so it
   is checked when it is started). */

type CreateTransactionInput = Extract<ReturnType<typeof CreateTransactionBody.safeParse>, { success: true }>["data"];

/** Same statuses finalizeSale lets a quote price a sale on. */
const QUOTE_STATUSES = new Set(["draft", "sent", "accepted"]);

export async function saleDiscountOverLimit(
  merchantId: number, sale: CreateTransactionInput, role: string | undefined, now = new Date(),
): Promise<{ over: boolean; manualPct: number; limitPct: number | null }> {
  const [settings] = await db.select({ limits: posSettingsTable.roleDiscountLimits }).from(posSettingsTable)
    .where(eq(posSettingsTable.merchantId, merchantId)).limit(1);
  const limitPct = approvalLimitFor(role, parseRoleLimits(settings?.limits));
  if (limitPct == null) return { over: false, manualPct: 0, limitPct };

  const lines = sale.items ?? [];
  const gross = lines.reduce((s, l) => s + Math.max(0, l.unitPrice ?? 0) * l.quantity, 0);
  const discount = lines.reduce((s, l) => s + Math.max(0, l.discount ?? 0), 0);
  if (!(discount > 0.004)) return { over: false, manualPct: 0, limitPct };

  // Pricing rules on the products in the sale.
  const ids = [...new Set(lines.map((l) => l.productId).filter((id) => id > 0))];
  const [products, rules, [merchant]] = await Promise.all([
    ids.length
      ? db.select({ id: productsTable.id, price: productsTable.price, categoryId: productsTable.categoryId }).from(productsTable)
        .where(and(eq(productsTable.merchantId, merchantId), inArray(productsTable.id, ids)))
      : Promise.resolve([]),
    db.select().from(pricingRulesTable).where(and(eq(pricingRulesTable.merchantId, merchantId), eq(pricingRulesTable.isActive, "true"))),
    db.select({ timezone: merchantsTable.timezone }).from(merchantsTable).where(eq(merchantsTable.id, merchantId)),
  ]);
  const timeZone = merchant?.timezone || "Australia/Sydney";
  const ruleRows: PricingRuleLike[] = rules.map((r) => ({ ...r, discountValue: parseFloat(r.discountValue) }));
  const byId = new Map(products.map((p) => [p.id, p]));
  const clocks = saleClocks(now, timeZone);
  let allowance = 0;
  for (const l of lines) {
    const p = byId.get(l.productId);
    if (!p) continue;
    allowance += ruleAllowance(ruleRows, { id: p.id, categoryId: p.categoryId ?? null, price: parseFloat(p.price) || 0 }, l.quantity, clocks);
  }

  // The customer's loyalty tier.
  if (sale.customerId != null) {
    const [[customer], [loyalty]] = await Promise.all([
      db.select({ totalSpent: customersTable.totalSpent, loyaltyPoints: customersTable.loyaltyPoints }).from(customersTable)
        .where(and(eq(customersTable.id, sale.customerId), eq(customersTable.merchantId, merchantId))),
      db.select({ programType: loyaltySettingsTable.programType, config: loyaltySettingsTable.config }).from(loyaltySettingsTable)
        .where(eq(loyaltySettingsTable.merchantId, merchantId)),
    ]);
    const tiers = ((loyalty?.config as { tiers?: TierLike[] } | undefined)?.tiers ?? []) as TierLike[];
    const pct = tierDiscountPct(loyalty?.programType, tiers, customer
      ? { totalSpent: parseFloat(String(customer.totalSpent ?? 0)) || 0, loyaltyPoints: Number(customer.loyaltyPoints ?? 0) || 0 }
      : null);
    allowance += gross * (pct / 100);
  }

  // The discount on the quote it was imported from (same rules as its prices).
  if (sale.quoteId != null) {
    const [quote] = await db.select({ status: quotesTable.status, customerId: quotesTable.customerId, discountTotal: quotesTable.discountTotal })
      .from(quotesTable).where(and(eq(quotesTable.id, sale.quoteId), eq(quotesTable.merchantId, merchantId)));
    if (quote && QUOTE_STATUSES.has(quote.status) && (quote.customerId ?? null) === (sale.customerId ?? null)) {
      allowance += Math.max(0, parseFloat(quote.discountTotal ?? "0") || 0);
    }
  }

  const manualPct = manualDiscountPct({ gross, discount, allowance });
  return { over: overDiscountLimit(manualPct, limitPct), manualPct, limitPct };
}

/* An approval tied to one cart. The till checks the discount when payment
   opens (POST /transactions/discount-check), so the PIN is asked for before
   money moves; a manager's approval there is valid for 30 minutes — but only
   for these lines, this customer and this quote, which a change to the cart
   breaks. Nothing is stored: the token says what was approved and until when. */
const APPROVAL_TTL_MS = 30 * 60 * 1000;

function cartFingerprint(merchantId: number, sale: CreateTransactionInput): string {
  const cents = (n: number | null | undefined) => Math.round((n ?? 0) * 100);
  const lines = (sale.items ?? [])
    .map((l) => `${l.productId}:${l.quantity}:${cents(l.unitPrice)}:${cents(l.discount)}`)
    .join(",");
  return `${merchantId}|${sale.customerId ?? ""}|${sale.quoteId ?? ""}|${lines}`;
}

function sign(payload: string): string {
  return createHmac("sha256", `discount-approval:${process.env.SESSION_SECRET ?? "koapos-dev-secret"}`).update(payload).digest("base64url");
}

export function discountApprovalToken(merchantId: number, sale: CreateTransactionInput, now = Date.now()): string {
  const until = now + APPROVAL_TTL_MS;
  return `${until}.${sign(`${until}|${cartFingerprint(merchantId, sale)}`)}`;
}

export function discountApprovalValid(token: unknown, merchantId: number, sale: CreateTransactionInput, now = Date.now()): boolean {
  if (typeof token !== "string") return false;
  const [untilRaw, mac] = token.split(".");
  const until = Number(untilRaw);
  if (!mac || !Number.isFinite(until) || now > until) return false;
  const expected = Buffer.from(sign(`${until}|${cartFingerprint(merchantId, sale)}`));
  const given = Buffer.from(mac);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Answers 403 manager_approval_required (and returns false) when the sale's
 *  manual discount is over the signed-in role's limit and no manager has
 *  approved at this till in the last two minutes. */
export async function enforceDiscountLimit(req: Request, res: Response, sale: CreateTransactionInput): Promise<boolean> {
  if (hasFreshManagerApproval(req)) return true;
  if (discountApprovalValid(sale.discountApproval, req.session.merchantId!, sale)) return true;
  const { over, limitPct } = await saleDiscountOverLimit(req.session.merchantId!, sale, req.session.staffRole);
  if (!over) return true;
  res.status(403).json({
    error: `This discount is over your role's limit of ${limitPct}% — a manager or owner needs to approve it with their PIN.`,
    code: "manager_approval_required",
  });
  return false;
}
