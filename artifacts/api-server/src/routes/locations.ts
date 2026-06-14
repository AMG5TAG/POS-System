import { Router, type IRouter } from "express";
import { db, locationsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type Row = typeof locationsTable.$inferSelect;

function fmt(row: Row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? null,
    address: row.address ?? null,
    phone: row.phone ?? null,
    isDefault: row.isDefault === "true",
    isActive: row.isActive === "true",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Return the merchant's locations, lazily creating a default "Main" if none
 *  exist yet (backfill for existing single-store merchants). */
async function ensureLocations(merchantId: number): Promise<Row[]> {
  const rows = await db.select().from(locationsTable)
    .where(eq(locationsTable.merchantId, merchantId)).orderBy(asc(locationsTable.id));
  if (rows.length > 0) return rows;
  await db.insert(locationsTable).values({ merchantId, name: "Main", isDefault: "true" });
  return db.select().from(locationsTable)
    .where(eq(locationsTable.merchantId, merchantId)).orderBy(asc(locationsTable.id));
}

function activeId(rows: Row[], sessionLocationId?: number): number {
  if (sessionLocationId && rows.some((r) => r.id === sessionLocationId)) return sessionLocationId;
  return (rows.find((r) => r.isDefault === "true") ?? rows[0]).id;
}

// GET /locations — list + the caller's active location.
router.get("/locations", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await ensureLocations(merchantId);
  res.json({ items: rows.map(fmt), activeLocationId: activeId(rows, req.session.locationId) });
});

// POST /locations — add a store/branch.
router.post("/locations", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  await ensureLocations(merchantId); // guarantee a default exists first
  const b = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  await db.insert(locationsTable).values({
    merchantId,
    name,
    code: typeof b.code === "string" && b.code.trim() ? b.code.trim() : null,
    address: typeof b.address === "string" && b.address.trim() ? b.address.trim() : null,
    phone: typeof b.phone === "string" && b.phone.trim() ? b.phone.trim() : null,
  });
  const rows = await ensureLocations(merchantId);
  res.status(201).json({ items: rows.map(fmt), activeLocationId: activeId(rows, req.session.locationId) });
});

// PUT /locations/:id — edit, or set as default (only one default at a time).
router.put("/locations/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<typeof locationsTable.$inferInsert> = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
  if (typeof b.code === "string") patch.code = b.code.trim() || null;
  if (typeof b.address === "string") patch.address = b.address.trim() || null;
  if (typeof b.phone === "string") patch.phone = b.phone.trim() || null;
  if (b.isActive !== undefined) patch.isActive = b.isActive ? "true" : "false";

  if (b.isDefault === true) {
    // Demote the current default, then promote this one.
    await db.update(locationsTable).set({ isDefault: "false" }).where(eq(locationsTable.merchantId, merchantId));
    patch.isDefault = "true";
    patch.isActive = "true";
  }

  const [updated] = await db.update(locationsTable).set(patch)
    .where(and(eq(locationsTable.id, id), eq(locationsTable.merchantId, merchantId))).returning();
  if (!updated) { res.status(404).json({ error: "Location not found" }); return; }
  const rows = await ensureLocations(merchantId);
  res.json({ items: rows.map(fmt), activeLocationId: activeId(rows, req.session.locationId) });
});

// DELETE /locations/:id — cannot delete the default or the last location.
router.delete("/locations/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  const rows = await ensureLocations(merchantId);
  const target = rows.find((r) => r.id === id);
  if (!target) { res.status(404).json({ error: "Location not found" }); return; }
  if (target.isDefault === "true") { res.status(409).json({ error: "Can't delete the default location" }); return; }
  if (rows.length <= 1) { res.status(409).json({ error: "A merchant must have at least one location" }); return; }
  await db.delete(locationsTable).where(and(eq(locationsTable.id, id), eq(locationsTable.merchantId, merchantId)));
  if (req.session.locationId === id) req.session.locationId = undefined;
  const after = await ensureLocations(merchantId);
  res.json({ items: after.map(fmt), activeLocationId: activeId(after, req.session.locationId) });
});

// POST /locations/active — set the caller's active store for this session.
router.post("/locations/active", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const locationId = Number((req.body ?? {}).locationId);
  const rows = await ensureLocations(merchantId);
  if (!rows.some((r) => r.id === locationId)) { res.status(404).json({ error: "Location not found" }); return; }
  req.session.locationId = locationId;
  res.json({ activeLocationId: locationId });
});

export default router;
