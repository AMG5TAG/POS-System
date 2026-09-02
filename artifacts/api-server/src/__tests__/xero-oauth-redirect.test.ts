import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";

// The db module is imported at the top of routes/xero.ts. The callback branches
// under test (missing code / non-numeric state) return BEFORE any db access, so
// a no-op proxy is enough to let the router import cleanly.
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
  requireAuth: (req: any, _res: any, next: any) => { req.session = { merchantId: 1 }; next(); },
  invalidateMerchantStatusCache: () => {},
}));

// The canonical wizard route every OAuth redirect must land on. Legacy aliases
// (/management/xero, /management/integrations) are query-stripping client
// redirects, so landing there loses the ?error=/?success= and looks like a
// silent page refresh — the exact bug this guards against.
const WIZARD_PATH = "/management/settings-integrations/integrations/xero";

let app: express.Express;

beforeAll(async () => {
  const { default: xeroRouter } = await import("../routes/xero");
  app = express();
  app.use(express.json());
  app.use("/api", xeroRouter);
});

describe("GET /api/xero/auth/callback — redirects land on the wizard with a readable code", () => {
  it("redirects to the wizard with error=oauth_denied when Xero returns an error", async () => {
    const res = await request(app).get("/api/xero/auth/callback?error=access_denied");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${WIZARD_PATH}?error=oauth_denied`);
  });

  it("redirects to the wizard with error=oauth_denied when no code is present", async () => {
    const res = await request(app).get("/api/xero/auth/callback");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${WIZARD_PATH}?error=oauth_denied`);
  });

  it("redirects to the wizard with error=invalid_state when state is not a merchant id", async () => {
    const res = await request(app).get("/api/xero/auth/callback?code=abc&state=not-a-number");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${WIZARD_PATH}?error=invalid_state`);
  });

  it("never redirects to a legacy query-stripping alias", async () => {
    const res = await request(app).get("/api/xero/auth/callback?error=access_denied");
    expect(res.headers.location).not.toMatch(/^\/management\/xero(\?|$)/);
    expect(res.headers.location).not.toMatch(/^\/management\/integrations(\?|$)/);
  });
});

describe("GET /api/xero/auth/start — not-configured redirect", () => {
  it("redirects to the wizard with error=not_configured when platform creds are unset", async () => {
    const prevId = process.env.XERO_CLIENT_ID;
    const prevSecret = process.env.XERO_CLIENT_SECRET;
    delete process.env.XERO_CLIENT_ID;
    delete process.env.XERO_CLIENT_SECRET;
    try {
      const res = await request(app).get("/api/xero/auth/start");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${WIZARD_PATH}?error=not_configured`);
    } finally {
      if (prevId !== undefined) process.env.XERO_CLIENT_ID = prevId;
      if (prevSecret !== undefined) process.env.XERO_CLIENT_SECRET = prevSecret;
    }
  });
});
