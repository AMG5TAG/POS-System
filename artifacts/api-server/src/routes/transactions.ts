import { Router, type IRouter } from "express";
import { db, transactionsTable, customersTable, productsTable, serviceJobsTable, appointmentsTable, loyaltySettingsTable, merchantsTable, giftCardsTable, giftCardLedgerTable } from "@workspace/db";
import { eq, and, sql, desc, inArray, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListTransactionsQueryParams,
  CreateTransactionBody,
  GetTransactionParams,
  RefundTransactionParams,
  RefundTransactionBody,
  DeleteTransactionParams,
  SendTransactionReceiptParams,
} from "@workspace/api-zod";
import { sendEmail } from "../services/email";

const router: IRouter = Router();

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

router.post("/transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    subtotal: clientSubtotal,
    taxTotal: clientTaxTotal,
    discountTotal: clientDiscountTotal = 0,
    total: clientTotal,
    amountTendered, changeDue, items: clientItems,
    customerId, staffId, paymentMethod, notes, loyaltyEarned,
    receiptNumber: providedReceiptNumber,
    idempotencyKey: rawIdempotencyKey, giftCardPayment,
  } = parsed.data;

  const idempotencyKey =
    typeof rawIdempotencyKey === "string" && rawIdempotencyKey.trim() !== ""
      ? rawIdempotencyKey.trim()
      : null;

  if (clientItems.length === 0) {
    res.status(400).json({ error: "Transaction must include at least one item" });
    return;
  }

  // Idempotency: if this exact request was already recorded (e.g. the client
  // retried after a network drop that happened *after* the commit), return the
  // original transaction instead of creating a duplicate sale + gift-card debit.
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.merchantId, req.session.merchantId!),
        eq(transactionsTable.idempotencyKey, idempotencyKey),
      ));
    if (existing) {
      let cust: typeof customersTable.$inferSelect | null = null;
      if (existing.customerId) {
        const [c] = await db.select().from(customersTable).where(and(eq(customersTable.id, existing.customerId), eq(customersTable.merchantId, req.session.merchantId!)));
        cust = c ?? null;
      }
      res.status(201).json(formatTransaction(existing, cust));
      return;
    }
  }

  // Tenant isolation: any provided customerId must belong to this merchant.
  let scopedCustomer: typeof customersTable.$inferSelect | null = null;
  if (customerId != null) {
    const [c] = await db
      .select()
      .from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, req.session.merchantId!)));
    if (!c) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    scopedCustomer = c;
  }

  // ── Recompute every monetary value from DB-authoritative product prices ──
  // Client-supplied unitPrice / totalPrice / taxAmount are treated as hints
  // only; the persisted record is built from product.price + product.taxRate.
  // Client `discount` per line is honoured but clamped to [0, lineGross]
  // so a forged discount cannot drive totals negative or below zero.
  // productId === 0 signals a custom / one-off item — it bypasses the DB lookup
  // and inventory deduction, using client-supplied name and price instead.
  const regularProductIds = [...new Set(clientItems.filter(i => i.productId !== 0).map((i) => i.productId))];
  const dbProducts = regularProductIds.length > 0
    ? await db
        .select()
        .from(productsTable)
        .where(and(inArray(productsTable.id, regularProductIds), eq(productsTable.merchantId, req.session.merchantId!)))
    : [];
  const productMap = new Map(dbProducts.map((p) => [p.id, p]));
  const missing = regularProductIds.filter((id) => !productMap.has(id));
  if (missing.length > 0) {
    res.status(400).json({ error: `Unknown product id(s): ${missing.join(", ")}` });
    return;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const computedItems: {
    productId: number; productName: string; quantity: number;
    unitPrice: number; totalPrice: number; taxAmount: number;
    discount?: number;
    giftCardIssue?: boolean; giftCardNumber?: string;
  }[] = [];
  for (const i of clientItems) {
    if (!Number.isFinite(i.quantity) || i.quantity <= 0 || !Number.isInteger(i.quantity)) {
      res.status(400).json({ error: `Invalid quantity for product ${i.productId}` });
      return;
    }
    // A gift card issue line must always have quantity 1 — each unit is a unique card
    // with its own generated number, so selling qty>1 would require multiple distinct
    // numbers, which the current dialog doesn't support.
    if (i.giftCardIssue && i.quantity !== 1) {
      res.status(400).json({ error: "Gift card issue items must have quantity 1. Add each card as a separate line." });
      return;
    }
    let unitPrice: number;
    let taxRatePct: number;
    let itemName: string;
    if (i.productId === 0) {
      // Custom item or gift card issue: trust client-supplied values, no DB product required
      unitPrice  = Math.max(0, i.unitPrice ?? 0);
      taxRatePct = 10; // standard Australian GST
      itemName   = (i.productName || (i.giftCardIssue ? "Gift Card" : "Custom Item")).slice(0, 200);
    } else {
      const product = productMap.get(i.productId)!;
      unitPrice  = parseFloat(product.price);
      taxRatePct = product.taxRate != null ? parseFloat(product.taxRate) : 10;
      itemName   = product.name;
    }
    const lineGross = round2(unitPrice * i.quantity);
    const rawDiscount = Math.max(0, i.discount ?? 0);
    const discount = round2(Math.min(rawDiscount, lineGross));
    const totalPrice = round2(lineGross - discount);
    const taxAmount = round2(totalPrice * (taxRatePct / (100 + taxRatePct)));
    computedItems.push({
      productId: i.productId,
      productName: itemName,
      quantity: i.quantity,
      unitPrice,
      totalPrice,
      taxAmount,
      discount: discount > 0 ? discount : undefined,
      giftCardIssue: i.giftCardIssue || undefined,
      // Preserve client-provided number; server will fill in blanks before the DB write
      giftCardNumber: (i.giftCardIssue && i.giftCardNumber) ? i.giftCardNumber.trim().toUpperCase() : undefined,
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

  // Reject obvious tampering on the only authoritative number: the charged
  // total. The breakdown fields can drift by sub-cent rounding when the
  // client sums tax pre-rounding, so we don't gate on them.
  if (Math.abs(clientTotal - total) > 0.01) {
    res.status(409).json({
      error: "Sale total does not match current product pricing. Please refresh the cart and try again.",
      expected: { subtotal, taxTotal, discountTotal, total },
    });
    return;
  }
  void clientSubtotal; void clientTaxTotal; void clientDiscountTotal;

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
    .where(eq(loyaltySettingsTable.merchantId, req.session.merchantId!));
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
      res.status(400).json({ error: "Loyalty program is disabled" });
      return;
    }
    if (programType === "stamp") {
      res.status(400).json({ error: "Stamp programs cannot be redeemed at checkout" });
      return;
    }
    if (!scopedCustomer) {
      res.status(400).json({ error: "Loyalty payments require a customer" });
      return;
    }
    if (requiredLoyaltyPoints > scopedCustomer.loyaltyPoints) {
      res.status(400).json({ error: "Insufficient loyalty balance" });
      return;
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
  let sanitizedEarned = 0;
  if (scopedCustomer && paymentMethod !== "loyalty" && programOn) {
    const excluded = ((loyaltyConfig.excludedCustomerGroups as string[]) ?? []).map((g) => g.toLowerCase());
    const groupName = (scopedCustomer.customerGroup ?? "").toLowerCase();
    const customerExcluded = !!groupName && excluded.includes(groupName);

    if (!customerExcluded) {
      // Eligible spend = sale total minus any line items whose product is
      // flagged excludeFromLoyalty. Matches POS preview logic so the credited
      // amount equals what the cashier saw on screen.
      const eligibleTotal = round2(computedItems.reduce((s, it) => {
        const p = productMap.get(it.productId);
        if (p?.excludeFromLoyalty === "true") return s;
        return s + it.totalPrice;
      }, 0));

      let baseEarned = 0;
      switch (programType) {
        case "cashback": {
          const rate = (loyaltyConfig.cashbackRate as number) ?? 0.01;
          baseEarned = eligibleTotal * rate;
          break;
        }
        case "points": {
          const ppd = (loyaltyConfig.pointsPerDollar as number) ?? 1;
          baseEarned = eligibleTotal * ppd;
          break;
        }
        case "tiered": {
          const tiers = (loyaltyConfig.tiers ?? []) as Array<{ minSpend?: number; pointsRequired?: number; rate?: number; bonusMultiplier?: number; name: string }>;
          const spent = parseFloat(scopedCustomer.totalSpent);
          const pts = scopedCustomer.loyaltyPoints ?? 0;
          const sorted = [...tiers].sort((a, b) =>
            (b.pointsRequired ?? b.minSpend ?? 0) - (a.pointsRequired ?? a.minSpend ?? 0)
          );
          const tier = sorted.find((t) => {
            if (t.pointsRequired != null) return pts >= t.pointsRequired;
            return spent >= (t.minSpend ?? 0);
          }) ?? sorted[sorted.length - 1];
          const rate = tier?.rate ?? 0.01;
          const bonusMult = tier?.bonusMultiplier ?? 1;
          baseEarned = eligibleTotal * rate * bonusMult;
          break;
        }
        case "stamp": {
          // 1 stamp per sale (only if at least one eligible item was bought).
          baseEarned = eligibleTotal > 0 ? 1 : 0;
          break;
        }
        case "custom": {
          const rate = (loyaltyConfig.customValue as number) ?? 0.01;
          baseEarned = eligibleTotal * rate;
          break;
        }
        default: baseEarned = 0;
      }

      // Apply active promotion multipliers / bonuses
      const promotions = (loyaltyConfig.promotions ?? []) as Array<{
        id: string; name: string; type: string; active: boolean;
        multiplier?: number; bonusAmount?: number;
        categoryId?: number | null; productId?: number | null;
        minSpend?: number | null; startDate?: string | null; endDate?: string | null;
      }>;
      const today = new Date().toISOString().slice(0, 10);
      const activePromos = promotions.filter((p) => {
        if (!p.active) return false;
        const inRange = (!p.startDate || p.startDate <= today) && (!p.endDate || p.endDate >= today);
        if (!inRange) return false;
        if (p.type === "spend_threshold" && (p.minSpend == null || total < p.minSpend)) return false;
        if (p.type === "category_bonus" && p.categoryId != null) {
          const hasCat = computedItems.some((it) => {
            const product = productMap.get(it.productId);
            return product && product.categoryId === p.categoryId;
          });
          if (!hasCat) return false;
        }
        if (p.type === "product_bonus" && p.productId != null) {
          return computedItems.some((it) => it.productId === p.productId);
        }
        if (p.type === "birthday" && scopedCustomer) {
          const dob = scopedCustomer.dateOfBirth;
          if (!dob) return false;
          const d = new Date(dob);
          const todayM = new Date().getMonth() + 1;
          const todayD = new Date().getDate();
          return d.getMonth() + 1 === todayM && d.getDate() === todayD;
        }
        return true;
      });
      const bestMultiplier = activePromos.length > 0
        ? Math.max(...activePromos.map((p) => p.multiplier ?? 1))
        : 1;
      const bestBonus = activePromos.length > 0
        ? Math.max(...activePromos.map((p) => p.bonusAmount ?? 0))
        : 0;
      const finalEarned = baseEarned * bestMultiplier + bestBonus;

      // Cap monetary earnings at the sale total so cashback never exceeds
      // the amount paid. Points and stamps are integer counts so we floor those.
      if (programType === "cashback" || programType === "tiered" || programType === "custom") {
        sanitizedEarned = round2(Math.max(0, Math.min(finalEarned, total)));
      } else {
        sanitizedEarned = Math.max(0, Math.floor(finalEarned));
      }
    }
  }
  void loyaltyEarned; // client value is purely informational — server is authoritative

  const receiptNumber = providedReceiptNumber || generateReceiptNumber();

  // Persist sanitized monetary fields, never raw client input.
  //   - Cash: cashier hands over >= total; we accept the actual tendered
  //     amount (no upper cap) and derive change ourselves. Reject under-tender.
  //   - Loyalty: tender equals the required points (in dollars), change = 0.
  //   - All other methods: force tendered = total, change = 0.
  let persistedTendered: number;
  let persistedChange: number;
  if (paymentMethod === "cash") {
    const cashTendered = Math.max(0, amountTendered ?? total);
    if (cashTendered < total - 0.009) {
      res.status(400).json({ error: "Cash tendered is less than the sale total" });
      return;
    }
    persistedTendered = cashTendered;
    persistedChange = Math.max(0, cashTendered - total);
  } else if (paymentMethod === "loyalty") {
    persistedTendered = requiredLoyaltyPoints;
    persistedChange = 0;
  } else {
    persistedTendered = total;
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
  let transaction: typeof transactionsTable.$inferSelect;
  try {
    transaction = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(transactionsTable)
      .values({
        merchantId: req.session.merchantId!,
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
          eq(giftCardsTable.merchantId, req.session.merchantId!),
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
        merchantId: req.session.merchantId!,
        giftCardId: card.id,
        type: "redemption",
        amount: (-applied).toString(),
        balanceAfter: newBalance.toString(),
        note: `Redeemed on sale ${receiptNumber}`,
        transactionId: row.id,
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
          merchantId: req.session.merchantId!,
          cardNumber: item.giftCardNumber,
          initialValue:   cardValue.toString(),
          currentBalance: cardValue.toString(),
          status: "active",
        })
        .returning();
      await tx.insert(giftCardLedgerTable).values({
        merchantId:   req.session.merchantId!,
        giftCardId:  issuedCard.id,
        type:        "issue",
        amount:      cardValue.toString(),
        balanceAfter: cardValue.toString(),
        note:        `Issued on receipt ${receiptNumber}`,
        transactionId: row.id,
      });
    }

    for (const [productId, qty] of qtyByProduct) {
      const product = productMap.get(productId);
      if (product?.trackInventory === "true") {
        await tx
          .update(productsTable)
          .set({ stockQuantity: Math.max(0, product.stockQuantity - qty) })
          .where(eq(productsTable.id, productId));
      }
    }

    if (scopedCustomer) {
      const redeemed = paymentMethod === "loyalty" ? requiredLoyaltyPoints : 0;
      const loyaltyDelta = paymentMethod === "loyalty"
        ? sql`GREATEST(0, ${customersTable.loyaltyPoints} - ${redeemed})`
        : sql`${customersTable.loyaltyPoints} + ${sanitizedEarned}`;
      await tx
        .update(customersTable)
        .set({
          totalSpent:    sql`${customersTable.totalSpent} + ${total}`,
          visitCount:    sql`${customersTable.visitCount} + 1`,
          loyaltyPoints: loyaltyDelta,
        })
        .where(and(eq(customersTable.id, scopedCustomer.id), eq(customersTable.merchantId, req.session.merchantId!)));
    }

    if (notes) {
      const serviceMatch = notes.match(/\[Service #([^:]+):/);
      if (serviceMatch) {
        const jobNumber = serviceMatch[1].trim();
        await tx
          .update(serviceJobsTable)
          .set({ status: "completed" })
          .where(and(
            eq(serviceJobsTable.jobNumber, jobNumber),
            eq(serviceJobsTable.merchantId, req.session.merchantId!),
          ));
      }
      const apptMatch = notes.match(/\[Appt #(\d+):/);
      if (apptMatch) {
        const apptId = parseInt(apptMatch[1], 10);
        await tx
          .update(appointmentsTable)
          .set({ status: "completed" })
          .where(and(
            eq(appointmentsTable.id, apptId),
            eq(appointmentsTable.merchantId, req.session.merchantId!),
          ));
      }
    }

    return row;
    });
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    // Idempotency race: a concurrent request with the same key won the unique
    // index. Return the transaction it created instead of surfacing a 500.
    if (idempotencyKey && (err as { code?: string })?.code === "23505") {
      const [existing] = await db
        .select()
        .from(transactionsTable)
        .where(and(
          eq(transactionsTable.merchantId, req.session.merchantId!),
          eq(transactionsTable.idempotencyKey, idempotencyKey),
        ));
      if (existing) {
        let cust: typeof customersTable.$inferSelect | null = null;
        if (existing.customerId) {
          const [c] = await db.select().from(customersTable).where(and(eq(customersTable.id, existing.customerId), eq(customersTable.merchantId, req.session.merchantId!)));
          cust = c ?? null;
        }
        res.status(201).json(formatTransaction(existing, cust));
        return;
      }
    }
    throw err;
  }

  res.status(201).json(formatTransaction(transaction, scopedCustomer));
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

router.post("/transactions/:id/refund", requireAuth, async (req, res): Promise<void> => {
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

  const [transaction] = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.merchantId, req.session.merchantId!)));

  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  const [updated] = await db
    .update(transactionsTable)
    .set({ status: "refunded", notes: parsed.data.reason })
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.merchantId, req.session.merchantId!)))
    .returning();

  let cust: typeof customersTable.$inferSelect | null = null;
  if (updated.customerId) {
    const [c] = await db.select().from(customersTable).where(and(eq(customersTable.id, updated.customerId), eq(customersTable.merchantId, req.session.merchantId!)));
    cust = c ?? null;
  }
  res.json(formatTransaction(updated, cust));
});

router.delete("/transactions/:id", requireAuth, async (req, res): Promise<void> => {
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
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${i.name}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:center;">${i.qty}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;">$${Number(i.total ?? i.price * i.qty).toFixed(2)}</td>
    </tr>`
  ).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#222;">
      <h2 style="margin:0 0 4px;">${bizName}</h2>
      <p style="margin:0 0 24px;color:#888;font-size:13px;">Receipt #${tx.receiptNumber ?? tx.id}</p>
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
      <div style="margin-top:16px;text-align:right;font-size:15px;">
        <strong>Total: $${Number(tx.total).toFixed(2)}</strong>
      </div>
      <p style="margin-top:32px;font-size:12px;color:#aaa;text-align:center;">Thank you for shopping with us!</p>
    </div>`;

  const result = await sendEmail(merchantId, {
    to: email,
    subject: `Receipt from ${bizName} — #${tx.receiptNumber ?? tx.id}`,
    html,
    text: `Receipt from ${bizName}\nReceipt #${tx.receiptNumber ?? tx.id}\nTotal: $${Number(tx.total).toFixed(2)}\n\nThank you for shopping with us!`,
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
