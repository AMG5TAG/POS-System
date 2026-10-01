import { db, productPreOrdersTable, productPreOrderItemsTable, merchantsTable, customersTable } from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { isPreOrderActive, preOrderNumber, PRE_ORDER_STATUS, OPEN_STATUSES, AWAITING_STATUSES, allocateReceived } from "./pre-orders";
import { sendSms } from "../services/sms";
import { sendEmail } from "../services/email";
import { escapeHtml } from "./html-escape";

/**
 * Pre-orders opened and collected by a till sale (routes/transactions.ts
 * finalizeSale). Planning happens before the sale's DB transaction so a bad
 * request is refused before anything is written; recording happens inside it,
 * so a sale and its pre-orders commit together or not at all.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ProductRow = {
  id: number; name: string; price: string;
  preOrder: string; preOrderReleaseDate: string | null; preOrderEtaDate: string | null;
};

export type PreOrderPlan = {
  productId: number; productName: string; quantity: number;
  unitPrice: number; totalAmount: number; paid: number;
  etaDate: string | null; deposit: boolean;
};

type Line = { productId: number; quantity: number; unitPrice: number; totalPrice: number; preOrderDeposit?: { productId: number; quantity: number } | null };

/**
 * Which lines of a sale open pre-orders:
 *  - a line for an active pre-order product, paid in full (its line total);
 *  - a deposit line (productId 0 + preOrderDeposit), paid by that line's total
 *    against price × quantity of the named product.
 * `collectingProductIds` are the products of a pre-order this sale collects —
 * those lines are the collection, not a new pre-order.
 */
export function planPreOrders(
  lines: Line[],
  products: Map<number, ProductRow>,
  today: string,
  collectingProductIds: Set<number>,
): { ok: true; plans: PreOrderPlan[] } | { ok: false; error: string } {
  const plans: PreOrderPlan[] = [];
  for (const l of lines) {
    if (l.productId !== 0) {
      const p = products.get(l.productId);
      if (!p || collectingProductIds.has(p.id) || !isPreOrderActive(p, today)) continue;
      plans.push({
        productId: p.id, productName: p.name, quantity: l.quantity,
        unitPrice: l.unitPrice, totalAmount: l.totalPrice, paid: l.totalPrice,
        etaDate: p.preOrderEtaDate, deposit: false,
      });
      continue;
    }
    const link = l.preOrderDeposit;
    if (!link) continue;
    const p = products.get(link.productId);
    if (!p) return { ok: false, error: "The product this deposit is for no longer exists." };
    if (!isPreOrderActive(p, today)) return { ok: false, error: `${p.name} isn't on pre-order any more — sell it as a normal product.` };
    const unitPrice = parseFloat(p.price) || 0;
    const totalAmount = Math.round(unitPrice * link.quantity * 100) / 100;
    if (l.totalPrice <= 0) return { ok: false, error: `The deposit on ${p.name} must be more than $0.` };
    if (l.totalPrice > totalAmount + 0.005) return { ok: false, error: `The deposit on ${p.name} is more than its price — take full payment instead.` };
    plans.push({
      productId: p.id, productName: p.name, quantity: link.quantity,
      unitPrice, totalAmount, paid: l.totalPrice,
      etaDate: p.preOrderEtaDate, deposit: true,
    });
  }
  return { ok: true, plans };
}

