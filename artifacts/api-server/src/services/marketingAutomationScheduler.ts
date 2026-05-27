import {
  db,
  customersTable,
  productsTable,
  serviceJobsTable,
  invoicesTable,
  merchantsTable,
  marketingAutomationRulesTable,
  marketingAutomationLogTable,
} from "@workspace/db";
import { eq, and, gte, lt, lte, isNotNull, desc } from "drizzle-orm";
import { sendEmail } from "./email";
import type { Logger } from "pino";

type Rule = typeof marketingAutomationRulesTable.$inferSelect;

/** Substitute template variables in text */
function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/** Check if this rule+record combo was already dispatched (within window) */
async function alreadySent(
  ruleId: number,
  recordId: string,
  withinMs: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinMs);
  const rows = await db
    .select({ id: marketingAutomationLogTable.id })
    .from(marketingAutomationLogTable)
    .where(
      and(
        eq(marketingAutomationLogTable.ruleId, ruleId),
        eq(marketingAutomationLogTable.recordId, recordId),
        gte(marketingAutomationLogTable.sentAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function logDispatch(opts: {
  merchantId: number;
  ruleId: number;
  customerId: number | null;
  recordType: string;
  recordId: string;
  channel: string;
  status: string;
  error?: string;
}) {
  await db.insert(marketingAutomationLogTable).values({
    merchantId: opts.merchantId,
    ruleId: opts.ruleId,
    customerId: opts.customerId,
    recordType: opts.recordType,
    recordId: opts.recordId,
    channel: opts.channel,
    status: opts.status,
    error: opts.error ?? null,
  });
}

async function getMerchantName(merchantId: number): Promise<string> {
  const [m] = await db
    .select({ name: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));
  return m?.name ?? "Your Business";
}

async function dispatchMessage(
  merchantId: number,
  rule: Rule,
  toEmail: string | null,
  subject: string,
  html: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  if (rule.channel === "sms") {
    return { success: false, error: "SMS gateway not configured. Please set up an SMS provider." };
  }
  if (!toEmail) {
    return { success: false, error: "No email address on file" };
  }
  const result = await sendEmail(merchantId, { to: toEmail, subject, html, text });
  return { success: result.success, error: result.error };
}

// ─── Trigger: Birthday ────────────────────────────────────────────────────────

async function runBirthday(
  merchantId: number,
  rule: Rule,
  bizName: string,
  logger: Logger,
): Promise<number> {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const yearStr = String(today.getFullYear());

  const customers = await db
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.merchantId, merchantId),
        isNotNull(customersTable.dateOfBirth),
        isNotNull(customersTable.email),
      ),
    );

  // Filter in JS because Postgres date functions vary by timezone setting
  const matches = customers.filter((c) => {
    if (!c.dateOfBirth) return false;
    const dob = String(c.dateOfBirth);
    const dobMM = dob.slice(5, 7);
    const dobDD = dob.slice(8, 10);
    return dobMM === mm && dobDD === dd;
  });

  let sent = 0;
  for (const c of matches) {
    const dedupeKey = `${yearStr}-${c.id}`;
    if (await alreadySent(rule.id, dedupeKey, 365 * 24 * 3600 * 1000)) continue;
    const firstName = c.firstName ?? "Valued Customer";
    const vars = { first_name: firstName, last_name: c.lastName ?? "", business_name: bizName };
    const subject = applyVars(rule.templateSubject ?? `Happy Birthday from ${bizName}!`, vars);
    const html = applyVars(rule.templateBody ?? `<p>Happy Birthday, ${firstName}! 🎂 Thank you for being a valued customer.</p>`, vars);
    const text = applyVars(`Happy Birthday, {{first_name}}! Thank you for being a valued customer of {{business_name}}.`, vars);
    const result = await dispatchMessage(merchantId, rule, c.email!, subject, html, text);
    await logDispatch({ merchantId, ruleId: rule.id, customerId: c.id, recordType: "customer", recordId: dedupeKey, channel: rule.channel, status: result.success ? "sent" : "failed", error: result.error });
    if (result.success) sent++;
    logger.info({ ruleId: rule.id, customerId: c.id, trigger: "birthday" }, "Automation: birthday message dispatched");
  }
  return sent;
}

