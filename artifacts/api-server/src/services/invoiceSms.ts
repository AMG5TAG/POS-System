import { db, invoicesTable, customersTable, merchantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendSms } from "./sms";

type InvoiceEvent = { type: string; timestamp: string; detail?: string };

/**
 * Send a short SMS notification for an invoice (the "new invoice", "reminder" or
 * "overdue" framing). Returns a not-applicable result when the customer has no
 * phone on file. Records an "sms" event on success. Shared by auto-send-on-create
 * and the reminder/overdue scheduler so the SMS wording stays consistent.
 */
export async function sendInvoiceSms(
  merchantId: number,
  invoiceId: number,
  kind: "invoice" | "reminder" | "overdue" = "invoice",
  overridePhone?: string,
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerPhone: customersTable.phone,
      businessName: merchantsTable.businessName,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .leftJoin(merchantsTable, eq(invoicesTable.merchantId, merchantsTable.id))
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.merchantId, merchantId)));

  if (!row) return { success: false, error: "Invoice not found" };
  // A manually-entered number (from the Send dialog) wins over the phone on file.
  const phone = (overridePhone?.trim() || row.customerPhone?.trim()) ?? "";
  if (!phone) return { success: false, skipped: true, error: "No customer phone on file" };

  const inv = row.invoice;
  const bizName = row.businessName ?? "KoaPOS";
  const total = `$${parseFloat(inv.total).toFixed(2)}`;
  const dueStr = inv.dueDate
    ? new Date(inv.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "";

  const body =
    kind === "reminder"
      ? `${bizName}: Reminder — invoice ${inv.invoiceNumber} for ${total} is due${dueStr ? ` ${dueStr}` : " soon"}.`
      : kind === "overdue"
        ? `${bizName}: Invoice ${inv.invoiceNumber} for ${total} is overdue${dueStr ? ` (due ${dueStr})` : ""}. Please arrange payment.`
        : `${bizName}: Invoice ${inv.invoiceNumber} for ${total}${dueStr ? `, due ${dueStr}` : ""}. Thank you.`;

  const result = await sendSms({ to: phone, body }, merchantId);

  if (result.success) {
    const [cur] = await db
      .select({ events: invoicesTable.events })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId));
    const events: InvoiceEvent[] = [
      ...(((cur?.events as InvoiceEvent[] | null) ?? [])),
      { type: "sms", timestamp: new Date().toISOString(), detail: phone },
    ];
    await db.update(invoicesTable).set({ events }).where(eq(invoicesTable.id, invoiceId));
  }

  return { success: result.success, error: result.error };
}
