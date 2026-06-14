import { Router, type IRouter } from "express";
import { db, serviceJobsTable, productSerialsTable, productsTable, customersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { customerDisplayName } from "../lib/customer-name";

const router: IRouter = Router();

// GET /device-history?serial=XXX — every repair and sale tied to a serial/IMEI.
router.get("/device-history", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const serial = String(req.query.serial ?? "").trim();
  if (!serial) { res.status(400).json({ error: "serial query param is required" }); return; }

  const [jobs, serials, customers] = await Promise.all([
    db.select().from(serviceJobsTable)
      .where(and(
        eq(serviceJobsTable.merchantId, merchantId),
        sql`lower(${serviceJobsTable.serialNumber}) = lower(${serial})`,
      ))
      .orderBy(desc(serviceJobsTable.createdAt)),
    db.select({
      id: productSerialsTable.id,
      productId: productSerialsTable.productId,
      productName: productsTable.name,
      status: productSerialsTable.status,
      transactionId: productSerialsTable.transactionId,
      soldAt: productSerialsTable.soldAt,
      createdAt: productSerialsTable.createdAt,
    }).from(productSerialsTable)
      .leftJoin(productsTable, eq(productsTable.id, productSerialsTable.productId))
      .where(and(
        eq(productSerialsTable.merchantId, merchantId),
        sql`lower(${productSerialsTable.serial}) = lower(${serial})`,
      ))
      .orderBy(desc(productSerialsTable.createdAt)),
    db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId)),
  ]);

  const custName = new Map<number, string | null>(
    customers.map((c) => [c.id, customerDisplayName(c.firstName, c.lastName, c.company)]),
  );

  res.json({
    serial,
    serviceJobs: jobs.map((j) => ({
      id: j.id,
      jobNumber: j.jobNumber,
      status: j.status,
      deviceType: j.deviceType ?? null,
      deviceDescription: j.deviceDescription ?? null,
      condition: j.condition ?? null,
      bookInDate: j.bookInDate,
      customerName: j.customerId ? (custName.get(j.customerId) ?? null) : null,
      createdAt: j.createdAt.toISOString(),
    })),
    sales: serials.map((s) => ({
      id: s.id,
      productId: s.productId,
      productName: s.productName ?? null,
      status: s.status,
      transactionId: s.transactionId ?? null,
      soldAt: s.soldAt ? s.soldAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

export default router;
