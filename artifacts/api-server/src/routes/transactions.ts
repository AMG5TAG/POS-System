import { requireManagerOrApproval, requireOwner } from "../middlewares/requireManagerOrOwner";
import { Router, type IRouter } from "express";
import { db, transactionsTable, customersTable, productsTable, serviceJobsTable, appointmentsTable, loyaltySettingsTable, merchantsTable, giftCardsTable, giftCardLedgerTable, storeCreditLedgerTable, merchantIntegrationsTable, digitalCodesTable, productTypesTable, productSerialsTable, quotesTable, customerSettingsTable } from "@workspace/db";
import { checkReferralAfterSale } from "../services/referralRewards";
import { enforceDiscountLimit, discountApprovalToken } from "../lib/discount-authority";
import { loyaltySpentMessage } from "../lib/loyalty";
import { groupPriceFor, resolveCustomerGroupId, type GroupPricingRule } from "@workspace/group-pricing";
import { eq, and, sql, desc, inArray, gte, lte } from "drizzle-orm";
import { loyaltyEarnedFor } from "../lib/loyalty";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListTransactionsQueryParams,
  CreateTransactionBody,
  GetTransactionParams,
  RefundTransactionParams,
  RefundTransactionBody,
  DeleteTransactionParams,
  SendTransactionReceiptParams,
  ModifyCompletedSaleParams,
  ModifyCompletedSaleBody,
} from "@workspace/api-zod";
import { sendEmail } from "../services/email";
import { escapeHtml } from "../lib/html-escape";
import { maybeQueueImmediateAlert } from "../services/lowStockAlertService";
import { isUniqueViolation } from "../lib/document-numbers";
import { reconcileOversellLedger } from "../lib/oversellLedger";
import { completeLinkedWork, mergeLinkedWork } from "../lib/linked-work";
import { planPreOrders, recordPreOrders, loadCollectable, collectPreOrder, cancelSalePreOrders, type PreOrderPlan } from "../lib/pre-order-sales";
import { localDate } from "../lib/pre-orders";

const router: IRouter = Router();

/* Quote statuses whose prices may still be charged. Mirrors
   IMPORTABLE_QUOTE_STATUSES in the POS: a converted quote has already been
   paid and a declined/expired one was never agreed, so neither may authorise
   what a sale charges. */
const QUOTE_PRICING_STATUSES = new Set(["draft", "sent", "accepted"]);

/** Error carrying an HTTP status, thrown inside a db.transaction to roll it
 *  back and map cleanly to a response after the transaction unwinds. */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function formatTransaction(t: typeof transactionsTable.$inferSelect, customer?: typeof customersTable.$inferSelect | null) {
  const rawItems = Array.isArray(t.items) ? t.items as Array<Record<string, unknown>> : [];
  const issuedGiftCards = rawItems
    .filter(i => i.giftCardIssue === true && typeof i.giftCardNumber === "string")
    // Use totalPrice (the actual charged amount after discounts) so the displayed
    // balance always matches what was loaded onto the card. unitPrice is the face
    // value and diverges when any discount is applied to the gift-card line.
    .map(i => ({ cardNumber: i.giftCardNumber as string, balance: Number(i.totalPrice ?? i.unitPrice ?? 0) }));

  return {
    id: t.id,
    merchantId: t.merchantId,
    customerId: t.customerId ?? null,
    customer: customer
      ? {
          id: customer.id,
          merchantId: customer.merchantId,
          firstName: customer.firstName ?? null,
          lastName: customer.lastName ?? null,
          /* Needed so sale/receipt screens can fall back to the business
             name for customers with no personal name recorded. */
          company: customer.company ?? null,
          email: customer.email ?? null,
          phone: customer.phone ?? null,
          address: customer.address ?? null,
          notes: customer.notes ?? null,
          loyaltyPoints: customer.loyaltyPoints,
          totalSpent: parseFloat(customer.totalSpent),
          visitCount: customer.visitCount,
          createdAt: customer.createdAt.toISOString(),
        }
      : undefined,
    staffId: t.staffId ?? null,
    receiptNumber: t.receiptNumber,
    status: t.status,
    subtotal: parseFloat(t.subtotal),
    taxTotal: parseFloat(t.taxTotal),
    discountTotal: parseFloat(t.discountTotal),
    total: parseFloat(t.total),
    paymentMethod: t.paymentMethod,
    amountTendered: t.amountTendered ? parseFloat(t.amountTendered) : null,
    changeDue: t.changeDue ? parseFloat(t.changeDue) : null,
    notes: t.notes ?? null,
    loyaltyEarned: t.loyaltyEarned ? parseFloat(t.loyaltyEarned) : null,
    surchargeAmount: t.surchargeAmount != null ? parseFloat(t.surchargeAmount) : 0,
    discountCapped: t.discountCapped === "true" ? true : t.discountCapped === "false" ? false : null,
    discountPct: t.discountPct != null ? parseFloat(t.discountPct) : null,
    items: rawItems,
    ...(issuedGiftCards.length > 0 ? { issuedGiftCards } : {}),
    createdAt: t.createdAt.toISOString(),
  };
}

function generateReceiptNumber(prefix = "KR", digits = 5): string {
  const n = Math.floor(Math.random() * Math.pow(10, digits));
  return `${prefix}${String(n).padStart(digits, "0")}`;
}

router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListTransactionsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { limit = 50, offset = 0, status, staffId, from, to } = queryParams.data;

  const conditions = [eq(transactionsTable.merchantId, req.session.merchantId!)];
  if (status) conditions.push(eq(transactionsTable.status, status));
  if (staffId !== undefined) conditions.push(eq(transactionsTable.staffId, staffId));
  if (from) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) conditions.push(gte(transactionsTable.createdAt, fromDate));
  }
  if (to) {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(transactionsTable.createdAt, toDate));
    }
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(and(...conditions));

  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(transactionsTable.createdAt));

  const customerIds = [...new Set(transactions.filter((t) => t.customerId).map((t) => t.customerId!))];
  const customerMap = new Map<number, typeof customersTable.$inferSelect>();
  if (customerIds.length > 0) {
    const customers = await db
      .select()
      .from(customersTable)
      .where(and(inArray(customersTable.id, customerIds), eq(customersTable.merchantId, req.session.merchantId!)));
    customers.forEach((c) => customerMap.set(c.id, c));
  }

  res.json({
    items: transactions.map((t) => formatTransaction(t, t.customerId ? customerMap.get(t.customerId) : null)),
    total: Number(countResult.count),
  });
});

/* ── Reusable sale finalisation ────────────────────────────────────────────────
   The core of POST /transactions, extracted so it can be driven both by a live
   cashier request AND by an asynchronous payment confirmation (e.g. the Zip Pay
   webhook captures a charge and replays the parked sale through here). It is
   I/O-agnostic: instead of writing to an Express `res`, it returns a result the
   caller maps to a response (cashier) or a payment_attempts update (webhook).

   Behaviour is identical to the original handler — only the request/response
   boundary moved out. */
export interface FinalizeSaleSyncContext { cookie: string; }
export interface FinalizeSaleOptions {
  /** Present → fire Xero live sync (needs a session cookie). Omit to skip. */
  syncContext?: FinalizeSaleSyncContext;
}
type CreateTransactionInput = Extract<ReturnType<typeof CreateTransactionBody.safeParse>, { success: true }>["data"];
export type FinalizeSaleResult =
  | { ok: true; transaction: typeof transactionsTable.$inferSelect; customer: typeof customersTable.$inferSelect | null }
  | { ok: false; status: number; error: string; expected?: unknown };

/* Whether a sold line takes a code from the product's digital code pool. Only a
 * digital_code-type product does, and not one marked "Physical or Printed Card"
 * (ePay): that card's code is issued by the third-party terminal at the time of
 * sale, so it has no pool and the sale must not be refused for an empty one. */
export function drawsFromCodePool(
  product: { isEpay?: string | null },
  pt: { isDigital?: boolean | null; printCode?: boolean | null } | undefined,
): boolean {
  if (product.isEpay === "true") return false;
  return !!pt && !!pt.isDigital && !!pt.printCode;
}

