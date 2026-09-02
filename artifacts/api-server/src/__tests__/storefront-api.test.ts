import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { createHash } from "crypto";
import {
  API_ENDPOINTS, API_SCOPES, DEFAULT_SCOPES, buildConnectionManifest, parseScopes,
} from "../lib/storefront-api";

/**
 * The Storefront Data API — the read-only door a merchant opens onto their own
 * data so a website (or the AI building it) can read the catalogue, and
 * optionally customers and sales.
 *
 * Two things are worth pinning hardest: that a key can only read what it was
 * granted, and that the connection brief the merchant hands to an AI describes
 * the API that actually exists. Everything else follows from those.
 */

/* Rows the mocked `db` hands back to SELECTs, in order. Writes (the middleware's
   usage counter) resolve to [] without consuming the queue, so a test's rows
   line up with its reads regardless of when that write lands. */
const h = vi.hoisted(() => ({ rows: [] as unknown[][] }));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (consume: boolean): any =>
    new Proxy({} as any, {
      get(_t, k) {
        const result = () => Promise.resolve(consume ? (h.rows.shift() ?? []) : []);
        if (k === "then")    return (res: any, rej: any) => result().then(res, rej);
        if (k === "catch")   return (rej: any) => result().catch(rej);
        if (k === "finally") return (f: any) => result().finally(f);
        return () => chain(consume);
      },
    });
  const db = new Proxy({} as any, { get: (_t, op) => () => chain(op === "select") });
  return { ...actual, db };
});

let app: express.Express;

const KEY = "koa_live_test-key";
const keyRow = (over: Record<string, unknown> = {}) => ({
  id: 1, merchantId: 7, name: "Test", keyPrefix: "koa_live_test",
  keyHash: createHash("sha256").update(KEY).digest("hex"),
  scopes: "products:read,inventory:read",
  lastUsedAt: null, requestCount: 0, expiresAt: null, revokedAt: null, createdAt: new Date(),
  ...over,
});

const auth = (req: request.Test) => req.set("Authorization", `Bearer ${KEY}`);

beforeAll(async () => {
  process.env.PUBLIC_DOMAIN = "koapos.com.au";
  const { default: storefrontRouter } = await import("../routes/storefront-api");
  app = express();
  app.use(express.json());
  app.use("/api", storefrontRouter);
});

beforeEach(() => { h.rows = []; });

/* ─── The brief cannot promise an API that does not exist ─────────────────── */

describe("the described API and the implemented API are the same API", () => {
  /** Paths Express has registered on the router, normalised to the brief's form. */
  const registeredPaths = async (): Promise<string[]> => {
    const { default: router } = await import("../routes/storefront-api");
    const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }).stack;
    return stack
      .filter((l) => l.route && l.route.methods.get)
      .map((l) => l.route!.path.replace("/storefront/v1", ""))
      .filter((p) => !p.includes("*"));
  };

  it("implements every endpoint the merchant's brief documents", async () => {
    const registered = await registeredPaths();
    for (const e of API_ENDPOINTS) expect(registered, `missing route for ${e.path}`).toContain(e.path);
  });

  it("documents every endpoint it implements", async () => {
    const documented = API_ENDPOINTS.map((e) => e.path);
    for (const path of await registeredPaths()) {
      expect(documented, `${path} is served but absent from the brief`).toContain(path);
    }
  });

  it("guards every endpoint with a scope, except the one that reports the scopes", () => {
    for (const e of API_ENDPOINTS) {
      if (e.path === "/store") expect(e.scope).toBeNull();
      else expect(API_SCOPES.map((s) => s.id), e.path).toContain(e.scope);
    }
  });
});

/* ─── Authentication ─────────────────────────────────────────────────────── */

