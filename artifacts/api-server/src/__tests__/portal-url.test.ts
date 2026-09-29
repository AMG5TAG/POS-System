import { describe, it, expect, beforeEach } from "vitest";
import { customerPortalUrl } from "../lib/publicUrl";

/* Portal links are the short /c/<token> form: the token alone identifies the
   customer, so no /b/<username> prefix. The long form still routes, for links
   already sent. */

beforeEach(() => {
  delete process.env.APP_BASE_URL;
  process.env.PUBLIC_DOMAIN = "pos.koastal.com.au";
});

describe("customerPortalUrl", () => {
  it("builds the short /c/ link on the app's domain", () => {
    expect(customerPortalUrl({ username: "koastal" }, "tok-1")).toBe("https://pos.koastal.com.au/c/tok-1");
  });

  it("does not need a username", () => {
    expect(customerPortalUrl({ username: null }, "tok-1")).toBe("https://pos.koastal.com.au/c/tok-1");
  });

  it("uses the merchant's own portal domain when one is set", () => {
    expect(customerPortalUrl({ username: "koastal", portalDomain: "portal.example.com" }, "tok-1"))
      .toBe("https://portal.example.com/c/tok-1");
  });

  it("returns null when the customer has no portal token", () => {
    expect(customerPortalUrl({ username: "koastal" }, null)).toBeNull();
  });
});