export async function finalizeSale(
  merchantId: number,
  body: CreateTransactionInput,
  rawItems: Array<{ serials?: unknown }>,
  opts: FinalizeSaleOptions = {},
): Promise<FinalizeSaleResult> {
  const {
    subtotal: clientSubtotal,
    taxTotal: clientTaxTotal,
    discountTotal: clientDiscountTotal = 0,
    total: clientTotal,
    amountTendered, changeDue, items: clientItems,
    customerId, staffId, paymentMethod, notes, loyaltyEarned,
    receiptNumber: providedReceiptNumber,
    idempotencyKey: rawIdempotencyKey, giftCardPayment, storeCreditPayment,
    requestedDiscountTotal: clientRequestedDiscountTotal,
    discountPct: clientDiscountPct,
    paidAt: rawPaidAt,
    serviceJobId: linkedServiceJobId,
    appointmentId: linkedAppointmentId,
    quoteId: importedQuoteId,
    preOrderId: collectingPreOrderId,
  } = body;

  const idempotencyKey =
    typeof rawIdempotencyKey === "string" && rawIdempotencyKey.trim() !== ""
      ? rawIdempotencyKey.trim()
      : null;

  // Optional accounting date: book the sale to the day the money actually landed
  // (e.g. a direct deposit that cleared earlier) rather than "now", so every
  // revenue report reads off the correct calendar day. A bare YYYY-MM-DD is
  // anchored at noon UTC so `(created_at)::date` lands on the chosen day in every
  // real (±12h) timezone. Mirrors the invoice payment paidAt handling. Future
  // dates are rejected.
  let saleCreatedAt: Date | undefined;
  if (typeof rawPaidAt === "string" && rawPaidAt.trim() !== "") {
    const raw = rawPaidAt.trim();
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00Z` : raw);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, status: 400, error: "Invalid paidAt date" };
    }
    if (d.getTime() > Date.now() + 86_400_000) {
      return { ok: false, status: 400, error: "paidAt cannot be in the future" };
    }
    saleCreatedAt = d;
  }

  if (clientItems.length === 0) {
    return { ok: false, status: 400, error: "Transaction must include at least one item" };
  }

  // Idempotency: if this exact request was already recorded (e.g. the client
  // retried after a network drop that happened *after* the commit), return the
  // original transaction instead of creating a duplicate sale + gift-card debit.
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.merchantId, merchantId),
        eq(transactionsTable.idempotencyKey, idempotencyKey),
      ));
    if (existing) {
      let cust: typeof customersTable.$inferSelect | null = null;
      if (existing.customerId) {
        const [c] = await db.select().from(customersTable).where(and(eq(customersTable.id, existing.customerId), eq(customersTable.merchantId, merchantId)));
        cust = c ?? null;
      }
      return { ok: true, transaction: existing, customer: cust };
    }
  }

  // Tenant isolation: any provided customerId must belong to this merchant.
  let scopedCustomer: typeof customersTable.$inferSelect | null = null;
  if (customerId != null) {
    const [c] = await db
      .select()
      .from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId)));
    if (!c) {
      return { ok: false, status: 404, error: "Customer not found" };
    }
    scopedCustomer = c;
  }

  // ── Recompute every monetary value from DB-authoritative product prices ──
  // Client-supplied unitPrice / totalPrice / taxAmount are treated as hints
  // only; the persisted record is built from product.price + product.taxRate.
  // The one exception is an open-price product (catalogue price $0.00), whose
  // price is by definition entered at the till — see the line loop below.
  // Client `discount` per line is honoured but clamped to [0, lineGross]
  // so a forged discount cannot drive totals negative or below zero.
  // productId === 0 signals a custom / one-off item — it bypasses the DB lookup
  // and inventory deduction, using client-supplied name and price instead.
  const regularProductIds = [...new Set(clientItems.filter(i => i.productId !== 0).map((i) => i.productId))];
  const dbProducts = regularProductIds.length > 0
    ? await db
        .select()
        .from(productsTable)
        .where(and(inArray(productsTable.id, regularProductIds), eq(productsTable.merchantId, merchantId)))
    : [];
  const productMap = new Map(dbProducts.map((p) => [p.id, p]));
  const missing = regularProductIds.filter((id) => !productMap.has(id));
  if (missing.length > 0) {
    return { ok: false, status: 400, error: `Unknown product id(s): ${missing.join(", ")}` };
  }

  // Product type lookup for digital code validation
  const productTypeIds = [...new Set(dbProducts.map((p) => p.productTypeId).filter((id): id is number => id != null))];
  const dbProductTypes = productTypeIds.length > 0
    ? await db.select().from(productTypesTable).where(and(inArray(productTypesTable.id, productTypeIds as number[]), eq(productTypesTable.merchantId, merchantId)))
    : [];
  const productTypeMap = new Map(dbProductTypes.map((pt) => [pt.id, pt]));

  const round2 = (n: number) => Math.round(n * 100) / 100;

  /* ── Prices a quote already agreed ──────────────────────────────────────
     A quoted line carries the price the customer was offered, which is often
     NOT the catalogue price — a shop quotes "$370 screen repair" against a
     $420 part. Repricing such a line from the catalogue makes the sale the
     till is trying to record disagree with the total the cashier is looking
     at, and it is rejected below as a totals mismatch. So the quote is
     re-read here and its unit prices are accepted for the products they were
     quoted on.

     The quote row is the authorisation, not the request: it is fetched
     scoped to this merchant, and only while it is one the till would still
     offer (draft / sent / accepted — a converted quote has already been paid
     and must not license a second sale's pricing). The client is therefore
     trusted for nothing but *which* quote; a line whose price matches no
     line on it is still repriced from the catalogue.

     Keyed in whole cents so a float that survived a JSON round trip still
     compares equal. */
  const quotedCents = new Map<number, Set<number>>();
  if (importedQuoteId != null) {
    const [quote] = await db
      .select()
      .from(quotesTable)
      .where(and(eq(quotesTable.id, importedQuoteId), eq(quotesTable.merchantId, merchantId)));
    // A quote prices the sale of the customer it was written for: someone
    // else's cheap quote (or one to nobody) can't price this sale. A quote with
    // no customer only prices a sale with no customer.
    const sameCustomer = (quote?.customerId ?? null) === (customerId ?? null);
    if (quote && QUOTE_PRICING_STATUSES.has(quote.status) && sameCustomer) {
      for (const raw of (Array.isArray(quote.items) ? quote.items : []) as Array<Record<string, unknown>>) {
        const pid = Number(raw.productId);
        const price = Number(raw.unitPrice);
        if (!Number.isInteger(pid) || pid <= 0 || !Number.isFinite(price) || price < 0) continue;
        const cents = quotedCents.get(pid) ?? new Set<number>();
        cents.add(Math.round(price * 100));
        quotedCents.set(pid, cents);
      }
    }
  }

  /* The customer's group price. The till charges a customer in a pricing
     group (Trade, Staff…) their group's price — the product's stored group
     price, else the group's rule — and every line used to come back repriced
     to the sell price, so a group-priced sale failed the total check below.
     The server works the group price out itself with the till's own function
     (@workspace/group-pricing) and accepts exactly that price, for the sale's
     own customer: the client is trusted for nothing but the price it asks. */
  let customerGroupId: string | null = null;
  let groupRules: GroupPricingRule[] = [];
  if (scopedCustomer?.customerGroup) {
    const [cs] = await db.select({ groups: customerSettingsTable.groups, groupPricing: customerSettingsTable.groupPricing })
      .from(customerSettingsTable).where(eq(customerSettingsTable.merchantId, merchantId));
    const parse = <T,>(raw: string | null | undefined, d: T): T => { try { return raw ? (JSON.parse(raw) as T) : d; } catch { return d; } };
    const groups = parse<Array<{ id: string; name: string }>>(cs?.groups, []);
    customerGroupId = resolveCustomerGroupId(scopedCustomer.customerGroup, Array.isArray(groups) ? groups : []);
    const rules = parse<GroupPricingRule[]>(cs?.groupPricing, []);
    groupRules = Array.isArray(rules) ? rules : [];
  }

  const computedItems: {
    productId: number; productName: string; quantity: number;
    unitPrice: number; totalPrice: number; taxAmount: number;
    costPrice?: number;
    discount?: number;
    giftCardIssue?: boolean; giftCardNumber?: string;
    digitalCodes?: string[];
    serials?: string[];
    preOrderDeposit?: { productId: number; quantity: number };
  }[] = [];
  // Per-item serial numbers aren't in the generated body schema (which strips
  // unknown keys), so they are supplied separately via `rawItems`, matched to
  // clientItems by index.
  for (let idx = 0; idx < clientItems.length; idx++) {
    const i = clientItems[idx];
    if (!Number.isFinite(i.quantity) || i.quantity <= 0 || !Number.isInteger(i.quantity)) {
      return { ok: false, status: 400, error: `Invalid quantity for product ${i.productId}` };
    }
    // A gift card issue line must always have quantity 1 — each unit is a unique card
    // with its own generated number, so selling qty>1 would require multiple distinct
    // numbers, which the current dialog doesn't support.
    if (i.giftCardIssue && i.quantity !== 1) {
      return { ok: false, status: 400, error: "Gift card issue items must have quantity 1. Add each card as a separate line." };
    }
    let unitPrice: number;
    let taxRatePct: number;
    let itemName: string;
    if (i.productId === 0) {
      // Custom item or gift card issue: trust client-supplied values, no DB product required
      unitPrice  = Math.max(0, i.unitPrice ?? 0);
      taxRatePct = 10; // standard Australian GST
      itemName   = (i.productName || (i.giftCardIssue ? "Gift Card" : "Custom Item")).slice(0, 200);
      // A pre-order deposit is named for its product below, once products are known.
    } else {
      const product = productMap.get(i.productId)!;
      const catalogPrice = parseFloat(product.price);
      // Open-price ("custom pricing") products: a $0.00 catalogue price is the
      // merchant's convention for "priced at the till" — the POS refuses to add
      // such a product until the cashier types a price and a reason
      // (`zeroPricePending` in pos.tsx). Repricing those lines from the catalogue
      // forced them back to $0 and the sale was rejected as a totals mismatch.
      // The product row is what authorises the override, so trusting the client
      // price here opens no tampering hole: a product with a real price on file
      // is still charged that price, whatever the client asks for.
      const openPriced = !Number.isFinite(catalogPrice) || catalogPrice === 0;
      // A price this sale's quote already agreed on for this product is
      // honoured for the same reason: the quote row on file authorises it.
      const askedPrice = Math.max(0, i.unitPrice ?? 0);
      const quotedPrice = quotedCents.get(i.productId)?.has(Math.round(askedPrice * 100)) ?? false;
      // And the customer's group price, worked out here — never a price the
      // client made up (see customerGroupId above).
      const groupPrice = groupPriceFor({
        price: Number.isFinite(catalogPrice) ? catalogPrice : 0,
        costPrice: product.costPrice != null ? parseFloat(product.costPrice) : 0,
        taxRate: product.taxRate != null ? parseFloat(product.taxRate) : 10,
        categoryId: product.categoryId ?? null,
        groupPrices: (product.groupPrices as Record<string, number> | null) ?? null,
      }, customerGroupId, groupRules);
      const groupPriced = groupPrice != null && Math.round(groupPrice * 100) === Math.round(askedPrice * 100);
      unitPrice  = (openPriced || quotedPrice || groupPriced) ? askedPrice : catalogPrice;
      taxRatePct = product.taxRate != null ? parseFloat(product.taxRate) : 10;
      itemName   = product.name;
    }
    const lineGross = round2(unitPrice * i.quantity);
    const rawDiscount = Math.max(0, i.discount ?? 0);
    // Reject explicitly rather than silently clamping. A discount that exceeds
    // the line gross would make the line total negative (bad data in the DB)
    // and indicates either a UI bug or a forged request. Use 0.005 as the
    // tolerance so sub-cent floating-point noise doesn't trigger a false 422.
    if (rawDiscount > lineGross + 0.005) {
      return { ok: false, status: 422, error: `Discount on "${itemName}" ($${rawDiscount.toFixed(2)}) exceeds the line total ($${lineGross.toFixed(2)}). Reduce or remove the discount before completing the sale.` };
    }
    const discount = round2(Math.min(rawDiscount, lineGross)); // clamp for sub-cent rounding
    const totalPrice = round2(lineGross - discount);
    const taxAmount = round2(totalPrice * (taxRatePct / (100 + taxRatePct)));
    const product = i.productId !== 0 ? productMap.get(i.productId) : undefined;
    // Snapshot the product's cost at sale time. Stored whenever the product has
    // a finite recorded cost — INCLUDING 0 — so a genuine zero-cost item is
    // distinguished from "cost unknown" and reports don't fall back to the
    // product's (possibly later-changed) current cost. Custom items (no product)
    // have no cost to snapshot.
    const parsedCost = product?.costPrice != null ? parseFloat(product.costPrice) : NaN;
    const costPrice = product && Number.isFinite(parsedCost) ? parsedCost : undefined;
    // Serials only apply to serial-tracked products.
    const rawSerials = rawItems[idx]?.serials;
    const serials = (product && product.tracksSerial === "true" && Array.isArray(rawSerials))
      ? [...new Set((rawSerials as unknown[]).map((s) => String(s).trim()).filter(Boolean))]
      : [];
    computedItems.push({
      productId: i.productId,
      productName: itemName,
      quantity: i.quantity,
      unitPrice,
      totalPrice,
      taxAmount,
      ...(costPrice != null ? { costPrice } : {}),
      discount: discount > 0 ? discount : undefined,
      giftCardIssue: i.giftCardIssue || undefined,
      // Preserve client-provided number; server will fill in blanks before the DB write
      giftCardNumber: (i.giftCardIssue && i.giftCardNumber) ? i.giftCardNumber.trim().toUpperCase() : undefined,
      ...(serials.length ? { serials } : {}),
      ...(i.productId === 0 && i.preOrderDeposit ? { preOrderDeposit: { productId: i.preOrderDeposit.productId, quantity: i.preOrderDeposit.quantity } } : {}),
    });
  }

  // Ensure every gift card issue item has a card number before entering the DB
  // transaction (so it gets stored on the items JSONB and is idempotent on retry).
  for (const item of computedItems) {
    if (item.giftCardIssue && !item.giftCardNumber) {
      const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
      item.giftCardNumber = `GC-${rand}`;
    }
  }

  // Server-authoritative totals. Convention used throughout the app:
  //   - prices are GST-inclusive
  //   - total === subtotal (the GST-inclusive amount the customer pays)
  //   - taxTotal is the GST component extracted from the total (informational)
  const total         = round2(computedItems.reduce((s, it) => s + it.totalPrice, 0));
  const taxTotal      = round2(computedItems.reduce((s, it) => s + it.taxAmount, 0));
  const subtotal      = total;
  const discountTotal = round2(computedItems.reduce((s, it) => s + (it.discount ?? 0), 0));

  // Belt-and-suspenders: the per-item discount clamp above guarantees each
  // line total is >= 0, so `total` should structurally always be >= 0. This
  // explicit guard catches any future regression (e.g. removal of the clamp)
  // or unexpected floating-point edge case before a negative-total record
  // can be persisted. Returns 422 so the POS surfaces it to the cashier.
  if (total < 0) {
    return { ok: false, status: 422, error: "Discounts exceed the cart subtotal — the sale total cannot be negative." };
  }

  // Reject obvious tampering on the only authoritative number: the charged
  // total. The breakdown fields can drift by sub-cent rounding when the
  // client sums tax pre-rounding, so we don't gate on them.
  if (Math.abs(clientTotal - total) > 0.01) {
    return {
      ok: false, status: 409,
      error: "Sale total does not match current product pricing. Please refresh the cart and try again.",
      expected: { subtotal, taxTotal, discountTotal, total },
    };
  }
  void clientSubtotal; void clientTaxTotal; void clientDiscountTotal;

  /* ── Pre-orders ─────────────────────────────────────────────────────────
     A line for a product on pre-order, or a deposit line naming one, opens a
     pre-order for the customer (lib/pre-order-sales.ts). Planned here, before
     anything is written, so a sale that can't open its pre-orders — no
     customer, a deposit on a product no longer on pre-order — is refused
     whole. A sale collecting a pre-order (preOrderId) is the collection, not a
     new pre-order of the same product. */
  let collecting: Awaited<ReturnType<typeof loadCollectable>> = null;
  if (collectingPreOrderId != null) {
    collecting = await loadCollectable(merchantId, collectingPreOrderId);
    if (!collecting) return { ok: false, status: 409, error: "That pre-order has already been collected or cancelled." };
  }
  const depositProductIds = computedItems.filter((it) => it.preOrderDeposit).map((it) => it.preOrderDeposit!.productId);
  const extraIds = depositProductIds.filter((id) => !productMap.has(id));
  const depositProducts = extraIds.length > 0
    ? await db.select().from(productsTable).where(and(inArray(productsTable.id, extraIds), eq(productsTable.merchantId, merchantId)))
    : [];
  const preOrderProducts = new Map([...productMap, ...depositProducts.map((p) => [p.id, p] as const)]);
  let preOrderPlans: PreOrderPlan[] = [];
  const mayHavePreOrders = depositProductIds.length > 0 || [...productMap.values()].some((p) => p.preOrder === "true");
  if (mayHavePreOrders) {
    const [m] = await db.select({ timezone: merchantsTable.timezone }).from(merchantsTable).where(eq(merchantsTable.id, merchantId));
    const planned = planPreOrders(computedItems, preOrderProducts, localDate(m?.timezone), collecting?.productIds ?? new Set());
    if (!planned.ok) return { ok: false, status: 400, error: planned.error };
    preOrderPlans = planned.plans;
    if (preOrderPlans.length > 0 && !scopedCustomer) {
      return { ok: false, status: 400, error: "Pre-order sales need a customer — add one to the sale so we can let them know when it arrives." };
    }
    for (const it of computedItems) {
      if (it.preOrderDeposit) it.productName = `Pre-order deposit — ${preOrderProducts.get(it.preOrderDeposit.productId)!.name}`.slice(0, 200);
    }
  }

  // Loyalty redemption — enforced server-side, not just in the UI.
  // The conversion from "balance units" to "dollars covered" depends on the
  // program type:
  //   - cashback / tiered / custom: balance is stored in dollars (1 unit = $1)
  //   - points: balance is points; redemption rate = `dollarPerPoint` from config
  //   - stamp: redemption disabled (stamps redeem out-of-band as a reward)
  // We fetch the loyalty settings here once and reuse for the earning block.
  const [loyaltyRow] = await db
    .select({
      programType: loyaltySettingsTable.programType,
      isEnabled:   loyaltySettingsTable.isEnabled,
      config:      loyaltySettingsTable.config,
    })
    .from(loyaltySettingsTable)
    .where(eq(loyaltySettingsTable.merchantId, merchantId));
  const programType = loyaltyRow?.programType ?? "cashback";
  const loyaltyConfig = (loyaltyRow?.config ?? {}) as Record<string, unknown>;
  // No row → default to enabled (matches GET /loyalty/settings default behaviour)
  const programOn = loyaltyRow ? loyaltyRow.isEnabled === "true" : true;

  // requiredLoyaltyPoints = how many BALANCE UNITS are needed to cover `total`.
  // Use ceil so the customer never under-pays the sale.
  let requiredLoyaltyPoints = 0;
  if (programType === "points") {
    const dpp = Math.max(0.000001, (loyaltyConfig.dollarPerPoint as number) ?? 0.01);
    requiredLoyaltyPoints = Math.max(0, Math.ceil(total / dpp));
  } else {
    // monetary balance (cashback/tiered/custom): 1 unit = $1
    requiredLoyaltyPoints = Math.max(0, Math.ceil(total));
  }

  if (paymentMethod === "loyalty") {
    if (!programOn) {
      return { ok: false, status: 400, error: "Loyalty program is disabled" };
    }
    if (programType === "stamp") {
      return { ok: false, status: 400, error: "Stamp programs cannot be redeemed at checkout" };
    }
    if (!scopedCustomer) {
      return { ok: false, status: 400, error: "Loyalty payments require a customer" };
    }
    if (requiredLoyaltyPoints > scopedCustomer.loyaltyPoints) {
      return { ok: false, status: 400, error: "Insufficient loyalty balance" };
    }
  }

  // Sanitize loyaltyEarned BEFORE persisting so the stored transaction
  // record matches what the customer balance is credited with. Never trust
  // the client value blindly.
  //
  // Earned units depend on program type:
  //   - cashback/tiered/custom: dollars (capped at sale total)
  //   - points: integer points (pointsPerDollar × eligible spend)
  //   - stamp: 1 stamp per visit (no per-item math)
  //
  // Earning is suppressed when the customer pays with loyalty, and when
  // the customer's group is in the excluded list.
  // The rule lives in lib/loyalty.ts, shared with the online shop's estimate.
  const sanitizedEarned = loyaltyEarnedFor({
    programType, config: loyaltyConfig, programOn, paymentMethod, total,
    customer: scopedCustomer
      ? { customerGroup: scopedCustomer.customerGroup ?? null, totalSpent: scopedCustomer.totalSpent, loyaltyPoints: scopedCustomer.loyaltyPoints ?? 0, dateOfBirth: scopedCustomer.dateOfBirth ?? null }
      : null,
    lines: computedItems.map((it) => {
      const p = productMap.get(it.productId);
      return { productId: it.productId, totalPrice: it.totalPrice, excludeFromLoyalty: p?.excludeFromLoyalty === "true", categoryId: p?.categoryId ?? null };
    }),
  });
  void loyaltyEarned; // client value is purely informational — server is authoritative

  // Store credit used to be a label only: a sale "paid by store credit" never
  // touched the balance, so the same credit paid for sale after sale. It is now
  // debited from the sale's customer inside the sale's own transaction — the
  // whole total for a store-credit sale, the stated leg for a split one.
  const storeCreditApplied = paymentMethod === "store_credit"
    ? total
    : round2(Number(storeCreditPayment?.amount ?? 0));
  if (storeCreditApplied < 0 || !Number.isFinite(storeCreditApplied)) {
    return { ok: false, status: 400, error: "Store credit amount must be positive" };
  }
  if (storeCreditApplied > total + 0.005) {
    return { ok: false, status: 400, error: "Store credit payment exceeds the sale total" };
  }
  if (storeCreditApplied > 0 && !scopedCustomer) {
    return { ok: false, status: 400, error: "Paying with store credit needs the customer on the sale" };
  }

  // `let` so the sale transaction can be retried with a fresh receipt number if
  // the random one collides with an existing sale (unique index enforces it).
  let receiptNumber = providedReceiptNumber || generateReceiptNumber();

  // Persist sanitized monetary fields, never raw client input.
  //   - Cash: cashier hands over >= total; we accept the actual tendered
  //     amount (no upper cap) and derive change ourselves. Reject under-tender.
  //   - Loyalty: tender equals the required points (in dollars), change = 0.
  //   - All other methods: force tendered = total, change = 0.
  // What the customer actually pays. (Payment-method surcharges were removed;
  // `surcharge_amount` is left at its 0 default on new sales.)
  const payable = round2(total);
  let persistedTendered: number;
  let persistedChange: number;
  if (paymentMethod === "cash") {
    const cashTendered = Math.max(0, amountTendered ?? payable);
    if (cashTendered < payable - 0.009) {
      return { ok: false, status: 400, error: "Cash tendered is less than the sale total" };
    }
    persistedTendered = cashTendered;
    persistedChange = Math.max(0, cashTendered - payable);
  } else if (paymentMethod === "loyalty") {
    persistedTendered = requiredLoyaltyPoints;
    persistedChange = 0;
  } else {
    persistedTendered = payable;
    persistedChange = 0;
  }
  void changeDue; // client-supplied changeDue is intentionally ignored

  // Aggregate quantities per product so duplicate line items don't
  // under-deduct stock (each UPDATE would otherwise read the same original
  // value from productMap and only the last write would land).
  const qtyByProduct = new Map<number, number>();
  for (const it of computedItems) {
    qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + it.quantity);
  }

  // All side-effects (transaction row + inventory + customer stats + linked
  // entity completion) commit together or roll back together. Prevents
  // partial commits where a sale is recorded but stock/customer state drift.
  // Definite-assignment: the retry loop below either assigns this and breaks, or
  // throws — so it is always set by the time it is read after the loop.
  let transaction!: typeof transactionsTable.$inferSelect;
  const updatedStockItems: Array<{ id: number; name: string; sku: string | null; stockQuantity: number; previousStockQuantity: number; lowStockThreshold: number | null; trackInventory: string }> = [];
  try {
    // Retry the whole sale transaction if the (random) receipt number collides
    // with an existing sale. The transaction fully rolls back on the unique
    // violation, so regenerating the number and re-running is safe. Only retried
    // for auto-generated numbers; a caller-provided receiptNumber is not.
    for (let receiptAttempt = 0; ; receiptAttempt++) {
      try {
        transaction = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(transactionsTable)
      .values({
        merchantId,
        customerId: customerId ?? null,
        staffId: staffId ?? null,
        receiptNumber,
        status: "completed",
        subtotal: subtotal.toString(),
        taxTotal: taxTotal.toString(),
        discountTotal: discountTotal.toString(),
        total: total.toString(),
        paymentMethod,
        amountTendered: persistedTendered.toString(),
        changeDue: persistedChange.toString(),
        notes: notes ?? null,
        loyaltyEarned: sanitizedEarned > 0 ? sanitizedEarned.toString() : null,
        items: computedItems,
        idempotencyKey: idempotencyKey ?? null,
        // Derive the flag server-side: if the client reported a larger requested
        // discount than what was actually applied (after role-limit clamping),
        // more than rounding noise → the cashier was capped.
        discountCapped: (
          clientRequestedDiscountTotal != null &&
          clientRequestedDiscountTotal > discountTotal + 0.01
        ) ? "true" : null,
        discountPct: (clientDiscountPct != null && clientDiscountPct > 0) ? clientDiscountPct.toString() : null,
        // Back-date the sale when an accounting date was supplied (e.g. a direct
        // deposit that cleared on an earlier day); otherwise the column defaults
        // to now().
        ...(saleCreatedAt ? { createdAt: saleCreatedAt } : {}),
      })
      .returning();

    // Atomic gift-card debit: the card is locked, validated, decremented and
    // a redemption ledger entry written inside the SAME transaction as the
    // sale, so the card can never be charged without the sale being recorded
    // (or vice-versa). Any failure throws and rolls the whole thing back.
    if (giftCardPayment) {
      const [card] = await tx
        .select()
        .from(giftCardsTable)
        .where(and(
          eq(giftCardsTable.id, giftCardPayment.cardId),
          eq(giftCardsTable.merchantId, merchantId),
        ))
        .for("update");
      if (!card) throw new HttpError(404, "Gift card not found");
      const applied = round2(giftCardPayment.amount);
      if (!(applied > 0)) throw new HttpError(400, "Gift card payment amount must be positive");
      if (applied > total + 0.005) throw new HttpError(400, "Gift card payment exceeds sale total");
      if (card.status !== "active") throw new HttpError(400, `Gift card is ${card.status}`);
      if (card.expiryDate && new Date() > card.expiryDate) throw new HttpError(400, "Gift card has expired");
      const balance = parseFloat(card.currentBalance);
      if (applied > balance + 0.005) throw new HttpError(400, "Insufficient gift card balance");
      const newBalance = round2(Math.max(0, balance - applied));
      await tx
        .update(giftCardsTable)
        .set({
          currentBalance: newBalance.toString(),
          status: newBalance <= 0 ? "redeemed" : card.status,
        })
        .where(eq(giftCardsTable.id, card.id));
      await tx.insert(giftCardLedgerTable).values({
        merchantId,
        giftCardId: card.id,
        type: "redemption",
        amount: (-applied).toString(),
        balanceAfter: newBalance.toString(),
        note: `Redeemed on sale ${receiptNumber}`,
        transactionId: row.id,
      });
    }

    // Atomic store-credit debit: lock the customer, re-read the balance from the
    // ledger under that lock (so two tills can't spend the same credit), and
    // record the redemption against this sale — or roll the sale back.
    if (storeCreditApplied > 0 && scopedCustomer) {
      await tx.select({ id: customersTable.id }).from(customersTable)
        .where(and(eq(customersTable.id, scopedCustomer.id), eq(customersTable.merchantId, merchantId)))
        .for("update");
      const [balRow] = await tx
        .select({ bal: sql<string>`COALESCE(SUM(${storeCreditLedgerTable.amount}), 0)` })
        .from(storeCreditLedgerTable)
        .where(and(eq(storeCreditLedgerTable.customerId, scopedCustomer.id), eq(storeCreditLedgerTable.merchantId, merchantId)));
      const balance = round2(parseFloat(balRow?.bal ?? "0"));
      if (storeCreditApplied > balance + 0.005) {
        throw new HttpError(400, `Not enough store credit — the customer has $${balance.toFixed(2)}`);
      }
      await tx.insert(storeCreditLedgerTable).values({
        merchantId,
        customerId: scopedCustomer.id,
        type: "redeem",
        amount: String(-storeCreditApplied),
        balanceAfter: String(round2(balance - storeCreditApplied)),
        note: `Redeemed on sale ${receiptNumber}`,
        transactionId: row.id,
        staffId: staffId ?? null,
      });
    }

    // Atomic gift card issuance — create and activate each gift card inside the
    // same DB transaction that records the sale, so neither can land without the
    // other. The card number was pre-generated before this block so it is stored
    // on the items JSONB and returned consistently even on idempotency retries.
    for (const item of computedItems) {
      if (!item.giftCardIssue || !item.giftCardNumber) continue;
      // Card balance = what the customer actually paid (totalPrice after any discounts).
      // unitPrice is the face value; totalPrice is the amount charged — these differ
      // when a cart-level or item-level discount touches the line. Issuing at unitPrice
      // would let the customer receive more value than they paid for.
      const cardValue = round2(item.totalPrice); // qty is enforced to be 1 (see validation above)
      const [issuedCard] = await tx
        .insert(giftCardsTable)
        .values({
          merchantId,
          cardNumber: item.giftCardNumber,
          initialValue:   cardValue.toString(),
          currentBalance: cardValue.toString(),
          status: "active",
        })
        .returning();
      await tx.insert(giftCardLedgerTable).values({
        merchantId,
        giftCardId:  issuedCard.id,
        type:        "issue",
        amount:      cardValue.toString(),
        balanceAfter: cardValue.toString(),
        note:        `Issued on receipt ${receiptNumber}`,
        transactionId: row.id,
      });
    }

    // ── Atomic digital code assignment ──────────────────────────────────────────
    // Each line for a product whose type is "digital_code" gets exactly one
    // unassigned code per unit sold. We lock the pool via FOR UPDATE skip locked
    // so concurrent sales for the same product don't double-assign. On retry the
    // items JSONB already contains the assigned codes, making the operation
    // idempotent.
    for (const item of computedItems) {
      if (item.digitalCodes && item.digitalCodes.length > 0) continue; // already assigned on retry
      const product = productMap.get(item.productId);
      if (!product || !product.productTypeId) continue;
      if (!drawsFromCodePool(product, productTypeMap.get(product.productTypeId))) continue;
      // Reserve one code per unit sold
      const needed = item.quantity;
      const codes = await tx
        .select()
        .from(digitalCodesTable)
        .where(and(
          eq(digitalCodesTable.productId, product.id),
          eq(digitalCodesTable.merchantId, merchantId),
          eq(digitalCodesTable.isUsed, "false"),
        ))
        .orderBy(digitalCodesTable.id)
        .limit(needed)
        .for("update", { skipLocked: true });
      if (codes.length < needed) {
        throw new HttpError(400, `Insufficient digital codes for "${product.name}" (need ${needed}, have ${codes.length})`);
      }
      const assignedCodes: string[] = [];
      for (const code of codes) {
        await tx
          .update(digitalCodesTable)
          .set({ isUsed: "true", usedAt: new Date(), transactionId: row.id })
          .where(eq(digitalCodesTable.id, code.id));
        assignedCodes.push(code.code);
      }
      item.digitalCodes = assignedCodes;
    }
    // If any codes were assigned, the items JSONB needs updating so the
    // transaction row records the codes and the response is idempotent.
    if (computedItems.some((i) => i.digitalCodes && i.digitalCodes.length > 0)) {
      await tx
        .update(transactionsTable)
        .set({ items: computedItems })
        .where(eq(transactionsTable.id, row.id));
    }

    // ── Serial number consumption (warranty products) ───────────────────────────
    // Mark each selected serial as sold. A serial pre-loaded at PO receiving is
    // flipped to "sold"; one typed at the till that isn't in stock yet is inserted
    // as a sold record so it's still tracked and printed.
    let serialsTouched = false;
    for (const item of computedItems) {
      if (!item.serials || item.serials.length === 0) continue;
      const product = productMap.get(item.productId);
      if (!product || product.tracksSerial !== "true") continue;
      for (const serial of item.serials) {
        const updated = await tx
          .update(productSerialsTable)
          .set({ status: "sold", soldAt: new Date(), transactionId: row.id })
          .where(and(
            eq(productSerialsTable.merchantId, merchantId),
            eq(productSerialsTable.productId, item.productId),
            eq(productSerialsTable.serial, serial),
            eq(productSerialsTable.status, "available"),
          ))
          .returning({ id: productSerialsTable.id });
        if (updated.length === 0) {
          await tx
            .insert(productSerialsTable)
            .values({ merchantId, productId: item.productId, serial, status: "sold", soldAt: new Date(), transactionId: row.id })
            .onConflictDoNothing();
        }
        serialsTouched = true;
      }
    }
    if (serialsTouched) {
      await tx
        .update(transactionsTable)
        .set({ items: computedItems })
        .where(eq(transactionsTable.id, row.id));
    }

    for (const [productId, qty] of qtyByProduct) {
      const product = productMap.get(productId);
      if (product?.trackInventory === "true") {
        // Allow stock to go negative: selling more than on-hand records a true
        // backorder rather than silently flooring at zero, so the shortfall stays
        // visible (and drives the "short" warning when a PO is later received).
        const newQty = product.stockQuantity - qty;
        await tx
          .update(productsTable)
          .set({ stockQuantity: newQty })
          .where(eq(productsTable.id, productId));
        // If this sale pushed stock further below zero, record the oversold units
        // against this sale's receipt so the backorder is traceable.
        await reconcileOversellLedger(tx, {
          merchantId, productId,
          prevStock: product.stockQuantity, newStock: newQty,
          receiptNumber, transactionId: row.id,
          saleAt: row.createdAt,
        });
        // product.stockQuantity is the pre-sale value; newQty is post-sale.
        updatedStockItems.push({ id: product.id, name: product.name, sku: product.sku ?? null, stockQuantity: newQty, previousStockQuantity: product.stockQuantity, lowStockThreshold: product.lowStockThreshold ?? null, trackInventory: product.trackInventory });
      }
    }

    if (scopedCustomer) {
      const redeemed = paymentMethod === "loyalty" ? requiredLoyaltyPoints : 0;
      const loyaltyDelta = paymentMethod === "loyalty"
        ? sql`${customersTable.loyaltyPoints} - ${redeemed}`
        : sql`${customersTable.loyaltyPoints} + ${sanitizedEarned}`;
      // The balance check above read the customer before this transaction, so
      // two tills redeeming at once both passed it (and GREATEST(0, …) quietly
      // let one balance pay twice). Redemption is now conditional on the
      // balance still covering it, decided by the row update itself.
      const updatedCustomer = await tx
        .update(customersTable)
        .set({
          totalSpent:    sql`${customersTable.totalSpent} + ${total}`,
          visitCount:    sql`${customersTable.visitCount} + 1`,
          loyaltyPoints: loyaltyDelta,
        })
        .where(and(
          eq(customersTable.id, scopedCustomer.id),
          eq(customersTable.merchantId, merchantId),
          ...(redeemed > 0 ? [sql`${customersTable.loyaltyPoints} >= ${redeemed}`] : []),
        ))
        .returning({ id: customersTable.id });
      if (redeemed > 0 && updatedCustomer.length === 0) throw new HttpError(400, "Insufficient loyalty balance");

      // Tier auto-upgrade: compute new tier based on updated loyaltyPoints + totalSpent
      const tiers = (loyaltyConfig.tiers ?? []) as Array<{
        name: string; minSpend?: number; pointsRequired?: number; rate?: number;
        discountPct?: number; freeShipping?: boolean; bonusMultiplier?: number; description?: string;
      }>;
      const sorted = [...tiers].sort((a, b) =>
        (b.pointsRequired ?? b.minSpend ?? 0) - (a.pointsRequired ?? a.minSpend ?? 0)
      );
      const newPts = (paymentMethod === "loyalty"
        ? Math.max(0, scopedCustomer.loyaltyPoints - redeemed)
        : scopedCustomer.loyaltyPoints + sanitizedEarned);
      const newSpent = parseFloat(scopedCustomer.totalSpent) + total;
      const tier = sorted.find((t) => {
        if (t.pointsRequired != null) return newPts >= t.pointsRequired;
        return newSpent >= (t.minSpend ?? 0);
      }) ?? sorted[sorted.length - 1] ?? null;
      if (tier && tier.name !== scopedCustomer.tierName) {
        await tx
          .update(customersTable)
          .set({ tierName: tier.name, tierUpdatedAt: new Date() })
          .where(and(eq(customersTable.id, scopedCustomer.id), eq(customersTable.merchantId, merchantId)));
      }
    }

    // Selling the work finishes it. The ids on the body are authoritative; the
    // `[Service #...]` / `[Appt #...]` notes markers are the fallback for older
    // POS builds and for a parked BNPL sale whose body predates this field.
    // Inside the sale's own transaction, so a sale can never commit having
    // failed to close the job it billed.
    await completeLinkedWork(tx, merchantId, mergeLinkedWork(
      { serviceJobId: linkedServiceJobId, appointmentId: linkedAppointmentId },
      notes,
    ));

    // Pre-orders this sale opens or collects — same transaction, so a sale can
    // never commit without them (or they without it).
    if (preOrderPlans.length > 0 && scopedCustomer) {
      await recordPreOrders(tx, merchantId, row.id, scopedCustomer, preOrderPlans);
    }
    if (collecting) await collectPreOrder(tx, merchantId, collecting.row.id, row.id);

    return row;
        });
        break;
      } catch (err) {
        if (!providedReceiptNumber && receiptAttempt < 5 && isUniqueViolation(err, "transactions_merchant_receipt_unique")) {
          receiptNumber = generateReceiptNumber();
          continue;
        }
        throw err;
      }
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return { ok: false, status: err.status, error: err.message };
    }
    // Idempotency race: a concurrent request with the same key won the unique
    // index. Return the transaction it created instead of surfacing a 500.
    if (idempotencyKey && (err as { code?: string })?.code === "23505") {
      const [existing] = await db
        .select()
        .from(transactionsTable)
        .where(and(
          eq(transactionsTable.merchantId, merchantId),
          eq(transactionsTable.idempotencyKey, idempotencyKey),
        ));
      if (existing) {
        let cust: typeof customersTable.$inferSelect | null = null;
        if (existing.customerId) {
          const [c] = await db.select().from(customersTable).where(and(eq(customersTable.id, existing.customerId), eq(customersTable.merchantId, merchantId)));
          cust = c ?? null;
        }
        return { ok: true, transaction: existing, customer: cust };
      }
    }
    throw err;
  }

  if (updatedStockItems.length) {
    Promise.all(updatedStockItems.map((p) => maybeQueueImmediateAlert(merchantId, p, p.previousStockQuantity)))
      .catch(() => { /* non-blocking */ });
  }

  /* Fire-and-forget Xero live sync if the merchant has enabled it and a session
     context was supplied (the internal sync endpoint requires the cashier's auth
     cookie). Async/webhook callers omit syncContext, so this is skipped for sales
     finalised out-of-band. */
  const syncContext = opts.syncContext;
  if (syncContext) {
    void (async () => {
      try {
        const [xeroRow] = await db.select({ credentials: merchantIntegrationsTable.credentials })
          .from(merchantIntegrationsTable)
          .where(and(eq(merchantIntegrationsTable.merchantId, merchantId), eq(merchantIntegrationsTable.integrationKey, "xero")));
        const xeroCreds = xeroRow?.credentials ? JSON.parse(xeroRow.credentials) as { syncSettings?: { syncOnSale?: boolean } } : {};
        if (xeroCreds.syncSettings?.syncOnSale) {
          // This process itself, on loopback — never the request's Host header,
          // which the caller controls (it sent their session cookie anywhere).
          await fetch(`${process.env.API_INTERNAL_ORIGIN?.trim() || `http://127.0.0.1:${process.env.PORT || 8080}`}/api/xero/sync-sale`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: syncContext.cookie },
            body: JSON.stringify({ transactionId: transaction.id }),
          });
        }
      } catch { /* silent */ }
    })();
  }

  // A sale can be what qualifies this customer's referral (or theirs as a
  // referrer's friend): pay it now rather than at the next daily sweep.
  checkReferralAfterSale(merchantId, scopedCustomer?.id);

  return { ok: true, transaction, customer: scopedCustomer };
}

