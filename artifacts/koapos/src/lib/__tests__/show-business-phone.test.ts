import { describe, it, expect } from "vitest";
import { buildInvoiceHtml } from "@workspace/sales-documents";

/** Sales templates › "Show Number": the business phone on invoices, quotes and
 *  A4 receipts (all drawn by buildInvoiceHtml). Unset means on, which is what
 *  every saved template from before the option gets. */
const doc = (showPhone?: boolean) => buildInvoiceHtml({
  title: "Tax Invoice", documentNumber: "INV-1", dateStr: "11 November 2026",
  business: { name: "Koastal Kollective", phone: "0493 145 179", abn: null, website: null, email: null },
  customer: null,
  items: [{ description: "Repair", quantity: 1, unitPrice: 100, amount: 100 }],
  subtotal: 90.91, taxTotal: 9.09, total: 100,
  options: showPhone === undefined ? {} : { showPhone },
} as Parameters<typeof buildInvoiceHtml>[0]);

describe("Show Number", () => {
  it("prints the business phone by default and when on", () => {
    expect(doc()).toContain("0493 145 179");
    expect(doc(true)).toContain("0493 145 179");
  });
  it("leaves it off when switched off", () => {
    expect(doc(false)).not.toContain("0493 145 179");
  });
});
