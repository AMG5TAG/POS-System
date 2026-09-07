import { describe, it, expect } from "vitest";
import {
  normalisePhone,
  phoneCountry,
  phoneExample,
  resolvePhoneCountry,
  PHONE_COUNTRIES,
  FALLBACK_PHONE_COUNTRY,
} from "@workspace/phone-shared";

/**
 * Storing phone numbers in E.164.
 *
 * The tests that matter most here are the ones asserting a value comes back
 * *unchanged*. A number that keeps the shape the operator typed is a cosmetic
 * miss; a number this code mangles is a customer the shop can no longer reach,
 * and nothing in the UI would show that it happened.
 */

const AU = phoneCountry("AU")!;
const US = phoneCountry("US")!;
const NZ = phoneCountry("NZ")!;
const IT = phoneCountry("IT")!;

describe("normalisePhone — the everyday case", () => {
  it("appends the country code to a number typed with a trunk prefix", () => {
    expect(normalisePhone("0412345678", AU)).toBe("+61412345678");
    expect(normalisePhone("04", AU)).toBe("04"); // too short to be a number
  });

  it("ignores the spaces and brackets people type", () => {
    expect(normalisePhone("0412 345 678", AU)).toBe("+61412345678");
    expect(normalisePhone("(02) 9333-4444", AU)).toBe("+61293334444");
    expect(normalisePhone("02 9333 4444", AU)).toBe("+61293334444");
  });

  it("handles a national number with no trunk prefix", () => {
    // 13/1300/1800 service numbers are dialled without a leading 0.
    expect(normalisePhone("1300 123 456", AU)).toBe("+611300123456");
    expect(normalisePhone("131 234", AU)).toBe("+61131234");
    // The NANP has no trunk prefix at all.
    expect(normalisePhone("(415) 555-1234", US)).toBe("+14155551234");
  });
});

describe("normalisePhone — numbers that already say what they are", () => {
  it("leaves an international number alone but tidies its formatting", () => {
    expect(normalisePhone("+61 412 345 678", AU)).toBe("+61412345678");
    expect(normalisePhone("+64 21 555 1234", AU)).toBe("+64215551234");
    expect(normalisePhone("+1 (415) 555-1234", AU)).toBe("+14155551234");
  });

  it("drops the parenthesised trunk digit in +61 (0) 412 …", () => {
    expect(normalisePhone("+61 (0) 412 345 678", AU)).toBe("+61412345678");
  });

  it("reads an international dialling prefix", () => {
    expect(normalisePhone("0061 412 345 678", AU)).toBe("+61412345678");
    expect(normalisePhone("0064 21 555 1234", AU)).toBe("+64215551234");
    expect(normalisePhone("0011 64 21 555 1234", AU)).toBe("+64215551234"); // AU dials out on 0011
    expect(normalisePhone("011 61 412 345 678", US)).toBe("+61412345678"); // NANP dials out on 011
  });

  it("does not double up a country code typed without the plus", () => {
    expect(normalisePhone("61412345678", AU)).toBe("+61412345678");
    expect(normalisePhone("14155551234", US)).toBe("+14155551234");
  });
});

describe("normalisePhone — values it must not touch", () => {
  it("leaves anything with words in it exactly as typed", () => {
    // An extension is the common one, and half-converting it would be worse
    // than leaving it: "+61293334444 ext 12" reads as one impossible number.
    expect(normalisePhone("02 9333 4444 ext 12", AU)).toBe("02 9333 4444 ext 12");
    expect(normalisePhone("ask for Dave", AU)).toBe("ask for Dave");
    expect(normalisePhone("N/A", AU)).toBe("N/A");
    expect(normalisePhone("mob 0412 345 678", AU)).toBe("mob 0412 345 678");
  });

  it("leaves too little or too much to be a phone number", () => {
    expect(normalisePhone("123", AU)).toBe("123");
    expect(normalisePhone("1234567890123456789", AU)).toBe("1234567890123456789");
  });

  it("passes empty values straight through", () => {
    expect(normalisePhone("", AU)).toBe("");
    expect(normalisePhone(null, AU)).toBe("");
    expect(normalisePhone(undefined, AU)).toBe("");
    expect(normalisePhone("   ", AU)).toBe("");
  });

  it("leaves everything alone when the country is unknown", () => {
    // Better an un-prefixed number than one carrying a made-up country code.
    expect(normalisePhone("0412345678", "ZZ")).toBe("0412345678");
    expect(normalisePhone("0412345678", null)).toBe("0412345678");
  });

  it("is idempotent — saving twice can't prefix twice", () => {
    const once = normalisePhone("0412 345 678", AU);
    expect(normalisePhone(once, AU)).toBe(once);
    expect(normalisePhone(normalisePhone(once, AU), AU)).toBe(once);
  });
});

describe("normalisePhone — country rules that are not Australia's", () => {
  it("keeps the leading zero for Italy, which has no trunk prefix", () => {
    expect(normalisePhone("06 6982 1234", IT)).toBe("+390669821234");
  });

  it("strips the trunk prefix for New Zealand", () => {
    expect(normalisePhone("021 555 1234", NZ)).toBe("+64215551234");
  });

  it("every listed country round-trips its own example", () => {
    for (const c of PHONE_COUNTRIES) {
      const { typed, stored } = phoneExample(c);
      expect(stored, `${c.code} example`).toBe(`+${c.dial}${typed.slice(c.trunk.length)}`);
      // …and running the result back through changes nothing.
      expect(normalisePhone(stored, c), `${c.code} idempotent`).toBe(stored);
    }
  });
});

describe("resolvePhoneCountry", () => {
  it("uses the merchant's setting when they have made one", () => {
    expect(resolvePhoneCountry("NZ").code).toBe("NZ");
    expect(resolvePhoneCountry("gb").code).toBe("GB");
  });

  it("defaults every other merchant to Australia", () => {
    // Not the merchant's business country: the default is the same +61 for
    // everyone until they choose otherwise, so what the settings screen shows is
    // what every till does.
    expect(FALLBACK_PHONE_COUNTRY).toBe("AU");
    for (const unset of ["", null, undefined, "   "]) {
      expect(resolvePhoneCountry(unset).code, String(unset)).toBe("AU");
    }
  });

  it("defaults rather than guessing when the stored code is unknown", () => {
    expect(resolvePhoneCountry("ZZ").code).toBe("AU");
    expect(resolvePhoneCountry("Australia").code).toBe("AU");
  });
});
