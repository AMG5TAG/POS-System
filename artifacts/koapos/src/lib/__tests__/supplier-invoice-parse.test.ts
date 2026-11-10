import { describe, it, expect } from "vitest";
import { parseSupplierInvoice, InvoiceParseError, type PdfPage } from "../supplier-invoice-parse";
import leader from "./fixtures/leader-invoice-text.json";

/* Purchase Orders › Import supplier invoice. The fixture is the text (with
   positions) pdf.js reads off a real two-page Leader Computers tax invoice,
   N-SI-21073805 — the invoice the import was built from. */

const pages = leader as PdfPage[];

describe("parseSupplierInvoice — Leader tax invoice", () => {
  const inv = parseSupplierInvoice(pages);

  it("reads the header: supplier, invoice number (our PO number), date, account code", () => {
    expect(inv.supplier.name).toBe("LEADER COMPUTERS PTY LTD");
    expect(inv.supplier.abn).toBe("24093139354");
    expect(inv.supplier.website).toBe("www.leadersystems.com.au");
    expect(inv.invoiceNumber).toBe("N-SI-21073805");
    expect(inv.date).toBe("2026-10-01");
    expect(inv.accountCode).toBe("KOAS44");
    expect(inv.orderNumber).toBe("WEB ORDER");
  });

  it("reads all 14 lines across both pages", () => {
    expect(inv.lines).toHaveLength(14);
    expect(inv.lines.map((l) => l.stockCode)).toEqual([
      "MNAO-U27B35", "BIW-UD150-32GB", "BIW-UD150-64GB", "BIW-UD150-128GB", "KBRP-X1800S-BLACK",
      "MIRP-M306", "MPA-WCA012AUWH", "MPA-WCA012AUBK", "MPA-CAB023FQ1MBK",
      // Page 2 wraps these two stock codes onto a second row.
      "MPA-CAB023FQ1MWH", "MPA-CAA021FQ1MWH",
      "NAO-NB-AC-90A", "NAO-NB-PD65B", "PSG-P650SSICE",
    ]);
  });

  it("joins wrapped descriptions and reads the money columns", () => {
    expect(inv.lines[0]).toMatchObject({
      stockCode: "MNAO-U27B35",
      manufCode: "U27B35",
      description: "AOC 27 4K Monitor U27B35: 27 IPS, 3840×2160 @ 60Hz",
      qty: 2, unitEx: 228, grossEx: 456, gst: 45.6, totalInc: 501.6,
    });
    expect(inv.lines[13]).toMatchObject({ manufCode: "GP-P650SS ICE", qty: 1, unitEx: 66, totalInc: 72.6 });
  });

  it("collects each line's serial numbers", () => {
    expect(inv.lines[0]!.serials).toEqual(["XZ4S4HA001672", "XZ4S4HA001696"]);
    expect(inv.lines[1]!.serials).toHaveLength(4);
    expect(inv.lines[13]!.serials).toEqual(["SN26115P001104"]);
  });

  it("reads the totals, and the lines add up to them", () => {
    expect(inv.totals).toEqual({ gst: 95.8, total: 1053.8 });
    const sum = inv.lines.reduce((s, l) => s + (l.totalInc ?? 0), 0);
    expect(Math.round(sum * 100) / 100).toBe(1053.8);
    expect(inv.warnings).toEqual([]);
  });
});

describe("parseSupplierInvoice — failures", () => {
  it("says so when a PDF has no text (a scan)", () => {
    expect(() => parseSupplierInvoice([{ width: 600, height: 800, items: [] }])).toThrow(/scan/);
  });
  it("says so when there's no item table", () => {
    expect(() => parseSupplierInvoice([{ width: 600, height: 800, items: [{ str: "Hello", x: 10, y: 10, w: 20 }] }]))
      .toThrow(InvoiceParseError);
  });
});