// ─── Trigger: Anniversary ─────────────────────────────────────────────────────

async function runAnniversary(
  merchantId: number,
  rule: Rule,
  bizName: string,
  logger: Logger,
): Promise<number> {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const yearStr = String(today.getFullYear());

  const customers = await db
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.merchantId, merchantId), isNotNull(customersTable.email)));

  const matches = customers.filter((c) => {
    const iso = c.createdAt.toISOString();
    return iso.slice(5, 7) === mm && iso.slice(8, 10) === dd;
  });

  let sent = 0;
  for (const c of matches) {
    const dedupeKey = `anniv-${yearStr}-${c.id}`;
    if (await alreadySent(rule.id, dedupeKey, 365 * 24 * 3600 * 1000)) continue;
    const firstName = c.firstName ?? "Valued Customer";
    const years = today.getFullYear() - c.createdAt.getFullYear();
    const vars = { first_name: firstName, last_name: c.lastName ?? "", business_name: bizName, years: String(years) };
    const subject = applyVars(rule.templateSubject ?? `Happy ${years > 0 ? `${years}-year` : ""} Anniversary, {{first_name}}!`, vars);
    const html = applyVars(rule.templateBody ?? `<p>Hi <strong>{{first_name}}</strong>,</p><p>Happy anniversary! It's been ${years > 0 ? `${years} year${years > 1 ? "s" : ""}` : "a while"} since you joined us. We appreciate your loyalty! 🎉</p>`, vars);
    const text = applyVars(`Hi {{first_name}}, happy anniversary! Thank you for being a part of {{business_name}}.`, vars);
    const result = await dispatchMessage(merchantId, rule, c.email!, subject, html, text);
    await logDispatch({ merchantId, ruleId: rule.id, customerId: c.id, recordType: "customer", recordId: dedupeKey, channel: rule.channel, status: result.success ? "sent" : "failed", error: result.error });
    if (result.success) sent++;
  }
  return sent;
}

// ─── Trigger: New Product Added ───────────────────────────────────────────────

async function runNewProduct(
  merchantId: number,
  rule: Rule,
  bizName: string,
  logger: Logger,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);

  const newProducts = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.merchantId, merchantId), gte(productsTable.createdAt, since)));

  if (newProducts.length === 0) return 0;

  const customers = await db
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.merchantId, merchantId), isNotNull(customersTable.email)));

  let sent = 0;
  for (const product of newProducts) {
    // Broadcast to all opted-in customers
    for (const c of customers) {
      if (c.agreedToMarketing === "false") continue;
      const dedupeKey = `product-${product.id}-customer-${c.id}`;
      if (await alreadySent(rule.id, dedupeKey, 30 * 24 * 3600 * 1000)) continue;
      const firstName = c.firstName ?? "Valued Customer";
      const vars = { first_name: firstName, last_name: c.lastName ?? "", business_name: bizName, product_name: product.name, product_price: `$${parseFloat(product.price).toFixed(2)}` };
      const subject = applyVars(rule.templateSubject ?? `New arrival: {{product_name}}`, vars);
      const html = applyVars(rule.templateBody ?? `<p>Hi <strong>{{first_name}}</strong>,</p><p>We just added <strong>{{product_name}}</strong> to our range at {{business_name}}. Check it out!</p>`, vars);
      const text = applyVars(`Hi {{first_name}}, we just added {{product_name}} at {{business_name}}. Come check it out!`, vars);
      const result = await dispatchMessage(merchantId, rule, c.email!, subject, html, text);
      await logDispatch({ merchantId, ruleId: rule.id, customerId: c.id, recordType: "product", recordId: dedupeKey, channel: rule.channel, status: result.success ? "sent" : "failed", error: result.error });
      if (result.success) sent++;
    }
    logger.info({ ruleId: rule.id, productId: product.id, trigger: "new_product" }, "Automation: new product broadcast");
  }
  return sent;
}

