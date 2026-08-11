import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Upload de-duplication and safe asset deletion.
 *
 * The point of dedup is that the same image used across hundreds of products
 * is stored once, so the contract that matters is: a known hash must come back
 * with no uploadURL, and deletion must refuse while anything still references
 * the object.
 */

// Results each awaited db chain resolves to, in call order.
let dbResults: unknown[][] = [];

vi.mock("@workspace/db", () => {
  const chain: any = new Proxy({} as any, {
    get(_t, k) {
      if (k === "then") {
        return (resolve: any, reject: any) =>
          Promise.resolve(dbResults.length ? dbResults.shift() : []).then(resolve, reject);
      }
      if (k === "catch") return () => chain;
      if (k === "finally") return () => chain;
      return () => chain;
    },
  });
  const tableProxy = new Proxy({} as any, { get: () => tableProxy });
  return {
    db: new Proxy({} as any, { get: () => () => chain }),
    pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
    merchantAssetsTable: tableProxy,
    customerFilesTable: tableProxy,
    productReturnAuthsTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  invalidateMerchantStatusCache: () => {},
}));

vi.mock("../middlewares/requireActiveAuth", () => ({
  requireActiveAuth: (_req: any, _res: any, next: any) => next(),
}));

const objectExists = vi.fn().mockResolvedValue(true);
const deleteObjectEntity = vi.fn().mockResolvedValue(undefined);

vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class ObjectNotFoundError extends Error {},
  ObjectStorageService: class {
    async getObjectEntityUploadURL() {
      return "https://storage.googleapis.com/bucket/.private/merchants/1/uploads/uuid-1";
    }
    normalizeObjectEntityPath(raw: string) {
      return raw.replace("https://storage.googleapis.com/bucket/.private", "/objects");
    }
    async getAssetUploadURL(merchantId: string, sha: string) {
      return `https://signed.example/${merchantId}/${sha}`;
    }
    assetObjectPath(merchantId: string, sha: string) {
      return `/objects/merchants/${merchantId}/assets/${sha}`;
    }
    objectExists(path: string) {
      return objectExists(path);
    }
    deleteObjectEntity(path: string) {
      return deleteObjectEntity(path);
    }
    async trySetObjectEntityAclPolicy(path: string) {
      return path;
    }
    async getObjectEntityFile() {
      return {} as any;
    }
    async canAccessObjectEntity() {
      return true;
    }
    async downloadObject() {
      return new Response("bytes", { headers: { "Content-Type": "image/png" } });
    }
  },
}));

const findAssetUsage = vi.fn();

vi.mock("../lib/assetUsage", () => ({
  findAssetUsage: (...args: unknown[]) => findAssetUsage(...args),
  findUsageCounts: async () => new Map(),
}));

const SHA = "a".repeat(64);

let app: express.Express;

beforeAll(async () => {
  const { default: storageRouter } = await import("../routes/storage");

  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { (req as any).session.merchantId = 1; next(); });
  app.use("/api", storageRouter);
});

beforeEach(() => {
  dbResults = [];
  objectExists.mockResolvedValue(true);
  deleteObjectEntity.mockClear();
  findAssetUsage.mockReset();
});

