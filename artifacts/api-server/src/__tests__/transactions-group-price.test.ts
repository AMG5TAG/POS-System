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
    customerSettingsTable: mkTable("customerSettings"),
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

/**
 * Customer-group prices at the till, and their following the sell price.
 *
 * The till charges a customer in a pricing group their group's price
 * (groupPriceFor). The server used to reprice every line to the sell price,
 * so every Trade sale failed its total check with a 409. It now works the
 * group price out with the till's own function and accepts exactly that —
 * for the sale's own customer, and nothing lower.
 */

const GROUPS = JSON.stringify([{ id: "standard", name: "Standard" }, { id: "trade", name: "Trade" }]);
function product(over: Record<string, unknown> = {}) {
  return {
    id: 7, merchantId: 1, name: "Service", price: "130.00", taxRate: "10", costPrice: "40.00", categoryId: null,
    productTypeId: null, tracksSerial: "false", stock: 5, groupPrices: { trade: 65 }, ...over,
  };
}
const customer = (group: string | null) => ({ id: 3, merchantId: 1, customerGroup: group, totalSpent: "0", loyaltyPoints: 0 });
function sale(unitPrice: number, over: Record<string, unknown> = {}) {
  return {
    items: [{ productId: 7, productName: "Service", quantity: 1, unitPrice, totalPrice: unitPrice }],
    paymentMethod: "eftpos", subtotal: unitPrice, taxTotal: 0, total: unitPrice, customerId: 3, ...over,
  } as unknown as Parameters<FinalizeSale>[1];
}
const reachesTx = async (p: Promise<unknown>) => ((await p.catch((e: Error) => e)) as Error)?.message === TX_REACHED;

describe("finalizeSale — customer group prices", () => {
  it("accepts a Trade customer's stored group price", async () => {
    Object.assign(rowsByTable, { products: [product()], customers: [customer("Trade")], customerSettings: [{ groups: GROUPS, groupPricing: "[]" }] });
    expect(await reachesTx(finalizeSale(1, sale(65), []))).toBe(true);
  });

  it("matches the group by id as well as name", async () => {
    Object.assign(rowsByTable, { products: [product()], customers: [customer("trade")], customerSettings: [{ groups: GROUPS, groupPricing: "[]" }] });
    expect(await reachesTx(finalizeSale(1, sale(65), []))).toBe(true);
  });

  it("accepts a price from the group's rule when none is stored", async () => {
    const rule = [{ groupId: "trade", enabled: true, formula: { basis: "rrp", mode: "discount", percent: 20, capAtRRP: true }, categoryRules: [] }];
    Object.assign(rowsByTable, { products: [product({ groupPrices: null })], customers: [customer("Trade")], customerSettings: [{ groups: GROUPS, groupPricing: JSON.stringify(rule) }] });
    expect(await reachesTx(finalizeSale(1, sale(104), []))).toBe(true);
  });

  it("refuses any other price below the sell price", async () => {
    Object.assign(rowsByTable, { products: [product()], customers: [customer("Trade")], customerSettings: [{ groups: GROUPS, groupPricing: "[]" }] });
    expect(await finalizeSale(1, sale(50), [])).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses the group price for a customer outside the group", async () => {
    Object.assign(rowsByTable, { products: [product()], customers: [customer("Standard")], customerSettings: [{ groups: GROUPS, groupPricing: "[]" }] });
    expect(await finalizeSale(1, sale(65), [])).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses the group price on a sale with no customer", async () => {
    Object.assign(rowsByTable, { products: [product()], customers: [], customerSettings: [{ groups: GROUPS, groupPricing: "[]" }] });
    expect(await finalizeSale(1, sale(65, { customerId: undefined }), [])).toMatchObject({ ok: false, status: 409 });
  });
});
