import { db, invoicesTable, customersTable, invoiceSettingsTable } from "@workspace/db";
import { eq, and, isNotNull, isNull, inArray } from "drizzle-orm";
import { trackedInterval } from "../lib/shutdown";
import type { Logger } from "pino";
import { getInvoiceSettings } from "../routes/invoice-settings";
import { sendInvoiceEmailInternal } from "../routes/invoices";
import { sendInvoiceSms } from "./invoiceSms";

type InvoiceEvent = { type: string; timestamp: string; detail?: string };
type LineItem = { description: string; quantity: number; unitPrice: number; taxRate: number };

/** Whole-day difference (b − a), ignoring time-of-day. */
function dayDiff(a: Date, b: Date): number {
  const x = new Date(a); x.setHours(0, 0, 0, 0);
  const y = new Date(b); y.setHours(0, 0, 0, 0);
  return Math.round((y.getTime() - x.getTime()) / 86_400_000);
}

function lastEventAt(events: InvoiceEvent[], type: string): Date | null {
  let latest: Date | null = null;
  for (const e of events) {
    if (e.type !== type) continue;
    const t = new Date(e.timestamp);
    if (!Number.isNaN(t.getTime()) && (!latest || t > latest)) latest = t;
  }
  return latest;
}

async function appendEvent(invoiceId: number, event: InvoiceEvent): Promise<void> {
  const [cur] = await db
    .select({ events: invoicesTable.events })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, invoiceId));
  const events: InvoiceEvent[] = [...(((cur?.events as InvoiceEvent[] | null) ?? [])), event];
  await db.update(invoicesTable).set({ events }).where(eq(invoicesTable.id, invoiceId));
}

type Settings = Awaited<ReturnType<typeof getInvoiceSettings>>;

/** Dispatch one notice (reminder or overdue) across the merchant's configured
 *  channels, then record a single canonical marker event for dedup. */
async function dispatchNotice(
  merchantId: number,
  invoiceId: number,
  kind: "reminder" | "overdue",
  customerEmail: string | null,
  method: Settings["defaultSendMethod"],
  logger: Logger,
): Promise<void> {
  let emailOk = false;
  let smsOk = false;

  if ((method === "email" || method === "both") && customerEmail) {
    const r = await sendInvoiceEmailInternal(merchantId, invoiceId, { to: customerEmail, kind });
    emailOk = r.success;
    if (!r.success) logger.warn({ invoiceId, kind, error: r.error }, "Invoice notice email failed");
  }
  if (method === "sms" || method === "both") {
    const r = await sendInvoiceSms(merchantId, invoiceId, kind);
    smsOk = r.success;
    if (!r.success && !r.skipped) logger.warn({ invoiceId, kind, error: r.error }, "Invoice notice SMS failed");
  }

  // sendInvoiceEmailInternal already appends a `${kind}` marker on email success.
  // For sms-only / email-failed cases, append the marker ourselves so dedup holds.
  if (!emailOk && smsOk) {
    await appendEvent(invoiceId, { type: kind, timestamp: new Date().toISOString(), detail: "sms" });
  }
}

/** Apply a one-time late fee line to an overdue invoice (guarded by a `late_fee`
 *  event so it is never applied twice). */
async function applyLateFee(invoice: typeof invoicesTable.$inferSelect, percent: number, logger: Logger): Promise<void> {
  const events = (invoice.events as InvoiceEvent[] | null) ?? [];
  if (events.some((e) => e.type === "late_fee")) return;

  const total = parseFloat(invoice.total);
  const fee = Math.round(total * (percent / 100) * 100) / 100;
  if (fee <= 0) return;

  const items = ((invoice.items as LineItem[] | null) ?? []).slice();
  items.push({ description: `Late fee (${percent}% overdue)`, quantity: 1, unitPrice: fee, taxRate: 0 });

  const newSubtotal = parseFloat(invoice.subtotal) + fee;
  const newTotal = total + fee;

  await db
    .update(invoicesTable)
    .set({
      items,
      subtotal: String(newSubtotal.toFixed(2)),
      total: String(newTotal.toFixed(2)),
      events: [...events, { type: "late_fee", timestamp: new Date().toISOString(), detail: `+$${fee.toFixed(2)}` }],
      updatedAt: new Date(),
    })
    .where(eq(invoicesTable.id, invoice.id));

  logger.info({ invoiceId: invoice.id, fee }, "Applied late fee to overdue invoice");
}

