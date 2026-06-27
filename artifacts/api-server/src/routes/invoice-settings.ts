import { Router, type IRouter } from "express";
import { db, invoiceSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateInvoiceSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

/** Sensible out-of-the-box invoicing policy. Any key absent from a merchant's
 *  stored `config` falls back to the value here. */
const DEFAULT_CONFIG = {
  // ── Defaults ──
  defaultDueDays: 14,
  numberPrefix: "KI",
  defaultNotes: "",
  defaultTerms: "",
  // ── Payment reminders ──
  reminderEnabled: false,
  reminderDaysBefore: 3,
  // ── Overdue notifications ──
  overdueEnabled: false,
  overdueDaysAfter: 1,
  overdueRepeatDays: 7,
  lateFeeEnabled: false,
  lateFeePercent: 0,
  // ── Sending ──
  autoSendOnCreate: false,
  defaultSendMethod: "email" as "email" | "sms" | "both",
  attachPdf: true,
  bccBusinessEmail: false,
  emailSubject: "Invoice {number} from {business}",
  emailMessage:
    "Please find your invoice {number} for {total} attached. Payment is due by {dueDate}.",
};

type InvoiceConfig = typeof DEFAULT_CONFIG;

const clampInt = (v: unknown, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const clampNum = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const asBool = (v: unknown, fallback: boolean): boolean =>
  typeof v === "boolean" ? v : fallback;

const asStr = (v: unknown, fallback: string): string =>
  typeof v === "string" ? v : fallback;

/** Coerce a stored (possibly partial / legacy) config into the full, typed,
 *  clamped settings object returned to the client. */
function formatSettings(row: typeof invoiceSettingsTable.$inferSelect | undefined): InvoiceConfig {
  const c = (row?.config ?? {}) as Partial<InvoiceConfig>;
  const method = c.defaultSendMethod;
  return {
    defaultDueDays: clampInt(c.defaultDueDays, DEFAULT_CONFIG.defaultDueDays),
    numberPrefix: asStr(c.numberPrefix, DEFAULT_CONFIG.numberPrefix),
    defaultNotes: asStr(c.defaultNotes, DEFAULT_CONFIG.defaultNotes),
    defaultTerms: asStr(c.defaultTerms, DEFAULT_CONFIG.defaultTerms),
    reminderEnabled: asBool(c.reminderEnabled, DEFAULT_CONFIG.reminderEnabled),
    reminderDaysBefore: clampInt(c.reminderDaysBefore, DEFAULT_CONFIG.reminderDaysBefore),
    overdueEnabled: asBool(c.overdueEnabled, DEFAULT_CONFIG.overdueEnabled),
    overdueDaysAfter: clampInt(c.overdueDaysAfter, DEFAULT_CONFIG.overdueDaysAfter),
    overdueRepeatDays: clampInt(c.overdueRepeatDays, DEFAULT_CONFIG.overdueRepeatDays),
    lateFeeEnabled: asBool(c.lateFeeEnabled, DEFAULT_CONFIG.lateFeeEnabled),
    lateFeePercent: clampNum(c.lateFeePercent, DEFAULT_CONFIG.lateFeePercent),
    autoSendOnCreate: asBool(c.autoSendOnCreate, DEFAULT_CONFIG.autoSendOnCreate),
    defaultSendMethod: method === "sms" || method === "both" || method === "email" ? method : DEFAULT_CONFIG.defaultSendMethod,
    attachPdf: asBool(c.attachPdf, DEFAULT_CONFIG.attachPdf),
    bccBusinessEmail: asBool(c.bccBusinessEmail, DEFAULT_CONFIG.bccBusinessEmail),
    emailSubject: asStr(c.emailSubject, DEFAULT_CONFIG.emailSubject),
    emailMessage: asStr(c.emailMessage, DEFAULT_CONFIG.emailMessage),
  };
}

/** Merchant invoicing defaults, consumed when creating/sending invoices. */
export async function getInvoiceSettings(merchantId: number): Promise<InvoiceConfig> {
  const [row] = await db
    .select()
    .from(invoiceSettingsTable)
    .where(eq(invoiceSettingsTable.merchantId, merchantId));
  return formatSettings(row);
}

router.get("/invoice-settings", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(invoiceSettingsTable)
    .where(eq(invoiceSettingsTable.merchantId, req.session.merchantId!));
  res.json(formatSettings(row));
});

router.put("/invoice-settings", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateInvoiceSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(invoiceSettingsTable)
    .where(eq(invoiceSettingsTable.merchantId, req.session.merchantId!));

  const config = { ...((existing?.config ?? {}) as object), ...parsed.data };

  let row: typeof invoiceSettingsTable.$inferSelect;
  if (existing) {
    [row] = await db
      .update(invoiceSettingsTable)
      .set({ config })
      .where(eq(invoiceSettingsTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(invoiceSettingsTable)
      .values({ merchantId: req.session.merchantId!, config })
      .returning();
  }

  res.json(formatSettings(row));
});

export default router;
