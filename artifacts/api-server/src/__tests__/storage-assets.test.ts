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
const findUsageCounts = vi.fn();
const countAssetUsage = vi.fn();
const findReferencesByPath = vi.fn();
const rewriteAssetReferences = vi.fn();

vi.mock("../lib/assetUsage", () => ({
  findAssetUsage: (...args: unknown[]) => findAssetUsage(...args),
  findUsageCounts: (...args: unknown[]) => findUsageCounts(...args),
  countAssetUsage: (...args: unknown[]) => countAssetUsage(...args),
  findReferencesByPath: (...args: unknown[]) => findReferencesByPath(...args),
  rewriteAssetReferences: (...args: unknown[]) => rewriteAssetReferences(...args),
}));

const SHA = "a".repeat(64);

let app: express.Express;

beforeAll(async () => {
  const { default: storageRouter } = await import("../routes/storage");

  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    (req as any).session.merchantId = 1;
    // pino-http supplies req.log in the real app; without it any handler that
    // logs on an error path throws instead of returning its own response.
    (req as any).log = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    next();
  });
  app.use("/api", storageRouter);
});

beforeEach(() => {
  dbResults = [];
  objectExists.mockResolvedValue(true);
  deleteObjectEntity.mockClear();
  findAssetUsage.mockReset();
  findReferencesByPath.mockReset();
  rewriteAssetReferences.mockReset();
  // Default: nothing references anything. Tests that care set their own counts.
  findUsageCounts.mockReset();
  findUsageCounts.mockImplementation(async (_merchantId: unknown, paths: string[]) =>
    new Map(paths.map((p) => [p, 0])));
  countAssetUsage.mockReset();
  countAssetUsage.mockResolvedValue(0);
});

/** A library row as the listing route reads it out of the db. */
function assetRow(over: Record<string, unknown> = {}) {
  return {
    id: 5,
    objectPath: `/objects/merchants/1/assets/${SHA}`,
    sha256: SHA,
    contentType: "image/png",
    sizeBytes: 2048,
    filename: "logo.png",
    width: 64,
    height: 64,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  };
}

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

