import { describe, it, expect } from "vitest";
import { extractProduct, mergeAiFields, parseDimensions, toKg, validGtin, specRows, matchSupplierBySite, siteHost, siteName, cleanTitleName, labelledDimensions, cleanSuggestedTags, fallbackTags, tagPrompt } from "../lib/product-page-import";
import { assertPublicUrl } from "../lib/safe-fetch";

const PAGE = `<!doctype html><html><head>
<title>Logitech MX Master 3S | Some Shop</title>
<meta property="og:title" content="Logitech MX Master 3S Wireless Mouse">
<meta property="og:image" content="/img/og.jpg">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"BreadcrumbList","itemListElement":[
   {"@type":"ListItem","position":1,"name":"Home"},
   {"@type":"ListItem","position":2,"name":"Mice &amp; Keyboards"},
   {"@type":"ListItem","position":3,"name":"Logitech MX Master 3S"}]},
 {"@type":"Product","name":"Logitech MX Master 3S","sku":"910-006561",
  "gtin13":"5099206100000","description":"<p>Quiet clicks.</p><p>8K DPI sensor.</p>",
  "brand":{"@type":"Brand","name":"Logitech"},
  "image":["https://cdn.example.com/a.jpg",{"@type":"ImageObject","url":"/b.jpg"}],
  "weight":{"@type":"QuantitativeValue","value":141,"unitCode":"GRM"},
  "additionalProperty":[{"@type":"PropertyValue","name":"Connectivity","value":"Bluetooth, Logi Bolt"}],
  "offers":{"@type":"Offer","price":"169.95","priceCurrency":"AUD"}}
]}
</script></head><body>
<table><tr><th>Dimensions</th><td>124.9 x 84.3 x 51 mm</td></tr>
<tr><th>Warranty</th><td>1 year</td></tr><tr><td>Connectivity</td><td>dup</td></tr></table>
</body></html>`;

describe("extractProduct", () => {
  const p = extractProduct(PAGE, "https://shop.example.com/p/mx");

  it("reads schema.org Product data first", () => {
    expect(p.name).toBe("Logitech MX Master 3S");
    expect(p.sku).toBe("910-006561");
    expect(p.brand).toBe("Logitech");
    expect(p.price).toBe(169.95);
    expect(p.weightKg).toBe(0.141);
    expect(p.description).toBe("Quiet clicks.\n8K DPI sensor.");
    expect(p.category).toBe("Mice & Keyboards");
  });

  it("keeps a barcode only with a valid check digit", () => {
    expect(validGtin("5099206100000")).toBe(false);
    expect(p.barcode).toBeUndefined();
    const ok = extractProduct(PAGE.replace("5099206100000", "9300633603205"), "https://x.com/");
    expect(ok.barcode).toBe("9300633603205");
  });

  it("takes dimensions and warranty from spec tables, without duplicate labels", () => {
    expect([p.lengthCm, p.widthCm, p.heightCm]).toEqual([12.5, 8.4, 5.1]);
    expect(p.warranty).toBe("1 year");
    expect(p.technicalSpecs?.split("\n")).toEqual([
      "Connectivity: Bluetooth, Logi Bolt", "Dimensions: 124.9 x 84.3 x 51 mm", "Warranty: 1 year",
    ]);
  });

  it("makes image links absolute, structured data first", () => {
    expect(p.images).toEqual(["https://cdn.example.com/a.jpg", "https://shop.example.com/b.jpg", "https://shop.example.com/img/og.jpg"]);
  });

  it("falls back to meta tags when there is no JSON-LD", () => {
    const q = extractProduct(`<meta property="og:title" content="Widget &amp; Co"><meta property="product:price:amount" content="1,299.00">`, "https://x.com/");
    expect(q).toMatchObject({ name: "Widget & Co", price: 1299 });
  });

  it("invents nothing for an empty page", () => {
    expect(extractProduct("<html><body></body></html>", "https://x.com/")).toEqual({ images: [] });
  });
});

describe("units", () => {
  it("converts weights and dimensions", () => {
    expect(toKg("1.2 kg")).toBe(1.2);
    expect(toKg("850g")).toBe(0.85);
    expect(toKg("2 lbs")).toBe(0.907);
    expect(parseDimensions("30 x 20 x 5 cm")).toEqual([30, 20, 5]);
    expect(parseDimensions("30 x 20 x 5")).toBeUndefined();
  });
  it("ignores prose rows in tables", () => {
    expect(specRows("<table><tr><td>This is a long sentence that is clearly not a spec label at all.</td><td>x</td></tr></table>")).toEqual([]);
  });
});

describe("mergeAiFields", () => {
  it("fills only empty fields, and checks Claude's values", () => {
    const { product, aiFilled } = mergeAiFields(
      { name: "From page", images: [] },
      { name: "From AI", brand: "Acme", price: -5, barcode: "123", weightKg: 1.5, description: null },
    );
    expect(product).toEqual({ name: "From page", brand: "Acme", weightKg: 1.5, images: [] });
    expect(aiFilled).toEqual(["brand", "weightKg"]);
  });
});

