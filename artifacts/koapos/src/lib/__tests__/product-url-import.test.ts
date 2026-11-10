import { describe, it, expect } from "vitest";
import { parseWarranty, matchByName } from "../product-url-import";

describe("parseWarranty", () => {
  it.each([
    ["12 months", { duration: "12", unit: "months" }],
    ["2 Years Manufacturer Warranty", { duration: "2", unit: "years" }],
    ["1 yr", { duration: "1", unit: "years" }],
    ["1.5 years", { duration: "18", unit: "months" }],
    ["36-month", { duration: "36", unit: "months" }],
  ])("%s", (t, want) => expect(parseWarranty(t)).toEqual(want));
  it("returns null without a length of time", () => {
    expect(parseWarranty("Limited lifetime")).toBeNull();
  });
});

describe("matchByName", () => {
  const list = [{ id: 1, name: "Mice & Keyboards" }, { id: 2, name: "Logitech" }];
  it("ignores case, spacing and & vs and", () => {
    expect(matchByName(list, "mice and  keyboards")?.id).toBe(1);
    expect(matchByName(list, "LOGITECH")?.id).toBe(2);
    expect(matchByName(list, "Logi")).toBeUndefined();
  });
});
