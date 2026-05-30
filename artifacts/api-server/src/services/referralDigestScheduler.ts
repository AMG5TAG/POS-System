import { db, customersTable, merchantsTable, customerSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "./email";
import type { Logger } from "pino";

const NOT_RECORDED = "Not recorded";
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;

type RawCustomer = {
  heardFrom: string | null;
  createdAt: Date;
  totalSpent: string;
};

type Comparison = {
  name: string;
  current: number;
  previous: number;
  delta: number;
};

type Highlight = {
  kind: "gainer" | "decliner";
  name: string;
  current: number;
  previous: number;
  delta: number;
  pctChange: number | null;
};

function computeHighlights(customers: RawCustomer[]): Highlight[] {
  const now = Date.now();
  const curStart = now - WINDOW_DAYS * DAY_MS;
  const prevStart = now - 2 * WINDOW_DAYS * DAY_MS;

  const curCount = new Map<string, number>();
  const prevCount = new Map<string, number>();

  for (const c of customers) {
    const ts = c.createdAt.getTime();
    if (Number.isNaN(ts)) continue;
    const source = (c.heardFrom ?? "").trim() || NOT_RECORDED;
    if (source === NOT_RECORDED) continue;
    if (ts >= curStart) {
      curCount.set(source, (curCount.get(source) ?? 0) + 1);
    } else if (ts >= prevStart && ts < curStart) {
      prevCount.set(source, (prevCount.get(source) ?? 0) + 1);
    }
  }

  // If there is no previous-period baseline at all, there is nothing to compare
  // against, so omit highlights entirely rather than surfacing misleading deltas.
  const totalPrevious = [...prevCount.values()].reduce((sum, n) => sum + n, 0);
  if (totalPrevious === 0) return [];

  const names = new Set<string>([...curCount.keys(), ...prevCount.keys()]);
  const comparison: Comparison[] = [...names].map((name) => ({
    name,
    current: curCount.get(name) ?? 0,
    previous: prevCount.get(name) ?? 0,
    delta: (curCount.get(name) ?? 0) - (prevCount.get(name) ?? 0),
  }));

  const highlights: Highlight[] = [];

  const pctChange = (c: Comparison): number | null =>
    c.previous > 0 ? Math.round((c.delta / c.previous) * 100) : null;

  const gainers = comparison.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta);
  if (gainers.length) {
    const g = gainers[0];
    highlights.push({ kind: "gainer", name: g.name, current: g.current, previous: g.previous, delta: g.delta, pctChange: pctChange(g) });
  }

  const decliners = comparison.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta);
  if (decliners.length) {
    const d = decliners[0];
    if (d.name !== highlights[0]?.name) {
      highlights.push({ kind: "decliner", name: d.name, current: d.current, previous: d.previous, delta: d.delta, pctChange: pctChange(d) });
    }
  }

  return highlights;
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function formatPct(pct: number | null): string {
  if (pct === null) return "new this period";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function buildEmailHtml(businessName: string, highlights: Highlight[]): string {
  const accent = "#3b82f6";

  const highlightRows = highlights.map((h) => {
    const isGainer = h.kind === "gainer";
    const iconColor = isGainer ? "#10b981" : "#ef4444";
    const icon = isGainer ? "▲" : "▼";
    const label = isGainer ? "Top Gainer" : "Top Decliner";
    const pctText = formatPct(h.pctChange);
    const deltaText = formatDelta(h.delta);
    return `
      <tr>
        <td style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9;">
          <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${iconColor}22;
            text-align:center;line-height:22px;font-size:11px;color:${iconColor};margin-right:10px;vertical-align:middle;">${icon}</span>
          <strong style="color:#1e293b;">${h.name}</strong>
          <span style="margin-left:8px;font-size:12px;color:#64748b;">${label}</span>
        </td>
        <td style="padding:14px 20px;border-bottom:1px solid #f1f5f9;text-align:right;color:#1e293b;">
          ${h.current} customers
          <span style="margin-left:8px;color:${iconColor};font-weight:600;">${deltaText} (${pctText})</span>
        </td>
      </tr>`;
  }).join("");

  const noDataSection = highlights.length === 0 ? `
    <tr>
      <td colspan="2" style="padding:20px;text-align:center;color:#94a3b8;font-size:14px;">
        Not enough data yet — highlights appear once there's a full comparison period.
      </td>
    </tr>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td colspan="2" style="background:${accent};padding:28px 32px;">
            <p style="margin:0 0 4px;font-size:13px;color:#bfdbfe;letter-spacing:.05em;text-transform:uppercase;">Weekly Digest</p>
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Referral Channel Highlights</h1>
          </td>
        </tr>

        <!-- Intro -->
        <tr>
          <td colspan="2" style="padding:24px 32px 12px;">
            <p style="margin:0;font-size:15px;color:#475569;line-height:1.6;">
              Here's a quick look at how your referral channels moved over the <strong>last 30 days</strong>
              compared with the 30 days before that, for <strong>${businessName}</strong>.
            </p>
          </td>
        </tr>

        <!-- Highlights table -->
        <tr>
          <td colspan="2" style="padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-top:8px;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:11px 20px;text-align:left;font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:.04em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Channel</th>
                  <th style="padding:11px 20px;text-align:right;font-size:12px;color:#94a3b8;font-weight:600;letter-spacing:.04em;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">This Period</th>
                </tr>
              </thead>
              <tbody>
                ${highlightRows}
                ${noDataSection}
              </tbody>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td colspan="2" style="padding:20px 32px 28px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
              You're receiving this because weekly referral digest is enabled in your KoaPOS settings.<br>
              To stop these emails, turn off <em>Weekly Referral Digest</em> under
              <strong>Customer Settings → Heard From Breakdown</strong>.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmailText(businessName: string, highlights: Highlight[]): string {
  const lines: string[] = [
    `Weekly Referral Channel Digest — ${businessName}`,
    `Last 30 days vs the prior 30 days`,
    ``,
  ];

  if (highlights.length === 0) {
    lines.push("Not enough data yet — highlights appear once there's a full comparison period.");
  } else {
    for (const h of highlights) {
      const label = h.kind === "gainer" ? "Top Gainer" : "Top Decliner";
      lines.push(`${label}: ${h.name} — ${h.current} customers this period (${formatDelta(h.delta)}, ${formatPct(h.pctChange)})`);
    }
  }

  lines.push("");
  lines.push("To unsubscribe, disable Weekly Referral Digest in Customer Settings > Heard From Breakdown.");
  return lines.join("\n");
}

async function runDigestForMerchant(
  merchantId: number,
  merchantEmail: string,
  businessName: string,
  logger: Logger,
): Promise<void> {
  const now = Date.now();
  const since = new Date(now - 2 * WINDOW_DAYS * DAY_MS);

  const customers = await db
    .select({
      heardFrom: customersTable.heardFrom,
      createdAt: customersTable.createdAt,
      totalSpent: customersTable.totalSpent,
    })
    .from(customersTable)
    .where(eq(customersTable.merchantId, merchantId));

  const recent = customers.filter((c) => c.createdAt >= since);

  const highlights = computeHighlights(recent as RawCustomer[]);

  const html = buildEmailHtml(businessName, highlights);
  const text = buildEmailText(businessName, highlights);

  const result = await sendEmail(merchantId, {
    to: merchantEmail,
    subject: `Your weekly referral channel digest — ${businessName}`,
    html,
    text,
  });

  if (result.success) {
    logger.info({ merchantId, highlights: highlights.length }, "Referral digest sent");
  } else {
    logger.warn({ merchantId, error: result.error }, "Referral digest send failed");
  }
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// In-memory dedup: tracks which merchants already received the digest on a given date.
// Key = merchantId, value = ISO date string (YYYY-MM-DD) of the last send.
const sentOnDate = new Map<number, string>();

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function sendReferralDigests(logger: Logger): Promise<void> {
  const todayDow = new Date().getDay(); // 0 = Sunday … 6 = Saturday
  const todayKey = todayDateStr();

  const optedIn = await db
    .select({
      merchantId: customerSettingsTable.merchantId,
      merchantEmail: merchantsTable.email,
      businessName: merchantsTable.businessName,
      weeklyDigestSendDay: customerSettingsTable.weeklyDigestSendDay,
    })
    .from(customerSettingsTable)
    .innerJoin(merchantsTable, eq(merchantsTable.id, customerSettingsTable.merchantId))
    .where(eq(customerSettingsTable.weeklyDigestOptIn, "true"));

  if (optedIn.length === 0) {
    logger.info("Referral digest: no opted-in merchants, skipping");
    return;
  }

  const due = optedIn.filter((row) => row.weeklyDigestSendDay === todayDow);

  if (due.length === 0) {
    logger.info(
      { todayDow, dayName: DAY_NAMES[todayDow] },
      "Referral digest: no merchants scheduled for today, skipping",
    );
    return;
  }

  logger.info(
    { count: due.length, dayName: DAY_NAMES[todayDow] },
    "Referral digest: sending to merchants scheduled for today",
  );

  for (const row of due) {
    // Prevent duplicate sends on server restarts within the same calendar day.
    if (sentOnDate.get(row.merchantId) === todayKey) {
      logger.info({ merchantId: row.merchantId }, "Referral digest: already sent today, skipping");
      continue;
    }

    try {
      await runDigestForMerchant(row.merchantId, row.merchantEmail, row.businessName, logger);
      sentOnDate.set(row.merchantId, todayKey);
    } catch (err) {
      logger.error({ merchantId: row.merchantId, err }, "Referral digest error for merchant");
    }
  }
}

export function scheduleReferralDigest(logger: Logger): void {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  // Run once on startup so a digest isn't skipped if the server restarts on the scheduled day.
  sendReferralDigests(logger).catch((err) =>
    logger.error({ err }, "Referral digest startup run error"),
  );
  setInterval(
    () =>
      sendReferralDigests(logger).catch((err) =>
        logger.error({ err }, "Referral digest scheduled run error"),
      ),
    ONE_DAY,
  );
  logger.info("Referral digest scheduler started (daily day-of-week check)");
}