/* Checked when the till opens payment, so a discount over the role's limit is
   approved before any money moves (lib/discount-authority.ts). Over the limit
   with no approval → 403 manager_approval_required; the till's fetch wrapper
   asks for a PIN and calls again, and the approval comes back as a token for
   this cart. */
router.post("/transactions/discount-check", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!(await enforceDiscountLimit(req, res, parsed.data))) return;
  res.json({ ok: true, discountApproval: discountApprovalToken(req.session.merchantId!, parsed.data) });
});

router.post("/transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Per-item serial numbers are stripped by the generated body schema, so read
  // them from the raw request body and hand them to finalizeSale separately.
  const rawItems: Array<{ serials?: unknown }> = Array.isArray((req.body as { items?: unknown }).items)
    ? (req.body as { items: Array<{ serials?: unknown }> }).items
    : [];

  // "delivery-order:<id>" keys belong to services/deliveryOrderSale.ts. A till
  // sending one would make that online order look already booked, so it is
  // never recorded.
  if (typeof parsed.data.idempotencyKey === "string" && parsed.data.idempotencyKey.trim().startsWith("delivery-order:")) {
    res.status(400).json({ error: "Invalid idempotency key" });
    return;
  }
  // The role's discount limit, which the till used to be alone in enforcing.
  if (!(await enforceDiscountLimit(req, res, parsed.data))) return;
  const result = await finalizeSale(req.session.merchantId!, parsed.data, rawItems, {
    syncContext: { cookie: String(req.headers.cookie ?? "") },
  });

  if (!result.ok) {
    if (result.expected !== undefined) {
      res.status(result.status).json({ error: result.error, expected: result.expected });
    } else {
      res.status(result.status).json({ error: result.error });
    }
    return;
  }
  res.status(201).json(formatTransaction(result.transaction, result.customer));
});

