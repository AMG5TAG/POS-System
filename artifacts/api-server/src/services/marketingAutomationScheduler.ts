import {
  db,
  customersTable,
  productsTable,
  serviceJobsTable,
  invoicesTable,
  transactionsTable,
  merchantsTable,
  businessProfileTable,
  marketingAutomationRulesTable,
  marketingAutomationLogTable,
} from "@workspace/db";
import { eq, and, gte, lt, lte, isNotNull, desc } from "drizzle-orm";
import { createHmac } from "crypto";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import type { Logger } from "pino";

type Rule = typeof marketingAutomationRulesTable.$inferSelect;

/** Substitute template variables in text */
function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/** Generate a signed unsubscribe token for a customer (no DB table needed). */
function makeUnsubscribeToken(merchantId: number, customerId: number): string {
  const secret = process.env.UNSUBSCRIBE_SECRET ?? process.env.SESSION_SECRET ?? "koapos-unsub-secret";
  const payload = `${merchantId}:${customerId}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

/** Build an absolute unsubscribe URL for inclusion in marketing emails. */
function unsubscribeUrl(merchantId: number, customerId: number): string {
  const base = process.env.APP_BASE_URL ?? "https://app.koastal.com.au";
  return `${base}/api/unsubscribe?t=${makeUnsubscribeToken(merchantId, customerId)}`;
}

/** Build a legal email footer with business identity + unsubscribe link. */
function legalEmailFooter(bizName: string, bizAddress: string, unsub: string): string {
  return `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;line-height:1.6;">
  <p>${bizName}${bizAddress ? ` · ${bizAddress}` : ""}</p>
  <p>You are receiving this email because you are a customer of ${bizName}.</p>
  <p><a href="${unsub}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> from marketing emails.</p>
</div>`;
}

/** Plain-text opt-out footer for emails. */
function legalEmailFooterText(bizName: string, bizAddress: string, unsub: string): string {
  return `\n\n---\n${bizName}${bizAddress ? ` · ${bizAddress}` : ""}\nTo unsubscribe: ${unsub}`;
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

interface BizInfo { name: string; address: string }

async function getBizInfo(merchantId: number): Promise<BizInfo> {
  const [[m], [bp]] = await Promise.all([
    db.select({ name: merchantsTable.businessName, address: merchantsTable.address, city: merchantsTable.city })
      .from(merchantsTable).where(eq(merchantsTable.id, merchantId)),
    db.select({ state: businessProfileTable.state, postcode: businessProfileTable.postcode })
      .from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId)),
  ]);
  const name = m?.name ?? "Your Business";
  const address = [m?.address, m?.city, bp?.state, bp?.postcode].filter(Boolean).join(", ");
  return { name, address };
}

async function dispatchMessage(
  merchantId: number,
  rule: Rule,
  toEmail: string | null,
  subject: string,
  html: string,
  text: string,
  biz: BizInfo,
  customerId: number | null,
  isMarketing: boolean,
  toPhone?: string | null,
): Promise<{ success: boolean; error?: string }> {
  if (rule.channel === "sms") {
    if (!toPhone) return { success: false, error: "No phone number on file" };
    // Spam Act 2003 / ACMA: marketing SMS must include opt-out instruction
    const body = isMarketing ? `${text}\nReply STOP to unsubscribe.` : text;
    const result = await sendSms({ to: toPhone, body }, merchantId);
    return { success: result.success, error: result.error };
  }
  if (!toEmail) {
    return { success: false, error: "No email address on file" };
  }
  // Spam Act 2003: marketing emails must include sender identity + unsubscribe link
  let finalHtml = html;
  let finalText = text;
  if (isMarketing && customerId != null) {
    const unsub = unsubscribeUrl(merchantId, customerId);
    finalHtml = html + legalEmailFooter(biz.name, biz.address, unsub);
    finalText = text + legalEmailFooterText(biz.name, biz.address, unsub);
  } else if (isMarketing) {
    // No customer ID — still append business identity
    finalHtml = html + legalEmailFooter(biz.name, biz.address, "#");
    finalText = text + legalEmailFooterText(biz.name, biz.address, "");
  }
  const result = await sendEmail(merchantId, { to: toEmail, subject, html: finalHtml, text: finalText });
  return { success: result.success, error: result.error };
}

// ─── Trigger: Birthday ────────────────────────────────────────────────────────

async function runBirthday(
  merchantId: number,
  rule: Rule,
  biz: BizInfo,
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
    // Spam Act 2003 s 16: only send to customers who have explicitly opted in
    if (c.agreedToMarketing !== "true") continue;
    const dedupeKey = `${yearStr}-${c.id}`;
    if (await alreadySent(rule.id, dedupeKey, 365 * 24 * 3600 * 1000)) continue;
    const firstName = c.firstName ?? "Valued Customer";
    const vars = { first_name: firstName, last_name: c.lastName ?? "", business_name: biz.name };
    const subject = applyVars(rule.templateSubject ?? `Happy Birthday from ${biz.name}!`, vars);
    const html = applyVars(rule.templateBody ?? `<p>Happy Birthday, ${firstName}! 🎂 Thank you for being a valued customer.</p>`, vars);
    const text = applyVars(`Happy Birthday, {{first_name}}! Thank you for being a valued customer of {{business_name}}.`, vars);
    const result = await dispatchMessage(merchantId, rule, c.email ?? null, subject, html, text, biz, c.id, true, c.phone ?? null);
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
  biz: BizInfo,
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
    // Spam Act 2003 s 16: only send to customers who have explicitly opted in
    if (c.agreedToMarketing !== "true") continue;
    const dedupeKey = `anniv-${yearStr}-${c.id}`;
    if (await alreadySent(rule.id, dedupeKey, 365 * 24 * 3600 * 1000)) continue;
    const firstName = c.firstName ?? "Valued Customer";
    const years = today.getFullYear() - c.createdAt.getFullYear();
    const vars = { first_name: firstName, last_name: c.lastName ?? "", business_name: biz.name, years: String(years) };
    const subject = applyVars(rule.templateSubject ?? `Happy ${years > 0 ? `${years}-year` : ""} Anniversary, {{first_name}}!`, vars);
    const html = applyVars(rule.templateBody ?? `<p>Hi <strong>{{first_name}}</strong>,</p><p>Happy anniversary! It's been ${years > 0 ? `${years} year${years > 1 ? "s" : ""}` : "a while"} since you joined us. We appreciate your loyalty! 🎉</p>`, vars);
    const text = applyVars(`Hi {{first_name}}, happy anniversary! Thank you for being a part of {{business_name}}.`, vars);
    const result = await dispatchMessage(merchantId, rule, c.email ?? null, subject, html, text, biz, c.id, true, c.phone ?? null);
    await logDispatch({ merchantId, ruleId: rule.id, customerId: c.id, recordType: "customer", recordId: dedupeKey, channel: rule.channel, status: result.success ? "sent" : "failed", error: result.error });
    if (result.success) sent++;
  }
  return sent;
}