describe("assertPublicUrl", () => {
  it.each([
    "http://127.0.0.1/", "http://10.0.0.5/x", "http://169.254.169.254/latest/meta-data",
    "http://[::1]/", "http://localhost:8080/", "file:///etc/passwd", "http://user:pw@example.com/",
  ])("refuses %s", async (u) => {
    await expect(assertPublicUrl(u)).rejects.toThrow();
  });
  it("allows a public IP", async () => {
    await expect(assertPublicUrl("https://1.1.1.1/")).resolves.toBeInstanceOf(URL);
  });
});

describe("matchSupplierBySite", () => {
  const sups = [
    { id: 1, name: "Australian Computer Traders", website: "www.australiancomputertraders.com.au" },
    { id: 2, name: "Leader", website: "https://leadersystems.com.au/" },
    { id: 3, name: "No site", website: null },
  ];
  it("matches the page's site to the supplier's saved website, however it was typed", () => {
    expect(matchSupplierBySite(sups, "https://www.australiancomputertraders.com.au/dell-latitude-5520-intel-i5-1145g7-2.60ghz-16gb-ra")?.name)
      .toBe("Australian Computer Traders");
    expect(matchSupplierBySite(sups, "https://shop.leadersystems.com.au/p/1")?.id).toBe(2);
  });
  it("matches nothing for an unknown site, or a look-alike domain", () => {
    expect(matchSupplierBySite(sups, "https://example.com/x")).toBeUndefined();
    expect(matchSupplierBySite(sups, "https://notleadersystems.com.au/x")).toBeUndefined();
  });
  it("is ambiguous, not a guess, when two suppliers share a site", () => {
    expect(matchSupplierBySite([...sups, { id: 4, name: "ACT 2", website: "australiancomputertraders.com.au" }],
      "https://australiancomputertraders.com.au/x")).toBeUndefined();
  });
  it("reads host and site name", () => {
    expect(siteHost("WWW.Example.COM.au/path")).toBe("example.com.au");
    expect(siteName('<meta property="og:site_name" content="Australian Computer Traders">')).toBe("Australian Computer Traders");
  });
});

describe("a supplier's page (Australian Computer Traders shape)", () => {
  const page = `<title>Buy Dell Latitude 5520 Intel i5 16GB RAM 256GB SSD | ACT</title>
    <meta name="description" content="Buy Refurbished Dell Latitude 5520. 12 Month Warranty &amp; Free Shipping AU Wide">
    <table><tr><td>Dimensions</td><td>Width: 14.09” / 357.80 mm Depth: 9.19” / 233.30 mm Height: 0.78” / 19.87 mm</td></tr></table>`;
  const p = extractProduct(page, "https://www.australiancomputertraders.com.au/x");
  it("cleans shop chrome off a title-derived name", () => {
    expect(p.name).toBe("Dell Latitude 5520 Intel i5 16GB RAM 256GB SSD");
    expect(cleanTitleName("Widget Pro 3000 - Some Shop")).toBe("Widget Pro 3000");
    expect(cleanTitleName("USB-C - HDMI")).toBe("USB-C - HDMI"); // too short to be name + shop
  });
  it("reads a warranty written in the description", () => {
    expect(p.warranty).toBe("12 Month");
  });
  it("reads labelled dimensions, preferring metric", () => {
    expect([p.lengthCm, p.widthCm, p.heightCm]).toEqual([23.3, 35.8, 2]);
    expect(labelledDimensions("Width: 30cm")).toBeUndefined();
  });
});

describe("imported product tags", () => {
  const known = [{ name: "Laptop", count: 40 }, { name: "Refurbished", count: 22 }, { name: "Business", count: 9 }, { name: "Dell", count: 7 }];

  it("keeps 5, de-duplicated, using an existing tag's spelling", () => {
    const tags = cleanSuggestedTags(["laptop", "LAPTOP", " Refurbished ", "#Intel i5", "Windows 11", "16GB RAM", "Extra"], known);
    expect(tags).toEqual([
      { name: "Laptop", existing: true },
      { name: "Refurbished", existing: true },
      { name: "Intel i5", existing: false },
      { name: "Windows 11", existing: false },
      { name: "16GB RAM", existing: false },
    ]);
  });

  it("drops non-strings, blanks and over-long tags", () => {
    expect(cleanSuggestedTags([1, null, "", "x".repeat(31), "Ok"], known)).toEqual([{ name: "Ok", existing: false }]);
    expect(cleanSuggestedTags("not an array", known)).toEqual([]);
  });

  it("without Claude, offers only category tags the product mentions — never invents", () => {
    const tags = fallbackTags({ name: "Refurbished Dell Latitude 5520 laptop", technicalSpecs: "Form Factor: Laptop" }, known);
    expect(tags.map((t) => t.name)).toEqual(["Laptop", "Refurbished", "Dell"]);
  });

  it("gives Claude the category's tags with counts", () => {
    const p = tagPrompt({ name: "Dell Latitude 5520" }, "Laptops", known.slice(0, 2), [{ name: "Gaming", count: 3 }]);
    expect(p).toContain("Category: Laptops");
    expect(p).toContain("Laptop (40), Refurbished (22)");
    expect(p).toContain("Gaming (3)");
  });
});