/** Apply a one-time percentage surcharge to an overdue invoice once it has had at
 *  least `afterReminders` overdue notices sent. Distinct from (and stackable on
 *  top of) the immediate late fee — guarded by a `surcharge` event so it is only
 *  ever applied once. Re-reads the row so it never clobbers a late fee applied in
 *  the same run. */
async function applySurcharge(invoiceId: number, percent: number, afterReminders: number, logger: Logger): Promise<void> {
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!invoice) return;

  const events = (invoice.events as InvoiceEvent[] | null) ?? [];
  if (events.some((e) => e.type === "surcharge")) return;

  // Only apply once enough overdue reminders have actually been sent.
  const overdueNotices = events.filter((e) => e.type === "overdue").length;
  if (overdueNotices < afterReminders) return;

  const total = parseFloat(invoice.total);
  const fee = Math.round(total * (percent / 100) * 100) / 100;
  if (fee <= 0) return;

  const items = ((invoice.items as LineItem[] | null) ?? []).slice();
  items.push({ description: `Overdue surcharge (${percent}%)`, quantity: 1, unitPrice: fee, taxRate: 0 });

  const newSubtotal = parseFloat(invoice.subtotal) + fee;
  const newTotal = total + fee;

  await db
    .update(invoicesTable)
    .set({
      items,
      subtotal: String(newSubtotal.toFixed(2)),
      total: String(newTotal.toFixed(2)),
      events: [...events, { type: "surcharge", timestamp: new Date().toISOString(), detail: `+$${fee.toFixed(2)} after ${overdueNotices} overdue notices` }],
      updatedAt: new Date(),
    })
    .where(eq(invoicesTable.id, invoice.id));

  logger.info({ invoiceId: invoice.id, fee, overdueNotices }, "Applied overdue surcharge to invoice");
}

type OverdueCustomer = { email: string | null; invoices: Array<{ id: number; events: InvoiceEvent[] }> };

/** Escalate to debt collection: when a single customer has accumulated at least
 *  `debtCollectionThreshold` overdue invoices, email them one escalation notice
 *  covering their account. Deduped by the `overdueRepeatDays` cadence via
 *  `debt_collection` marker events (0 = send once only). */
async function processDebtCollection(
  merchantId: number,
  settings: Settings,
  overdueByCustomer: Map<number, OverdueCustomer>,
  logger: Logger,
): Promise<void> {
  const today = new Date();
  for (const [customerId, entry] of overdueByCustomer) {
    if (entry.invoices.length < settings.debtCollectionThreshold) continue;
    if (!entry.email) continue; // no email on file — cannot escalate

    // Cadence dedup: newest debt_collection marker across the customer's overdue invoices.
    let lastDebtAt: Date | null = null;
    for (const inv of entry.invoices) {
      const t = lastEventAt(inv.events, "debt_collection");
      if (t && (!lastDebtAt || t > lastDebtAt)) lastDebtAt = t;
    }
    const due = !lastDebtAt || (settings.overdueRepeatDays > 0 && dayDiff(lastDebtAt, today) >= settings.overdueRepeatDays);
    if (!due) continue;

    // Send against the customer's oldest overdue invoice; the notice frames the
    // whole overdue account. sendInvoiceEmailInternal records the dedup marker on success.
    const target = entry.invoices[0];
    const r = await sendInvoiceEmailInternal(merchantId, target.id, { to: entry.email, kind: "debt_collection" });
    if (r.success) {
      logger.info({ merchantId, customerId, overdueCount: entry.invoices.length }, "Sent debt-collection escalation notice");
    } else {
      logger.warn({ merchantId, customerId, error: r.error }, "Debt-collection email failed");
    }
  }
}