describe("authentication", () => {
  it("refuses a request with no key, and says how to send one", async () => {
    const res = await request(app).get("/api/storefront/v1/store");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing_key");
    expect(res.headers["www-authenticate"]).toMatch(/Bearer/);
  });

  it("refuses an unknown key", async () => {
    h.rows = [[]];
    const res = await auth(request(app).get("/api/storefront/v1/store"));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_key");
  });

  // A caller must not be able to tell "revoked" from "never existed" — that
  // difference is a hint worth having if you are guessing keys.
  it("refuses a revoked key indistinguishably from an unknown one", async () => {
    h.rows = [[keyRow({ revokedAt: new Date() })]];
    const res = await auth(request(app).get("/api/storefront/v1/store"));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_key");
  });

  it("refuses an expired key", async () => {
    h.rows = [[keyRow({ expiresAt: new Date(Date.now() - 1000) })]];
    const res = await auth(request(app).get("/api/storefront/v1/store"));
    expect(res.status).toBe(401);
  });

  it("accepts a key sent as X-API-Key", async () => {
    h.rows = [[keyRow()], [{ businessName: "Koastal", username: "koastal" }]];
    const res = await request(app).get("/api/storefront/v1/store").set("X-API-Key", KEY);
    expect(res.status).toBe(200);
  });

  // The key belongs in a header. A query string ends up in access logs, browser
  // history and Referer headers.
  it("does not accept a key in the query string", async () => {
    const res = await request(app).get(`/api/storefront/v1/store?api_key=${KEY}`);
    expect(res.status).toBe(401);
  });
});

/* ─── Scopes ─────────────────────────────────────────────────────────────── */

describe("scopes", () => {
  it("lets a catalogue key read products", async () => {
    h.rows = [[keyRow()], []];
    const res = await auth(request(app).get("/api/storefront/v1/products"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], nextCursor: null, hasMore: false });
  });

  it("refuses customers to a key that was not granted them", async () => {
    h.rows = [[keyRow()]];
    const res = await auth(request(app).get("/api/storefront/v1/customers"));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("insufficient_scope");
  });

  it("refuses sales to a key that was not granted them", async () => {
    h.rows = [[keyRow()]];
    const res = await auth(request(app).get("/api/storefront/v1/sales"));
    expect(res.status).toBe(403);
  });

  it("allows customers once the scope is granted", async () => {
    h.rows = [[keyRow({ scopes: "products:read,customers:read" })], []];
    const res = await auth(request(app).get("/api/storefront/v1/customers"));
    expect(res.status).toBe(200);
  });

  it("reports the key's scopes on /store, so a client can adapt", async () => {
    h.rows = [[keyRow()], [{ businessName: "Koastal", username: "koastal" }]];
    const res = await auth(request(app).get("/api/storefront/v1/store"));
    expect(res.body.scopes).toEqual(["products:read", "inventory:read"]);
  });

  it("ignores a scope that is not in the catalogue", () => {
    expect(parseScopes("products:read,everything:write")).toEqual(["products:read"]);
  });

  it("defaults a new key to the catalogue only — never to personal information", () => {
    const sensitive = API_SCOPES.filter((s) => s.sensitive).map((s) => s.id);
    for (const s of DEFAULT_SCOPES) expect(sensitive).not.toContain(s);
  });
});

/* ─── Payloads ───────────────────────────────────────────────────────────── */

describe("payloads", () => {
  const product = {
    id: 5, name: "Widget", description: null, price: "12.50", sku: "W-1", barcode: null,
    imageUrl: null, categoryId: 2, categoryName: "Bits", brandName: null, taxRate: "10.00",
    isActive: "true", tags: null, stockQuantity: 3, trackInventory: "true",
    createdAt: new Date(), updatedAt: new Date(),
  };

  it("returns numbers for money and booleans for flags, not the DB's text", async () => {
    h.rows = [[keyRow()], [product]];
    const res = await auth(request(app).get("/api/storefront/v1/products"));
    expect(res.body.data[0].price).toBe(12.5);
    expect(res.body.data[0].taxRate).toBe(10);
    expect(res.body.data[0].isActive).toBe(true);
  });

  // Stock is its own scope: a catalogue-only key should not learn how much of
  // anything a merchant holds.
  it("withholds stock from a key without inventory:read", async () => {
    h.rows = [[keyRow({ scopes: "products:read" })], [product]];
    const res = await auth(request(app).get("/api/storefront/v1/products"));
    expect(res.body.data[0]).not.toHaveProperty("stock");
  });

  it("includes stock when the key holds inventory:read", async () => {
    h.rows = [[keyRow()], [product]];
    const res = await auth(request(app).get("/api/storefront/v1/products"));
    expect(res.body.data[0].stock).toBe(3);
  });

  it("pages with a cursor, and reports when more remain", async () => {
    const many = Array.from({ length: 3 }, (_, i) => ({ ...product, id: 10 - i }));
    h.rows = [[keyRow()], many];
    const res = await auth(request(app).get("/api/storefront/v1/products?limit=2"));
    expect(res.body.data).toHaveLength(2);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.nextCursor).toBe("9");
  });

  it("never omits the customer fields a portal would need, and never leaks the ones it wouldn't", async () => {
    h.rows = [[keyRow({ scopes: "customers:read" })], [{
      id: 3, firstName: "Sarah", lastName: "Johnson", company: null, email: "s@example.com",
      phone: "0400", address: null, customerGroup: null,
      billingStreet: "1 Main St", billingCity: "Gosford", billingState: "NSW",
      billingPostcode: "2250", billingCountry: "AU",
      shippingStreet: null, shippingCity: null, shippingState: null, shippingPostcode: null, shippingCountry: null,
      loyaltyPoints: 12, totalSpent: "340.00", visitCount: 4, agreedToMarketing: "true",
      createdAt: new Date(), updatedAt: new Date(),
    }]];
    const res = await auth(request(app).get("/api/storefront/v1/customers"));
    const c = res.body.data[0];
    expect(c.billing.postcode).toBe("2250");
    expect(c.acceptsMarketing).toBe(true);
    expect(c.totalSpent).toBe(340);
    // Portal credentials and internal staff notes are not selected at all.
    expect(c).not.toHaveProperty("portalToken");
    expect(c).not.toHaveProperty("portalPasswordHash");
    expect(c).not.toHaveProperty("notes");
    expect(c).not.toHaveProperty("warningNote");
  });

  it("answers a mistyped endpoint with JSON, not the app's HTML", async () => {
    h.rows = [[keyRow()]];
    const res = await auth(request(app).get("/api/storefront/v1/prodcuts"));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("unknown_endpoint");
  });
});

