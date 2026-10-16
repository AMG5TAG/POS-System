import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";

// The db mock returns no rows, so Xero reads as not connected.
vi.mock("@workspace/db", () => {
  const chain: any = new Proxy({} as any, {
    get(_t, k) {
      if (k === "then") return (res: any) => Promise.resolve([]).then(res);
      if (k === "catch") return () => chain;
      if (k === "finally") return () => chain;
      return () => chain;
    },
  });
  const tableProxy = new Proxy({} as any, { get: () => tableProxy });
  return {
    db: new Proxy({} as any, { get: () => () => chain }),
    merchantIntegrationsTable: tableProxy,
    transactionsTable: tableProxy,
    customersTable: tableProxy,
    suppliersTable: tableProxy,
    purchaseOrdersTable: tableProxy,
    customerNotesTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.session = { merchantId: 1, staffRole: "owner" }; next(); },
  invalidateMerchantStatusCache: () => {},
}));

// The POS treats ANY 401 as "your session expired" and signs the user out
// (setOnUnauthorized in koapos App.tsx). Opening the Xero page while Xero was
// not connected — or its token had lapsed — therefore logged the owner out of
// the POS. A Xero-side problem must be a 409, never a 401.
let app: express.Express;

beforeAll(async () => {
  const { default: xeroRouter } = await import("../routes/xero");
  app = express();
  app.use(express.json());
  app.use("/api", xeroRouter);
});

describe("Xero 'not connected' never answers 401", () => {
  it.each([
    ["get", "/api/xero/tenants"],
    ["get", "/api/xero/accounts"],
    ["post", "/api/xero/sync/contacts"],
    ["post", "/api/xero/sync/transactions"],
    ["post", "/api/xero/sync/purchase-orders"],
    ["post", "/api/xero/sync-sale"],
  ] as const)("%s %s → 409 xero_not_connected", async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("xero_not_connected");
  });
});
