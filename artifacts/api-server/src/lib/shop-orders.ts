/**
 * The shop account's Orders card (GET /shop/account/orders): what a customer
 * bought in store and what they ordered online, shaped for the customer — no
 * cost prices, staff, idempotency keys or internal notes leave this module.
 * No `db` or `req` here; pinned by shop-orders.test.ts.
 *
 * In-store vs online: a paid online order is ALSO booked as a till
 * transaction (services/deliveryOrderSale.ts, idempotency key
 * `delivery-order:<id>`), so that transaction is left out of In-Store — the
 * order already shows under Online, and listing it twice would read as two
 * purchases.
 */

export const ONLINE_SALE_KEY_PREFIX = "delivery-order:";

/** Till sale statuses a customer sees: what they bought, and what was refunded. */
export const IN_STORE_STATUSES = ["completed", "refunded"] as const;

export function isOnlineOrderSale(idempotencyKey: string | null | undefined): boolean {
  return !!idempotencyKey && idempotencyKey.startsWith(ONLINE_SALE_KEY_PREFIX);
}

export interface OrderLine { name: string; quantity: number; total: number }

const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : d;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lines from a till transaction's `items` jsonb. */
export function saleLines(items: unknown): OrderLine[] {
  if (!Array.isArray(items)) return [];
  return items.filter((i) => i && typeof i === "object").map((i: Record<string, unknown>) => {
    const quantity = Math.max(1, Math.round(num(i.quantity, 1)));
    return {
      name: String(i.productName ?? i.name ?? "Item"),
      quantity,
      total: round2(i.totalPrice != null ? num(i.totalPrice) : num(i.unitPrice) * quantity),
    };
  });
}

/** Lines from an online order's `items` text (JSON). A malformed blob gives no lines. */
export function onlineOrderLines(items: string | null | undefined): OrderLine[] {
  let parsed: unknown;
  try { parsed = JSON.parse(items || "[]"); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((l) => l && typeof l === "object").map((l: Record<string, unknown>) => {
    const quantity = Math.max(1, Math.round(num(l.qty ?? l.quantity, 1)));
    return {
      name: String(l.name ?? l.productName ?? "Item"),
      quantity,
      total: round2(l.lineTotal != null ? num(l.lineTotal) : num(l.price) * quantity),
    };
  });
}

/* How the till names a payment method → how a customer would. Anything else
   (a merchant's own custom method) is shown tidied up, as typed. */
const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash", card: "Card", eftpos: "EFTPOS", credit: "Card", split: "Split payment",
  gift_card: "Gift card", giftcard: "Gift card", voucher: "Voucher", store_credit: "Store credit",
  loyalty: "Rewards", account: "On account", bank_transfer: "Bank transfer", afterpay: "Afterpay",
  zip: "Zip", stripe: "Card", paypal: "PayPal", online: "Online",
};
export function paymentLabel(method: string | null | undefined): string {
  const m = (method ?? "").trim();
  if (!m) return "";
  const known = PAYMENT_LABELS[m.toLowerCase()];
  if (known) return known;
  const words = m.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* Order statuses, worded for the customer (the POS's are staff-facing). */
const ORDER_STATUS_LABELS: Record<string, string> = {
  new: "Order received", processing: "Being prepared", ready: "Ready for pickup",
  shipped: "On its way", delivered: "Delivered", cancelled: "Cancelled",
};
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? (status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ") : "");
}

/* Carrier tracking pages. Same ids and URLs as the POS's lib/order-tracking.ts —
   change both together. */
const CARRIERS: Record<string, { name: string; url?: (n: string) => string }> = {
  auspost:   { name: "Australia Post",   url: (n) => `https://auspost.com.au/mypost/track/details/${n}` },
  startrack: { name: "StarTrack",        url: (n) => `https://startrack.com.au/track/details/${n}` },
  couriers:  { name: "Couriers Please",  url: (n) => `https://www.couriersplease.com.au/tools-track/no/${n}` },
  fastway:   { name: "Aramex (Fastway)", url: (n) => `https://www.aramex.com.au/tools/track?l=${n}` },
  tnt:       { name: "TNT Express",      url: (n) => `https://www.tnt.com/express/en_au/site/shipping-tools/tracking.html?searchType=con&cons=${n}` },
  dhl:       { name: "DHL Express",      url: (n) => `https://www.dhl.com/au-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}` },
  fedex:     { name: "FedEx",            url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}` },
  sendle:    { name: "Sendle",           url: (n) => `https://track.sendle.com/tracking?ref=${n}` },
  other:     { name: "Other" },
};

export function tracking(carrier: string | null | undefined, number: string | null | undefined) {
  const n = (number ?? "").trim();
  if (!n) return null;
  const c = CARRIERS[(carrier ?? "").trim()];
  return { carrier: c?.name ?? (carrier || null), number: n, url: c?.url ? c.url(encodeURIComponent(n)) : null };
}