/* ─── The connection brief ───────────────────────────────────────────────── */

describe("connection brief", () => {
  const base = {
    origin: "https://koapos.com.au",
    businessName: "Koastal Repairs",
    keyName: "Storefront",
    keyPrefix: "koa_live_abc",
    scopes: ["products:read", "inventory:read"],
  };

  it("tells the agent where to connect and how to authenticate", () => {
    const md = buildConnectionManifest(base);
    expect(md).toContain("https://koapos.com.au/api/storefront/v1");
    expect(md).toContain("Authorization: Bearer");
  });

  it("embeds the key at creation, and only then", () => {
    expect(buildConnectionManifest({ ...base, secret: "koa_live_secret" })).toContain("koa_live_secret");
    const later = buildConnectionManifest(base);
    expect(later).not.toContain("koa_live_secret");
    expect(later).toContain("<YOUR_API_KEY>");
  });

  it("documents only the endpoints this key can actually call", () => {
    const md = buildConnectionManifest(base);
    expect(md).toContain("GET /products");
    expect(md).not.toContain("GET /customers");
    expect(md).not.toContain("GET /sales");
  });

  it("adds the privacy section exactly when a PII scope is granted", () => {
    expect(buildConnectionManifest(base)).not.toContain("## Privacy");
    const withPii = buildConnectionManifest({ ...base, scopes: [...base.scopes, "customers:read"] });
    expect(withPii).toContain("## Privacy");
    expect(withPii).toContain("Privacy Act");
    expect(withPii).toContain("GET /customers");
  });

  it("tells the agent the API is read-only and server-side only", () => {
    const md = buildConnectionManifest(base);
    expect(md).toMatch(/read-only/i);
    expect(md).toMatch(/server you control/i);
    expect(md).toMatch(/leaks it to every visitor/i);
    expect(md).toContain("KOAPOS_API_KEY");
  });

  it("says when the key expires, so the agent can warn before it breaks", () => {
    const md = buildConnectionManifest({ ...base, expiresAt: new Date("2027-01-31T00:00:00Z") });
    expect(md).toContain("2027-01-31");
  });

  /* The brief carries a JSON block for tools that would rather parse than read.
     If it stops being valid JSON, every one of those tools breaks silently. */
  it("carries a machine-readable block that parses", () => {
    const md = buildConnectionManifest({ ...base, secret: "koa_live_secret" });
    const block = /```json\n([\s\S]*?)\n```/.exec(md);
    expect(block).not.toBeNull();
    const parsed = JSON.parse(block![1]) as Record<string, unknown>;
    expect(parsed.baseUrl).toBe("https://koapos.com.au/api/storefront/v1");
    expect(parsed.readOnly).toBe(true);
    expect((parsed.key as { value: string }).value).toBe("koa_live_secret");
    expect((parsed.endpoints as unknown[]).length).toBe(
      API_ENDPOINTS.filter((e) => e.scope === null || base.scopes.includes(e.scope)).length,
    );
  });
});