describe("POST /api/storage/assets/bulk-delete", () => {
  const pathFor = (n: number) => `/objects/merchants/1/assets/${String(n).repeat(64)}`;
  const row = (id: number, over: Record<string, unknown> = {}) => ({
    id,
    objectPath: pathFor(id),
    sizeBytes: 1000 * id,
    filename: `file-${id}.png`,
    ...over,
  });

  it("deletes every unreferenced asset and totals the bytes reclaimed", async () => {
    dbResults = [[row(1), row(2)], []];

    const res = await request(app)
      .post("/api/storage/assets/bulk-delete")
      .send({ assetIds: [1, 2] });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);
    expect(res.body.deletedIds).toEqual([1, 2]);
    expect(res.body.reclaimedBytes).toBe(3000);
    expect(res.body.skipped).toEqual([]);
    expect(deleteObjectEntity).toHaveBeenCalledTimes(2);
  });

  // The whole point of the chosen semantics: one in-use file must not cost the
  // merchant the rest of the batch, and must not itself be touched.
  it("skips in-use assets and still deletes the rest", async () => {
    dbResults = [[row(1), row(2), row(3)], []];
    findUsageCounts.mockImplementation(async (_m: unknown, paths: string[]) =>
      new Map(paths.map((p) => [p, p === pathFor(2) ? 4 : 0])));

    const res = await request(app)
      .post("/api/storage/assets/bulk-delete")
      .send({ assetIds: [1, 2, 3] });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);
    expect(res.body.deletedIds).toEqual([1, 3]);
    expect(res.body.skipped).toEqual([{ id: 2, filename: "file-2.png", usageCount: 4 }]);
    // Reclaimed bytes must exclude the file that was kept.
    expect(res.body.reclaimedBytes).toBe(4000);
    expect(deleteObjectEntity).not.toHaveBeenCalledWith(pathFor(2));
  });

  it("never deletes an id the merchant does not own", async () => {
    // The scoped select simply does not return the foreign row.
    dbResults = [[row(1)], []];

    const res = await request(app)
      .post("/api/storage/assets/bulk-delete")
      .send({ assetIds: [1, 999] });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
    expect(res.body.notFound).toEqual([999]);
    expect(deleteObjectEntity).toHaveBeenCalledTimes(1);
    expect(deleteObjectEntity).toHaveBeenCalledWith(pathFor(1));
  });

  it("cleans up the library row when the stored object is already gone", async () => {
    dbResults = [[row(1)], []];
    const { ObjectNotFoundError } = await import("../lib/objectStorage");
    deleteObjectEntity.mockRejectedValueOnce(new ObjectNotFoundError());

    const res = await request(app)
      .post("/api/storage/assets/bulk-delete")
      .send({ assetIds: [1] });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
    expect(res.body.failed).toEqual([]);
  });

  it("keeps the row when the storage delete genuinely fails", async () => {
    dbResults = [[row(1), row(2)], []];
    deleteObjectEntity.mockRejectedValueOnce(new Error("bucket unreachable"));

    const res = await request(app)
      .post("/api/storage/assets/bulk-delete")
      .send({ assetIds: [1, 2] });

    expect(res.status).toBe(200);
    // A row whose object is still in the bucket must not be dropped, or the
    // object becomes an orphan nothing can find.
    expect(res.body.deletedIds).toEqual([2]);
    expect(res.body.failed).toEqual([
      { id: 1, filename: "file-1.png", error: "Could not remove the stored file" },
    ]);
    expect(res.body.reclaimedBytes).toBe(2000);
  });

  it("falls back to a per-asset scan for a path outside the merchant prefix", async () => {
    // A legacy import could carry a path the batch scan does not cover; it must
    // read as in-use rather than as unreferenced.
    dbResults = [[row(1, { objectPath: "/objects/legacy/odd-path" })], []];
    countAssetUsage.mockResolvedValue(2);

    const res = await request(app)
      .post("/api/storage/assets/bulk-delete")
      .send({ assetIds: [1] });

    expect(res.status).toBe(200);
    expect(countAssetUsage).toHaveBeenCalledWith("/objects/legacy/odd-path");
    expect(res.body.deleted).toBe(0);
    expect(res.body.skipped[0].usageCount).toBe(2);
    expect(deleteObjectEntity).not.toHaveBeenCalled();
  });

  it("rejects an empty list", async () => {
    const res = await request(app)
      .post("/api/storage/assets/bulk-delete")
      .send({ assetIds: [] });

    expect(res.status).toBe(400);
    expect(deleteObjectEntity).not.toHaveBeenCalled();
  });

  it("rejects a batch over the cap", async () => {
    const res = await request(app)
      .post("/api/storage/assets/bulk-delete")
      .send({ assetIds: Array.from({ length: 201 }, (_, i) => i + 1) });

    expect(res.status).toBe(400);
    expect(deleteObjectEntity).not.toHaveBeenCalled();
  });

  it("counts a repeated id once", async () => {
    dbResults = [[row(1)], []];

    const res = await request(app)
      .post("/api/storage/assets/bulk-delete")
      .send({ assetIds: [1, 1, 1] });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
    expect(res.body.notFound).toEqual([]);
    expect(deleteObjectEntity).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/storage/assets", () => {
  it("labels each asset with its media kind", async () => {
    dbResults = [
      [
        assetRow({ id: 1, contentType: "image/png" }),
        assetRow({ id: 2, contentType: "video/mp4" }),
        assetRow({ id: 3, contentType: "application/pdf" }),
      ],
      [{ total: 3, totalBytes: 6144 }],
    ];

    const res = await request(app).get("/api/storage/assets");

    expect(res.status).toBe(200);
    expect(res.body.assets.map((a: any) => a.kind)).toEqual(["image", "video", "document"]);
  });

  it("omits usage detail unless it is asked for", async () => {
    dbResults = [[assetRow()], [{ total: 1, totalBytes: 2048 }]];

    const res = await request(app).get("/api/storage/assets");

    expect(res.status).toBe(200);
    // The scan is the expensive part; the default listing must not pay for it.
    expect(findReferencesByPath).not.toHaveBeenCalled();
    expect(res.body.assets[0].usageCount).toBeUndefined();
    expect(res.body.assets[0].references).toBeUndefined();
  });

  it("reports what each asset is attached to when withReferences is set", async () => {
    const path = `/objects/merchants/1/assets/${SHA}`;
    dbResults = [[assetRow({ objectPath: path })], [{ total: 1, totalBytes: 2048 }]];
    findReferencesByPath.mockResolvedValue(
      new Map([[path, [
        { entity: "products", column: "image_url", id: "412", label: "Coca-Cola 600ml" },
        { entity: "brands", column: "logo_url", id: "7", label: "Coca-Cola" },
      ]]]),
    );

    const res = await request(app).get("/api/storage/assets?withReferences=true");

    expect(res.status).toBe(200);
    const [asset] = res.body.assets;
    expect(asset.usageCount).toBe(2);
    expect(asset.references).toHaveLength(2);
    expect(asset.references[0].label).toBe("Coca-Cola 600ml");
  });

  it("returns an empty reference list for an asset nothing points at", async () => {
    dbResults = [[assetRow()], [{ total: 1, totalBytes: 2048 }]];
    findReferencesByPath.mockResolvedValue(new Map());

    const res = await request(app).get("/api/storage/assets?withReferences=true");

    expect(res.status).toBe(200);
    expect(res.body.assets[0].usageCount).toBe(0);
    expect(res.body.assets[0].references).toEqual([]);
  });
});

