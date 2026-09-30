import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { audienceWhere, isKnownAudience } from "../lib/campaign-audience";

/**
 * Campaign audiences (lib/campaign-audience.ts). Pinned: a campaign for one
 * customer can only ever reach that customer — the page saves "specific",
 * which the send routes once didn't recognise and sent to everyone — an
 * unknown audience is refused rather than widened, and every audience is
 * limited to customers who opted in to marketing.
 */

const render = (w: ReturnType<typeof audienceWhere>) => new PgDialect().sqlToQuery(w!);

describe("campaign audiences", () => {
  it("narrows a specific-customer campaign to that customer", () => {
    for (const a of ["specific", "single"]) {
      const q = render(audienceWhere(1, "email", a, 42));
      expect(q.params).toContain(42);
    }
  });

  it("sends a specific-customer campaign with no customer chosen to no one", () => {
    expect(render(audienceWhere(1, "sms", "specific", null)).sql).toBe("false");
  });

  it("refuses an audience it doesn't know instead of sending to everyone", () => {
    expect(audienceWhere(1, "email", "vip", null)).toBeNull();
    expect(isKnownAudience("vip")).toBe(false);
  });

  it("limits every sending audience to opted-in customers with the channel's contact", () => {
    for (const a of ["all", "loyalty", "new", "inactive", "layby", "high_value", "no_purchase_30d"]) {
      const email = render(audienceWhere(1, "email", a, null));
      expect(email.sql).toContain('"agreed_to_marketing"');
      expect(email.sql).toContain('"email"');
      const sms = render(audienceWhere(1, "sms", a, null));
      expect(sms.sql).toContain('"phone"');
    }
  });

  it("filters each segment rather than returning the base list", () => {
    const base = render(audienceWhere(1, "email", "all", null)).sql;
    for (const a of ["loyalty", "new", "inactive", "layby", "high_value"]) {
      expect(render(audienceWhere(1, "email", a, null)).sql).not.toBe(base);
    }
  });
});