// ─── Trigger: New Service Job ─────────────────────────────────────────────────

async function runNewServiceJob(
  merchantId: number,
  rule: Rule,
  bizName: string,
  logger: Logger,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);

  const jobs = await db
    .select({
      job: serviceJobsTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerId: customersTable.id,
    })
    .from(serviceJobsTable)
    .leftJoin(customersTable, eq(serviceJobsTable.customerId, customersTable.id))
    .where(and(eq(serviceJobsTable.merchantId, merchantId), gte(serviceJobsTable.createdAt, since)));

  let sent = 0;
  for (const row of jobs) {
    const email = row.customerEmail;
    if (!email) continue;
    const dedupeKey = `job-${row.job.id}`;
    if (await alreadySent(rule.id, dedupeKey, 48 * 3600 * 1000)) continue;
    const firstName = row.customerFirstName ?? "Valued Customer";
    const vars = { first_name: firstName, last_name: row.customerLastName ?? "", business_name: bizName, job_number: row.job.jobNumber, device: (row.job as unknown as { deviceType?: string }).deviceType ?? "device", status: row.job.status };
    const subject = applyVars(rule.templateSubject ?? `Your service job {{job_number}} has been received`, vars);
    const html = applyVars(rule.templateBody ?? `<p>Hi <strong>{{first_name}}</strong>,</p><p>Thank you for bringing your <strong>{{device}}</strong> to <strong>{{business_name}}</strong>. Your service job <strong>{{job_number}}</strong> has been received and is now in our queue.</p><p>We'll keep you updated on the progress. Thank you for choosing us!</p>`, vars);
    const text = applyVars(`Hi {{first_name}}, your service job {{job_number}} has been received at {{business_name}}. We'll keep you updated!`, vars);
    const result = await dispatchMessage(merchantId, rule, email, subject, html, text);
    await logDispatch({ merchantId, ruleId: rule.id, customerId: row.customerId ?? null, recordType: "service_job", recordId: dedupeKey, channel: rule.channel, status: result.success ? "sent" : "failed", error: result.error });
    if (result.success) sent++;
  }
  return sent;
}

// ─── Trigger: Invoice Overdue ─────────────────────────────────────────────────