async function processMerchant(merchantId: number, settings: Settings, logger: Logger): Promise<void> {
  const today = new Date();

  // Unpaid, sendable invoices with a due date. Drafts, paid, cancelled and void
  // are excluded — there is nothing to chase.
  const rows = await db
    .select({
      invoice: invoicesTable,
      customerEmail: customersTable.email,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(
      and(
        eq(invoicesTable.merchantId, merchantId),
        isNotNull(invoicesTable.dueDate),
        // Exclude recurring TEMPLATE rows. A template carries the series' original
        // invoice number and original due date and only exists to spawn child
        // instances — it must never be chased as an overdue invoice itself, or the
        // reminder would show the original number instead of the child's. Its
        // generated children (recurringFrequency IS NULL) and normal one-off
        // invoices are still included.
        isNull(invoicesTable.recurringFrequency),
        inArray(invoicesTable.status, ["sent", "partial", "overdue"]),
      ),
    );

  // Overdue invoices grouped by customer, for debt-collection escalation below.
  const overdueByCustomer = new Map<number, OverdueCustomer>();

  for (const row of rows) {
    const inv = row.invoice;
    if (!inv.dueDate) continue;
    const events = (inv.events as InvoiceEvent[] | null) ?? [];
    const daysUntilDue = dayDiff(today, inv.dueDate);
    const daysOverdue = -daysUntilDue;

    try {
      // ── Pre-due payment reminder (once, when inside the lead-up window) ──
      if (
        settings.reminderEnabled &&
        daysUntilDue >= 0 &&
        daysUntilDue <= settings.reminderDaysBefore &&
        !lastEventAt(events, "reminder")
      ) {
        await dispatchNotice(merchantId, inv.id, "reminder", row.customerEmail ?? null, settings.defaultSendMethod, logger);
      }

      // ── Overdue handling ──
      if (daysOverdue >= 1) {
        // Reflect reality in the stored status once the merchant uses overdue handling.
        if (settings.overdueEnabled && inv.status !== "overdue") {
          await db.update(invoicesTable).set({ status: "overdue" }).where(eq(invoicesTable.id, inv.id));
        }

        // One-time late fee.
        if (settings.lateFeeEnabled && settings.lateFeePercent > 0) {
          await applyLateFee(inv, settings.lateFeePercent, logger);
        }

        // Overdue notice — first at `overdueDaysAfter`, then every `overdueRepeatDays`.
        if (settings.overdueEnabled && daysOverdue >= settings.overdueDaysAfter) {
          const last = lastEventAt(events, "overdue");
          const due =
            !last ||
            (settings.overdueRepeatDays > 0 && dayDiff(last, today) >= settings.overdueRepeatDays);
          if (due) {
            await dispatchNotice(merchantId, inv.id, "overdue", row.customerEmail ?? null, settings.defaultSendMethod, logger);
          }
        }

        // Additional one-time surcharge once enough overdue reminders have been sent.
        if (settings.surchargeEnabled && settings.surchargePercent > 0) {
          await applySurcharge(inv.id, settings.surchargePercent, settings.surchargeAfterReminders, logger);
        }

        // Track this overdue invoice against its customer for debt-collection escalation.
        if (inv.customerId != null) {
          const entry = overdueByCustomer.get(inv.customerId) ?? { email: row.customerEmail ?? null, invoices: [] };
          if (!entry.email && row.customerEmail) entry.email = row.customerEmail;
          entry.invoices.push({ id: inv.id, events });
          overdueByCustomer.set(inv.customerId, entry);
        }
      }
    } catch (err) {
      logger.error({ invoiceId: inv.id, err }, "Error processing invoice notification");
    }
  }

  // ── Debt-collection escalation (per customer, once over the threshold) ──
  if (settings.debtCollectionEnabled) {
    await processDebtCollection(merchantId, settings, overdueByCustomer, logger);
  }
}

export async function processInvoiceNotifications(logger: Logger): Promise<void> {
  const merchants = await db.select({ merchantId: invoiceSettingsTable.merchantId }).from(invoiceSettingsTable);
  for (const { merchantId } of merchants) {
    try {
      const settings = await getInvoiceSettings(merchantId);
      if (
        !settings.reminderEnabled && !settings.overdueEnabled && !settings.lateFeeEnabled &&
        !settings.surchargeEnabled && !settings.debtCollectionEnabled
      ) continue;
      await processMerchant(merchantId, settings, logger);
    } catch (err) {
      logger.error({ merchantId, err }, "Error processing merchant invoice notifications");
    }
  }
}

export function scheduleInvoiceReminders(logger: Logger): void {
  processInvoiceNotifications(logger).catch((err) =>
    logger.error({ err }, "Invoice reminder scheduler startup error"),
  );
  trackedInterval(
    () =>
      processInvoiceNotifications(logger).catch((err) =>
        logger.error({ err }, "Invoice reminder scheduler error"),
      ),
    12 * 60 * 60 * 1000, // every 12 hours; per-invoice dedup prevents duplicate notices
  );
}