router.get("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [transaction] = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.merchantId, req.session.merchantId!)));
  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  let customer = null;
  if (transaction.customerId) {
    const [c] = await db.select().from(customersTable).where(and(eq(customersTable.id, transaction.customerId), eq(customersTable.merchantId, req.session.merchantId!)));
    customer = c ?? null;
  }
  res.json(formatTransaction(transaction, customer));
});

/** Reverse the stock, loyalty and lifetime-spend side effects that finalizeSale
 *  applied to a completed sale, when that sale is refunded or voided. Mirrors the
 *  invoice "left paid" reversal (applyInvoiceStock / applyInvoiceCustomerSpend):
 *    • restock every inventory-tracked line item;
 *    • subtract the sale total and one visit from the customer's lifetime figures;
 *    • undo loyalty movement — restore points *redeemed* on a loyalty-tendered
 *      sale, or claw back points *earned* on any other sale.
 *  Gift-card redemption/issuance, serials and digital codes are deliberately NOT
 *  reversed here (matching prior behaviour). Callers must guard against calling
 *  this twice on the same sale (status transition to refunded/voided) so effects
 *  are reversed exactly once. Runs inside the caller's db.transaction. */
async function reverseSaleEffects(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  merchantId: number,
  transaction: typeof transactionsTable.$inferSelect,
): Promise<void> {
  // Restock inventory-tracked lines, aggregating repeated products so the
  // pre-read stock value is only adjusted once (avoids lost updates).
  const qtyByProduct = new Map<number, number>();
  const items = Array.isArray(transaction.items)
    ? transaction.items as Array<{ productId?: unknown; quantity?: unknown }>
    : [];
  for (const it of items) {
    const pid = typeof it.productId === "number" ? it.productId : Number(it.productId);
    const qty = Number(it.quantity) || 0;
    if (Number.isInteger(pid) && pid > 0 && qty > 0) {
      qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + qty);
    }
  }
  for (const [productId, qty] of qtyByProduct) {
    const [product] = await tx
      .select({ stockQuantity: productsTable.stockQuantity, trackInventory: productsTable.trackInventory })
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)))
      .for("update");
    if (product?.trackInventory !== "true") continue;
    const newQty = product.stockQuantity + qty;
    await tx
      .update(productsTable)
      .set({ stockQuantity: newQty })
      .where(eq(productsTable.id, productId));
    // Restocking may cover outstanding backorders — resolve them FIFO.
    await reconcileOversellLedger(tx, {
      merchantId, productId,
      prevStock: product.stockQuantity, newStock: newQty,
    });
  }

  // Gift cards sold on this sale. Refunding the sale while keeping a live card
  // was a way to turn cash into a card for free; an unspent card is put on hold
  // with the sale, and a card already spent from blocks the refund (staff
  // decide how to settle that by hand).
  const issued = await tx
    .select({ cardId: giftCardLedgerTable.giftCardId })
    .from(giftCardLedgerTable)
    .where(and(
      eq(giftCardLedgerTable.merchantId, merchantId),
      eq(giftCardLedgerTable.transactionId, transaction.id),
      eq(giftCardLedgerTable.type, "issue"),
    ));
  for (const { cardId } of issued) {
    const [card] = await tx.select().from(giftCardsTable)
      .where(and(eq(giftCardsTable.id, cardId), eq(giftCardsTable.merchantId, merchantId)))
      .for("update");
    if (!card || card.status === "on_hold") continue;
    if (parseFloat(card.currentBalance) < parseFloat(card.initialValue) - 0.005) {
      throw new HttpError(409, `Gift card ${card.cardNumber} from this sale has already been used — sort the card out before reversing the sale.`);
    }
    await tx.update(giftCardsTable).set({ status: "on_hold" }).where(eq(giftCardsTable.id, card.id));
    await tx.insert(giftCardLedgerTable).values({
      merchantId,
      giftCardId: card.id,
      type: "void",
      amount: "0",
      balanceAfter: card.currentBalance,
      note: `On hold — sale ${transaction.receiptNumber} was reversed`,
      transactionId: transaction.id,
    });
  }

  // Store credit the sale spent goes back to the customer it came from.
  const spent = await tx
    .select({ customerId: storeCreditLedgerTable.customerId, amount: storeCreditLedgerTable.amount })
    .from(storeCreditLedgerTable)
    .where(and(
      eq(storeCreditLedgerTable.merchantId, merchantId),
      eq(storeCreditLedgerTable.transactionId, transaction.id),
      eq(storeCreditLedgerTable.type, "redeem"),
    ));
  for (const s of spent) {
    const back = Math.abs(parseFloat(s.amount));
    if (!(back > 0)) continue;
    await tx.select({ id: customersTable.id }).from(customersTable)
      .where(and(eq(customersTable.id, s.customerId), eq(customersTable.merchantId, merchantId))).for("update");
    const [balRow] = await tx
      .select({ bal: sql<string>`COALESCE(SUM(${storeCreditLedgerTable.amount}), 0)` })
      .from(storeCreditLedgerTable)
      .where(and(eq(storeCreditLedgerTable.customerId, s.customerId), eq(storeCreditLedgerTable.merchantId, merchantId)));
    const balance = parseFloat(balRow?.bal ?? "0");
    await tx.insert(storeCreditLedgerTable).values({
      merchantId,
      customerId: s.customerId,
      type: "refund",
      amount: String(back),
      balanceAfter: String(Math.round((balance + back) * 100) / 100),
      note: `Returned — sale ${transaction.receiptNumber} was reversed`,
      transactionId: transaction.id,
    });
  }

  if (!transaction.customerId) return;

  // Reverse lifetime spend + visit count (clamped at 0, matching invoices).
  const total = parseFloat(transaction.total) || 0;
  if (total > 0) {
    await tx
      .update(customersTable)
      .set({
        totalSpent: sql`GREATEST(0, ${customersTable.totalSpent} - ${total})`,
        visitCount: sql`GREATEST(0, ${customersTable.visitCount} - 1)`,
      })
      .where(and(eq(customersTable.id, transaction.customerId), eq(customersTable.merchantId, merchantId)));
  }

  // Undo the loyalty movement finalizeSale made. A loyalty-tendered sale spent
  // points (persistedTendered == requiredLoyaltyPoints, stored in amountTendered)
  // — give them back. Any other sale earned points (loyaltyEarned) — claw back.
  if (transaction.paymentMethod === "loyalty") {
    const redeemed = parseFloat(transaction.amountTendered ?? "0") || 0;
    if (redeemed > 0) {
      await tx
        .update(customersTable)
        .set({ loyaltyPoints: sql`${customersTable.loyaltyPoints} + ${redeemed}` })
        .where(and(eq(customersTable.id, transaction.customerId), eq(customersTable.merchantId, merchantId)));
    }
  } else {
    const earned = parseFloat(transaction.loyaltyEarned ?? "0") || 0;
    if (earned > 0) {
      // Taken back in full or not at all. Clamping at zero let a customer spend
      // what a sale earned and keep it when the sale was refunded; now the
      // reversal waits until staff settle the balance by hand.
      const taken = await tx
        .update(customersTable)
        .set({ loyaltyPoints: sql`${customersTable.loyaltyPoints} - ${earned}` })
        .where(and(
          eq(customersTable.id, transaction.customerId),
          eq(customersTable.merchantId, merchantId),
          sql`${customersTable.loyaltyPoints} >= ${earned}`,
        ))
        .returning({ id: customersTable.id });
      if (taken.length === 0) throw new HttpError(409, loyaltySpentMessage(earned));
    }
  }
}

