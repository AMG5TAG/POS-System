import { describe, expect, it } from "vitest";
import { customQrEmailBlock } from "../lib/custom-qr-email";

describe("customQrEmailBlock", () => {
  const image = "https://cdn.example.com/menu-qr.png";

  it("renders the image and caption when the template shows a custom QR", () => {
    const html = customQrEmailBlock({ showCustomQr: true, customQrImage: image, customQrCaption: "Scan for our menu" });
    expect(html).toContain(image);
    expect(html).toContain("Scan for our menu");
  });

  it("renders nothing while the template's toggle is off", () => {
    expect(customQrEmailBlock({ showCustomQr: false, customQrImage: image })).toBe("");
  });

  it("renders nothing when no image has been chosen", () => {
    expect(customQrEmailBlock({ showCustomQr: true })).toBe("");
    expect(customQrEmailBlock({ showCustomQr: true, customQrImage: "   " })).toBe("");
  });

  it("accepts an uploaded data URL, the shape the picker and upload both store", () => {
    const html = customQrEmailBlock({ showCustomQr: true, customQrImage: "data:image/png;base64,iVBORw0KGgo=" });
    expect(html).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  it("refuses a source a mail client should never fetch", () => {
    expect(customQrEmailBlock({ showCustomQr: true, customQrImage: "javascript:alert(1)" })).toBe("");
    expect(customQrEmailBlock({ showCustomQr: true, customQrImage: "data:text/html,<script>" })).toBe("");
  });

  it("escapes the caption rather than letting it inject markup", () => {
    const html = customQrEmailBlock({
      showCustomQr: true,
      customQrImage: image,
      customQrCaption: '"><script>alert(1)</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("ignores non-string values from a hand-edited options blob", () => {
    expect(customQrEmailBlock({ showCustomQr: true, customQrImage: { url: image } })).toBe("");
  });
});
