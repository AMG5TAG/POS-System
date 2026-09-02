import { describe, expect, it } from "vitest";
import { buildReceiptBytes } from "@/lib/escpos";
import {
  DEFAULT_QR_SETTINGS,
  apiToQrEntry,
  buildQRDataString,
  buildQROptions,
  isEntityQr,
  qrEntryData,
  type QREntry,
} from "@/lib/qr-render";

const entry = (over: Partial<QREntry> = {}): QREntry => ({
  id: "7",
  label: "Menu QR",
  url: "https://koastal.com.au/menu",
  qrType: "website",
  content: { url: "https://koastal.com.au/menu" },
  createdAt: new Date().toISOString(),
  settings: { ...DEFAULT_QR_SETTINGS },
  ...over,
});

describe("apiToQrEntry", () => {
  it("parses the stored JSON columns onto defaults", () => {
    const e = apiToQrEntry({
      id: 12,
      label: "Wifi",
      url: "",
      qrType: "wifi",
      content: JSON.stringify({ wifiSsid: "Koastal", wifiPass: "hunter2", wifiSec: "WPA" }),
      settings: JSON.stringify({ patternColor: "#166534", template: "circle" }),
    });
    expect(e.id).toBe("12");
    expect(e.qrType).toBe("wifi");
    expect(e.content?.wifiSsid).toBe("Koastal");
    expect(e.settings.patternColor).toBe("#166534");
    // Unspecified settings fall back rather than coming back undefined.
    expect(e.settings.level).toBe(DEFAULT_QR_SETTINGS.level);
  });

  it("survives rows with unparseable JSON", () => {
    const e = apiToQrEntry({ id: 1, label: "Broken", content: "{oops", settings: "nope" });
    expect(e.settings).toEqual(DEFAULT_QR_SETTINGS);
    expect(e.content).toEqual({});
  });
});

describe("buildQRDataString", () => {
  it("encodes each type in its scanner-recognised form", () => {
    expect(buildQRDataString("website", { url: "https://koapos.com" })).toBe("https://koapos.com");
    expect(buildQRDataString("static", { text: "Hello" })).toBe("Hello");
    expect(buildQRDataString("sms", { smsTo: "0400000000", smsMsg: "Hi" })).toBe("SMSTO:0400000000:Hi");
    expect(buildQRDataString("wifi", { wifiSsid: "Koastal", wifiPass: "pw", wifiSec: "WPA" })).toContain("WIFI:");
  });

  it("escapes vCard separators so a comma can't corrupt the card", () => {
    const vc = buildQRDataString("vcard", { vcName: "Smith, Sarah", vcOrg: "Koastal; Repairs" });
    expect(vc).toContain("BEGIN:VCARD");
    expect(vc).toContain("Smith\\, Sarah");
    expect(vc).toContain("Koastal\\; Repairs");
  });
});

describe("qrEntryData", () => {
  it("encodes the destination for an untracked code", () => {
    expect(qrEntryData(entry())).toBe("https://koastal.com.au/menu");
  });

  it("encodes the scan-logging redirect for a tracked code", () => {
    const tracked = entry({ settings: { ...DEFAULT_QR_SETTINGS, trackScans: true } });
    expect(qrEntryData(tracked)).toMatch(/\/api\/qr\/r\/7$/);
  });

  it("ignores tracking on types with no URL to redirect through", () => {
    const wifi = entry({
      qrType: "wifi",
      url: "WIFI:T:WPA;S:Koastal;P:pw;;",
      settings: { ...DEFAULT_QR_SETTINGS, trackScans: true },
    });
    expect(qrEntryData(wifi)).toBe("WIFI:T:WPA;S:Koastal;P:pw;;");
  });
});

describe("isEntityQr", () => {
  it("separates the per-record codes from the ones a merchant designed", () => {
    for (const qrType of ["product", "customer", "service"] as const) {
      expect(isEntityQr({ qrType: qrType as QREntry["qrType"] })).toBe(true);
    }
    expect(isEntityQr({ qrType: "website" })).toBe(false);
    expect(isEntityQr({ qrType: undefined })).toBe(false);
  });
});

describe("buildQROptions", () => {
  it("carries the saved design onto the renderer", () => {
    const o = buildQROptions(
      { ...DEFAULT_QR_SETTINGS, patternColor: "#166534", eyeColor: "#111", dotStyle: "dots", level: "H" },
      "https://koapos.com",
      512,
    );
    expect(o.width).toBe(512);
    expect(o.dotsOptions?.color).toBe("#166534");
    expect(o.dotsOptions?.type).toBe("dots");
    expect(o.cornersSquareOptions?.color).toBe("#111");
    expect(o.qrOptions?.errorCorrectionLevel).toBe("H");
  });

  it("renders circle-framed codes on a circular canvas", () => {
    expect(buildQROptions({ ...DEFAULT_QR_SETTINGS, template: "circle" }, "x", 256).shape).toBe("circle");
    expect(buildQROptions({ ...DEFAULT_QR_SETTINGS, template: "standard" }, "x", 256).shape).toBe("square");
  });

  it("maps a transparent background to a transparent fill, not the word", () => {
    expect(buildQROptions({ ...DEFAULT_QR_SETTINGS, bgColor: "transparent" }, "x", 256).backgroundOptions?.color)
      .toBe("rgba(0,0,0,0)");
  });
});

/* ─── Custom QR on the thermal receipt ─────────────────────────────────────── */

describe("buildReceiptBytes custom QR", () => {
  const tx = {
    id: 1, receiptNumber: "1042", total: 45, subtotal: 40.91, taxTotal: 4.09,
    items: [{ productName: "Flat White", quantity: 2, unitPrice: 4, totalPrice: 8 }],
    createdAt: "2026-08-28T00:00:00.000Z",
  } as unknown as Parameters<typeof buildReceiptBytes>[0];
  const printer = { paperWidth: "80mm" } as Parameters<typeof buildReceiptBytes>[3];

  /** GS ( k — the model-2 QR command prefix. */
  const hasQrCommand = (b: Uint8Array) =>
    b.some((_, i) => b[i] === 0x1d && b[i + 1] === 0x28 && b[i + 2] === 0x6b);

  it("encodes what a picked code points at, plus its caption", () => {
    const bytes = buildReceiptBytes(tx, undefined, {
      showCustomQr: true,
      customQrData: "https://koastal.com.au/menu",
      customQrCaption: "Scan for our menu",
    }, printer);
    expect(hasQrCommand(bytes)).toBe(true);
    const text = Array.from(bytes).map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " ")).join("");
    expect(text).toContain("koastal.com.au/menu");
    expect(text).toContain("Scan for our menu");
  });

  it("prints nothing for an uploaded image — a thermal head has no payload to encode", () => {
    const bytes = buildReceiptBytes(tx, undefined, {
      showCustomQr: true,
      customQrImage: "data:image/png;base64,iVBORw0KGgo=",
    }, printer);
    expect(hasQrCommand(bytes)).toBe(false);
  });

  it("stays off while the template's Custom QR toggle is off", () => {
    const bytes = buildReceiptBytes(tx, undefined, {
      showCustomQr: false,
      customQrData: "https://koastal.com.au/menu",
    }, printer);
    expect(hasQrCommand(bytes)).toBe(false);
  });
});