router.post("/transactions/:id/refund", requireAuth, requireManagerOrApproval, async (req, res): Promise<void> => {
  const params = RefundTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RefundTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const merchantId = req.session.merchantId!;
  const id = params.data.id;

  try {
    const updated = await db.transaction(async (tx) => {
      // Lock the sale row so a concurrent refund/void/modify can't race the
      // reversal and double-apply (or skip) the stock/loyalty/spend changes.
      const [transaction] = await tx
        .select()
        .from(transactionsTable)
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.merchantId, merchantId)))
        .for("update");
      if (!transaction) throw new HttpError(404, "Transaction not found");
      // Only a completed sale can be refunded: this blocks re-refunding (which
      // would reverse effects twice) and refunding an already-voided sale.
      if (transaction.status !== "completed") {
        throw new HttpError(409, `Only completed sales can be refunded (this sale is ${transaction.status}).`);
      }
      await reverseSaleEffects(tx, merchantId, transaction);
      await cancelSalePreOrders(tx, merchantId, transaction.id);
      const [row] = await tx
        .update(transactionsTable)
        .set({ status: "refunded", notes: parsed.data.reason })
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.merchantId, merchantId)))
        .returning();
      return row;
    });

    let cust: typeof customersTable.$inferSelect | null = null;
    if (updated.customerId) {
      const [c] = await db.select().from(customersTable).where(and(eq(customersTable.id, updated.customerId), eq(customersTable.merchantId, merchantId)));
      cust = c ?? null;
    }
    res.json(formatTransaction(updated, cust));
  } catch (err) {
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
    throw err;
  }
});

