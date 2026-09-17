import { describe, it, expect, vi, beforeAll } from "vitest";

/* Table-aware db mock — same shape as transactions-open-price.test.ts. Every
 * pricing check under test runs before any DB write, so `db.transaction`
 * throws a sentinel: a sale that reaches it is one whose totals the server
 * accepted. */
const TX_REACHED = "TX_REACHED";
const rowsByTable: Record<string, unknown[]> = {};

vi.mock("@workspace/db", () => {
  let table: string | null = null;
  const chain: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
    get(_t, k) {
      if (k === "then") {
        const rows = table ? (rowsByTable[table] ?? []) : [];
        return (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
      }
      if (k === "from") return (t: { __name?: string }) => { table = t?.__name ?? null; return chain; };
      if (k === "catch" || k === "finally") return () => chain;
      return () => chain;
    },
  });
  const mkTable = (name: string) =>
    new Proxy({ __name: name } as Record<string, unknown>, {
      get: (t, k) => (k === "__name" ? name : (t[k as string] ??= { __name: name })),
    });
  const db = new Proxy({} as Record<string, unknown>, {
    get(_t, k) {
      if (k === "transaction") return () => Promise.reject(new Error(TX_REACHED));
      return () => { table = null; return chain; };
    },
  });
  return {
    db,
    transactionsTable: mkTable("transactions"),
    customersTable: mkTable("customers"),
    productsTable: mkTable("products"),
    serviceJobsTable: mkTable("serviceJobs"),
    appointmentsTable: mkTable("appointments"),
    loyaltySettingsTable: mkTable("loyaltySettings"),
    merchantsTable: mkTable("merchants"),
    giftCardsTable: mkTable("giftCards"),
    giftCardLedgerTable: mkTable("giftCardLedger"),
    merchantIntegrationsTable: mkTable("merchantIntegrations"),
    digitalCodesTable: mkTable("digitalCodes"),
    productTypesTable: mkTable("productTypes"),
    productSerialsTable: mkTable("productSerials"),
    paymentMethodSurchargesTable: mkTable("paymentMethodSurcharges"),
    quotesTable: mkTable("quotes"),
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  invalidateMerchantStatusCache: () => {},
}));
vi.mock("../services/email", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../services/lowStockAlertService", () => ({ maybeQueueImmediateAlert: vi.fn() }));

type FinalizeSale = typeof import("../routes/transactions")["finalizeSale"];
let finalizeSale: FinalizeSale;

beforeAll(async () => {
  ({ finalizeSale } = await import("../routes/transactions"));
});

/** A catalogue row as the products table returns it — numerics are strings. */
function product(over: Record<string, unknown> = {}) {
  return {
    id: 7, merchantId: 1, name: "Screen assembly", price: "420.00", taxRate: "10",
    costPrice: null, productTypeId: null, tracksSerial: "false", stock: 5,
    ...over,
  };
}

function quote(over: Record<string, unknown> = {}) {
  return {
    id: 55, merchantId: 1, status: "accepted", serviceJobId: 3,
    items: [{ productId: 7, description: "Screen assembly", quantity: 1, unitPrice: 370, taxRate: 10 }],
    ...over,
  };
}

function sale(items: unknown[], total: number, over: Record<string, unknown> = {}) {
  return {
    items, paymentMethod: "eftpos", subtotal: total, taxTotal: 0, total, ...over,
  } as unknown as Parameters<FinalizeSale>[1];
}

const line = (unitPrice: number, quantity = 1) => ({
  productId: 7, productName: "Screen assembly", quantity,
  unitPrice, totalPrice: unitPrice * quantity,
});

/* A repair is quoted at an agreed price that is deliberately not the catalogue
   price. Importing that quote at the till must ring up what was agreed. */
describe("finalizeSale — prices agreed on a quote", () => {
  it("charges the quoted price for a catalogue product", async () => {
    rowsByTable.products = [product()];
    rowsByTable.quotes = [quote()];
    const res = await finalizeSale(1, sale([line(370)], 370, { quoteId: 55 }), []).catch((e: Error) => e);

    expect(res).toBeInstanceOf(Error);
    expect((res as Error).message).toBe(TX_REACHED);
  });

  it("honours the quoted price per unit, not per line", async () => {
    rowsByTable.products = [product()];
    rowsByTable.quotes = [quote()];
    const ok = await finalizeSale(1, sale([line(370, 2)], 740, { quoteId: 55 }), []).catch((e: Error) => e);
    expect((ok as Error).message).toBe(TX_REACHED);
  });

  it("still reprices a line the quote never priced", async () => {
    rowsByTable.products = [product()];
    rowsByTable.quotes = [quote()];
    // 300 is not what was quoted, so the catalogue price stands and the sale
    // the till asked for no longer adds up.
    const res = await finalizeSale(1, sale([line(300)], 300, { quoteId: 55 }), []);
    expect(res).toMatchObject({ ok: false, status: 409 });
  });

  it("reprices when the sale names no quote", async () => {
    rowsByTable.products = [product()];
    rowsByTable.quotes = [quote()];
    const res = await finalizeSale(1, sale([line(370)], 370), []);
    expect(res).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses to price a sale from a quote that was already converted", async () => {
    rowsByTable.products = [product()];
    rowsByTable.quotes = [quote({ status: "converted" })];
    const res = await finalizeSale(1, sale([line(370)], 370, { quoteId: 55 }), []);
    expect(res).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses to price a sale from a declined or expired quote", async () => {
    for (const status of ["declined", "expired"]) {
      rowsByTable.products = [product()];
      rowsByTable.quotes = [quote({ status })];
      const res = await finalizeSale(1, sale([line(370)], 370, { quoteId: 55 }), []);
      expect(res).toMatchObject({ ok: false, status: 409 });
    }
  });

  it("charges a quoted price above the catalogue price too", async () => {
    rowsByTable.products = [product({ price: "120.00" })];
    rowsByTable.quotes = [quote({ items: [{ productId: 7, description: "Screen assembly", quantity: 1, unitPrice: 150, taxRate: 10 }] })];
    const res = await finalizeSale(1, sale([line(150)], 150, { quoteId: 55 }), []).catch((e: Error) => e);
    expect((res as Error).message).toBe(TX_REACHED);
  });

  it("prices only the products the quote actually named", async () => {
    rowsByTable.products = [product({ id: 9, name: "Battery", price: "80.00" }), product()];
    rowsByTable.quotes = [quote()];
    // The quote priced product 7 at 370; product 9 was never on it, so its
    // catalogue price stands and a discounted ask is rejected.
    const res = await finalizeSale(
      1,
      sale([line(370), { productId: 9, productName: "Battery", quantity: 1, unitPrice: 20, totalPrice: 20 }], 390, { quoteId: 55 }),
      [],
    );
    expect(res).toMatchObject({ ok: false, status: 409 });
  });
});
