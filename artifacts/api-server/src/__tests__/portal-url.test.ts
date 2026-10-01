import { describe, it, expect, beforeEach } from "vitest";
import { customerPortalUrl } from "../lib/publicUrl";

/* A customer's account link is /c/<token> in the online shop, which replaced
   the customer portal: it signs them into their shop account. It no longer
   points at the POS domain or a custom portal domain — links already sent
   there forward to the shop. */

beforeEach(() => {
  delete process.env.SITE_DOMAIN;
  process.env.PUBLIC_DOMAIN = "pos.koastal.com.au";
});

describe("customerPortalUrl", () => {
  it("builds /c/<token> under the shop", () => {
    expect(customerPortalUrl({ username: "koastal" }, "tok-1")).toBe("https://koastal.com.au/shop/c/tok-1");
  });

  it("does not need a merchant", () => {
    expect(customerPortalUrl(null, "tok-1")).toBe("https://koastal.com.au/shop/c/tok-1");
  });

  it("ignores a custom portal domain — the account lives in the shop", () => {
    expect(customerPortalUrl({ username: "koastal", portalDomain: "portal.example.com" }, "tok-1"))
      .toBe("https://koastal.com.au/shop/c/tok-1");
  });

  it("follows SITE_DOMAIN", () => {
    process.env.SITE_DOMAIN = "example.com.au";
    expect(customerPortalUrl(null, "tok-1")).toBe("https://example.com.au/shop/c/tok-1");
  });

  it("returns null when the customer has no portal token", () => {
    expect(customerPortalUrl({ username: "koastal" }, null)).toBeNull();
  });
});
