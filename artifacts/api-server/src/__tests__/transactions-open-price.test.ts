import { describe, it, expect, vi, beforeAll } from "vitest";

/* Table-aware db mock: `.from(table)` records which table the current select is
 * reading so the awaited result can differ per table. The pricing checks under
 * test all run before any DB write, so `db.transaction` throws a sentinel — a
 * sale that reaches it is one whose totals the server accepted. */
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
    id: 1, merchantId: 1, name: "Bench repair", price: "0.00", taxRate: "10",
    costPrice: null, productTypeId: null, tracksSerial: "false", stock: 99,
    ...over,
  };
}

function sale(items: unknown[], total: number) {
  return {
    items, paymentMethod: "cash", subtotal: total, taxTotal: 0, total,
  } as unknown as Parameters<FinalizeSale>[1];
}

/* A $0.00 catalogue price is the merchant's "priced at the till" convention:
   the POS refuses to add such a product until the cashier enters a price, so
   the server must charge what they entered rather than repricing it to $0. */
describe("finalizeSale — open-price (custom pricing) products", () => {
  it("charges the till-entered price instead of rejecting the sale", async () => {
    rowsByTable.products = [product({ price: "0.00" })];
    const res = await finalizeSale(
      1,
      sale([{ productId: 1, productName: "Bench repair", quantity: 1, unitPrice: 85, totalPrice: 85 }], 85),
      [],
    ).catch((e: Error) => e);

    // Reaching the DB write means the totals were accepted.
    expect(res).toBeInstanceOf(Error);
    expect((res as Error).message).toBe(TX_REACHED);
  });

  it("honours quantity on an open-price line", async () => {
    rowsByTable.products = [product({ price: "0.00" })];
    const ok = await finalizeSale(
      1,
      sale([{ productId: 1, productName: "Bench repair", quantity: 3, unitPrice: 20, totalPrice: 60 }], 60),
      [],
    ).catch((e: Error) => e);
    expect((ok as Error).message).toBe(TX_REACHED);

    rowsByTable.products = [product({ price: "0.00" })];
    const bad = await finalizeSale(
      1,
      sale([{ productId: 1, productName: "Bench repair", quantity: 3, unitPrice: 20, totalPrice: 60 }], 20),
      [],
    );
    expect(bad).toMatchObject({ ok: false, status: 409 });
  });

  it("still rejects a client price on a product that has a real price", async () => {
    rowsByTable.products = [product({ price: "49.95" })];
    const res = await finalizeSale(
      1,
      sale([{ productId: 1, productName: "Bench repair", quantity: 1, unitPrice: 1, totalPrice: 1 }], 1),
      [],
    );
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect((res as { error: string }).error).toMatch(/does not match current product pricing/i);
  });

  it("charges the catalogue price, not the client's, when both are non-zero", async () => {
    rowsByTable.products = [product({ price: "49.95" })];
    const res = await finalizeSale(
      1,
      sale([{ productId: 1, productName: "Bench repair", quantity: 1, unitPrice: 49.95, totalPrice: 49.95 }], 49.95),
      [],
    ).catch((e: Error) => e);
    expect((res as Error).message).toBe(TX_REACHED);
  });
});
