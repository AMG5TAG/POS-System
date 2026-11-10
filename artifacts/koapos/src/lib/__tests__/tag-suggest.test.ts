import { describe, it, expect } from "vitest";
import { suggestTags } from "../tag-suggest";

const tags = [
  { name: "Data", productCount: 6 },
  { name: "Memory", productCount: 3 },
  { name: "Portable", productCount: 3 },
  { name: "Anti-Virus", productCount: 3 },
  { name: "USB", productCount: 1 },
  { name: "A", productCount: 9 },
];

describe("suggestTags", () => {
  it("matches the business's own tags as whole words, case-insensitively, most-used first", () => {
    expect(suggestTags("Biwin UD150 32GB USB Flash Drive · portable memory stick", tags)).toEqual(["Memory", "Portable", "USB"]);
  });
  it("never matches inside a word, and ignores one-letter tags", () => {
    expect(suggestTags("Database server with a fan", tags)).toEqual([]);
  });
  it("handles hyphenated tags and caps the list", () => {
    expect(suggestTags("Norton anti-virus data protection", tags)).toEqual(["Data", "Anti-Virus"]);
    expect(suggestTags("data memory portable usb anti-virus", tags, 2)).toEqual(["Data", "Anti-Virus"]);
  });
});
