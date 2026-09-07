import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

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
    merchantAutoSyncSettingsTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  invalidateMerchantStatusCache: () => {},
}));

const isAccountConnected = vi.fn<(merchantId: number, provider: string) => Promise<boolean>>();

vi.mock("../services/accountSync", () => ({
  isSyncProvider: (v: unknown) => v === "google_contacts" || v === "microsoft_contacts" || v === "apple_icloud",
  isAccountConnected: (m: number, p: string) => isAccountConnected(m, p),
  syncProviderLabel: (p: string) => ({ microsoft_contacts: "Microsoft Account", apple_icloud: "Apple iCloud" }[p] ?? p),
}));

let app: express.Express;

beforeAll(async () => {
  const { default: autoSyncRouter } = await import("../routes/auto-sync-settings");

  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((_req, _res, next) => { (_req as any).session.merchantId = 1; next(); });
  app.use("/api", autoSyncRouter);
});

beforeEach(() => { isAccountConnected.mockReset(); });

describe("PUT /api/integrations/auto-sync — target account must be connected", () => {
  it("rejects a schedule aimed at an account that isn't connected", async () => {
    // The merchant moved to Apple, but the saved target is still Microsoft.
    isAccountConnected.mockImplementation(async (_m, p) => p === "apple_icloud");

    const res = await request(app).put("/api/integrations/auto-sync").send({
      contacts: { provider: "microsoft_contacts", frequency: "instant" },
      calendar: { provider: "", frequency: "disabled" },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Microsoft Account");
  });

  it("accepts a schedule aimed at a connected account", async () => {
    isAccountConnected.mockResolvedValue(true);

    const res = await request(app).put("/api/integrations/auto-sync").send({
      contacts: { provider: "apple_icloud", frequency: "instant", includeNotes: true },
      calendar: { provider: "apple_icloud", frequency: "24h" },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("does not require a connected account when the schedule is off", async () => {
    isAccountConnected.mockResolvedValue(false);

    const res = await request(app).put("/api/integrations/auto-sync").send({
      contacts: { provider: "microsoft_contacts", frequency: "disabled" },
      calendar: { provider: "", frequency: "disabled" },
    });

    expect(res.status).toBe(200);
    expect(isAccountConnected).not.toHaveBeenCalled();
  });

  it("rejects an unknown frequency", async () => {
    const res = await request(app).put("/api/integrations/auto-sync").send({
      contacts: { provider: "apple_icloud", frequency: "hourly" },
      calendar: { provider: "", frequency: "disabled" },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("frequency");
  });
});
