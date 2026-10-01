import { readFileSync } from "node:fs";
import path from "node:path";
// @ts-expect-error — plain .mjs beside server.mjs, no type declarations.
import { absoluteImage, productIdFromPath, withProductShare } from "../../../share-meta.mjs";

/* Link previews: every koastal.com.au page shows Share.png; a shared product
   shows its own photo first and Share.png second (share-meta.mjs, used by
   server.mjs for /shop/product/:id). */
const ORIGIN = "https://koastal.com.au";
const SHARE = `${ORIGIN}/api/share-image.png`;
const shopIndex = readFileSync(path.resolve(__dirname, "../../../../shop/index.html"), "utf8");
const ogImages = (html: string) => [...html.matchAll(/<meta property="og:image" content="([^"]+)"/g)].map((m) => m[1]);

describe("share previews", () => {
  it("the shop's default preview is Share.png", () => {
    expect(ogImages(shopIndex)).toEqual([SHARE]);
    expect(shopIndex).toContain(`<meta name="twitter:image" content="${SHARE}" />`);
  });

  it("the website's default preview is Share.png", () => {
    const site = readFileSync(path.resolve(__dirname, "../../../../website/index.html"), "utf8");
    expect(ogImages(site)).toEqual([SHARE]);
  });

  it("a product leads with its own photo, then Share.png", () => {
    const html = withProductShare(shopIndex, { name: "Gaming PC", description: "<p>Fast &amp; quiet</p>", price: 1999, imageUrl: "/api/shop/media/abc.jpg" },
      { origin: ORIGIN, pageUrl: `${ORIGIN}/shop/product/7` });
    expect(ogImages(html)).toEqual([`${ORIGIN}/api/shop/media/abc.jpg`, SHARE]);
    expect(html).toContain('<meta name="twitter:image" content="https://koastal.com.au/api/shop/media/abc.jpg" />');
    expect(html).toContain("<title>Gaming PC | Koastal Kollective</title>");
    expect(html).toContain('<meta property="og:type" content="product" />');
    expect(html).toContain('<meta property="product:price:amount" content="1999.00" />');
    // The default block is replaced, not added to.
    expect(html.match(/property="og:type"/g)).toHaveLength(1);
  });

  it("a product with no usable photo shows Share.png alone", () => {
    for (const imageUrl of [null, "", "data:image/png;base64,xyz", "//evil.example/x.png"]) {
      const html = withProductShare(shopIndex, { name: "Repair", description: "", price: 50, imageUrl }, { origin: ORIGIN, pageUrl: `${ORIGIN}/shop/product/1` });
      expect(ogImages(html)).toEqual([SHARE]);
    }
  });

  it("escapes what the merchant typed", () => {
    const html = withProductShare(shopIndex, { name: 'Cable "6ft" <b>', description: "", price: 5, imageUrl: null }, { origin: ORIGIN, pageUrl: `${ORIGIN}/shop/product/2` });
    expect(html).toContain('content="Cable &quot;6ft&quot; &lt;b&gt; | Koastal Kollective"');
    expect(html).not.toContain("<b>");
  });

  it("only /product/<id> is a product page", () => {
    expect(productIdFromPath("/product/42")).toBe(42);
    expect(productIdFromPath("/product/42/")).toBe(42);
    expect(productIdFromPath("/products")).toBeNull();
    expect(productIdFromPath("/product/abc")).toBeNull();
    expect(absoluteImage("https://cdn.example/x.jpg", ORIGIN)).toBe("https://cdn.example/x.jpg");
  });
});
