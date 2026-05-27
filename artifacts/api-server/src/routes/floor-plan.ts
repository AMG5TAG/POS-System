import { Router } from "express";
import { db, floorPlanSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();
router.use(requireAuth);

/* ── GET /floor-plan ────────────────────────────────────────────────────── */
router.get("/floor-plan", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(floorPlanSettingsTable)
    .where(eq(floorPlanSettingsTable.merchantId, merchantId));
  if (!row) return res.json({ elements: [], gridCols: 20, gridRows: 15 });
  return res.json({
    elements: (() => { try { return JSON.parse(row.elements); } catch { return []; } })(),
    gridCols: row.gridCols,
    gridRows:  row.gridRows,
  });
});

/* ── PUT /floor-plan ────────────────────────────────────────────────────── */
router.put("/floor-plan", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { elements, gridCols, gridRows } = req.body as {
    elements?: unknown[]; gridCols?: number; gridRows?: number;
  };
  const existing = await db.select({ id: floorPlanSettingsTable.id })
    .from(floorPlanSettingsTable)
    .where(eq(floorPlanSettingsTable.merchantId, merchantId));
  const payload = {
    elements: JSON.stringify(elements ?? []),
    gridCols: gridCols ?? 20,
    gridRows:  gridRows ?? 15,
  };
  if (existing.length === 0) {
    await db.insert(floorPlanSettingsTable).values({ merchantId, ...payload });
  } else {
    await db.update(floorPlanSettingsTable).set(payload)
      .where(eq(floorPlanSettingsTable.merchantId, merchantId));
  }
  return res.json({ ok: true });
});

/* ── GET /floor-plan/zones ──────────────────────────────────────────────── */
router.get("/floor-plan/zones", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select({ elements: floorPlanSettingsTable.elements })
    .from(floorPlanSettingsTable)
    .where(eq(floorPlanSettingsTable.merchantId, merchantId));
  if (!row) return res.json([]);
  const elements = (() => { try { return JSON.parse(row.elements); } catch { return []; } })() as Array<{ id: string; label?: string }>;
  const zones = elements
    .filter(el => el.label?.trim())
    .map(el => ({ id: el.id, label: el.label! }));
  return res.json(zones);
});

export default router;
