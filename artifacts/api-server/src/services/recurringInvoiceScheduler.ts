import { db, invoicesTable, customersTable, merchantsTable } from "@workspace/db";
import { eq, and, lte, or, isNotNull } from "drizzle-orm";
import { sendEmail } from "./email";
import type { Logger } from "pino";

type InvoiceEvent = { type: string; timestamp: string; detail?: string };
type LineItem = { description: string; quantity: number; unitPrice: number; taxRate: number };

export function advanceByFrequency(date: Date, frequency: string): Date {
  const d = new Date(date);
  switch (frequency) {
    case "daily":  d.setDate(d.getDate() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    default:       d.setMonth(d.getMonth() + 1); break; // monthly
  }
  return d;
}

/** Returns the next scheduled send date >= today given a base start date and frequency. */
export function computeNextSendDate(startDate: Date, frequency: string): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  while (d < today) d = advanceByFrequency(d, frequency);
  return d;
}

function buildInvoiceHtml(
  invoiceNumber: string,
  total: number,
  dueDate: string | null,
  items: LineItem[],
  notes: string | null,
  customerName: string | null,
  merchantName: string,
): string {
  const rows = items
    .map(
      (it) =>
        `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${it.description}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${it.quantity}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">$${it.unitPrice.toFixed(2)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">$${(it.quantity * it.unitPrice).toFixed(2)}</td>
        </tr>`,
    )
    .join("");

  const dueLine = dueDate
    ? `<p style="margin:0 0 8px"><strong>Due date:</strong> ${new Date(dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</p>`
    : "";

  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="margin:0 0 4px">Invoice ${invoiceNumber}</h2>
  <p style="margin:0 0 16px;color:#555">from <strong>${merchantName}</strong></p>
  <p style="margin:0 0 8px">Hi ${customerName ?? "there"},</p>
  <p style="margin:0 0 16px">Please find your recurring invoice below.</p>
  ${dueLine}
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:8px 10px;text-align:left;font-size:13px">Description</th>
        <th style="padding:8px 10px;text-align:center;font-size:13px">Qty</th>
        <th style="padding:8px 10px;text-align:right;font-size:13px">Unit Price</th>
        <th style="padding:8px 10px;text-align:right;font-size:13px">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="padding:8px 10px;text-align:right;font-weight:600">Total</td>
        <td style="padding:8px 10px;text-align:right;font-weight:600">$${total.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
  ${notes ? `<p style="color:#555;font-style:italic">${notes}</p>` : ""}
  <p style="color:#888;font-size:12px;margin-top:24px">This is an automated recurring invoice. Please contact ${merchantName} if you have any questions.</p>
</div>`;
}

export async function processRecurringInvoices(logger: Logger): Promise<void> {
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const due = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      merchantName: merchantsTable.businessName,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .leftJoin(merchantsTable, eq(invoicesTable.merchantId, merchantsTable.id))
    .where(
      and(
        eq(invoicesTable.isRecurring, "true"),
        isNotNull(invoicesTable.recurringStartDate),
        lte(invoicesTable.recurringStartDate, endOfDay),
      ),
    );

  if (due.length > 0) {
    logger.info({ count: due.length }, "Processing recurring invoices");
  }

  for (const row of due) {
    const inv = row.invoice;
    const customerEmail = row.customerEmail ?? null;
    const customerName = [row.customerFirstName, row.customerLastName].filter(Boolean).join(" ") || null;
    const merchantName = row.merchantName ?? "Your Merchant";

    try {
      const total = parseFloat(String(inv.total));
      const items = (inv.items as LineItem[] | null) ?? [];
      const dueDate = inv.dueDate?.toISOString() ?? null;

      let sendResult: { success: boolean; provider: string; error?: string } = { success: false, provider: "none", error: "No customer email on file" };

      if (customerEmail) {
        const html = buildInvoiceHtml(inv.invoiceNumber, total, dueDate, items, inv.notes ?? null, customerName, merchantName);
        sendResult = await sendEmail(inv.merchantId, {
          to: customerEmail,
          subject: `Invoice ${inv.invoiceNumber} from ${merchantName}`,
          html,
          text: `Invoice ${inv.invoiceNumber} — Total: $${total.toFixed(2)}${dueDate ? ` — Due: ${new Date(dueDate).toLocaleDateString("en-AU")}` : ""}`,
        });
      }

      const [eventRow] = await db
        .select({ events: invoicesTable.events })
        .from(invoicesTable)
        .where(eq(invoicesTable.id, inv.id));

      const events: InvoiceEvent[] = [
        ...((eventRow?.events as InvoiceEvent[] | null) ?? []),
        {
          type: "email",
          timestamp: new Date().toISOString(),
          detail: sendResult.success
            ? `Recurring invoice auto-sent to ${customerEmail}`
            : `Auto-send failed: ${sendResult.error ?? "unknown error"}`,
        },
      ];

      // Advance the next scheduled date by one interval
      const nextDate = inv.recurringStartDate
        ? advanceByFrequency(inv.recurringStartDate, inv.recurringFrequency ?? "monthly")
        : null;

      const nextOccurrences =
        inv.recurringOccurrences != null ? inv.recurringOccurrences - 1 : null;
      const stillRecurring = nextOccurrences == null || nextOccurrences > 0;

      await db
        .update(invoicesTable)
        .set({
          events,
          recurringStartDate: nextDate,
          recurringOccurrences: nextOccurrences,
          isRecurring: stillRecurring ? "true" : "false",
          updatedAt: new Date(),
        })
        .where(eq(invoicesTable.id, inv.id));

      logger.info(
        { invoiceId: inv.id, emailSent: sendResult.success, nextDate },
        "Recurring invoice processed",
      );
    } catch (err) {
      logger.error({ invoiceId: inv.id, err }, "Error processing recurring invoice");
    }
  }
}

/**
 * One-time data correction for the Koastal Komputers merchant: reset ALL of
 * their recurring invoices back to unviewed and unpaid (status "sent", clearing
 * viewedAt / paidAt and zeroing amountPaid) so the ledger reflects reality.
 */
// One-time cutoff. Only invoices last modified before this instant are eligible,
// so the reset corrects the existing stale data once and never clobbers any
// payment recorded after this fix was deployed.
const RECURRING_RESET_CUTOFF = new Date("2026-05-30T00:00:00.000Z");

export async function patchFutureRecurringInvoiceStates(logger: Logger): Promise<void> {
  const targetEmail = "admin@koastalkomputers.com.au";

  const [merchant] = await db
    .select({ id: merchantsTable.id })
    .from(merchantsTable)
    .where(eq(merchantsTable.email, targetEmail));
  if (!merchant) return;

  // Reset ALL recurring invoices for this merchant to unviewed + unpaid.
  // The updatedAt <= cutoff guard makes this idempotent: once a row is reset
  // its updatedAt advances past the cutoff and it is never touched again.
  const result = await db
    .update(invoicesTable)
    .set({ status: "sent", viewedAt: null, paidAt: null, amountPaid: "0", updatedAt: new Date() })
    .where(
      and(
        eq(invoicesTable.merchantId, merchant.id),
        eq(invoicesTable.isRecurring, "true"),
        lte(invoicesTable.updatedAt, RECURRING_RESET_CUTOFF),
        or(
          eq(invoicesTable.status, "paid"),
          eq(invoicesTable.status, "partial"),
          isNotNull(invoicesTable.viewedAt),
          isNotNull(invoicesTable.paidAt),
        ),
      ),
    )
    .returning({ id: invoicesTable.id });

  if (result.length > 0) {
    logger.info({ merchantId: merchant.id, count: result.length }, "Reset recurring invoices to unviewed and unpaid");
  }
}

export function scheduleRecurringInvoices(logger: Logger): void {
  patchFutureRecurringInvoiceStates(logger).catch((err) =>
    logger.error({ err }, "Failed to reset recurring invoice states"),
  );
  processRecurringInvoices(logger).catch((err) =>
    logger.error({ err }, "Recurring invoice scheduler startup error"),
  );
  setInterval(
    () =>
      processRecurringInvoices(logger).catch((err) =>
        logger.error({ err }, "Recurring invoice scheduler error"),
      ),
    60 * 60 * 1000, // every hour
  );
}
