import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { shopListable, shopVisible } from "../lib/shop-visibility";

/**
 * "Hide out-of-stock items" (Management › Online Store). Pinned: with the
 * option off, listings are exactly what the shop shows; with it on, they also
 * require stock — where a type that doesn't track stock (services) and a
 * product not tracking inventory always count as in stock.
 */

const render = (w: Parameters<PgDialect["sqlToQuery"]>[0]) => new PgDialect().sqlToQuery(w).sql;

describe("shop listings and out-of-stock products", () => {
  it("lists exactly the visible products while the option is off", () => {
    expect(render(shopListable(1, false))).toBe(render(shopVisible(1)));
  });

  it("requires stock while the option is on, keeping untracked products", () => {
    const q = render(shopListable(1, true));
    expect(q).toContain('"stock_quantity" > 0');
    expect(q).toContain(`"track_inventory" <> 'true'`);
    expect(q).toContain("pt.track_stock = false");
  });
});
