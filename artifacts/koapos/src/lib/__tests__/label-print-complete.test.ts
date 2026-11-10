import { describe, it, expect } from "vitest";
import {
  buildLabelHtml, DYMO_SIZES, LABEL_SIZE_ID, SAMPLE_LABEL_FIELDS, STICKER_TYPES, repairStickerFields, withSampleFields,
} from "@/lib/sticker-config";

/* Every line a label type offers must reach the printed label. Labels used to
   lose text two ways: the print path and the editor preview were separate
   renderers that drifted, and empty fields were filled with sample text on the
   preview (and on the print, until that was removed) — so a line could show on
   screen and never print. The preview now renders this same HTML. */

const size = DYMO_SIZES.find((s) => s.id === LABEL_SIZE_ID)!;
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Every toggle on, so every line the type offers is asked for. */
function allOn(typeId: string): Record<string, string> {
  const t = STICKER_TYPES.find((x) => x.id === typeId)!;
  return Object.fromEntries(t.fields.map((f) => [f.key, f.type === "toggle" ? "true" : f.defaultValue]));
}

const NOT_TEXT = new Set(["barcode", "productQrUrl", "serviceQrUrl", "customerQrValue"]);

describe("every label line reaches the print", () => {
  for (const type of STICKER_TYPES) {
    it(`${type.id}: all its text prints`, () => {
      const fields = { ...allOn(type.id), splitJobNo: "false", ...SAMPLE_LABEL_FIELDS[type.id], customText: "Thank you!" };
      const html = buildLabelHtml({
        typeId: type.id, size, fields, businessName: "Koastal Kollective", brandColor: "#007b7d",
        website: "koastal.com.au", orientation: "horizontal", quantity: 1,
      });
      for (const [k, v] of Object.entries(SAMPLE_LABEL_FIELDS[type.id]!)) {
        if (NOT_TEXT.has(k)) continue;
        expect(html, `${type.id}.${k}`).toContain(esc(v));
      }
      expect(html).toContain("Thank you!");
      expect(html).toContain("koastal.com.au");
    });
  }
});

describe("nothing prints that isn't there", () => {
  it("an empty field leaves no bare prefix and no sample text", () => {
    const html = buildLabelHtml({
      typeId: "pricetag", size, fields: { ...allOn("pricetag"), productName: "Cable", price: "$9.95" },
      businessName: "", brandColor: "#000", orientation: "horizontal", quantity: 1,
    });
    expect(html).toContain("Cable");
    expect(html).not.toMatch(/>#</);
    expect(html).not.toContain("Reusable Cup");
    const repair = buildLabelHtml({
      typeId: "repair", size, fields: { ...allOn("repair"), jobNo: "KS1", customer: "Mike" },
      businessName: "", brandColor: "#000", orientation: "horizontal", quantity: 1,
    });
    expect(repair).not.toContain("Due:");
    expect(repair).not.toContain("Tech:");
    expect(repair).not.toContain("1234");
  });

  it("samples fill only what's empty, and never a real value", () => {
    expect(withSampleFields("product", { productName: "Real", price: "" })).toMatchObject({ productName: "Real", price: "$5.50" });
  });
});

describe("repair sticker data", () => {
  it("is built the same way everywhere: description first, technician, credentials on one line, the job's own due date", () => {
    expect(repairStickerFields(
      { id: 7, jobNumber: "KS0007", customerName: "Mike", deviceDescription: "MacBook Pro 14", deviceType: "Laptop",
        workDescription: "Screen\nflicker", accounts: "a@b.com\n", passwordOrPin: "12\n34" },
      { tech: "Alex" },
    )).toMatchObject({
      jobNo: "KS0007", customer: "Mike", device: "MacBook Pro 14", fault: "Screen / flicker",
      tech: "Alex", username: "a@b.com", password: "12 / 34", dueDate: "",
    });
    expect(repairStickerFields({ deviceType: "Laptop" }).device).toBe("Laptop");
    expect(repairStickerFields({ dueDate: "2026-11-20" }).dueDate).toBe("20/11/2026");
    expect(repairStickerFields({ dueDate: null }).dueDate).toBe("");
  });
});