describe("POST /api/storage/assets/:id/replace", () => {
  const OTHER_SHA = "b".repeat(64);
  const originalPath = `/objects/merchants/1/assets/${SHA}`;
  const replacementPath = `/objects/merchants/1/assets/${OTHER_SHA}`;

  it("repoints every reference at the replacement", async () => {
    dbResults = [[
      { id: 5, objectPath: originalPath },
      { id: 6, objectPath: replacementPath },
    ]];
    rewriteAssetReferences.mockResolvedValue(4);

    const res = await request(app)
      .post("/api/storage/assets/5/replace")
      .send({ replacementAssetId: 6 });

    expect(res.status).toBe(200);
    expect(res.body.replaced).toBe(4);
    expect(rewriteAssetReferences).toHaveBeenCalledWith(originalPath, replacementPath);
  });

  it("leaves the old asset in place — replacing never deletes", async () => {
    dbResults = [[
      { id: 5, objectPath: originalPath },
      { id: 6, objectPath: replacementPath },
    ]];
    rewriteAssetReferences.mockResolvedValue(1);

    await request(app).post("/api/storage/assets/5/replace").send({ replacementAssetId: 6 });

    expect(deleteObjectEntity).not.toHaveBeenCalled();
  });

  it("rejects an asset replacing itself", async () => {
    const res = await request(app)
      .post("/api/storage/assets/5/replace")
      .send({ replacementAssetId: 5 });

    expect(res.status).toBe(400);
    expect(rewriteAssetReferences).not.toHaveBeenCalled();
  });

  it("rejects a body with no replacement", async () => {
    const res = await request(app).post("/api/storage/assets/5/replace").send({});

    expect(res.status).toBe(400);
    expect(rewriteAssetReferences).not.toHaveBeenCalled();
  });

  it("404s when the asset is not the merchant's", async () => {
    // Neither row comes back, because the lookup is merchant-scoped.
    dbResults = [[]];

    const res = await request(app)
      .post("/api/storage/assets/999/replace")
      .send({ replacementAssetId: 6 });

    expect(res.status).toBe(404);
    expect(rewriteAssetReferences).not.toHaveBeenCalled();
  });

  it("refuses to point references at another merchant's file", async () => {
    // The original is ours; the replacement id belongs to someone else, so the
    // merchant-scoped lookup returns only the original.
    dbResults = [[{ id: 5, objectPath: originalPath }]];

    const res = await request(app)
      .post("/api/storage/assets/5/replace")
      .send({ replacementAssetId: 6 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Replacement asset not found");
    expect(rewriteAssetReferences).not.toHaveBeenCalled();
  });
});
