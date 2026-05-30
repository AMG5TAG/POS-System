import type { Transaction } from "@workspace/api-client-react";

export interface ReceiptBusinessInfo {
  businessName?: string;
  abn?: string;
  website?: string;
  email?: string;
  brandColor?: string;
}

export interface ReceiptTemplateOpts {
  showLogo?: boolean;
  showAbn?: boolean;
  showGstBreakdown?: boolean;
  showWebsite?: boolean;
  showPaymentMethods?: boolean;
  showCustomerQr?: boolean;
  showLoyaltyEarned?: boolean;
  showBarcode?: boolean;
  printCustomerCopy?: boolean;
  thankYouMsg?: string;
  footerText?: string;
  headerText?: string;
  customMessage?: string;
  loyaltyQrText?: string;
  fontFamily?: string;
}

export function printReceipt(
  tx: Transaction,
  businessInfo?: ReceiptBusinessInfo,
  opts?: ReceiptTemplateOpts,
): void {
  const win = window.open("", "_blank", "width=400,height=600");
  if (!win) {
    // eslint-disable-next-line no-console
    console.warn("Popup blocked — receipt print could not open");
    return;
  }

  const esc = (s: string) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
    );

  const rawBusinessName = businessInfo?.businessName ?? "Your Store";
  const rawAbn = businessInfo?.abn ?? "";
  const rawWebsite = businessInfo?.website ?? "";
  const rawEmail = businessInfo?.email ?? "";
  const rawBrandColor = businessInfo?.brandColor ?? "#374151";
  const businessName = esc(rawBusinessName);
  const abn = esc(rawAbn);
  const website = esc(rawWebsite);
  const email = esc(rawEmail);
  const brandColor = /^#[0-9a-fA-F]{3,8}$/.test(rawBrandColor) ? rawBrandColor : "#374151";

  const tpl: ReceiptTemplateOpts = {
    showLogo: true,
    showAbn: true,
    showGstBreakdown: true,
    showWebsite: true,
    showPaymentMethods: true,
    showCustomerQr: false,
    showLoyaltyEarned: false,
    showBarcode: false,
    printCustomerCopy: false,
    thankYouMsg: "Thank you for your purchase!",
    footerText: "",
    headerText: "",
    customMessage: "",
    loyaltyQrText: "",
    fontFamily: "Courier New",
    ...opts,
  };

  const receiptNum = tx.receiptNumber ? `#${tx.receiptNumber}` : `#${tx.id}`;
  const dateStr = new Date(tx.createdAt).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = new Date(tx.createdAt).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const items = (tx.items ?? []) as Array<{
    productName?: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice?: number;
    discount?: number;
  }>;

  const itemRows = items
    .map((item) => {
      const name = esc(item.productName ?? "Item");
      const qty = item.quantity ?? 1;
      const lineTotal = item.totalPrice ?? (item.unitPrice ?? 0) * qty;
      return `<tr><td>${name}</td><td class="tcenter">${qty}</td><td class="right">$${lineTotal.toFixed(2)}</td></tr>`;
    })
    .join("");

  const subtotal = tx.subtotal ?? 0;
  const taxTotal = tx.taxTotal ?? 0;
  const total = tx.total ?? 0;
  const pmLabel = tx.paymentMethod?.toUpperCase() ?? "";

  const fontFamily = tpl.fontFamily === "Courier New" ? "'Courier New', monospace" : tpl.fontFamily ?? "'Courier New', monospace";

  const resolveStr = (text?: string) => {
    if (!text) return "";
    return esc(
      text
        .replace(/\{\{business\.name\}\}/g, rawBusinessName)
        .replace(/\{\{business\.abn\}\}/g, rawAbn)
        .replace(/\{\{business\.email\}\}/g, rawEmail)
        .replace(/\{\{business\.website\}\}/g, rawWebsite)
        .replace(/\{\{transaction\.total\}\}/g, `$${total.toFixed(2)}`)
        .replace(/\{\{transaction\.date\}\}/g, `${dateStr} ${timeStr}`)
        .replace(/\{\{transaction\.number\}\}/g, receiptNum)
        .replace(/\{\{[^}]+\}\}/g, ""),
    );
  };

  const thankYou = resolveStr(tpl.thankYouMsg);
  const footer = resolveStr(tpl.footerText);
  const header = resolveStr(tpl.headerText);
  const customMsg = resolveStr(tpl.customMessage);

  const escReceiptNum = esc(receiptNum);

  let body = `
    <div class="receipt">
      <div class="center bdr-b pb mb">
        ${tpl.showLogo ? `<div class="logo-square" style="background:${brandColor}"></div>` : ""}
        <p class="bold upper tracking">${businessName}</p>
        ${tpl.showAbn && abn ? `<p class="gray small">ABN ${abn}</p>` : ""}
        ${tpl.showWebsite && website ? `<p class="gray small">${website}</p>` : ""}
        <p class="gray small">${dateStr} ${timeStr}</p>
        ${receiptNum ? `<p class="gray small">Receipt: ${escReceiptNum}</p>` : ""}
      </div>
      ${header ? `<p class="center small mb">${header}</p>` : ""}
      <table>
        <thead><tr><th class="left">Item</th><th class="tcenter">Qty</th><th class="right">Amt</th></tr></thead>
        <tbody>
          ${itemRows || '<tr><td class="gray small">No items</td><td class="tcenter">—</td><td class="right">—</td></tr>'}
        </tbody>
      </table>
      <div class="bdr-t pt small">
        <div class="row"><span class="gray">Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>
        ${tpl.showGstBreakdown ? `<div class="row"><span class="gray">GST (10% incl.)</span><span>$${taxTotal.toFixed(2)}</span></div>` : ""}
        ${tx.discountTotal ? `<div class="row"><span class="gray">Discount</span><span>−$${tx.discountTotal.toFixed(2)}</span></div>` : ""}
        <div class="row bold"><span>TOTAL AUD</span><span>$${total.toFixed(2)}</span></div>
        ${tpl.showPaymentMethods && pmLabel ? `<div class="row gray"><span>${pmLabel}</span><span>Approved</span></div>` : ""}
      </div>
      <div class="center gray small bdr-t pt mt">
        ${thankYou ? `<p>${thankYou}</p>` : ""}
        ${footer ? `<p>${footer}</p>` : ""}
        ${customMsg ? `<p style="line-height:1.5;margin-top:4px">${customMsg}</p>` : ""}
      </div>
    </div>`;

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${fontFamily}; font-size: 12px; color: #1f2937; background: #fff; padding: 16px; }
    .receipt { max-width: 300px; margin: 0 auto; }
    .center { text-align: center; }
    .left { text-align: left; }
    .right { text-align: right; }
    .tcenter { text-align: center; }
    .bold { font-weight: bold; }
    .upper { text-transform: uppercase; }
    .tracking { letter-spacing: 0.05em; }
    .gray { color: #9ca3af; }
    .small { font-size: 10px; }
    .mb { margin-bottom: 8px; }
    .mt { margin-top: 8px; }
    .pb { padding-bottom: 8px; }
    .pt { padding-top: 8px; }
    .bdr-b { border-bottom: 1px solid #e5e7eb; }
    .bdr-t { border-top: 1px solid #e5e7eb; }
    .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 4px 0; }
    thead tr { border-bottom: 1px solid #e5e7eb; }
    th { font-weight: 500; padding-bottom: 2px; font-size: 10px; color: #6b7280; }
    td { padding: 2px 0; }
    .logo-square { width: 20px; height: 20px; border-radius: 2px; margin: 0 auto 4px; }
    @media print {
      body { padding: 0; }
      @page { margin: 8mm; size: 80mm auto; }
    }
  `;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${escReceiptNum}</title><style>${css}</style></head><body>${body}</body></html>`;

  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 800);

  if (tpl.printCustomerCopy) {
    setTimeout(() => {
      const tagged = html.replace("<body>", '<body><p style="text-align:center;font-weight:bold;font-size:11px;color:#9ca3af;letter-spacing:2px;margin-bottom:6px">CUSTOMER COPY</p>');
      const win2 = window.open("", "_blank", "width=400,height=600,scrollbars=yes");
      if (win2) {
        win2.document.write(tagged);
        win2.document.close();
        win2.focus();
        setTimeout(() => win2.print(), 800);
      }
    }, 1400);
  }
}
