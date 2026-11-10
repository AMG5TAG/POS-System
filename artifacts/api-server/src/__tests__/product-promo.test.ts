import { describe, it, expect } from "vitest";
import {
  cleanFeatures, cleanPromoCopy, cleanTemplate, draftPromoFromProduct, extractSpecs, mergeAiCopy,
  suggestTemplate, PROMO_FEATURE_COUNT, PROMO_FEATURE_MAX, REFURB_BANNER,
} from "../lib/product-promo";

/* Inventory › Promotions drafts a promo card's words from the product. With
   no AI connected the draft must still be useful, and must never say anything
   the product record doesn't. */

describe("draftPromoFromProduct", () => {
  it("prefers the description's own bullet list, then specs, capped at five", () => {
    const copy = draftPromoFromProduct({
      name: "Samsung A9+",
      description: "A highly capable tablet for the family.\n• 11\" TFT LCD screen\n• Snapdragon 695\n- 8MP camera",
      technicalSpecs: "Storage: 128GB\nOS: Android\nColour: Graphite",
    });
    expect(copy.features).toEqual([
      "11\" TFT LCD screen", "Snapdragon 695", "8MP camera", "128GB storage", "Android os",
    ]);
    expect(copy.features).toHaveLength(PROMO_FEATURE_COUNT);
    expect(copy.pitch).toBe("A highly capable tablet for the family");
  });

  it("invents nothing for a bare product — a generic pitch and no features", () => {
    const copy = draftPromoFromProduct({ name: "Cable" });
    expect(copy.features).toEqual([]);
    expect(copy.pitch).toBe("Available now in store");
    expect(copy.banner).toBe("");
  });

  it("strips pasted HTML", () => {
    const copy = draftPromoFromProduct({ name: "X", description: "<ul><li>Fast &amp; quiet</li><li>Tiny</li></ul>" });
    expect(copy.features).toEqual(["Fast & quiet", "Tiny"]);
  });

  it("adds the warranty from the product record", () => {
    const copy = draftPromoFromProduct({ name: "X", warrantyDuration: 12, warrantyUnit: "months" });
    expect(copy.features).toEqual(["12 months warranty"]);
    expect(copy.specs.warranty).toBe("12 months");
  });

  it("marks refurbished stock with the condition banner", () => {
    expect(draftPromoFromProduct({ name: "Dell Optiplex (Refurbished)" }).banner).toBe(REFURB_BANNER);
    expect(draftPromoFromProduct({ name: "Dell Optiplex" }).banner).toBe("");
  });
});

describe("extractSpecs", () => {
  it("files spec lines onto the computer tiles by label", () => {
    const specs = extractSpecs({
      name: "PC",
      technicalSpecs: "Processor: Intel i5\nMemory: 16GB\nSSD: 256GB\nGraphics: Intel UHD\nOperating System: Win 11 Pro\nCondition: A Grade\nScreen: 24\" FHD",
      warrantyDuration: 1, warrantyUnit: "years",
    });
    expect(specs).toEqual({
      cpu: "Intel i5", ram: "16GB", storage: "256GB", gpu: "Intel UHD", display: "24\" FHD",
      os: "Win 11 Pro", warranty: "1 year", grade: "A Grade",
    });
  });
});

describe("suggestTemplate", () => {
  it("puts computers on the spec-tile card and everything else on the products card", () => {
    expect(suggestTemplate({ name: "Dell Ultra + 24\"", category: "Desktops" })).toBe("computers");
    expect(suggestTemplate({ name: "Lenovo ThinkPad T14" })).toBe("computers");
    expect(suggestTemplate({ name: "Samsung A9+", category: "Tablets" })).toBe("products");
    // "PC" inside a word is not a computer.
    expect(suggestTemplate({ name: "Upcycled vase" })).toBe("products");
  });
});

describe("cleaning", () => {
  it("drops blanks and duplicates and trims bullets", () => {
    expect(cleanFeatures(["• Fast.", "fast", "", 4, "  Light  "])).toEqual(["Fast", "Light"]);
  });

  it("cuts long features on a word boundary", () => {
    const [f] = cleanFeatures(["word ".repeat(40)]);
    expect(f!.length).toBeLessThanOrEqual(PROMO_FEATURE_MAX);
    expect(f!.endsWith("word")).toBe(true);
  });

  it("fills every field of a partial or junk stored copy", () => {
    const c = cleanPromoCopy({ pitch: 5, specs: { cpu: "i7", bogus: "x" } });
    expect(c.pitch).toBe("");
    expect(c.specs.cpu).toBe("i7");
    expect(Object.keys(c.specs)).not.toContain("bogus");
    expect(c.features).toEqual([]);
  });

  it("treats an unknown template as classic", () => {
    expect(cleanTemplate("computers")).toBe("computers");
    expect(cleanTemplate("<script>")).toBe("classic");
  });
});

describe("mergeAiCopy", () => {
  const draft = draftPromoFromProduct({
    name: "Dell (Refurbished)", warrantyDuration: 12, warrantyUnit: "months",
    technicalSpecs: "CPU: i5\nRAM: 8GB",
  });

  it("takes Claude's words but keeps the warranty and banner from the product record", () => {
    const merged = mergeAiCopy({
      subtitle: "Business desktop", features: ["a", "b", "c", "d", "e", "f"], pitch: "Ultra all in one",
      blurb: "Compact.", specs: { cpu: "Intel i5", ram: "", warranty: "Lifetime", grade: "A Grade" },
    }, draft);
    expect(merged.features).toEqual(["a", "b", "c", "d", "e"]);
    expect(merged.specs.cpu).toBe("Intel i5");
    expect(merged.specs.ram).toBe("8GB");         // AI said nothing, the draft stands
    expect(merged.specs.warranty).toBe("12 months"); // the record wins over the model
    expect(merged.banner).toBe(REFURB_BANNER);
  });

  it("falls back to the draft when the model output is junk", () => {
    expect(mergeAiCopy("nonsense", draft)).toEqual(draft);
  });
});
