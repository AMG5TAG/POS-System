import { describe, it, expect } from "vitest";
import { CreateParkedSaleBody } from "@workspace/api-zod";

/* A parked cart has to come back the way it was parked. The request validator
   strips anything the spec does not declare, so a field the POS sends but the
   schema omits is dropped in silence — which is exactly how a discounted, hand-
   priced or quote-imported line came back at catalogue price. */
describe("parked sale request contract", () => {
  it("keeps what a line was actually priced at", () => {
    const parsed = CreateParkedSaleBody.parse({
      items: [{
        productId: 7, name: "Screen assembly", quantity: 1, price: 370,
        itemDiscount: 15, customPrice: 370, itemNote: "Cracked glass only",
      }],
      total: 355,
    });

    expect(parsed.items[0]).toMatchObject({
      itemDiscount: 15,
      customPrice: 370,
      itemNote: "Cracked glass only",
    });
  });

  it("keeps what the cart was built from", () => {
    const parsed = CreateParkedSaleBody.parse({
      items: [{ productId: 7, name: "Screen assembly", quantity: 1, price: 370 }],
      total: 370,
      quoteId: 55,
      serviceJobId: 3,
    });

    // Without these the retrieved sale is repriced from the catalogue when it
    // is recorded, and leaves its service job open once it is paid.
    expect(parsed.quoteId).toBe(55);
    expect(parsed.serviceJobId).toBe(3);
  });

  it("still accepts a plain cart that was built from neither", () => {
    const parsed = CreateParkedSaleBody.parse({
      items: [{ productId: 1, name: "Flat white", quantity: 2, price: 4.5 }],
      total: 9,
    });
    expect(parsed.quoteId).toBeUndefined();
    expect(parsed.serviceJobId).toBeUndefined();
  });
});
