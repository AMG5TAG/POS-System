import { Router } from "express";
import { db, ipCamerasTable, cameraSnapshotsTable, cameraSettingsTable, posSecurityCapturesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.use(requireAuth);

/* ── List cameras ───────────────────────────────────────────────────────── */
router.get("/cameras", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const cameras = await db
    .select()
    .from(ipCamerasTable)
    .where(eq(ipCamerasTable.merchantId, merchantId))
    .orderBy(ipCamerasTable.sortOrder, ipCamerasTable.createdAt);
  return res.json(cameras);
});

/* ── Create camera ──────────────────────────────────────────────────────── */
router.post("/cameras", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { name, streamUrl, port, username, password, status, sortOrder } = req.body as {
    name: string; streamUrl: string; port?: string; username?: string;
    password?: string; status?: string; sortOrder?: number;
  };
  const [camera] = await db.insert(ipCamerasTable).values({
    merchantId,
    name,
    streamUrl,
    port: port ?? null,
    username: username ?? null,
    password: password ?? null,
    status: status ?? "active",
    sortOrder: sortOrder ?? 0,
  }).returning();
  return res.status(201).json(camera);
});

/* ── Get camera settings ────────────────────────────────────────────────── */
router.get("/cameras/settings", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const [settings] = await db
    .select()
    .from(cameraSettingsTable)
    .where(eq(cameraSettingsTable.merchantId, merchantId));
  if (!settings) {
    return res.json({
      pipEnabled: "false",
      pipCameraId: null,
      allowedRoles: "admin,manager,cashier",
      posWebcamEnabled: "false",
      posWebcamDeviceId: null,
    });
  }
  return res.json({
    pipEnabled: settings.pipEnabled,
    pipCameraId: settings.pipCameraId ?? null,
    allowedRoles: settings.allowedRoles,
    posWebcamEnabled: settings.posWebcamEnabled,
    posWebcamDeviceId: settings.posWebcamDeviceId ?? null,
  });
});

/* ── Update camera settings ─────────────────────────────────────────────── */
router.put("/cameras/settings", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { pipEnabled, pipCameraId, allowedRoles, posWebcamEnabled, posWebcamDeviceId } = req.body as {
    pipEnabled?: string; pipCameraId?: number | null; allowedRoles?: string;
    posWebcamEnabled?: string; posWebcamDeviceId?: string | null;
  };
  const existing = await db
    .select()
    .from(cameraSettingsTable)
    .where(eq(cameraSettingsTable.merchantId, merchantId));

  if (existing.length === 0) {
    const [s] = await db.insert(cameraSettingsTable).values({
      merchantId,
      pipEnabled: pipEnabled ?? "false",
      pipCameraId: pipCameraId ?? null,
      allowedRoles: allowedRoles ?? "admin,manager,cashier",
      posWebcamEnabled: posWebcamEnabled ?? "false",
      posWebcamDeviceId: posWebcamDeviceId ?? null,
    }).returning();
    return res.json({
      pipEnabled: s.pipEnabled, pipCameraId: s.pipCameraId ?? null, allowedRoles: s.allowedRoles,
      posWebcamEnabled: s.posWebcamEnabled, posWebcamDeviceId: s.posWebcamDeviceId ?? null,
    });
  }

  const [s] = await db.update(cameraSettingsTable)
    .set({
      ...(pipEnabled !== undefined ? { pipEnabled } : {}),
      ...(pipCameraId !== undefined ? { pipCameraId: pipCameraId ?? null } : {}),
      ...(allowedRoles !== undefined ? { allowedRoles } : {}),
      ...(posWebcamEnabled !== undefined ? { posWebcamEnabled } : {}),
      ...(posWebcamDeviceId !== undefined ? { posWebcamDeviceId: posWebcamDeviceId ?? null } : {}),
    })
    .where(eq(cameraSettingsTable.merchantId, merchantId))
    .returning();
  return res.json({
    pipEnabled: s.pipEnabled, pipCameraId: s.pipCameraId ?? null, allowedRoles: s.allowedRoles,
    posWebcamEnabled: s.posWebcamEnabled, posWebcamDeviceId: s.posWebcamDeviceId ?? null,
  });
});