// POST /transactions/:id/void — cancel a completed sale (e.g. mistaken entry).
// Distinct from a refund: marks the sale void rather than recording a money-out.
router.post("/transactions/:id/void", requireAuth, requireManagerOrApproval, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const reason = typeof (req.body ?? {}).reason === "string" ? (req.body as { reason: string }).reason : null;

  // A void is a sale that should never have happened: like a refund it puts
  // the stock, spend, loyalty, store credit and gift cards back (it used to
  // only relabel the row, so a voided sale still kept the loyalty it earned).
  // Locked so it can't race a refund or a second void.
  let updated: typeof transactionsTable.$inferSelect;
  try {
    updated = await db.transaction(async (tx) => {
      const [transaction] = await tx.select().from(transactionsTable)
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.merchantId, merchantId)))
        .for("update");
      if (!transaction) throw new HttpError(404, "Transaction not found");
      if (transaction.status === "voided") throw new HttpError(409, "Already voided");
      if (transaction.status === "refunded") throw new HttpError(409, "Refunded sales can't be voided");
      if (transaction.status === "completed") await reverseSaleEffects(tx, merchantId, transaction);
      await cancelSalePreOrders(tx, merchantId, id);
      const [row] = await tx.update(transactionsTable)
        .set({ status: "voided", notes: reason ?? transaction.notes })
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.merchantId, merchantId)))
        .returning();
      return row!;
    });
  } catch (err) {
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
    throw err;
  }

  let cust: typeof customersTable.$inferSelect | null = null;
  if (updated.customerId) {
    const [c] = await db.select().from(customersTable).where(and(eq(customersTable.id, updated.customerId), eq(customersTable.merchantId, merchantId)));
    cust = c ?? null;
  }
  res.json(formatTransaction(updated, cust));
});

