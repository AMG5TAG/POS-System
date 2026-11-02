import { describe, it, expect } from "vitest";
import { canDialFromBrowser, numberFromPhoneHref } from "../phone-link-guard";

const WIN_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("canDialFromBrowser", () => {
  it("guards desktop browsers, including a Windows touchscreen", () => {
    expect(canDialFromBrowser({ userAgent: WIN_CHROME, maxTouchPoints: 0 })).toBe(false);
    expect(canDialFromBrowser({ userAgent: WIN_CHROME, maxTouchPoints: 10 })).toBe(false);
    expect(canDialFromBrowser({ userAgent: MAC_CHROME, maxTouchPoints: 0 })).toBe(false);
  });
  it("lets phones and tablets dial", () => {
    expect(canDialFromBrowser({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(true);
    expect(canDialFromBrowser({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(canDialFromBrowser({ userAgent: MAC_CHROME, maxTouchPoints: 5 })).toBe(true); // iPadOS
  });
});

describe("numberFromPhoneHref", () => {
  it("strips the scheme and any body", () => {
    expect(numberFromPhoneHref("tel:+61412345678")).toBe("+61412345678");
    expect(numberFromPhoneHref("sms:+61412345678?body=Hi%20there")).toBe("+61412345678");
    expect(numberFromPhoneHref("TEL:0412%20345%20678")).toBe("0412 345 678");
  });
});
