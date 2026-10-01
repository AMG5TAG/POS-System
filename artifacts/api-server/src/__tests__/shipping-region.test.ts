import { describe, it, expect } from "vitest";
import { auState, isAustralia, checkDeliveryAddress, SHIPPING_ONLY_MESSAGE } from "../lib/shipping-region";

/**
 * lib/shipping-region.ts — the online store delivers within Australia only.
 * Pinned: overseas delivery addresses are refused, Australian ones are
 * normalised (state code, country "Australia"), and an empty address
 * (click & collect) is allowed.
 */

describe("delivery addresses", () => {
  it("refuses an overseas delivery address", () => {
    expect(checkDeliveryAddress({ street: "1 Queen St", city: "Auckland", state: "", postcode: "1010", country: "New Zealand" }))
      .toEqual({ ok: false, error: SHIPPING_ONLY_MESSAGE });
  });

  it("refuses an address with no Australian state or a non-Australian postcode", () => {
    expect(checkDeliveryAddress({ street: "1 Main St", city: "Gosford", state: "California", postcode: "2250" }).ok).toBe(false);
    expect(checkDeliveryAddress({ street: "1 Main St", city: "Gosford", state: "NSW", postcode: "90210-1" }).ok).toBe(false);
  });

  it("accepts and normalises an Australian address", () => {
    expect(checkDeliveryAddress({ street: "1 Main St", city: "Gosford", state: "new south wales", postcode: "2250", country: "AU" }))
      .toEqual({ ok: true, empty: false, state: "NSW", country: "Australia" });
    expect(checkDeliveryAddress({ street: "1 Main St", city: "Gosford", state: "n.s.w.", postcode: " 2250 " }).ok).toBe(true);
  });

  it("allows no address at all (click & collect)", () => {
    expect(checkDeliveryAddress({ street: "", city: "", state: "", postcode: "", country: "Germany" }))
      .toEqual({ ok: true, empty: true, state: null, country: null });
  });

  it("reads states and countries the way people type them", () => {
    expect(auState("Vic")).toBe("VIC");
    expect(auState("Australian Capital Territory")).toBe("ACT");
    expect(auState("Ontario")).toBeNull();
    expect(isAustralia("")).toBe(true);
    expect(isAustralia("Aus")).toBe(true);
    expect(isAustralia("USA")).toBe(false);
  });
});
