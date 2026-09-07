import { describe, it, expect } from "vitest";
import { buildLabelHtml, DYMO_SIZES } from "@/lib/sticker-config";

/* The per-field font size feature stores a scale under `fs_<key>` and the print
 * renderer multiplies that field's base size by it. These tests exercise the
 * pure HTML-building path (barcode/QR toggled off so no canvas/DOM is needed). */

const size = DYMO_SIZES[0];

function productHtml(extra: Record<string, string>): string {
  return buildLabelHtml({
    typeId: "product",
    size,
    fields: { showBarcode: "false", showProductQr: "false", productName: "Widget", ...extra },
    businessName: "Biz",
    brandColor: "#000000",
    orientation: "horizontal",
    quantity: 1,
  });
}

/** Pull the pt font-size of the product-name element out of the built HTML. */
function productNameFontPt(html: string): number {
  const m = html.match(/font-size:([\d.]+)pt[^>]*>Widget/);
  if (!m) throw new Error("product name font-size not found in HTML");
  return parseFloat(m[1]);
}

describe("sticker per-field font size", () => {
  it("uses the field's default size when no scale is set", () => {
    const base = productNameFontPt(productHtml({}));
    expect(base).toBeGreaterThan(0);
  });

  it("doubles the field's font size when fs_ scale is 2", () => {
    const base = productNameFontPt(productHtml({}));
    const scaled = productNameFontPt(productHtml({ fs_showProductName: "2" }));
    expect(scaled).toBeCloseTo(base * 2, 1);
  });

  it("shrinks the field's font size when fs_ scale is 0.5", () => {
    const base = productNameFontPt(productHtml({}));
    const scaled = productNameFontPt(productHtml({ fs_showProductName: "0.5" }));
    expect(scaled).toBeCloseTo(base * 0.5, 1);
  });

  it("only affects the targeted field, not its neighbours", () => {
    const base = productHtml({ price: "$9.00" });
    const scaled = productHtml({ price: "$9.00", fs_showProductName: "2" });
    // The price element's font-size is unchanged by scaling the product name.
    const priceOf = (h: string) => parseFloat((h.match(/font-size:([\d.]+)pt[^>]*>\$9\.00/) ?? ["", "0"])[1]);
    expect(priceOf(scaled)).toBeCloseTo(priceOf(base), 1);
  });

  it("ignores an invalid scale (falls back to default)", () => {
    const base = productNameFontPt(productHtml({}));
    const bad = productNameFontPt(productHtml({ fs_showProductName: "notanumber" }));
    expect(bad).toBeCloseTo(base, 1);
  });
});