/** Open the planned pre-orders for a committed-with-this-tx sale. Numbered from their own id. */
export async function recordPreOrders(
  tx: Tx,
  merchantId: number,
  transactionId: number,
  customer: { id: number; firstName: string | null; lastName: string | null; company?: string | null },
  plans: PreOrderPlan[],
): Promise<void> {
  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.company || "Customer";
  for (const p of plans) {
    const [row] = await tx.insert(productPreOrdersTable).values({
      merchantId,
      poNumber: "PRE-…", // replaced with the row's own number just below
      customerId: customer.id,
      customerName,
      productId: p.productId,
      productName: p.productName,
      quantity: p.quantity,
      depositAmount: p.paid.toFixed(2),
      totalAmount: p.totalAmount.toFixed(2),
      status: PRE_ORDER_STATUS.awaiting,
      expectedDate: p.etaDate,
      source: "pos",
      transactionId,
      notes: p.deposit ? "Deposit taken at the till" : null,
    }).returning({ id: productPreOrdersTable.id });
    await tx.update(productPreOrdersTable).set({ poNumber: preOrderNumber(row!.id) }).where(eq(productPreOrdersTable.id, row!.id));
    await tx.insert(productPreOrderItemsTable).values({
      preOrderId: row!.id, productId: p.productId, productName: p.productName,
      quantity: p.quantity, unitPrice: p.unitPrice.toFixed(2),
    });
  }
}

/** The open pre-order a sale is collecting, with its product ids — or null if it can't be collected. */
export async function loadCollectable(merchantId: number, preOrderId: number) {
  const [row] = await db.select().from(productPreOrdersTable)
    .where(and(eq(productPreOrdersTable.id, preOrderId), eq(productPreOrdersTable.merchantId, merchantId))).limit(1);
  if (!row || !(OPEN_STATUSES as readonly string[]).includes(row.status)) return null;
  const items = await db.select({ productId: productPreOrderItemsTable.productId }).from(productPreOrderItemsTable)
    .where(eq(productPreOrderItemsTable.preOrderId, preOrderId));
  const productIds = new Set(items.map((i) => i.productId).filter((id): id is number => id != null));
  if (row.productId) productIds.add(row.productId);
  return { row, productIds };
}

/** Mark a pre-order collected by this sale, fully paid. Only while still open (a double submit finds it closed). */
export async function collectPreOrder(tx: Tx, merchantId: number, preOrderId: number, transactionId: number): Promise<void> {
  const [row] = await tx.select({ totalAmount: productPreOrdersTable.totalAmount, depositAmount: productPreOrdersTable.depositAmount })
    .from(productPreOrdersTable)
    .where(and(eq(productPreOrdersTable.id, preOrderId), eq(productPreOrdersTable.merchantId, merchantId), inArray(productPreOrdersTable.status, [...OPEN_STATUSES])))
    .limit(1);
  if (!row) return;
  const total = parseFloat(row.totalAmount);
  await tx.update(productPreOrdersTable).set({
    status: PRE_ORDER_STATUS.collected,
    collectedAt: new Date(),
    collectedTransactionId: transactionId,
    ...(total > 0 ? { depositAmount: row.totalAmount } : {}),
  }).where(eq(productPreOrdersTable.id, preOrderId));
}

/* ── Purchase-order receiving ────────────────────────────────────────── */

export type PreOrderArrival = {
  preOrderId: number; number: string; customerId: number | null; customerName: string;
  productName: string; quantity: number; allocatedQuantity: number; complete: boolean;
};

/**
 * Received units of a product go to the pre-orders waiting for it, oldest
 * first; one now fully covered becomes Arrived. Runs inside the receive's own
 * transaction, locking the waiting rows so two receipts at once can't give the
 * same unit to two customers.
 */
