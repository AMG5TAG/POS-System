/**
 * Persisted, trackable QR codes for products, customers and service jobs.
 *
 * Product and customer QRs are generated once and reused regardless of when
 * they're printed (no on-the-fly generation), so they always appear in QR
 * analytics. Service QRs are the only time-limited kind — they expire 30 days
 * after creation.
 *
 * All helpers are idempotent (one row per merchant+entry+type) and best-effort:
 * callers should not let a QR-registration failure break the primary operation.
 */
import { db, qrCodesTable, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { publicOrigin } from "../lib/publicUrl";

const SERVICE_QR_TTL_DAYS = 30;

async function merchantUsername(merchantId: number): Promise<string | null> {
  const [m] = await db.select({ username: merchantsTable.username })
    .from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  return m?.username ?? null;
}

async function upsertQr(
  merchantId: number,
  entryId: string,
  qrType: "product" | "customer" | "service",
  label: string,
  url: string,
  expiresAt: Date | null,
): Promise<void> {
  await db.insert(qrCodesTable)
    .values({ merchantId, entryId, label, url, qrType, expiresAt })
    .onConflictDoUpdate({
      target: [qrCodesTable.merchantId, qrCodesTable.entryId, qrCodesTable.qrType],
      set: { label, url, expiresAt },
    });
}

/** Persist (or refresh) a product's QR — scannable to its public product page. */
export async function registerProductQr(merchantId: number, productId: number, name: string | null): Promise<void> {
  const username = await merchantUsername(merchantId);
  const url = username ? `${publicOrigin()}/b/${encodeURIComponent(username)}/p/${productId}` : "";
  await upsertQr(merchantId, `product-${productId}`, "product", name || `Product ${productId}`, url, null);
}

/** Persist (or refresh) a customer's QR — the stable "CUS-<id>" lookup code that
    the printed customer sticker encodes (there is no public customer page). */
export async function registerCustomerQr(merchantId: number, customerId: number, name: string | null): Promise<void> {
  await upsertQr(merchantId, `customer-${customerId}`, "customer", name || `Customer ${customerId}`, `CUS-${customerId}`, null);
}

/** Persist (or refresh) a service job's QR — Tech App deep link, expiring in 30 days. */
export async function registerServiceQr(merchantId: number, jobId: number, label: string | null): Promise<void> {
  const username = await merchantUsername(merchantId);
  const origin = publicOrigin();
  const url = username ? `${origin}/b/${encodeURIComponent(username)}/t/techapp?job=${jobId}` : `${origin}/service-jobs/${jobId}`;
  const expiresAt = new Date(Date.now() + SERVICE_QR_TTL_DAYS * 86_400_000);
  await upsertQr(merchantId, `service-${jobId}`, "service", label || `Service ${jobId}`, url, expiresAt);
}

/** Batch-register product QRs (CSV import / backfill). Existing rows are left as-is. */
export async function registerProductQrsBatch(merchantId: number, products: Array<{ id: number; name: string | null }>): Promise<void> {
  if (!products.length) return;
  const username = await merchantUsername(merchantId);
  const rows = products.map((p) => ({
    merchantId,
    entryId: `product-${p.id}`,
    qrType: "product",
    label: p.name || `Product ${p.id}`,
    url: username ? `${publicOrigin()}/b/${encodeURIComponent(username)}/p/${p.id}` : "",
    expiresAt: null,
  }));
  await db.insert(qrCodesTable).values(rows).onConflictDoNothing();
}

/** Batch-register customer QRs (CSV import / backfill). Existing rows are left as-is. */
export async function registerCustomerQrsBatch(merchantId: number, customers: Array<{ id: number; name: string | null }>): Promise<void> {
  if (!customers.length) return;
  const rows = customers.map((c) => ({
    merchantId,
    entryId: `customer-${c.id}`,
    qrType: "customer",
    label: c.name || `Customer ${c.id}`,
    url: `CUS-${c.id}`,
    expiresAt: null,
  }));
  await db.insert(qrCodesTable).values(rows).onConflictDoNothing();
}

/** Fire-and-forget wrapper: register a QR without letting failures bubble up. */
export function registerQrBestEffort(p: Promise<void>): void {
  void p.catch(() => { /* QR persistence is non-critical */ });
}