// POST /transactions/:id/modify — limited post-sale amendments to a COMPLETED
// sale: add free ($0) products, link/detach a customer, and/or link an
// appointment or service job. Deliberately narrow so a finalised sale can be
// annotated (comp an item, attach a customer, connect it to the job it settled)
// without ever changing the money collected — added items are forced to $0, so
// subtotal/tax/total are untouched. Refunded/voided sales cannot be modified.
router.post("/transactions/:id/modify", requireAuth, requireManagerOrApproval, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const params = ModifyCompletedSaleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = ModifyCompletedSaleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const id = params.data.id;
  const { customerId, addItems, serviceJobNumber, appointmentId } = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      // Lock the row so a concurrent modify/void can't race the items/notes edit.
      const [transaction] = await tx
        .select()
        .from(transactionsTable)
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.merchantId, merchantId)))
        .for("update");
      if (!transaction) throw new HttpError(404, "Transaction not found");
      if (transaction.status !== "completed") {
        throw new HttpError(409, "Only completed sales can be modified.");
      }

      const updates: Partial<typeof transactionsTable.$inferInsert> = {};

      // ── Add free ($0) products ──────────────────────────────────────────────
      // Catalog products are resolved for their name (and stock deduction); the
      // price is forced to 0 regardless of the catalog price. productId 0 is a
      // custom free line carrying a client-supplied name.
      if (addItems && addItems.length > 0) {
        const existingItems = Array.isArray(transaction.items)
          ? [...(transaction.items as Array<Record<string, unknown>>)]
          : [];
        const catalogIds = [...new Set(addItems.filter((i) => i.productId !== 0).map((i) => i.productId))];
        const products = catalogIds.length > 0
          ? await tx.select().from(productsTable).where(and(inArray(productsTable.id, catalogIds), eq(productsTable.merchantId, merchantId)))
          : [];
        const productMap = new Map(products.map((p) => [p.id, p]));
        const missing = catalogIds.filter((pid) => !productMap.has(pid));
        if (missing.length > 0) throw new HttpError(400, `Unknown product id(s): ${missing.join(", ")}`);

        // Aggregate per product so multiple lines of the same product deduct once
        // from the pre-read stock value (avoids lost updates).
        const qtyByProduct = new Map<number, number>();
        for (const item of addItems) {
          if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            throw new HttpError(400, "Item quantity must be a positive integer.");
          }
          let name: string;
          if (item.productId === 0) {
            name = (item.productName?.trim() || "Free item").slice(0, 200);
          } else {
            name = productMap.get(item.productId)!.name;
            qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
          }
          existingItems.push({
            productId: item.productId,
            productName: name,
            quantity: item.quantity,
            unitPrice: 0,
            totalPrice: 0,
            taxAmount: 0,
            // Marks the line as a post-sale complimentary add so reports/receipts
            // can distinguish it from an item that was actually paid for.
            comp: true,
          });
        }
        for (const [pid, qty] of qtyByProduct) {
          const product = productMap.get(pid)!;
          if (product.trackInventory === "true") {
            // Complimentary items still draw down stock, and may push it negative.
            const newQty = product.stockQuantity - qty;
            await tx.update(productsTable).set({ stockQuantity: newQty }).where(eq(productsTable.id, pid));
            await reconcileOversellLedger(tx, {
              merchantId, productId: pid,
              prevStock: product.stockQuantity, newStock: newQty,
              receiptNumber: transaction.receiptNumber, transactionId: transaction.id,
            });
          }
        }
        updates.items = existingItems;
      }

      // ── Link / detach customer ──────────────────────────────────────────────
      // undefined → leave unchanged; null → detach; number → link (tenant-scoped).
      if (customerId !== undefined) {
        if (customerId === null) {
          updates.customerId = null;
        } else {
          const [c] = await tx
            .select({ id: customersTable.id })
            .from(customersTable)
            .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId)));
          if (!c) throw new HttpError(404, "Customer not found");
          updates.customerId = customerId;
        }
      }

      // ── Link appointment / service job ──────────────────────────────────────
      // Uses the same notes-marker convention as a live sale (see finalizeSale),
      // and marks the linked entity completed. Markers are de-duplicated so
      // re-linking the same job/appointment doesn't append twice.
      let notes = transaction.notes ?? "";
      const appendMarker = (marker: string) => {
        if (!notes.includes(marker)) notes = notes ? `${notes} ${marker}` : marker;
      };
      if (serviceJobNumber) {
        const jobNum = serviceJobNumber.trim();
        const [job] = await tx.select().from(serviceJobsTable)
          .where(and(eq(serviceJobsTable.jobNumber, jobNum), eq(serviceJobsTable.merchantId, merchantId)));
        if (!job) throw new HttpError(404, "Service job not found");
        await completeLinkedWork(tx, merchantId, { serviceJobId: job.id });
        appendMarker(`[Service #${job.jobNumber}: ${job.deviceType || job.deviceDescription || "service"}]`);
      }
      if (appointmentId != null) {
        const [appt] = await tx.select().from(appointmentsTable)
          .where(and(eq(appointmentsTable.id, appointmentId), eq(appointmentsTable.merchantId, merchantId)));
        if (!appt) throw new HttpError(404, "Appointment not found");
        await completeLinkedWork(tx, merchantId, { appointmentId: appt.id });
        appendMarker(`[Appt #${appt.id}: ${appt.title}]`);
      }
      if (notes !== (transaction.notes ?? "")) updates.notes = notes;

      if (Object.keys(updates).length === 0) return transaction;

      const [updated] = await tx.update(transactionsTable).set(updates)
        .where(and(eq(transactionsTable.id, id), eq(transactionsTable.merchantId, merchantId)))
        .returning();
      return updated;
    });

    let customer: typeof customersTable.$inferSelect | null = null;
    if (result.customerId) {
      const [c] = await db.select().from(customersTable).where(and(eq(customersTable.id, result.customerId), eq(customersTable.merchantId, merchantId)));
      customer = c ?? null;
    }
    res.json(formatTransaction(result, customer));
  } catch (err) {
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
    req.log.error({ err, transactionId: id }, "Failed to modify completed sale");
    res.status(500).json({ error: "Failed to modify sale" });
  }
});