/* ── Update camera ──────────────────────────────────────────────────────── */
router.put("/cameras/:id", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  const { name, streamUrl, port, username, password, status, sortOrder } = req.body as {
    name?: string; streamUrl?: string; port?: string; username?: string;
    password?: string; status?: string; sortOrder?: number;
  };
  const [camera] = await db.update(ipCamerasTable)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(streamUrl !== undefined ? { streamUrl } : {}),
      ...(port !== undefined ? { port: port ?? null } : {}),
      ...(username !== undefined ? { username: username ?? null } : {}),
      ...(password !== undefined ? { password: password ?? null } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    })
    .where(and(eq(ipCamerasTable.id, id), eq(ipCamerasTable.merchantId, merchantId)))
    .returning();
  if (!camera) return res.status(404).json({ error: "Camera not found" });
  return res.json(camera);
});

/* ── Delete camera ──────────────────────────────────────────────────────── */
router.delete("/cameras/:id", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  await db.delete(ipCamerasTable)
    .where(and(eq(ipCamerasTable.id, id), eq(ipCamerasTable.merchantId, merchantId)));
  return res.status(204).end();
});

/* ── List snapshots ─────────────────────────────────────────────────────── */
router.get("/camera-snapshots", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const cameraId = req.query.cameraId ? parseInt(req.query.cameraId as string, 10) : undefined;

  const rows = await db
    .select({
      id: cameraSnapshotsTable.id,
      cameraId: cameraSnapshotsTable.cameraId,
      merchantId: cameraSnapshotsTable.merchantId,
      imageData: cameraSnapshotsTable.imageData,
      takenAt: cameraSnapshotsTable.takenAt,
      takenBy: cameraSnapshotsTable.takenBy,
      source: cameraSnapshotsTable.source,
      cameraName: ipCamerasTable.name,
    })
    .from(cameraSnapshotsTable)
    .leftJoin(ipCamerasTable, eq(cameraSnapshotsTable.cameraId, ipCamerasTable.id))
    .where(
      cameraId !== undefined
        ? and(eq(cameraSnapshotsTable.merchantId, merchantId), eq(cameraSnapshotsTable.cameraId, cameraId))
        : eq(cameraSnapshotsTable.merchantId, merchantId)
    )
    .orderBy(desc(cameraSnapshotsTable.takenAt))
    .limit(100);

  return res.json(rows.map((r: typeof rows[0]) => ({ ...r, cameraName: r.cameraName ?? "Deleted Camera" })));
});

/* ── Create snapshot ────────────────────────────────────────────────────── */
router.post("/camera-snapshots", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { cameraId, imageData, takenBy, source } = req.body as {
    cameraId: number; imageData: string; takenBy?: string; source?: string;
  };
  const [snap] = await db.insert(cameraSnapshotsTable).values({
    cameraId,
    merchantId,
    imageData,
    takenBy: takenBy ?? null,
    source: source ?? "manual",
  }).returning();

  const camera = await db.select({ name: ipCamerasTable.name })
    .from(ipCamerasTable)
    .where(eq(ipCamerasTable.id, cameraId));

  return res.status(201).json({
    ...snap,
    cameraName: camera[0]?.name ?? "Unknown",
  });
});

/* ── Delete snapshot ────────────────────────────────────────────────────── */
router.delete("/camera-snapshots/:id", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  await db.delete(cameraSnapshotsTable)
    .where(and(eq(cameraSnapshotsTable.id, id), eq(cameraSnapshotsTable.merchantId, merchantId)));
  return res.status(204).end();
});

/* ── List POS security captures ─────────────────────────────────────────── */
router.get("/pos-security-captures", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select()
    .from(posSecurityCapturesTable)
    .where(eq(posSecurityCapturesTable.merchantId, merchantId))
    .orderBy(desc(posSecurityCapturesTable.takenAt))
    .limit(200);
  return res.json(rows);
});

/* ── Create POS security capture ────────────────────────────────────────── */
router.post("/pos-security-captures", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { type, imageData, filename, deviceLabel, takenBy, storedLocally } = req.body as {
    type: string; imageData?: string; filename?: string;
    deviceLabel?: string; takenBy?: string; storedLocally?: boolean;
  };
  const [row] = await db.insert(posSecurityCapturesTable).values({
    merchantId,
    type: type ?? "photo",
    imageData: imageData ?? null,
    filename: filename ?? null,
    deviceLabel: deviceLabel ?? null,
    takenBy: takenBy ?? null,
    storedLocally: storedLocally ?? true,
  }).returning();
  return res.status(201).json(row);
});

/* ── Delete POS security capture ────────────────────────────────────────── */
router.delete("/pos-security-captures/:id", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  await db.delete(posSecurityCapturesTable)
    .where(and(eq(posSecurityCapturesTable.id, id), eq(posSecurityCapturesTable.merchantId, merchantId)));
  return res.status(204).end();
});

export default router;
