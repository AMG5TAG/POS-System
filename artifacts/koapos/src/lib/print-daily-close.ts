import type { DailyClose } from "@workspace/api-client-react";

const fmt$ = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
};

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("en-AU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

export function printDailyClose(row: DailyClose, businessName?: string) {
  const b = row.breakdown as Record<string, number>;
  const variance = row.variance;
  const isOver = variance > 0;
  const isShort = variance < 0;
  const varianceLabel = variance === 0 ? "Balanced" : isOver ? `Overage +${fmt$(variance)}` : `Shortage -${fmt$(Math.abs(variance))}`;
  const varianceColor = variance === 0 ? "#059669" : isOver ? "#2563eb" : "#dc2626";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Daily Close — ${fmtDate(row.closeDate)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111; background: #fff; padding: 32px; max-width: 600px; margin: 0 auto; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #666; margin-bottom: 24px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f0f0f0; }
    .row:last-child { border-bottom: none; }
    .row.bold { font-weight: 700; }
    .row.dimmed { color: #666; }
    .row.total { font-size: 14px; font-weight: 700; border-top: 2px solid #111; padding-top: 8px; margin-top: 4px; }
    .variance { display: flex; justify-content: space-between; padding: 10px 14px; border-radius: 6px; font-weight: 700; font-size: 14px; margin-top: 12px; }
    .footer { margin-top: 32px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
    @media print { body { padding: 16px; } @page { margin: 1cm; } }
  </style>
</head>
<body>
  <h1>End of Day Report</h1>
  <div class="subtitle">
    ${businessName ? `<strong>${businessName}</strong> &nbsp;·&nbsp; ` : ""}${fmtDate(row.closeDate)}<br/>
    ${row.closedByName ? `Closed by ${row.closedByName} &nbsp;·&nbsp; ` : ""}Saved at ${fmtDateTime(row.createdAt)}
  </div>

  <div class="section">
    <div class="section-title">Sales Summary</div>
    <div class="row bold"><span>Gross Sales</span><span>${fmt$(b.grossSales ?? 0)}</span></div>
    <div class="row dimmed"><span>Tax (GST included)</span><span>${fmt$(b.taxTotal ?? 0)}</span></div>
    <div class="row dimmed"><span>Discounts</span><span>-${fmt$(b.discountTotal ?? 0)}</span></div>
    <div class="row dimmed"><span>Refunds</span><span>-${fmt$(b.refundTotal ?? 0)}</span></div>
    <div class="row total"><span>Net Sales (ex GST)</span><span>${fmt$(b.netSales ?? 0)}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Payment Breakdown</div>
    <div class="row"><span>Cash</span><span>${fmt$(b.cash ?? 0)}</span></div>
    <div class="row"><span>Card / EFTPOS</span><span>${fmt$(b.card ?? 0)}</span></div>
    <div class="row"><span>Gift Card</span><span>${fmt$(b.giftCard ?? 0)}</span></div>
    ${(b.other ?? 0) > 0 ? `<div class="row"><span>Other</span><span>${fmt$(b.other)}</span></div>` : ""}
  </div>

  <div class="section">
    <div class="section-title">Cash Reconciliation</div>
    <div class="row"><span>Expected Cash</span><span>${fmt$(row.expectedCash)}</span></div>
    <div class="row bold"><span>Counted Cash</span><span>${fmt$(row.countedCash)}</span></div>
    <div class="variance" style="background:${variance === 0 ? "#f0fdf4" : isOver ? "#eff6ff" : "#fff1f2"}; color:${varianceColor}; border:1px solid ${varianceColor}40;">
      <span>Variance</span><span>${varianceLabel}</span>
    </div>
  </div>

  ${row.notes ? `
  <div class="section">
    <div class="section-title">Notes</div>
    <p style="padding:10px;background:#fafafa;border-radius:4px;line-height:1.5;">${row.notes}</p>
  </div>` : ""}

  <div class="footer">
    KoaPOS &nbsp;·&nbsp; Report generated ${new Date().toLocaleString("en-AU")}
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=700,height=900");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

export function exportDailyClosesCSV(rows: DailyClose[]) {
  const headers = [
    "Date", "Gross Sales", "Net Sales", "Tax (GST)", "Discounts", "Refunds",
    "Cash", "Card/EFTPOS", "Gift Card", "Other",
    "Expected Cash", "Counted Cash", "Variance", "Closed By", "Notes",
  ];

  const lines = rows.map(r => {
    const b = r.breakdown as Record<string, number>;
    return [
      r.closeDate,
      (b.grossSales ?? 0).toFixed(2),
      (b.netSales ?? 0).toFixed(2),
      (b.taxTotal ?? 0).toFixed(2),
      (b.discountTotal ?? 0).toFixed(2),
      (b.refundTotal ?? 0).toFixed(2),
      (b.cash ?? 0).toFixed(2),
      (b.card ?? 0).toFixed(2),
      (b.giftCard ?? 0).toFixed(2),
      (b.other ?? 0).toFixed(2),
      r.expectedCash.toFixed(2),
      r.countedCash.toFixed(2),
      r.variance.toFixed(2),
      r.closedByName ?? "",
      (r.notes ?? "").replace(/"/g, '""'),
    ].map(v => `"${v}"`).join(",");
  });

  const csv = [headers.map(h => `"${h}"`).join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daily-closes-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