// ─── Trigger: New Product Added ───────────────────────────────────────────────

async function runNewProduct(
  merchantId: number,
  rule: Rule,
  biz: BizInfo,
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
    // Broadcast to all opted-in customers — require explicit opt-in (Spam Act 2003 s 16)
    for (const c of customers) {
      if (c.agreedToMarketing !== "true") continue;
      const dedupeKey = `product-${product.id}-customer-${c.id}`;
      if (await alreadySent(rule.id, dedupeKey, 30 * 24 * 3600 * 1000)) continue;
      const firstName = c.firstName ?? "Valued Customer";
      const vars = { first_name: firstName, last_name: c.lastName ?? "", business_name: biz.name, product_name: product.name, product_price: `$${parseFloat(product.price).toFixed(2)}` };
      const subject = applyVars(rule.templateSubject ?? `New arrival: {{product_name}}`, vars);
      const html = applyVars(rule.templateBody ?? `<p>Hi <strong>{{first_name}}</strong>,</p><p>We just added <strong>{{product_name}}</strong> to our range at {{business_name}}. Check it out!</p>`, vars);
      const text = applyVars(`Hi {{first_name}}, we just added {{product_name}} at {{business_name}}. Come check it out!`, vars);
      const result = await dispatchMessage(merchantId, rule, c.email ?? null, subject, html, text, biz, c.id, true, c.phone ?? null);
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
  biz: BizInfo,
  logger: Logger,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);

  const jobs = await db
    .select({
      job: serviceJobsTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerId: customersTable.id,
    })
    .from(serviceJobsTable)
    .leftJoin(customersTable, eq(serviceJobsTable.customerId, customersTable.id))
    .where(and(eq(serviceJobsTable.merchantId, merchantId), gte(serviceJobsTable.createdAt, since)));

  let sent = 0;
  for (const row of jobs) {
    const email = row.customerEmail;
    const phone = row.customerPhone ?? null;
    if (!email && !phone) continue;
    const dedupeKey = `job-${row.job.id}`;
    if (await alreadySent(rule.id, dedupeKey, 48 * 3600 * 1000)) continue;
    const firstName = row.customerFirstName ?? "Valued Customer";
    const vars = { first_name: firstName, last_name: row.customerLastName ?? "", business_name: biz.name, job_number: row.job.jobNumber, device: (row.job as unknown as { deviceType?: string }).deviceType ?? "device", status: row.job.status };
    const subject = applyVars(rule.templateSubject ?? `Your service job {{job_number}} has been received`, vars);
    const html = applyVars(rule.templateBody ?? `<p>Hi <strong>{{first_name}}</strong>,</p><p>Thank you for bringing your <strong>{{device}}</strong> to <strong>{{business_name}}</strong>. Your service job <strong>{{job_number}}</strong> has been received and is now in our queue.</p><p>We'll keep you updated on the progress. Thank you for choosing us!</p>`, vars);
    const text = applyVars(`Hi {{first_name}}, your service job {{job_number}} has been received at {{business_name}}. We'll keep you updated!`, vars);
    // New service job is transactional (not marketing) — no opt-in check, no marketing footer
    const result = await dispatchMessage(merchantId, rule, email ?? null, subject, html, text, biz, row.customerId ?? null, false, phone);
    await logDispatch({ merchantId, ruleId: rule.id, customerId: row.customerId ?? null, recordType: "service_job", recordId: dedupeKey, channel: rule.channel, status: result.success ? "sent" : "failed", error: result.error });
    if (result.success) sent++;
  }
  return sent;
}

