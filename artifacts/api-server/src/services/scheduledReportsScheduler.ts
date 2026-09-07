import type { Logger } from "pino";
import { db, scheduledReportsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { trackedInterval } from "../lib/shutdown";
import { jitteredStart } from "../lib/scheduler-jitter";
import { runReport, type ReportColumn, type ReportGroupBy } from "../lib/report-run";
import { htmlToPdf } from "./htmlToPdf";
import { sendEmail } from "./email";

/* scheduledReportsScheduler — actually runs the scheduled reports the CRUD UI
 * lets merchants configure. Previously nothing executed them (lastRunAt stayed
 * null); now an hourly tick finds reports due per their frequency, builds the
 * report artifact (PDF or CSV) and emails it to the configured recipient,
 * stamping lastRunAt on success. */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const INTERVAL_MS: Record<string, number> = { daily: DAY, weekly: 7 * DAY, monthly: 30 * DAY };

/** reportType → the report-builder grouping. Unknown types fall back to a daily
 *  date breakdown so a misconfigured row still produces something sensible. */
const GROUP_BY: Record<string, ReportGroupBy> = {
  daily_sales: "date",
  weekly_summary: "week",
  monthly_report: "month",
  top_products: "product",
  staff_sales: "staff",
};

function isDue(frequency: string, lastRunAt: Date | null): boolean {
  const interval = INTERVAL_MS[frequency];
  if (!interval) return false;
  if (!lastRunAt) return true;
  return Date.now() - lastRunAt.getTime() >= interval;
}

function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The reporting window for a run: the completed period up to yesterday (so a
 *  daily report covers yesterday, weekly the last 7 days, monthly the last 30). */
function rangeForFrequency(frequency: string): { startDate: string; endDate: string } {
  const end = new Date();
  end.setDate(end.getDate() - 1); // yesterday = last fully-closed day
  const start = new Date(end);
  if (frequency === "weekly") start.setDate(start.getDate() - 6);
  else if (frequency === "monthly") start.setDate(start.getDate() - 29);
  return { startDate: toISODate(start), endDate: toISODate(end) };
}

function formatCell(value: unknown, type: ReportColumn["type"]): string {
  if (value == null) return "";
  if (type === "currency") return `$${Number(value).toFixed(2)}`;
  if (type === "percent") return `${Number(value)}%`;
  return String(value);
}

function buildCsv(columns: ReportColumn[], rows: Record<string, unknown>[]): string {
  const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = columns.map((c) => esc(c.label)).join(",");
  const lines = rows.map((r) => columns.map((c) => esc(formatCell(r[c.key], c.type))).join(","));
  return [header, ...lines].join("\r\n");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string));
}

function buildReportHtml(title: string, subtitle: string, columns: ReportColumn[], rows: Record<string, unknown>[]): string {
  const thead = columns.map((c) => `<th style="text-align:${c.type === "text" ? "left" : "right"};padding:8px 12px;border-bottom:2px solid #e5e7eb;font-size:12px;color:#374151;">${escapeHtml(c.label)}</th>`).join("");
  const tbody = rows.length
    ? rows.map((r) => `<tr>${columns.map((c) => `<td style="text-align:${c.type === "text" ? "left" : "right"};padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#111827;">${escapeHtml(formatCell(r[c.key], c.type))}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">No data for this period.</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:32px;color:#111827}</style></head>
<body>
  <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(title)}</h1>
  <p style="color:#6b7280;font-size:13px;margin:0 0 20px">${escapeHtml(subtitle)}</p>
  <table style="border-collapse:collapse;width:100%"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
</body></html>`;
}

async function runOne(row: typeof scheduledReportsTable.$inferSelect, logger: Logger): Promise<void> {
  const groupBy = GROUP_BY[row.reportType] ?? "date";
  const { startDate, endDate } = rangeForFrequency(row.frequency);
  const { columns, rows } = await runReport(row.merchantId, groupBy, startDate, endDate);

  const period = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
  const slug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";

  // Build the requested artifact. PDF needs Chromium; if it's unavailable we
  // fall back to a CSV attachment rather than dropping the report.
  let filename: string;
  let content: Buffer;
  let contentType: string;
  if (row.format === "pdf") {
    try {
      content = await htmlToPdf(buildReportHtml(row.name, `Period: ${period}`, columns, rows));
      filename = `${slug}.pdf`;
      contentType = "application/pdf";
    } catch (err) {
      logger.warn({ err, id: row.id }, "Scheduled report: PDF renderer unavailable, sending CSV instead");
      content = Buffer.from(buildCsv(columns, rows), "utf8");
      filename = `${slug}.csv`;
      contentType = "text/csv";
    }
  } else {
    content = Buffer.from(buildCsv(columns, rows), "utf8");
    filename = `${slug}.csv`;
    contentType = "text/csv";
  }

  const result = await sendEmail(row.merchantId, {
    to: row.email,
    subject: `${row.name} — ${period}`,
    html: `<p>Your scheduled <strong>${escapeHtml(row.name)}</strong> report for <strong>${escapeHtml(period)}</strong> is attached.</p>
           <p style="color:#6b7280;font-size:12px">${rows.length} row(s). Sent automatically by KoaPOS (${escapeHtml(row.frequency)}).</p>`,
    text: `Your scheduled "${row.name}" report for ${period} is attached (${rows.length} rows).`,
    attachments: [{ filename, content, contentType }],
  });

  if (!result.success) {
    // Don't stamp lastRunAt — retry on the next hourly tick until it sends.
    logger.error({ id: row.id, error: result.error }, "Scheduled report email failed");
    return;
  }
  await db.update(scheduledReportsTable).set({ lastRunAt: new Date() }).where(eq(scheduledReportsTable.id, row.id));
  logger.info({ id: row.id, reportType: row.reportType, to: row.email }, "Scheduled report sent");
}

async function runDueReports(logger: Logger): Promise<void> {
  const reports = await db
    .select()
    .from(scheduledReportsTable)
    .where(eq(scheduledReportsTable.enabled, "true"));
  for (const row of reports) {
    try {
      if (!isDue(row.frequency, row.lastRunAt)) continue;
      await runOne(row, logger);
    } catch (err) {
      logger.error({ err, id: row.id }, "Scheduled report run failed");
    }
  }
}

export function scheduleScheduledReports(logger: Logger): void {
  jitteredStart(() => runDueReports(logger).catch((err) => logger.error({ err }, "Scheduled reports scheduler startup error")));
  trackedInterval(
    () => runDueReports(logger).catch((err) => logger.error({ err }, "Scheduled reports scheduler error")),
    HOUR,
  );
  logger.info("Scheduled reports scheduler started (hourly due-check)");
}
