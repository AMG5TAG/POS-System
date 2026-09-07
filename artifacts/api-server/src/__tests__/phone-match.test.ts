import { describe, expect, it } from "vitest";
import { phoneMatchKey, samePhone } from "../lib/phone-match";

describe("phoneMatchKey", () => {
  it("ignores the punctuation people type", () => {
    expect(phoneMatchKey("0400 000 000")).toBe(phoneMatchKey("0400000000"));
    expect(phoneMatchKey("(02) 9333-4444")).toBe(phoneMatchKey("0293334444"));
  });

  it("spans the trunk prefix and the country code", () => {
    expect(phoneMatchKey("+61 400 000 000")).toBe(phoneMatchKey("0400 000 000"));
    expect(phoneMatchKey("0061400000000")).toBe(phoneMatchKey("0400000000"));
  });

  it("refuses to match on too few digits", () => {
    expect(phoneMatchKey("123")).toBe("");
    expect(phoneMatchKey("")).toBe("");
    expect(phoneMatchKey(null)).toBe("");
    expect(phoneMatchKey("n/a")).toBe("");
  });

  it("compares a short number whole rather than padding it", () => {
    expect(phoneMatchKey("933 4444")).toBe("9334444");
  });
});

describe("samePhone", () => {
  it("matches the same number written either way", () => {
    expect(samePhone("+61400123456", "0400 123 456")).toBe(true);
    expect(samePhone("0400123456", "0400123456")).toBe(true);
  });

  it("keeps different numbers apart", () => {
    expect(samePhone("0400123456", "0400123457")).toBe(false);
    // Same last 7 but a different mobile — the 9-digit key catches it.
    expect(samePhone("0400123456", "0411123456")).toBe(false);
  });

  it("never matches on a blank or unusable number", () => {
    expect(samePhone("", "")).toBe(false);
    expect(samePhone("123", "123")).toBe(false);
    expect(samePhone(null, "0400123456")).toBe(false);
  });
});