async function runInvoiceOverdue(
  merchantId: number,
  rule: Rule,
  bizName: string,
  logger: Logger,
): Promise<number> {
  const now = new Date();

  const rows = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerId: customersTable.id,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(
      and(
        eq(invoicesTable.merchantId, merchantId),
        isNotNull(invoicesTable.dueDate),
        lte(invoicesTable.dueDate, now),
      ),
    );

  const overdue = rows.filter(
    (r) => r.invoice.status !== "paid" && r.invoice.status !== "void" && r.invoice.status !== "cancelled",
  );

  let sent = 0;
  for (const row of overdue) {
    const email = row.customerEmail;
    if (!email) continue;
    const dedupeKey = `invoice-overdue-${row.invoice.id}`;
    // Re-send at most once per 7 days per invoice
    if (await alreadySent(rule.id, dedupeKey, 7 * 24 * 3600 * 1000)) continue;
    const firstName = row.customerFirstName ?? "Valued Customer";
    const dueStr = row.invoice.dueDate ? new Date(row.invoice.dueDate).toLocaleDateString("en-AU") : "N/A";
    const total = parseFloat(String(row.invoice.total)).toFixed(2);
    const vars = { first_name: firstName, last_name: row.customerLastName ?? "", business_name: bizName, invoice_number: row.invoice.invoiceNumber, due_date: dueStr, total: `$${total}` };
    const subject = applyVars(rule.templateSubject ?? `Reminder: Invoice {{invoice_number}} is overdue`, vars);
    const html = applyVars(rule.templateBody ?? `<p>Hi <strong>{{first_name}}</strong>,</p><p>This is a friendly reminder that Invoice <strong>{{invoice_number}}</strong> for <strong>{{total}}</strong> was due on <strong>{{due_date}}</strong> and remains unpaid.</p><p>Please contact <strong>{{business_name}}</strong> at your earliest convenience to arrange payment. Thank you!</p>`, vars);
    const text = applyVars(`Hi {{first_name}}, Invoice {{invoice_number}} for {{total}} was due {{due_date}} and is still unpaid. Please contact {{business_name}} to arrange payment.`, vars);
    const result = await dispatchMessage(merchantId, rule, email, subject, html, text);
    await logDispatch({ merchantId, ruleId: rule.id, customerId: row.customerId ?? null, recordType: "invoice", recordId: dedupeKey, channel: rule.channel, status: result.success ? "sent" : "failed", error: result.error });
    if (result.success) sent++;
    logger.info({ ruleId: rule.id, invoiceId: row.invoice.id, trigger: "invoice_overdue" }, "Automation: overdue reminder sent");
  }
  return sent;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runAutomationRule(
  merchantId: number,
  rule: Rule,
  logger: Logger,
): Promise<{ dispatched: number; trigger: string; error?: string }> {
  if (!rule.templateBody) {
    return { dispatched: 0, trigger: rule.triggerEvent, error: "No template body configured" };
  }
  const bizName = await getMerchantName(merchantId);
  try {
    let dispatched = 0;
    switch (rule.triggerEvent) {
      case "birthday":         dispatched = await runBirthday(merchantId, rule, bizName, logger); break;
      case "anniversary":      dispatched = await runAnniversary(merchantId, rule, bizName, logger); break;
      case "new_product":      dispatched = await runNewProduct(merchantId, rule, bizName, logger); break;
      case "new_service_job":  dispatched = await runNewServiceJob(merchantId, rule, bizName, logger); break;
      case "invoice_overdue":  dispatched = await runInvoiceOverdue(merchantId, rule, bizName, logger); break;
      default:
        return { dispatched: 0, trigger: rule.triggerEvent, error: `Unknown trigger: ${rule.triggerEvent}` };
    }
    // Update lastRunAt
    await db
      .update(marketingAutomationRulesTable)
      .set({ lastRunAt: new Date() })
      .where(eq(marketingAutomationRulesTable.id, rule.id));
    return { dispatched, trigger: rule.triggerEvent };
  } catch (err) {
    logger.error({ ruleId: rule.id, err }, "Automation rule error");
    return { dispatched: 0, trigger: rule.triggerEvent, error: String(err) };
  }
}

export async function processAllMerchantAutomations(logger: Logger): Promise<void> {
  // Get all active rules across all merchants
  const rules = await db
    .select()
    .from(marketingAutomationRulesTable)
    .where(eq(marketingAutomationRulesTable.isActive, "true"));

  if (rules.length === 0) return;
  logger.info({ count: rules.length }, "Marketing automation: processing active rules");

  for (const rule of rules) {
    await runAutomationRule(rule.merchantId, rule, logger);
  }
}

export function scheduleMarketingAutomation(logger: Logger): void {
  // Run once on startup (in case the server restarted during a scheduled window)
  processAllMerchantAutomations(logger).catch((err) =>
    logger.error({ err }, "Marketing automation startup run error"),
  );
  // Then every 24 hours
  setInterval(
    () =>
      processAllMerchantAutomations(logger).catch((err) =>
        logger.error({ err }, "Marketing automation scheduled run error"),
      ),
    24 * 60 * 60 * 1000,
  );
}
