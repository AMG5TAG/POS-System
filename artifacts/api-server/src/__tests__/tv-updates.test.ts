import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { Readable } from "node:stream";

const state = vi.hoisted(() => ({
  findPublicTvUpdateFile: vi.fn(),
  getWritableTvUpdateFile: vi.fn(),
  listPublicTvUpdates: vi.fn(),
  saveOrder: [] as string[],
  apkSize: 0,
  apkFile: {} as any,
  manifestFile: {} as any,
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/tvUpdatesStorage", () => ({
  findPublicTvUpdateFile: state.findPublicTvUpdateFile,
  getWritableTvUpdateFile: state.getWritableTvUpdateFile,
  listPublicTvUpdates: state.listPublicTvUpdates,
}));

let app: express.Express;

beforeAll(async () => {
  const { default: adminRouter, tvUpdatesPublicRouter } = await import("../routes/tv-updates");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    req.session.merchantId = 1;
    req.session.staffRole = req.header("x-role") === "manager" ? "manager" : "owner";
    req.session.authKind = req.header("x-auth-kind") === "staff-email" ? "staff-email" : "owner";
    if (req.header("x-staff-id")) req.session.staffId = Number(req.header("x-staff-id"));
    next();
  });
  app.use("/api", adminRouter);
  app.use("/api", tvUpdatesPublicRouter);
});

beforeEach(() => {
  state.saveOrder = [];
  state.findPublicTvUpdateFile.mockReset().mockResolvedValue(null);
  state.listPublicTvUpdates.mockReset().mockResolvedValue([]);

  state.apkFile = {
    exists: vi.fn().mockResolvedValue([false]),
    save: vi.fn(async (buffer: Buffer) => {
      state.saveOrder.push("apk");
      state.apkSize = buffer.length;
    }),
    getMetadata: vi.fn(async () => [{ size: String(state.apkSize ?? 0) }]),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  state.manifestFile = {
    save: vi.fn(async () => { state.saveOrder.push("update.json"); }),
  };
  state.getWritableTvUpdateFile.mockReset().mockImplementation((_app: string, filename: string) =>
    filename === "update.json" ? state.manifestFile : state.apkFile,
  );
});

describe("TV app update publishing", () => {
  it("rejects staff sessions even when the staff role is owner", async () => {
    const response = await request(app)
      .post("/api/tv-updates/admin/publish")
      .set("x-auth-kind", "staff-email")
      .set("x-staff-id", "12")
      .field("app", "apsclock");

    expect(response.status).toBe(403);
    expect(state.getWritableTvUpdateFile).not.toHaveBeenCalled();
  });

  it("writes the APK before update.json and returns the public manifest URL", async () => {
    const response = await request(app)
      .post("/api/tv-updates/admin/publish")
      .field("app", "apsclock")
      .attach("apk", Buffer.from("apk-bytes"), {
        filename: "apsclock-1.2.apk",
        contentType: "application/vnd.android.package-archive",
      })
      .attach("updateJson", Buffer.from(JSON.stringify({
        versionCode: 3,
        versionName: "1.2",
        apk: "apsclock-1.2.apk",
      })), {
        filename: "update.json",
        contentType: "application/json",
      });

    if (response.status !== 201) console.log("publish response:", response.status, response.body);
    expect(response.status).toBe(201);
    expect(state.saveOrder).toEqual(["apk", "update.json"]);
    expect(response.body.publicUrl).toMatch(/\/tv\/apsclock\/update\.json$/);
    expect(state.apkFile.save).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        metadata: expect.objectContaining({
          contentType: "application/vnd.android.package-archive",
        }),
      }),
    );
    expect(state.manifestFile.save).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        metadata: expect.objectContaining({ cacheControl: "no-cache" }),
      }),
    );
  });
});

describe("TV app update downloads", () => {
  it("serves the manifest as uncached JSON", async () => {
    const manifest = Buffer.from('{"versionCode":3,"versionName":"1.2","apk":"apsclock-1.2.apk"}');
    const file = {
      getMetadata: vi.fn().mockResolvedValue([{ size: String(manifest.length) }]),
      createReadStream: vi.fn(() => Readable.from([manifest])),
    };
    state.findPublicTvUpdateFile.mockResolvedValue(file);

    const response = await request(app).get("/api/tv-updates/public/apsclock/update.json");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.text).toBe(manifest.toString());
  });

  it("serves APKs with the Android package content type and returns 404 for missing files", async () => {
    const file = {
      getMetadata: vi.fn().mockResolvedValue([{ size: "7" }]),
      createReadStream: vi.fn(() => Readable.from([Buffer.from("apkdata")])),
    };
    state.findPublicTvUpdateFile.mockResolvedValueOnce(file).mockResolvedValueOnce(null);

    const response = await request(app).get("/api/tv-updates/public/apsclock/apsclock-1.2.apk");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/vnd.android.package-archive");

    const missing = await request(app).get("/api/tv-updates/public/apsclock/missing.apk");
    expect(missing.status).toBe(404);
  });
});