// ─── Trigger: Invoice Overdue ─────────────────────────────────────────────────

async function runInvoiceOverdue(
  merchantId: number,
  rule: Rule,
  biz: BizInfo,
  logger: Logger,
): Promise<number> {
  const now = new Date();

  const rows = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
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
    const phone = row.customerPhone ?? null;
    if (!email && !phone) continue;
    const dedupeKey = `invoice-overdue-${row.invoice.id}`;
    // Re-send at most once per 7 days per invoice
    if (await alreadySent(rule.id, dedupeKey, 7 * 24 * 3600 * 1000)) continue;
    const firstName = row.customerFirstName ?? "Valued Customer";
    const dueStr = row.invoice.dueDate ? new Date(row.invoice.dueDate).toLocaleDateString("en-AU") : "N/A";
    const total = parseFloat(String(row.invoice.total)).toFixed(2);
    const vars = { first_name: firstName, last_name: row.customerLastName ?? "", business_name: biz.name, invoice_number: row.invoice.invoiceNumber, due_date: dueStr, total: `$${total}` };
    const subject = applyVars(rule.templateSubject ?? `Reminder: Invoice {{invoice_number}} is overdue`, vars);
    const html = applyVars(rule.templateBody ?? `<p>Hi <strong>{{first_name}}</strong>,</p><p>This is a friendly reminder that Invoice <strong>{{invoice_number}}</strong> for <strong>{{total}}</strong> was due on <strong>{{due_date}}</strong> and remains unpaid.</p><p>Please contact <strong>{{business_name}}</strong> at your earliest convenience to arrange payment. Thank you!</p>`, vars);
    const text = applyVars(`Hi {{first_name}}, Invoice {{invoice_number}} for {{total}} was due {{due_date}} and is still unpaid. Please contact {{business_name}} to arrange payment.`, vars);
    // Invoice reminders are transactional — no opt-in check, no marketing footer
    const result = await dispatchMessage(merchantId, rule, email ?? null, subject, html, text, biz, row.customerId ?? null, false, phone);
    await logDispatch({ merchantId, ruleId: rule.id, customerId: row.customerId ?? null, recordType: "invoice", recordId: dedupeKey, channel: rule.channel, status: result.success ? "sent" : "failed", error: result.error });
    if (result.success) sent++;
    logger.info({ ruleId: rule.id, invoiceId: row.invoice.id, trigger: "invoice_overdue" }, "Automation: overdue reminder sent");
  }
  return sent;
}

