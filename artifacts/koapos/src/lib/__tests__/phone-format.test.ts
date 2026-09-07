import { describe, it, expect } from "vitest";
import { isPhoneField } from "../phone-format";

/**
 * Which fields the base `Input` rewrites on blur.
 *
 * Most phone fields in this app are a plain `<Input>` with no `name` and no
 * `type` — the placeholder ("0400 000 000") is the only thing identifying them —
 * so detection has to lean on it. The tests that earn their keep are therefore
 * the negative ones: a search box whose placeholder merely *mentions* the word
 * phone must never have its query rewritten mid-lookup.
 */

describe("isPhoneField", () => {
  it("recognises an explicit phone field", () => {
    expect(isPhoneField("tel")).toBe(true);
    expect(isPhoneField("text", { inputMode: "tel" })).toBe(true);
    expect(isPhoneField("text", { autoComplete: "tel-national" })).toBe(true);
    expect(isPhoneField(undefined, { name: "phone" })).toBe(true);
    expect(isPhoneField(undefined, { name: "customer-mobile" })).toBe(true);
    expect(isPhoneField(undefined, { id: "from-number", name: "phoneNumber" })).toBe(true);
  });

  it("recognises a field whose placeholder is an example number", () => {
    for (const placeholder of [
      "0400 000 000",
      "04XX XXX XXX",
      "+61 400 000 000",
      "+61412345678",
      "(02) 0000 0000",
    ]) {
      expect(isPhoneField(undefined, { placeholder }), placeholder).toBe(true);
    }
  });

  it("does not touch a search box that mentions phones", () => {
    expect(isPhoneField(undefined, {
      placeholder: "Search by name, email or phone...",
    })).toBe(false);
  });

  it("does not touch fields that are something else entirely", () => {
    expect(isPhoneField("email", { name: "email" })).toBe(false);
    expect(isPhoneField("number", { placeholder: "0.00" })).toBe(false);
    expect(isPhoneField("date")).toBe(false);
    expect(isPhoneField("password")).toBe(false);
    // A short numeric placeholder is a postcode or a quantity, not a number.
    expect(isPhoneField(undefined, { placeholder: "2000" })).toBe(false);
    expect(isPhoneField(undefined, { name: "postcode" })).toBe(false);
    // A field that says what it is beats a placeholder that merely looks like a
    // number: an ABN, an IMEI and a BSB are all digits and none are dialable.
    expect(isPhoneField(undefined, { name: "abn", placeholder: "12 345 678 901" })).toBe(false);
    expect(isPhoneField(undefined, { name: "imei", placeholder: "123456789012345" })).toBe(false);
    expect(isPhoneField(undefined, { id: "bsb", placeholder: "062 000" })).toBe(false);
  });

  it("is not fooled by a name that merely contains the letters", () => {
    // "telegramHandle" and "iPhone 13" are not phone numbers.
    expect(isPhoneField(undefined, { name: "telegramHandle" })).toBe(false);
    expect(isPhoneField(undefined, { name: "deviceModel", placeholder: "iPhone 13" })).toBe(false);
  });

  it("has no opinion about a plain unlabelled text box", () => {
    expect(isPhoneField(undefined, {})).toBe(false);
    expect(isPhoneField("text", { placeholder: "Notes" })).toBe(false);
  });
});
