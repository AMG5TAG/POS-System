import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsvBuffer } from "../lib/parseCsv";
import {
  cleanFeedDescription, feedProductName, feedRowToProduct, isLeaderImageUrl, isLeaderSupplier,
  normaliseStockCode, warrantyFromMonths,
} from "../lib/leader-feed";

/* Leader's dealer datafeed fills in products made by a supplier-invoice
   import. The fixture is six real feed rows (the products on the sample
   invoice) with the dealer buy price and stock levels blanked. */

const rows = parseCsvBuffer(readFileSync(path.join(__dirname, "fixtures/leader-feed-sample.csv")));
const byCode = new Map(rows.map(feedRowToProduct).filter((p) => p).map((p) => [p!.stockCode, p!]));

describe("feedRowToProduct", () => {
  it("reads every row of the real feed format", () => {
    expect(byCode.size).toBe(6);
  });

  it("maps a monitor: name, barcode, brand, image, mm → cm, warranty, RRP", () => {
    const p = byCode.get("MNAO-U27B35")!;
    expect(p).toMatchObject({
      name: "AOC 27' 4K Monitor U27B35",
      barcode: "6973985232961",
      brand: "AOC",
      manufCode: "U27B35",
      imageUrl: "https://www.leadersystems.com.au/Images/MNAO-U27B35.jpg",
      weightKg: 4.74,
      lengthCm: 12.4, widthCm: 69, heightCm: 48,
      warrantyMonths: 36,
      rrp: 349,
      category: "Monitors",
    });
    expect(p.description).toContain("Experience stunning clarity");
    expect(p.description).not.toMatch(/\r|\n{3,}/);
  });

  it("strips HTML from descriptions", () => {
    const p = byCode.get("MPA-CAB023FQ1MWH")!;
    expect(p.description).not.toContain("<h3>");
    expect(p.description.startsWith("Belkin BoostCharge USB-C to USB-C Cable (1M) - White")).toBe(true);
    expect(p.name).toBe("Belkin BoostCharge USB-C to USB-C Cable (1M) - White (CAB023fq1MWH)");
  });

  it("cuts the spec list off the short description to make a name", () => {
    expect(byCode.get("BIW-UD150-32GB")!.name).toBe("Biwin UD150 32GB USB Flash Drive USB 3.2 Gen 1 Type-A/Type-C");
    expect(feedProductName("Short: but the colon is too early to cut at, really")).toBe("Short: but the colon is too early to cut at");
    expect(feedProductName("x ".repeat(80)).length).toBeLessThanOrEqual(90);
  });
});

describe("helpers", () => {
  it("normalises stock codes and recognises Leader", () => {
    expect(normaliseStockCode(" biw-ud150-32gb ")).toBe("BIW-UD150-32GB");
    expect(isLeaderSupplier("LEADER COMPUTERS PTY LTD")).toBe(true);
    expect(isLeaderSupplier("Leader")).toBe(true);
    expect(isLeaderSupplier("Ingram Micro")).toBe(false);
    expect(isLeaderSupplier("Cheerleader Supplies")).toBe(false);
  });
  it("turns months into the product form's warranty", () => {
    expect(warrantyFromMonths(36)).toEqual({ warrantyDuration: 3, warrantyUnit: "years" });
    expect(warrantyFromMonths(18)).toEqual({ warrantyDuration: 18, warrantyUnit: "months" });
    expect(warrantyFromMonths(0)).toBeNull();
  });
  it("only fetches images from Leader's own site", () => {
    expect(isLeaderImageUrl("https://www.leadersystems.com.au/Images/X.jpg")).toBe(true);
    expect(isLeaderImageUrl("http://www.leadersystems.com.au/Images/X.jpg")).toBe(false);
    expect(isLeaderImageUrl("https://leadersystems.com.au.evil.com/x.jpg")).toBe(false);
    expect(isLeaderImageUrl("https://169.254.169.254/latest")).toBe(false);
  });
  it("tidies descriptions", () => {
    expect(cleanFeedDescription("<p>A&amp;B</p>\r\n\r\n\r\n\r\n  two   spaces ")).toBe("A&B\n\ntwo spaces");
  });
});
