import { describe, it, expect } from "vitest";
import { capitalizeFirst, capitalizeName, capitalizeImportedName } from "../auto-capitalize";

/**
 * Name capitalisation.
 *
 * The app already capitalised the first character of any text input, which is
 * right for prose and wrong for a name: it leaves "mary jane" as "Mary jane".
 * Customer name fields opt into per-word capitalisation instead.
 *
 * The rule that matters most here is what it *doesn't* touch. Capitalising a
 * word means uppercasing its first letter and nothing else — lowercasing the
 * remainder would quietly turn "McDonald" into "Mcdonald" every time a staff
 * member retyped it, which is worse than the problem being solved.
 */
describe("capitalizeName", () => {
  it("capitalises every word, not just the first", () => {
    expect(capitalizeName("mary jane")).toBe("Mary Jane");
    expect(capitalizeName("sarah")).toBe("Sarah");
  });

  it("treats hyphens and apostrophes as word breaks", () => {
    expect(capitalizeName("mary-jane")).toBe("Mary-Jane");
    expect(capitalizeName("o'brien")).toBe("O'Brien");
    expect(capitalizeName("d'angelo smith-jones")).toBe("D'Angelo Smith-Jones");
    // A curly apostrophe is what a phone keyboard actually produces.
    expect(capitalizeName("o’brien")).toBe("O’Brien");
  });

  it("leaves casing inside a word exactly as typed", () => {
    expect(capitalizeName("McDonald")).toBe("McDonald");
    expect(capitalizeName("MacLeod")).toBe("MacLeod");
    expect(capitalizeName("DeVries")).toBe("DeVries");
    expect(capitalizeName("JAMES")).toBe("JAMES");
  });

  it("never changes the length of the value, so the caret can't drift", () => {
    for (const v of ["mary jane", "o'brien", "straße", "  padded  ", "élodie", ""]) {
      expect(capitalizeName(v).length).toBe(v.length);
    }
  });

  it("handles accented and non-latin first letters", () => {
    expect(capitalizeName("élodie dupont")).toBe("Élodie Dupont");
    // "ß" uppercases to "SS" — growing the value would shift the caret, so the
    // word is left alone rather than half-transformed.
    expect(capitalizeName("straße")).toBe("Straße");
  });

  it("copes with the half-typed states a field passes through", () => {
    expect(capitalizeName("")).toBe("");
    expect(capitalizeName(" ")).toBe(" ");
    expect(capitalizeName("j")).toBe("J");
    expect(capitalizeName("mary ")).toBe("Mary ");
    expect(capitalizeName("mary  jane")).toBe("Mary  Jane");
  });

  it("still refuses to touch a value that looks like a URL or email", () => {
    expect(capitalizeName("jane@example.com")).toBe("jane@example.com");
    expect(capitalizeName("www.example.com")).toBe("www.example.com");
  });

  it("differs from capitalizeFirst only past the first word", () => {
    expect(capitalizeFirst("mary jane")).toBe("Mary jane");
    expect(capitalizeName("mary jane")).toBe("Mary Jane");
  });
});

/**
 * The import variant.
 *
 * Typed entry never lowercases anything: someone holding shift meant it. A CSV
 * carries no such intent, and legacy systems export "JANE SMITH" constantly, so
 * the import adds exactly one rule — a fully-uppercase word is title-cased.
 * Everything mixed-case is still left alone, which is what stops the import
 * flattening "McDonald" on its way through.
 */
describe("capitalizeImportedName", () => {
  it("title-cases the all-caps names legacy exports produce", () => {
    expect(capitalizeImportedName("JANE SMITH")).toBe("Jane Smith");
    expect(capitalizeImportedName("O'BRIEN")).toBe("O'Brien");
    expect(capitalizeImportedName("MARY-JANE")).toBe("Mary-Jane");
  });

  it("still fixes a lowercase spreadsheet the same way typing would", () => {
    expect(capitalizeImportedName("jane smith")).toBe("Jane Smith");
    expect(capitalizeImportedName("o'brien")).toBe("O'Brien");
  });

  it("leaves a deliberately mixed-case name completely alone", () => {
    expect(capitalizeImportedName("McDonald")).toBe("McDonald");
    expect(capitalizeImportedName("MacLeod")).toBe("MacLeod");
    expect(capitalizeImportedName("DeVries")).toBe("DeVries");
    // Half-shouted, but still mixed — not ours to reinterpret.
    expect(capitalizeImportedName("McDONALD")).toBe("McDONALD");
  });

  it("differs from typed entry only on fully-uppercase words", () => {
    expect(capitalizeName("JANE SMITH")).toBe("JANE SMITH");
    expect(capitalizeImportedName("JANE SMITH")).toBe("Jane Smith");
  });

  it("passes through the values a CSV column throws at it", () => {
    expect(capitalizeImportedName("")).toBe("");
    expect(capitalizeImportedName("   ")).toBe("   ");
    expect(capitalizeImportedName("123")).toBe("123");
    expect(capitalizeImportedName("jane@example.com")).toBe("jane@example.com");
    expect(capitalizeImportedName("ÉLODIE DUPONT")).toBe("Élodie Dupont");
  });
});