// ─── Trigger: X days after sale ───────────────────────────────────────────────

/** Plain-text version of a template body for SMS / email text part. */
function bodyToText(html: string | null, fallback: string): string {
  if (!html) return fallback;
  const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return stripped || fallback;
}

async function runDaysAfterSale(
  merchantId: number,
  rule: Rule,
  biz: BizInfo,
  logger: Logger,
): Promise<number> {
  const delayDays = rule.delayDays ?? 0;
  if (delayDays <= 0) return 0;
  const dayMs = 24 * 3600 * 1000;
  // The sale must be at least `delayDays` old. Look back a couple of weeks beyond
  // that so a missed daily run still catches up; per-sale dedup prevents resends.
  const target = new Date(Date.now() - delayDays * dayMs);
  const windowStart = new Date(Date.now() - (delayDays + 14) * dayMs);

  const rows = await db
    .select({
      txId: transactionsTable.id,
      firstName: customersTable.firstName,
      lastName: customersTable.lastName,
      email: customersTable.email,
      phone: customersTable.phone,
      agreedToMarketing: customersTable.agreedToMarketing,
      customerId: customersTable.id,
    })
    .from(transactionsTable)
    .innerJoin(customersTable, eq(transactionsTable.customerId, customersTable.id))
    .where(
      and(
        eq(transactionsTable.merchantId, merchantId),
        gte(transactionsTable.createdAt, windowStart),
        lte(transactionsTable.createdAt, target),
      ),
    );

  let sent = 0;
  for (const row of rows) {
    // Marketing message → require explicit opt-in (Spam Act 2003 s 16)
    if (row.agreedToMarketing !== "true") continue;
    if (!row.email && !row.phone) continue;
    const dedupeKey = `sale-${row.txId}`;
    if (await alreadySent(rule.id, dedupeKey, 120 * dayMs)) continue;
    const firstName = row.firstName ?? "Valued Customer";
    const vars = { first_name: firstName, last_name: row.lastName ?? "", business_name: biz.name, days: String(delayDays) };
    const subject = applyVars(rule.templateSubject ?? `Thanks for shopping with ${biz.name}`, vars);
    const html = applyVars(rule.templateBody ?? `<p>Hi <strong>{{first_name}}</strong>,</p><p>Thanks for your recent purchase at {{business_name}}. We hope you're enjoying it!</p>`, vars);
    const text = applyVars(bodyToText(rule.templateBody, `Hi {{first_name}}, thanks for your recent purchase at {{business_name}}!`), vars);
    const result = await dispatchMessage(merchantId, rule, row.email ?? null, subject, html, text, biz, row.customerId, true, row.phone ?? null);
    await logDispatch({ merchantId, ruleId: rule.id, customerId: row.customerId, recordType: "transaction", recordId: dedupeKey, channel: rule.channel, status: result.success ? "sent" : "failed", error: result.error });
    if (result.success) sent++;
  }
  if (sent > 0) logger.info({ ruleId: rule.id, delayDays, sent, trigger: "days_after_sale" }, "Automation: days-after-sale dispatched");
  return sent;
}

