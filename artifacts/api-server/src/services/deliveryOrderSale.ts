import { db, deliveryOrdersTable, transactionsTable, customersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { withUniqueRetry, isUniqueViolation } from "../lib/document-numbers";

/**
 * Recording an online order as a sale, once the money is actually in.
 *
 * An order placed through the storefront is not revenue — it is a claim on
 * revenue. `online-store-checkout` writes it `paymentStatus: "pending"`, and
 * until someone confirms payment it must not appear in takings. Moving the
 * order to "paid" is what books it, and this is the only thing that does.
 *
 * What this deliberately does NOT do, because placing the order already did it
 * inside the checkout's own transaction:
 *   - **stock**: decremented when the order was placed, so the goods were
 *     committed the moment the shopper checked out. Moving it again here would
 *     take the same units off twice.
 *   - **customer totals**: `totalSpent` and `visitCount` were bumped then too.
 * Writing the sale is therefore a single INSERT, not a replay of the checkout.
 *
 * Idempotency is the idempotency key itself: `delivery-order:<id>` under the
 * merchant, which the unique index on (merchantId, idempotencyKey) enforces. So
 * marking an order paid twice — a double click, a retried request, a merchant
 * toggling the status back and forth — yields one sale, and the key doubles as
 * the link back from a transaction to the order that produced it.
 */

/** The key tying a transaction to the order it was raised from. */
export function orderIdempotencyKey(orderId: number): string {
  return `delivery-order:${orderId}`;
}

type OrderRow = typeof deliveryOrdersTable.$inferSelect;

/** A line as the storefront persists it. Older orders carry only the last three
 *  fields — `productId` was added later — so everything here is optional and the
 *  mapping below copes with either shape. */
type StoredLine = {
  productId?: number;
  taxRate?: number;
  lineTotal?: number;
  name?: string;
  qty?: number;
  price?: number;
};

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function generateReceiptNumber(prefix = "KR", digits = 5): string {
  const n = Math.floor(Math.random() * Math.pow(10, digits));
  return `${prefix}${String(n).padStart(digits, "0")}`;
}

/** Map the order's stored lines onto the shape `transactions.items` holds. */
function toTransactionItems(order: OrderRow) {
  let lines: StoredLine[] = [];
  try {
    const parsed = JSON.parse(order.items || "[]");
    if (Array.isArray(parsed)) lines = parsed as StoredLine[];
  } catch { /* a malformed blob still books the money, just without lines */ }

  return lines.map((l) => {
    const quantity = Math.max(1, Math.round(num(l.qty, 1)));
    const unitPrice = num(l.price);
    const totalPrice = l.lineTotal != null ? num(l.lineTotal) : round2(unitPrice * quantity);
    /* GST-inclusive pricing, matching the storefront: the tax is the portion
       already inside the line total, not an addition to it. */
    const rate = num(l.taxRate);
    const taxAmount = rate > 0 ? round2(totalPrice - totalPrice / (1 + rate / 100)) : 0;
    return {
      productId: l.productId ?? 0,
      productName: l.name ?? "Item",
      quantity,
      unitPrice,
      totalPrice,
      taxAmount,
    };
  });
}

export type RecordSaleResult =
  | { recorded: true; transactionId: number }
  /** Already booked — the order had been marked paid before. */
  | { recorded: false; transactionId: number | null };

/**
 * Book a paid online order as a sale. Safe to call repeatedly: the second and
 * later calls report the transaction the first one created.
 */
export async function recordPaidOrderAsSale(
  merchantId: number, order: OrderRow,
): Promise<RecordSaleResult> {
  const key = orderIdempotencyKey(order.id);

  const existing = await findSaleForOrder(merchantId, order.id);
  if (existing != null) return { recorded: false, transactionId: existing };

  /* Attribute the sale to the customer the storefront matched or created, so it
     shows on their history. Matched by email because that is the only handle a
     storefront order carries. */
  let customerId: number | null = null;
  if (order.customerEmail) {
    const [c] = await db.select({ id: customersTable.id })
      .from(customersTable)
      .where(and(eq(customersTable.merchantId, merchantId), eq(customersTable.email, order.customerEmail)))
      .limit(1);
    customerId = c?.id ?? null;
  }

  const items = toTransactionItems(order);
  const total = num(order.total);
  const subtotal = num(order.subtotal, total);

  try {
    const row = await withUniqueRetry("transactions_merchant_receipt_unique", async () => {
      const [inserted] = await db.insert(transactionsTable).values({
        merchantId,
        customerId,
        receiptNumber: generateReceiptNumber(),
        status: "completed",
        subtotal: String(subtotal),
        taxTotal: String(num(order.taxTotal)),
        discountTotal: String(num(order.discountTotal)),
        total: String(total),
        /* The channel, not a card type — the storefront takes no payment itself,
           so this records where the sale came from. */
        paymentMethod: order.paymentProvider || "online",
        notes: `Online order ${order.number || order.orderId}`,
        items,
        idempotencyKey: key,
      }).returning();
      return inserted;
    });
    return { recorded: true, transactionId: row.id };
  } catch (err) {
    /* Another request booked it between the check above and this insert. The
       key did its job; report theirs rather than failing the status change. */
    if (isUniqueViolation(err, "transactions_merchant_idempotency_idx")) {
      return { recorded: false, transactionId: await findSaleForOrder(merchantId, order.id) };
    }
    throw err;
  }
}

/** The transaction raised from this order, if the order has been booked. */
export async function findSaleForOrder(merchantId: number, orderId: number): Promise<number | null> {
  const [row] = await db.select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.merchantId, merchantId),
      eq(transactionsTable.idempotencyKey, orderIdempotencyKey(orderId)),
    ))
    .limit(1);
  return row?.id ?? null;
}