export async function allocateArrivals(tx: Tx, merchantId: number, productId: number, received: number): Promise<PreOrderArrival[]> {
  if (received <= 0) return [];
  const waiting = await tx.select().from(productPreOrdersTable)
    .where(and(eq(productPreOrdersTable.merchantId, merchantId), inArray(productPreOrdersTable.status, [...AWAITING_STATUSES])))
    .orderBy(asc(productPreOrdersTable.createdAt), asc(productPreOrdersTable.id))
    .for("update");
  if (waiting.length === 0) return [];
  const items = await tx.select().from(productPreOrderItemsTable)
    .where(inArray(productPreOrderItemsTable.preOrderId, waiting.map((w) => w.id)));
  const itemsBy = new Map<number, typeof items>();
  for (const it of items) itemsBy.set(it.preOrderId, [...(itemsBy.get(it.preOrderId) ?? []), it]);

  // What each waiting pre-order needs of this product. Older manual rows with no
  // item rows carry the product on the pre-order itself.
  const wanting = waiting.flatMap((w) => {
    const own = itemsBy.get(w.id);
    const line = own ? own.find((i) => i.productId === productId) : (w.productId === productId ? { quantity: w.quantity, productName: w.productName } : undefined);
    return line ? [{ row: w, quantity: line.quantity, productName: line.productName }] : [];
  });
  const allocations = allocateReceived(wanting.map((w) => ({ id: w.row.id, quantity: w.quantity, allocatedQuantity: w.row.allocatedQuantity })), received);
  const out: PreOrderArrival[] = [];
  for (const a of allocations) {
    const w = wanting.find((x) => x.row.id === a.id)!;
    await tx.update(productPreOrdersTable).set({
      allocatedQuantity: a.allocatedQuantity,
      ...(a.complete ? { status: PRE_ORDER_STATUS.arrived, arrivedAt: new Date() } : {}),
    }).where(eq(productPreOrdersTable.id, a.id));
    out.push({
      preOrderId: a.id, number: w.row.poNumber, customerId: w.row.customerId, customerName: w.row.customerName,
      productName: w.productName, quantity: w.quantity, allocatedQuantity: a.allocatedQuantity, complete: a.complete,
    });
  }
  return out;
}

/**
 * Tell each customer whose pre-order is now complete that it has arrived — SMS
 * and email, whichever they have. After the receive commits (never inside it:
 * a failed receipt must not tell anyone their order is in); best-effort, and
 * notifiedAt records that at least one message went.
 */
export async function notifyArrivals(merchantId: number, arrivals: PreOrderArrival[]): Promise<void> {
  const done = arrivals.filter((a) => a.complete && a.customerId);
  if (done.length === 0) return;
  const [m] = await db.select({ businessName: merchantsTable.businessName }).from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const biz = m?.businessName || "We";
  for (const a of done) {
    const [c] = await db.select({ firstName: customersTable.firstName, email: customersTable.email, phone: customersTable.phone })
      .from(customersTable).where(and(eq(customersTable.id, a.customerId!), eq(customersTable.merchantId, merchantId)));
    if (!c) continue;
    const hi = c.firstName ? `Hi ${c.firstName}, ` : "";
    const text = `${hi}your pre-order ${a.number} (${a.productName}) has arrived at ${biz} and is ready for you.`;
    let sent = false;
    if (c.phone) {
      const r = await sendSms({ to: c.phone, body: `${biz}: ${text}` }, merchantId).catch(() => null);
      sent = sent || !!r?.success;
    }
    if (c.email) {
      const r = await sendEmail(merchantId, {
        to: c.email,
        subject: `Your pre-order ${a.number} has arrived`,
        html: `<p>${escapeHtml(text)}</p><p>Pre-order <strong>${escapeHtml(a.number)}</strong>: ${escapeHtml(a.productName)} × ${a.quantity}</p><p>— ${escapeHtml(biz)}</p>`,
        text,
      }).catch(() => null);
      sent = sent || !!r?.success;
    }
    if (sent) await db.update(productPreOrdersTable).set({ notifiedAt: new Date() }).where(eq(productPreOrdersTable.id, a.preOrderId));
  }
}

/** A refunded or voided sale takes its pre-orders with it — only those still
 *  open; one already collected or shipped is history, not undone here. Units
 *  already allocated to one simply stay in stock for the next in line. */
export async function cancelSalePreOrders(exec: Tx | typeof db, merchantId: number, transactionId: number): Promise<void> {
  await exec.update(productPreOrdersTable)
    .set({ status: PRE_ORDER_STATUS.cancelled, notes: "Sale refunded or voided" })
    .where(and(
      eq(productPreOrdersTable.merchantId, merchantId),
      eq(productPreOrdersTable.transactionId, transactionId),
      inArray(productPreOrdersTable.status, [...OPEN_STATUSES]),
    ));
}
