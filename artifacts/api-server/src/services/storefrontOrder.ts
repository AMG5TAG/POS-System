import {
  db, productsTable, discountsTable, customersTable, deliveryOrdersTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { formatAddressParts } from "../lib/address";
import { normalisePhoneFor } from "../lib/phone";

/**
 * Placing an order against a merchant's catalogue.
 *
 * Extracted from the public storefront checkout so the Storefront Data API's
 * `orders:write` endpoint lands orders down the *same* path. Two implementations
 * of "take an order" would be two implementations of stock validation and price
 * computation, and the one that drifted would be the one holding the money.
 *
 * The rule that matters: **nothing the caller says about price is believed.**
 * Line prices, tax and totals are recomputed here from the merchant's own
 * products, and a discount code is re-validated against the discounts table. A
 * caller can choose *what* to buy and *how many*; it cannot choose what it costs.
 *
 * Orders are always written `paymentStatus: "pending"`. Placing an order is a
 * claim on revenue, not revenue — `deliveryOrderSale` books it as a sale only
 * once a human confirms the money arrived.
 */

export type OrderLine = {
  productId: number; name: string; qty: number;
  price: number; taxRate: number; lineTotal: number;
};

export type PlaceOrderInput = {
  items: { productId: number; qty: number }[];
  customer: { name: string; email: string; phone?: string };
  address?: { line?: string; city?: string; state?: string; postcode?: string };
  discountCode?: string;
  notes?: string;
  /** Where the order came from, recorded on the order. */
  channel?: string;
  /** Caller's own reference. Supplying it makes a retry safe: a second call with
   *  the same reference returns the first order rather than placing another. */
  reference?: string;
};

export type PlacedOrder = {
  orderNumber: string;
  subtotal: number; discountTotal: number; taxTotal: number; total: number;
  currency: "AUD"; paymentStatus: "pending";
  lines: OrderLine[];
  appliedCode: string;
  /** True when this call matched an existing order instead of placing one. */
  duplicate: boolean;
};

export type PlaceOrderResult =
  | { ok: true; order: PlacedOrder }
  | { ok: false; status: number; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Look up an order already placed under this caller reference. */
async function findByReference(merchantId: number, reference: string) {
  const [row] = await db.select().from(deliveryOrdersTable)
    .where(and(eq(deliveryOrdersTable.merchantId, merchantId), eq(deliveryOrdersTable.orderId, reference)))
    .limit(1);
  return row ?? null;
}

export async function placeStorefrontOrder(
  merchantId: number, input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  /* A retry of a request that already succeeded must not buy the goods twice.
     Checked before anything is computed so a duplicate costs nothing. */
  if (input.reference) {
    const existing = await findByReference(merchantId, input.reference);
    if (existing) {
      return {
        ok: true,
        order: {
          orderNumber: existing.orderId,
          subtotal: parseFloat(existing.subtotal), discountTotal: parseFloat(existing.discountTotal),
          taxTotal: parseFloat(existing.taxTotal), total: parseFloat(existing.total),
          currency: "AUD", paymentStatus: "pending",
          lines: [], appliedCode: existing.discountCode, duplicate: true,
        },
      };
    }
  }

  // ── Load the real products (merchant-scoped, active) and recompute ──
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const products = await db.select().from(productsTable)
    .where(and(
      eq(productsTable.merchantId, merchantId),
      inArray(productsTable.id, ids),
      eq(productsTable.isActive, "true"),
    ));
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines: OrderLine[] = [];
  for (const item of input.items) {
    const p = byId.get(item.productId);
    if (!p) return { ok: false, status: 409, error: "One or more products are no longer available." };
    if (p.trackInventory === "true" && p.stockQuantity < item.qty) {
      return { ok: false, status: 409, error: `"${p.name}" only has ${p.stockQuantity} left in stock.` };
    }
    const price = parseFloat(p.price);
    lines.push({
      productId: p.id, name: p.name, qty: item.qty, price,
      taxRate: p.taxRate ? parseFloat(p.taxRate) : 0,
      lineTotal: round2(price * item.qty),
    });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

  // ── Discount, re-validated against the merchant's own rules ──
  let discountTotal = 0;
  let appliedCode = "";
  let discountRow: typeof discountsTable.$inferSelect | undefined;
  if (input.discountCode) {
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await db.select().from(discountsTable)
      .where(and(eq(discountsTable.merchantId, merchantId), eq(discountsTable.code, input.discountCode)));
    if (!row || row.isActive !== "true") return { ok: false, status: 400, error: "Invalid or inactive discount code." };
    if (row.endDate && row.endDate < today) return { ok: false, status: 400, error: "This discount has expired." };
    if (row.startDate && row.startDate > today) return { ok: false, status: 400, error: "This discount isn't active yet." };
    if (row.maxUses && row.usedCount >= row.maxUses) return { ok: false, status: 400, error: "This discount has reached its usage limit." };
    if (row.minOrderAmount && subtotal < parseFloat(row.minOrderAmount)) {
      return { ok: false, status: 400, error: `Spend at least $${row.minOrderAmount} to use this code.` };
    }
    discountTotal = round2(row.type === "percentage"
      ? subtotal * (parseFloat(row.value) / 100)
      : Math.min(parseFloat(row.value), subtotal));
    appliedCode = row.code ?? input.discountCode;
    discountRow = row;
  }

  const total = round2(Math.max(0, subtotal - discountTotal));
  /* Prices are GST-inclusive (AU retail convention); report the included GST,
     scaled down by the discount so it never exceeds what was actually charged. */
  const ratio = subtotal > 0 ? total / subtotal : 1;
  const taxTotal = round2(lines.reduce((s, l) => {
    const inclGst = l.taxRate > 0 ? l.lineTotal - l.lineTotal / (1 + l.taxRate / 100) : 0;
    return s + inclGst * ratio;
  }, 0));

  const orderNumber = input.reference
    || `WEB-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const nameParts = input.customer.name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? input.customer.name;
  const lastName = nameParts.slice(1).join(" ");
  const addr = input.address ?? {};
  const addressStr = formatAddressParts(addr.line, addr.city, addr.state, addr.postcode);
  // Both callers are unauthenticated (a storefront checkout, an API key), so
  // the phone middleware never sees this body. The merchant is known here.
  const phone = await normalisePhoneFor(merchantId, input.customer.phone ?? "");

  // ── Persist atomically: decrement stock, bump discount usage, write order ──
  await db.transaction(async (tx) => {
    for (const l of lines) {
      const p = byId.get(l.productId)!;
      if (p.trackInventory === "true") {
        await tx.update(productsTable)
          .set({ stockQuantity: sql`${productsTable.stockQuantity} - ${l.qty}` })
          .where(and(eq(productsTable.id, l.productId), eq(productsTable.merchantId, merchantId)));
      }
    }
    if (discountRow) {
      await tx.update(discountsTable)
        .set({ usedCount: sql`${discountsTable.usedCount} + 1` })
        .where(eq(discountsTable.id, discountRow.id));
    }
    // Upsert the customer by email within this merchant.
    const [existingCustomer] = await tx.select().from(customersTable)
      .where(and(eq(customersTable.merchantId, merchantId), eq(customersTable.email, input.customer.email)))
      .limit(1);
    if (existingCustomer) {
      await tx.update(customersTable).set({
        totalSpent: sql`${customersTable.totalSpent} + ${total}`,
        visitCount: sql`${customersTable.visitCount} + 1`,
        ...(phone ? { phone } : {}),
        ...(addressStr ? {
          address: addressStr,
          billingStreet: addr.line || null, billingCity: addr.city || null,
          billingState: addr.state || null, billingPostcode: addr.postcode || null,
        } : {}),
      }).where(eq(customersTable.id, existingCustomer.id));
    } else {
      await tx.insert(customersTable).values({
        merchantId,
        firstName, lastName: lastName || null,
        email: input.customer.email, phone: phone || null,
        address: addressStr || null,
        billingStreet: addr.line || null, billingCity: addr.city || null,
        billingState: addr.state || null, billingPostcode: addr.postcode || null,
        totalSpent: String(total), visitCount: 1,
      });
    }
    await tx.insert(deliveryOrdersTable).values({
      merchantId,
      orderId: orderNumber, number: orderNumber,
      channel: input.channel ?? "Online Store",
      customer: input.customer.name,
      customerEmail: input.customer.email,
      phone,
      address: addr.line ?? "", city: addr.city ?? "",
      state: addr.state ?? "", postcode: addr.postcode ?? "",
      status: "pending",
      placedAt: new Date().toISOString(),
      total: String(total),
      /* productId/taxRate/lineTotal are carried so the order can later be booked
         as a sale attributed to real products. */
      items: JSON.stringify(lines.map((l) => ({
        productId: l.productId, name: l.name, qty: l.qty,
        price: l.price, taxRate: l.taxRate, lineTotal: l.lineTotal,
      }))),
      notes: input.notes ?? "",
      subtotal: String(subtotal),
      discountCode: appliedCode,
      discountTotal: String(discountTotal),
      taxTotal: String(taxTotal),
      shippingTotal: "0",
      currency: "AUD",
      /* Placing an order is never payment: the storefront takes no money, so a
         human confirms it and that is what books the sale. */
      paymentStatus: "pending",
      paymentProvider: "manual",
      paymentRef: "",
    });
  });

  return {
    ok: true,
    order: {
      orderNumber, subtotal, discountTotal, taxTotal, total,
      currency: "AUD", paymentStatus: "pending",
      lines, appliedCode, duplicate: false,
    },
  };
}