router.delete("/transactions/:id", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.merchantId, req.session.merchantId!)));

  if (!existing) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  await db
    .delete(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.merchantId, req.session.merchantId!)));

  res.status(204).send();
});

router.post("/transactions/:id/send-receipt", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { id } = SendTransactionReceiptParams.parse({ id: Number(req.params.id) });
  const { email } = req.body as { email: string };
  if (!email) { res.status(400).json({ error: "Email is required" }); return; }

  const [tx] = await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.id, id), eq(transactionsTable.merchantId, merchantId)));
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }

  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const bizName = merchant?.businessName ?? "KoaPOS";

  const itemsRaw = tx.items as Array<{ name: string; qty: number; price: number; total: number }> | null;
  const itemRows = (itemsRaw ?? []).map(i =>
    `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${escapeHtml(i.name)}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:center;">${escapeHtml(String(i.qty))}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;">$${Number(i.total ?? i.price * i.qty).toFixed(2)}</td>
    </tr>`
  ).join("");

  const subtotal = Number(tx.subtotal ?? 0);
  const discountTotal = Number(tx.discountTotal ?? 0);
  const taxTotal = Number(tx.taxTotal ?? 0);
  const total = Number(tx.total ?? 0);
  const discountPct = tx.discountPct != null ? parseFloat(tx.discountPct) : null;
  const discountLabel = discountPct != null && discountPct > 0 ? `${discountPct}% discount` : "Discount";

  const summaryRows = [
    `<tr>
      <td style="padding:4px 0;color:#555;">Subtotal</td>
      <td style="padding:4px 0;text-align:right;">$${subtotal.toFixed(2)}</td>
    </tr>`,
    ...(discountTotal > 0 ? [`<tr>
      <td style="padding:4px 0;color:#555;">${discountLabel}</td>
      <td style="padding:4px 0;text-align:right;color:#e53e3e;">-$${discountTotal.toFixed(2)}</td>
    </tr>`] : []),
    ...(taxTotal > 0 ? [`<tr>
      <td style="padding:4px 0;color:#555;">Tax</td>
      <td style="padding:4px 0;text-align:right;">$${taxTotal.toFixed(2)}</td>
    </tr>`] : []),
    `<tr>
      <td style="padding:8px 0 4px;border-top:2px solid #eee;font-weight:700;">Total</td>
      <td style="padding:8px 0 4px;border-top:2px solid #eee;text-align:right;font-weight:700;">$${total.toFixed(2)}</td>
    </tr>`,
  ].join("");

  const textSummaryLines = [
    `Subtotal: $${subtotal.toFixed(2)}`,
    ...(discountTotal > 0 ? [`${discountLabel}: -$${discountTotal.toFixed(2)}`] : []),
    ...(taxTotal > 0 ? [`Tax: $${taxTotal.toFixed(2)}`] : []),
    `Total: $${total.toFixed(2)}`,
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#222;">
      <h2 style="margin:0 0 4px;">${escapeHtml(bizName)}</h2>
      <p style="margin:0 0 24px;color:#888;font-size:13px;">Receipt #${escapeHtml(String(tx.receiptNumber ?? tx.id))}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;">Item</th>
            <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;">Qty</th>
            <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
        <tbody>${summaryRows}</tbody>
      </table>
      <p style="margin-top:32px;font-size:12px;color:#aaa;text-align:center;">Thank you for shopping with us!</p>
    </div>`;

  const result = await sendEmail(merchantId, {
    to: email,
    subject: `Receipt from ${bizName} — #${tx.receiptNumber ?? tx.id}`,
    html,
    text: `Receipt from ${bizName}\nReceipt #${tx.receiptNumber ?? tx.id}\n\n${textSummaryLines}\n\nThank you for shopping with us!`,
  });

  if (!result.success) {
    req.log.warn({ transactionId: id, email, error: result.error }, "Receipt email failed");
    res.status(400).json({ error: result.error ?? "Failed to send receipt email" });
    return;
  }

  req.log.info({ transactionId: id, email, provider: result.provider }, "Receipt emailed");
  res.json({ success: true });
});

export default router;