describe("POST /api/storage/uploads/request-url — de-duplication", () => {
  it("reuses the stored object when the merchant already has that hash", async () => {
    dbResults = [[{ id: 7, objectPath: `/objects/merchants/1/assets/${SHA}` }]];

    const res = await request(app)
      .post("/api/storage/uploads/request-url")
      .send({ name: "logo.png", size: 1234, contentType: "image/png", sha256: SHA });

    expect(res.status).toBe(200);
    expect(res.body.deduped).toBe(true);
    expect(res.body.assetId).toBe(7);
    expect(res.body.objectPath).toBe(`/objects/merchants/1/assets/${SHA}`);
    // The whole saving depends on the client having nothing to upload.
    expect(res.body.uploadURL).toBeUndefined();
  });

  it("issues a content-addressed upload URL when the hash is new", async () => {
    dbResults = [[]];

    const res = await request(app)
      .post("/api/storage/uploads/request-url")
      .send({ name: "new.png", size: 999, contentType: "image/png", sha256: SHA });

    expect(res.status).toBe(200);
    expect(res.body.deduped).toBe(false);
    expect(res.body.uploadURL).toBeTruthy();
    expect(res.body.objectPath).toBe(`/objects/merchants/1/assets/${SHA}`);
  });

  it("re-uploads when the library row points at an object that is gone", async () => {
    dbResults = [
      [{ id: 7, objectPath: `/objects/merchants/1/assets/${SHA}` }], // stale row
      [], // delete of the stale row
    ];
    objectExists.mockResolvedValue(false);

    const res = await request(app)
      .post("/api/storage/uploads/request-url")
      .send({ name: "logo.png", size: 1234, contentType: "image/png", sha256: SHA });

    expect(res.status).toBe(200);
    expect(res.body.deduped).toBe(false);
    expect(res.body.uploadURL).toBeTruthy();
  });

  it("falls back to a unique key when no hash is supplied", async () => {
    const res = await request(app)
      .post("/api/storage/uploads/request-url")
      .send({ name: "legacy.png", size: 10, contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.deduped).toBe(false);
    expect(res.body.objectPath).toBe("/objects/merchants/1/uploads/uuid-1");
  });

  it("rejects a disallowed content type", async () => {
    const res = await request(app)
      .post("/api/storage/uploads/request-url")
      .send({ name: "evil.exe", size: 10, contentType: "application/x-msdownload", sha256: SHA });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/storage/uploads/confirm", () => {
  it("refuses an objectPath belonging to another merchant", async () => {
    const res = await request(app)
      .post("/api/storage/uploads/confirm")
      .send({ objectPath: `/objects/merchants/2/assets/${SHA}` });

    expect(res.status).toBe(403);
  });

  it("registers the upload in the library and returns its asset id", async () => {
    dbResults = [
      [], // insert … onConflictDoNothing
      [{ id: 42 }], // read-back
    ];

    const res = await request(app)
      .post("/api/storage/uploads/confirm")
      .send({
        objectPath: `/objects/merchants/1/assets/${SHA}`,
        sha256: SHA,
        name: "logo.png",
        size: 1234,
        contentType: "image/png",
      });

    expect(res.status).toBe(200);
    expect(res.body.assetId).toBe(42);
  });
});

describe("GET /api/storage/objects/* — original filename", () => {
  it("serves the file under the name it was uploaded with", async () => {
    dbResults = [[{ filename: "blue widget.png" }]];

    const res = await request(app).get(`/api/storage/objects/merchants/1/assets/${SHA}`);

    expect(res.status).toBe(200);
    // Without this the browser saves the file as a bare hex string.
    expect(res.headers["content-disposition"]).toContain('filename="blue widget.png"');
  });

  it("encodes a non-ASCII filename rather than mangling it", async () => {
    dbResults = [[{ filename: "café-menü.pdf" }]];

    const res = await request(app).get(`/api/storage/objects/merchants/1/assets/${SHA}`);

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(encodeURIComponent("café-menü.pdf"));
  });

  it("omits the header when no filename is on record", async () => {
    dbResults = [[]];

    const res = await request(app).get(`/api/storage/objects/merchants/1/assets/${SHA}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBeUndefined();
  });

  it("still refuses another merchant's path", async () => {
    const res = await request(app).get(`/api/storage/objects/merchants/2/assets/${SHA}`);
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/storage/assets/:id", () => {
  it("refuses to delete while the image is still in use", async () => {
    dbResults = [[{ id: 5, objectPath: `/objects/merchants/1/assets/${SHA}`, sizeBytes: 100 }]];
    findAssetUsage.mockResolvedValue([{ entity: "products", column: "image_url", count: 3 }]);

    const res = await request(app).delete("/api/storage/assets/5");

    expect(res.status).toBe(409);
    expect(res.body.total).toBe(3);
    expect(res.body.usage[0].entity).toBe("products");
    expect(deleteObjectEntity).not.toHaveBeenCalled();
  });

  it("deletes and reports reclaimed bytes when nothing references it", async () => {
    dbResults = [
      [{ id: 5, objectPath: `/objects/merchants/1/assets/${SHA}`, sizeBytes: 2048 }],
      [], // row delete
    ];
    findAssetUsage.mockResolvedValue([]);

    const res = await request(app).delete("/api/storage/assets/5");

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.reclaimedBytes).toBe(2048);
    expect(deleteObjectEntity).toHaveBeenCalledWith(`/objects/merchants/1/assets/${SHA}`);
  });

  it("404s for an asset that does not belong to the merchant", async () => {
    dbResults = [[]];

    const res = await request(app).delete("/api/storage/assets/999");

    expect(res.status).toBe(404);
    expect(deleteObjectEntity).not.toHaveBeenCalled();
  });
});