// ─── Trigger: After a set time (one-off scheduled broadcast) ───────────────────

async function runScheduledTime(
  merchantId: number,
  rule: Rule,
  biz: BizInfo,
  logger: Logger,
): Promise<number> {
  if (!rule.scheduledAt) return 0;
  // Not yet time — wait for a run on/after the configured moment.
  if (Date.now() < new Date(rule.scheduledAt).getTime()) return 0;

  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.merchantId, merchantId));

  let sent = 0;
  for (const c of customers) {
    // Broadcast marketing message → require explicit opt-in (Spam Act 2003 s 16)
    if (c.agreedToMarketing !== "true") continue;
    if (!c.email && !c.phone) continue;
    // One send per customer, ever, for this scheduled rule.
    const dedupeKey = `sched-${rule.id}-${c.id}`;
    if (await alreadySent(rule.id, dedupeKey, 3650 * 24 * 3600 * 1000)) continue;
    const firstName = c.firstName ?? "Valued Customer";
    const vars = { first_name: firstName, last_name: c.lastName ?? "", business_name: biz.name };
    const subject = applyVars(rule.templateSubject ?? `A message from ${biz.name}`, vars);
    const html = applyVars(rule.templateBody ?? `<p>Hi <strong>{{first_name}}</strong>,</p>`, vars);
    const text = applyVars(bodyToText(rule.templateBody, `Hi {{first_name}}, a message from {{business_name}}.`), vars);
    const result = await dispatchMessage(merchantId, rule, c.email ?? null, subject, html, text, biz, c.id, true, c.phone ?? null);
    await logDispatch({ merchantId, ruleId: rule.id, customerId: c.id, recordType: "scheduled", recordId: dedupeKey, channel: rule.channel, status: result.success ? "sent" : "failed", error: result.error });
    if (result.success) sent++;
  }
  if (sent > 0) logger.info({ ruleId: rule.id, sent, trigger: "scheduled_time" }, "Automation: scheduled broadcast dispatched");
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
  const biz = await getBizInfo(merchantId);
  try {
    let dispatched = 0;
    switch (rule.triggerEvent) {
      case "birthday":         dispatched = await runBirthday(merchantId, rule, biz, logger); break;
      case "anniversary":      dispatched = await runAnniversary(merchantId, rule, biz, logger); break;
      case "new_product":      dispatched = await runNewProduct(merchantId, rule, biz, logger); break;
      case "new_service_job":  dispatched = await runNewServiceJob(merchantId, rule, biz, logger); break;
      case "invoice_overdue":  dispatched = await runInvoiceOverdue(merchantId, rule, biz, logger); break;
      case "days_after_sale":  dispatched = await runDaysAfterSale(merchantId, rule, biz, logger); break;
      case "scheduled_time":   dispatched = await runScheduledTime(merchantId, rule, biz, logger); break;
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
  // Then hourly — frequent enough that "after a set time" sends land within the
  // hour, while per-record dedup keeps daily/event triggers idempotent.
  setInterval(
    () =>
      processAllMerchantAutomations(logger).catch((err) =>
        logger.error({ err }, "Marketing automation scheduled run error"),
      ),
    60 * 60 * 1000,
  );
}
