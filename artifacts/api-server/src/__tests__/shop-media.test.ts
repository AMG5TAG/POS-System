import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * lib/shop-media.ts — how uploaded product photos and videos reach shoppers.
 * Uploads sit behind the staff session, so the shop links a public address
 * that serves a file ONLY while something on the shop uses it. Pinned: the
 * rewrite touches only our own uploads; a file stops being public the moment
 * nothing listed refers to it; and Range parsing (needed for video on iOS).
 */

const h = vi.hoisted(() => ({ rows: [] as unknown[][] }));
vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any => new Proxy({} as any, {
    get(_t, k) {
      if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
      return () => chain();
    },
  });
  return { ...actual, db: new Proxy({} as any, { get: () => () => chain() }) };
});

const { shopMediaUrl, isShopMedia, resetShopMediaCache, parseRange, describeVideo } = await import("../lib/shop-media");

beforeEach(() => { h.rows = []; resetShopMediaCache(); });

describe("shopMediaUrl", () => {
  it("moves our uploads to the public shop address and leaves other URLs alone", () => {
    expect(shopMediaUrl("/api/storage/objects/merchants/4/uploads/abc")).toBe("/api/shop/media/merchants/4/uploads/abc");
    expect(shopMediaUrl("https://cdn.example.com/x.jpg")).toBe("https://cdn.example.com/x.jpg");
    expect(shopMediaUrl(null)).toBeNull();
  });
});

describe("isShopMedia", () => {
  it("serves a file used by a listed product's image or gallery, and nothing else", async () => {
    h.rows = [
      [{ id: 1, imageUrl: "/api/storage/objects/merchants/4/uploads/main", media: [{ type: "video", url: "/api/storage/objects/merchants/4/uploads/clip" }] }],
      [], // variants
      [], // categories
    ];
    expect(await isShopMedia(4, "merchants/4/uploads/main")).toBe(true);
    expect(await isShopMedia(4, "merchants/4/uploads/clip")).toBe(true);
    // An invoice PDF or a staff photo in the same bucket is not exposed.
    expect(await isShopMedia(4, "merchants/4/uploads/private-invoice")).toBe(false);
  });

  it("stops serving a file once nothing listed uses it", async () => {
    h.rows = [[{ id: 1, imageUrl: "/api/storage/objects/merchants/4/uploads/main", media: null }], [], []];
    expect(await isShopMedia(4, "merchants/4/uploads/main")).toBe(true);
    resetShopMediaCache();
    h.rows = [[], [], []]; // product taken off the shop
    expect(await isShopMedia(4, "merchants/4/uploads/main")).toBe(false);
  });
});

describe("parseRange", () => {
  it("reads the byte ranges browsers send for video", () => {
    expect(parseRange(undefined, 1000)).toBeNull();
    expect(parseRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=100-199", 1000)).toEqual({ start: 100, end: 199 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=0-5000", 1000)).toEqual({ start: 0, end: 999 });
  });
  it("refuses a range it cannot satisfy", () => {
    expect(parseRange("bytes=2000-", 1000)).toBe("invalid");
    expect(parseRange("bytes=5-1", 1000)).toBe("invalid");
    expect(parseRange("items=0-1", 1000)).toBe("invalid");
  });
});

describe("describeVideo", () => {
  it("embeds YouTube and Vimeo links and plays anything else as a file", () => {
    expect(describeVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ").embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
    expect(describeVideo("https://youtu.be/dQw4w9WgXcQ").provider).toBe("youtube");
    expect(describeVideo("https://vimeo.com/123456").embedUrl).toBe("https://player.vimeo.com/video/123456");
    expect(describeVideo("/api/storage/objects/merchants/4/uploads/clip").provider).toBe("file");
  });
});
