import { describe, it, expect } from "vitest";
import { buildProductFeed, feedSkipReason, validGtin, plainText, absoluteImage, type FeedProduct, type FeedContext } from "../lib/product-feed";
import { shopMediaUrl } from "../lib/shop-media";

/**
 * lib/product-feed.ts — the Google-format feed that Google, Meta, Pinterest,
 * TikTok and Microsoft fetch. Pinned: what is left out and why, stock and
 * pre-order availability, GST-inclusive AUD prices, absolute public image
 * links (never the staff-only storage path), GTIN check digits, variants as
 * grouped items, and XML escaping.
 */

const ctx: FeedContext = {
  shopOrigin: "https://koastal.com.au/shop",
  siteOrigin: "https://koastal.com.au",
  mediaUrl: shopMediaUrl,
  title: "Koastal Kollective",
};

const product = (over: Partial<FeedProduct> = {}): FeedProduct => ({
  id: 7, name: "USB-C Cable", description: "<p>Braided &amp; tough</p>", price: 29.95, barcode: null, brand: "Belkin",
  imageUrl: "/api/storage/objects/merchants/1/uploads/cable", media: null, categoryPath: "Accessories > Cables",
  refurbished: false, trackInventory: true, stockQuantity: 3, typeTracksStock: true, isService: false, isEpay: false,
  weightKg: 0.1, preOrder: null, variants: [], ...over,
});

describe("what goes in the feed", () => {
  it("leaves out services, gift cards, $0 and photo-less products, saying why", () => {
    expect(feedSkipReason(product({ isService: true }), ctx)).toBe("service");
    expect(feedSkipReason(product({ isEpay: true }), ctx)).toBe("giftCard");
    expect(feedSkipReason(product({ price: 0 }), ctx)).toBe("noPrice");
    expect(feedSkipReason(product({ imageUrl: "data:image/png;base64,AAAA" }), ctx)).toBe("noImage");
    expect(feedSkipReason(product(), ctx)).toBeNull();
    const r = buildProductFeed([product(), product({ id: 8, isService: true }), product({ id: 9, imageUrl: null })], ctx);
    expect(r.included).toBe(1);
    expect(r.skipped).toEqual({ service: 1, giftCard: 0, noPrice: 0, noImage: 1 });
  });

  it("links the public shop media address, absolute, never the staff-only storage path", () => {
    expect(absoluteImage("/api/storage/objects/merchants/1/uploads/x", ctx)).toBe("https://koastal.com.au/api/shop/media/merchants/1/uploads/x");
    const { xml } = buildProductFeed([product()], ctx);
    expect(xml).not.toContain("/api/storage/objects/");
  });
});

describe("item fields", () => {
  it("sends price in AUD, the product page link and category path", () => {
    const { xml } = buildProductFeed([product()], ctx);
    expect(xml).toContain("<g:id>P7</g:id>");
    expect(xml).toContain("<g:price>29.95 AUD</g:price>");
    expect(xml).toContain("<link>https://koastal.com.au/shop/product/7</link>");
    expect(xml).toContain("<g:product_type>Accessories &gt; Cables</g:product_type>");
    expect(xml).toContain("<g:description>Braided &amp; tough</g:description>");
    expect(xml).toContain("<g:condition>new</g:condition>");
  });

  it("marks stock, untracked items and pre-orders", () => {
    expect(buildProductFeed([product({ stockQuantity: 0 })], ctx).xml).toContain("<g:availability>out_of_stock</g:availability>");
    expect(buildProductFeed([product({ stockQuantity: 0, trackInventory: false })], ctx).xml).toContain("<g:availability>in_stock</g:availability>");
    const pre = buildProductFeed([product({ stockQuantity: 0, preOrder: { releaseDate: "2026-12-01" } })], ctx).xml;
    expect(pre).toContain("<g:availability>preorder</g:availability>");
    expect(pre).toContain("<g:availability_date>2026-12-01T00:00:00+10:00</g:availability_date>");
  });

  it("sends a GTIN only when its check digit is valid", () => {
    expect(validGtin("9300601123456")).toBeNull();
    expect(validGtin("4006381333931")).toBe("4006381333931");
    expect(validGtin("ABC123")).toBeNull();
    expect(buildProductFeed([product({ barcode: "4006381333931" })], ctx).xml).toContain("<g:gtin>4006381333931</g:gtin>");
    const none = buildProductFeed([product({ barcode: "12345" })], ctx).xml;
    expect(none).not.toContain("<g:gtin>");
    expect(none).toContain("<g:identifier_exists>no</g:identifier_exists>");
  });

  it("turns variants into grouped items with their own price and stock", () => {
    const { xml, included } = buildProductFeed([product({ variants: [
      { id: 1, name: "Black", price: 34.95, barcode: null, stockQuantity: 0, imageUrl: null, attributes: { Colour: "Black" } },
      { id: 2, name: "White", price: null, barcode: null, stockQuantity: 2, imageUrl: null, attributes: { Colour: "White" } },
    ] })], ctx);
    expect(included).toBe(2);
    expect(xml).toContain("<g:id>P7-V1</g:id>");
    expect(xml).toContain("<g:item_group_id>P7</g:item_group_id>");
    expect(xml).toContain("<g:price>34.95 AUD</g:price>");
    expect(xml).toContain("<g:price>29.95 AUD</g:price>");
    expect(xml).toContain("<g:color>Black</g:color>");
  });

  it("escapes XML and strips characters XML can't carry", () => {
    const { xml } = buildProductFeed([product({ name: 'Case <Pro> "XL" & \u0001more' })], ctx);
    expect(xml).toContain("<title>Case &lt;Pro&gt; &quot;XL&quot; &amp; more</title>");
  });

  it("reads HTML descriptions as plain text", () => {
    expect(plainText("<p>One</p><p>Two&nbsp;three</p>")).toBe("One\nTwo three");
  });
});
