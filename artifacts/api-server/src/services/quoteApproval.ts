import { db, serviceJobsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/** A quote shaped just enough to drive job approval. */
type ApprovableQuote = {
  serviceJobId: number | null;
  depositRequired: string | null;
};

/**
 * When an estimate is approved (customer accepts via the portal, or staff record
 * an in-store go-ahead), reflect it on the linked service job:
 *  - stamp who/when/how it was approved,
 *  - copy the deposit requirement across so the counter can collect it,
 *  - advance the job to "in-progress" if it was waiting on the customer,
 *  - log an audit line in the job notes.
 * No-op when the quote isn't linked to a job. Returns true if a job was updated.
 */
export async function applyEstimateApprovalToJob(
  merchantId: number, quote: ApprovableQuote, via: "portal" | "in-store",
): Promise<boolean> {
  if (quote.serviceJobId == null) return false;

  const [job] = await db.select({ status: serviceJobsTable.status, notes: serviceJobsTable.notes })
    .from(serviceJobsTable)
    .where(and(eq(serviceJobsTable.id, quote.serviceJobId), eq(serviceJobsTable.merchantId, merchantId)))
    .limit(1);
  if (!job) return false;

  const updates: Partial<typeof serviceJobsTable.$inferInsert> = {
    estimateApprovedAt: new Date(),
    estimateApprovedVia: via,
  };
  if (quote.depositRequired != null) updates.depositRequired = quote.depositRequired;
  // Approval is the go-ahead, so release the job from a holding state into work.
  if (job.status === "awaiting-customer" || job.status === "pending") updates.status = "in-progress";

  const channel = via === "portal" ? "customer portal" : "in-store";
  const logEntry = `[${new Date().toISOString()}] Estimate approved (${channel})`;
  updates.notes = job.notes ? `${job.notes}\n${logEntry}` : logEntry;

  await db.update(serviceJobsTable).set(updates)
    .where(and(eq(serviceJobsTable.id, quote.serviceJobId), eq(serviceJobsTable.merchantId, merchantId)));
  return true;
}

/**
 * When an estimate is sent to the customer for sign-off, move the linked job into
 * "awaiting-customer" so the board shows it's blocked on approval. Only promotes
 * from "pending" so an already-progressing job isn't dragged backwards.
 */
export async function markJobAwaitingApproval(merchantId: number, serviceJobId: number | null): Promise<void> {
  if (serviceJobId == null) return;
  await db.update(serviceJobsTable)
    .set({ status: "awaiting-customer" })
    .where(and(
      eq(serviceJobsTable.id, serviceJobId),
      eq(serviceJobsTable.merchantId, merchantId),
      eq(serviceJobsTable.status, "pending"),
    ));
}
