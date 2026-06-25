import { Router, type IRouter } from "express";
import { db, transactionsTable, productsTable, customersTable, serviceJobsTable } from "@workspace/db";
import { eq, and, gt, isNotNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Expiry = sale date + duration (months/years). Mirrors the frontend warranty helper. */
function productWarrantyExpiry(saleDate: Date | string, duration: number, unit: string): Date | null {
  if (!duration || duration <= 0) return null;
  const start = new Date(saleDate);
  if (isNaN(start.getTime())) return null;
  const months = unit === "years" ? duration * 12 : duration;
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  return end;
}

function productWarrantyLabel(duration: number, unit: string): string {
  if (!duration || duration <= 0) return "";
  const u = unit === "years" ? "year" : "month";
  return `${duration} ${u}${duration === 1 ? "" : "s"} warranty`;
}

function customerName(c?: { firstName?: string | null; lastName?: string | null; company?: string | null } | null): string {
  if (!c) return "";
  const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
  return name || (c.company ?? "");
}

type WarrantyItem = {
  type: "product" | "service";
  key: string;
  itemName: string;
  sku: string | null;
  serials: string[];
  quantity: number;
  warrantyLabel: string;
  soldAt: string;
  expiry: string;
  daysRemaining: number;
  referenceId: number;
  referenceNumber: string | null;
  customer: { id: number; name: string; email: string | null; phone: string | null } | null;
};

type TxItem = {
  productId?: number | null;
  productName?: string | null;
  name?: string | null;
  quantity?: number | null;
  serials?: unknown;
};

/**
 * GET /warranties — every product and service warranty that is still active for
 * this merchant, computed deterministically server-side from a single `now`.
 *
 * Product warranties come from sold line items (sale date + the product's
 * warranty duration). Service warranties come from completed service jobs
 * (completion date + repair-warranty days). The result is the *full* history —
 * there is no row cap — so the page no longer flickers as paginated client
 * fetches change which products/transactions happen to be loaded.
 */
router.get("/warranties", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const now = new Date();

  // Warranty-carrying products only.
  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      sku: productsTable.sku,
      warrantyDuration: productsTable.warrantyDuration,
      warrantyUnit: productsTable.warrantyUnit,
    })
    .from(productsTable)
    .where(and(eq(productsTable.merchantId, merchantId), gt(productsTable.warrantyDuration, 0)));
  const productsById = new Map(products.map((p) => [p.id, p]));

  // Customers (for names/contact). Loaded once into a map.
  const customers = await db
    .select({
      id: customersTable.id,
      firstName: customersTable.firstName,
      lastName: customersTable.lastName,
      company: customersTable.company,
      email: customersTable.email,
      phone: customersTable.phone,
    })
    .from(customersTable)
    .where(eq(customersTable.merchantId, merchantId));
  const customersById = new Map(customers.map((c) => [c.id, c]));

  const items: WarrantyItem[] = [];

  // ── Product warranties (from sales) ─────────────────────────────────────────
  // Skip warranty products with no sales entirely, avoiding loading transactions
  // when there's nothing to match.
  if (productsById.size > 0) {
    const txns = await db
      .select({
        id: transactionsTable.id,
        customerId: transactionsTable.customerId,
        receiptNumber: transactionsTable.receiptNumber,
        createdAt: transactionsTable.createdAt,
        items: transactionsTable.items,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.merchantId, merchantId));

    for (const tx of txns) {
      const lineItems = Array.isArray(tx.items) ? (tx.items as TxItem[]) : [];
      lineItems.forEach((it, idx) => {
        if (it.productId == null) return;
        const product = productsById.get(it.productId);
        if (!product) return;
        const expiry = productWarrantyExpiry(tx.createdAt, product.warrantyDuration, product.warrantyUnit);
        if (!expiry || expiry.getTime() < now.getTime()) return;
        const cust = tx.customerId != null ? customersById.get(tx.customerId) ?? null : null;
        const serials = Array.isArray(it.serials)
          ? (it.serials as unknown[]).map((s) => String(s).trim()).filter(Boolean)
          : [];
        items.push({
          type: "product",
          key: `product-${tx.id}-${it.productId}-${idx}`,
          itemName: it.productName || it.name || product.name,
          sku: product.sku,
          serials,
          quantity: it.quantity ?? 1,
          warrantyLabel: productWarrantyLabel(product.warrantyDuration, product.warrantyUnit),
          soldAt: tx.createdAt.toISOString(),
          expiry: expiry.toISOString(),
          daysRemaining: Math.ceil((expiry.getTime() - now.getTime()) / DAY_MS),
          referenceId: tx.id,
          referenceNumber: tx.receiptNumber,
          customer: cust
            ? { id: cust.id, name: customerName(cust) || "Walk-in", email: cust.email, phone: cust.phone }
            : null,
        });
      });
    }
  }

  // ── Service / repair warranties (from completed service jobs) ───────────────
  const jobs = await db
    .select({
      id: serviceJobsTable.id,
      jobNumber: serviceJobsTable.jobNumber,
      title: serviceJobsTable.title,
      deviceType: serviceJobsTable.deviceType,
      deviceDescription: serviceJobsTable.deviceDescription,
      serialNumber: serviceJobsTable.serialNumber,
      customerId: serviceJobsTable.customerId,
      repairWarrantyDays: serviceJobsTable.repairWarrantyDays,
      completedAt: serviceJobsTable.completedAt,
    })
    .from(serviceJobsTable)
    .where(
      and(
        eq(serviceJobsTable.merchantId, merchantId),
        gt(serviceJobsTable.repairWarrantyDays, 0),
        isNotNull(serviceJobsTable.completedAt),
      ),
    );

  for (const job of jobs) {
    if (!job.completedAt) continue;
    const expiry = new Date(new Date(job.completedAt).getTime() + job.repairWarrantyDays * DAY_MS);
    if (expiry.getTime() < now.getTime()) continue;
    const cust = job.customerId != null ? customersById.get(job.customerId) ?? null : null;
    const deviceName = job.deviceDescription || job.deviceType || job.title;
    items.push({
      type: "service",
      key: `service-${job.id}`,
      itemName: `${deviceName} — repair`,
      sku: null,
      serials: job.serialNumber ? [job.serialNumber] : [],
      quantity: 1,
      warrantyLabel: `${job.repairWarrantyDays}-day repair warranty`,
      soldAt: new Date(job.completedAt).toISOString(),
      expiry: expiry.toISOString(),
      daysRemaining: Math.ceil((expiry.getTime() - now.getTime()) / DAY_MS),
      referenceId: job.id,
      referenceNumber: job.jobNumber,
      customer: cust
        ? { id: cust.id, name: customerName(cust) || "Walk-in", email: cust.email, phone: cust.phone }
        : null,
    });
  }

  // Soonest to expire first — stable, deterministic ordering.
  items.sort((a, b) => a.daysRemaining - b.daysRemaining || a.key.localeCompare(b.key));

  res.json({ items });
});

export default router;
