import { Router, type IRouter } from "express";
import { db, loanerDevicesTable, customersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { customerDisplayName } from "../lib/customer-name";

const router: IRouter = Router();

type Row = typeof loanerDevicesTable.$inferSelect;
const STATUSES = new Set(["available", "on_loan", "retired"]);

function fmt(row: Row, customerName?: string | null) {
  return {
    id: row.id,
    name: row.name,
    identifier: row.identifier ?? null,
    status: row.status,
    assignedCustomerId: row.assignedCustomerId ?? null,
    assignedCustomerName: customerName ?? null,
    assignedServiceJobId: row.assignedServiceJobId ?? null,
    assignedAt: row.assignedAt ? row.assignedAt.toISOString() : null,
    dueBackAt: row.dueBackAt ? row.dueBackAt.toISOString() : null,
    conditionOut: row.conditionOut ?? null,
    conditionIn: row.conditionIn ?? null,
    returnedAt: row.returnedAt ? row.returnedAt.toISOString() : null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function listAll(merchantId: number) {
  const rows = await db.select().from(loanerDevicesTable)
    .where(eq(loanerDevicesTable.merchantId, merchantId))
    .orderBy(desc(loanerDevicesTable.updatedAt));
  const custIds = [...new Set(rows.map((r) => r.assignedCustomerId).filter((v): v is number => v != null))];
  const custMap = new Map<number, string | null>();
  if (custIds.length) {
    const cs = await db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId));
    for (const c of cs) custMap.set(c.id, customerDisplayName(c.firstName, c.lastName, c.company));
  }
  return rows.map((r) => fmt(r, r.assignedCustomerId ? custMap.get(r.assignedCustomerId) : null));
}

function parseDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d;
}

// GET /loaner-devices
router.get("/loaner-devices", requireAuth, async (req, res): Promise<void> => {
  res.json({ items: await listAll(req.session.merchantId!) });
});

// POST /loaner-devices — register a loaner.
router.post("/loaner-devices", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  await db.insert(loanerDevicesTable).values({
    merchantId,
    name,
    identifier: typeof b.identifier === "string" && b.identifier.trim() ? b.identifier.trim() : null,
    notes: typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
  });
  res.status(201).json({ items: await listAll(merchantId) });
});

// PUT /loaner-devices/:id — edit, issue (assign) or return a loaner.
router.put("/loaner-devices/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<typeof loanerDevicesTable.$inferInsert> = {};

  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
  if (typeof b.identifier === "string") patch.identifier = b.identifier.trim() || null;
  if (typeof b.notes === "string") patch.notes = b.notes.trim() || null;
  if (typeof b.status === "string" && STATUSES.has(b.status)) patch.status = b.status;
  if (b.assignedCustomerId !== undefined) patch.assignedCustomerId = b.assignedCustomerId != null ? Number(b.assignedCustomerId) : null;
  if (b.assignedServiceJobId !== undefined) patch.assignedServiceJobId = b.assignedServiceJobId != null ? Number(b.assignedServiceJobId) : null;
  if (typeof b.conditionOut === "string") patch.conditionOut = b.conditionOut.trim() || null;
  if (typeof b.conditionIn === "string") patch.conditionIn = b.conditionIn.trim() || null;
  const dueBack = parseDate(b.dueBackAt); if (dueBack !== undefined) patch.dueBackAt = dueBack;

  // Convenience actions: issue / return.
  if (b.action === "issue") {
    patch.status = "on_loan";
    patch.assignedAt = new Date();
    patch.returnedAt = null;
    if (b.assignedCustomerId != null) patch.assignedCustomerId = Number(b.assignedCustomerId);
  } else if (b.action === "return") {
    patch.status = "available";
    patch.returnedAt = new Date();
    patch.assignedCustomerId = null;
    patch.assignedServiceJobId = null;
    patch.dueBackAt = null;
  }

  const [updated] = await db.update(loanerDevicesTable).set(patch)
    .where(and(eq(loanerDevicesTable.id, id), eq(loanerDevicesTable.merchantId, merchantId))).returning();
  if (!updated) { res.status(404).json({ error: "Loaner not found" }); return; }
  res.json({ items: await listAll(merchantId) });
});

// DELETE /loaner-devices/:id
router.delete("/loaner-devices/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  await db.delete(loanerDevicesTable)
    .where(and(eq(loanerDevicesTable.id, id), eq(loanerDevicesTable.merchantId, merchantId)));
  res.json({ items: await listAll(merchantId) });
});

export default router;
