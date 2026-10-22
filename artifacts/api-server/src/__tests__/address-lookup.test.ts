import { describe, it, expect } from "vitest";
import { mapSearch, mapDetail } from "../routes/address-lookup";

/* Shapes captured from the hosted Addressr service on RapidAPI (2026-10). */
describe("address lookup normalisation", () => {
  it("reads the hosted service's bare-array search response", () => {
    const results = mapSearch([
      { sla: "SHOP 1, 200 GEORGE ST, SYDNEY NSW 2000", pid: "GANSW710275906" },
      { sla: "SHOP 1, 317 GEORGE ST, SYDNEY NSW 2000", pid: "GANSW710278995" },
    ]);
    expect(results).toEqual([
      { id: "GANSW710275906", label: "SHOP 1, 200 GEORGE ST, SYDNEY NSW 2000" },
      { id: "GANSW710278995", label: "SHOP 1, 317 GEORGE ST, SYDNEY NSW 2000" },
    ]);
  });

  it("still reads the older HAL search response", () => {
    const results = mapSearch({
      _embedded: { addresses: [{ sla: "1 MAIN RD, TOUKLEY NSW 2263", _links: { self: { href: "/addresses/GANSW1?x=1" } } }] },
    });
    expect(results).toEqual([{ id: "GANSW1", label: "1 MAIN RD, TOUKLEY NSW 2263" }]);
  });

  it("builds the street from a detail with coded street type and a unit", () => {
    const d = mapDetail({
      sla: "SHOP 1, 200 GEORGE ST, SYDNEY NSW 2000",
      smla: ["1/200 GEORGE ST", "SYDNEY NSW 2000"],
      structured: {
        number: { number: 200 },
        flat: { number: 1 },
        street: { name: "GEORGE", type: { code: "STREET", name: "ST" } },
        locality: { name: "SYDNEY" },
        state: { name: "NEW SOUTH WALES", abbreviation: "NSW" },
        postcode: "2000",
      },
    });
    expect(d).toEqual({ street: "1/200 GEORGE ST", city: "SYDNEY", state: "NSW", postcode: "2000" });
  });

  it("falls back to structured parts without smla, never printing an object", () => {
    const d = mapDetail({
      structured: { number: { number: 200 }, flat: { number: 1 }, street: { name: "GEORGE", type: { code: "STREET", name: "ST" } } },
    });
    expect(d.street).toBe("1/200 GEORGE ST");
    expect(mapDetail({ structured: { number: 5, street: { name: "MAIN", type: "RD" } } }).street).toBe("5 MAIN RD");
  });
});
