import { Router, type IRouter } from "express";
import { db, appointmentsTable, customersTable, staffTable } from "@workspace/db";
import { eq, and, gte, lt } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { CreateAppointmentBody, UpdateAppointmentBody, DeleteAppointmentParams, UpdateAppointmentParams } from "@workspace/api-zod";

const router: IRouter = Router();

async function formatAppointment(
  a: typeof appointmentsTable.$inferSelect,
  customerMap: Map<number, { firstName: string | null; lastName: string | null }>,
  staffMap: Map<number, { name: string }>,
) {
  const customer = a.customerId ? customerMap.get(a.customerId) : null;
  const staff = a.staffId ? staffMap.get(a.staffId) : null;
  const endAt = new Date(a.scheduledAt.getTime() + a.durationMinutes * 60 * 1000);
  return {
    id: a.id,
    merchantId: a.merchantId,
    customerId: a.customerId ?? null,
    staffId: a.staffId ?? null,
    title: a.title,
    description: a.description ?? null,
    scheduledAt: a.scheduledAt.toISOString(),
    endAt: endAt.toISOString(),
    durationMinutes: a.durationMinutes,
    status: a.status,
    notes: a.notes ?? null,
    customerName: customer ? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || null : null,
    staffName: staff?.name ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/appointments", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const year = req.query.year ? parseInt(String(req.query.year), 10) : null;
  const month = req.query.month ? parseInt(String(req.query.month), 10) : null;

  const conditions = [eq(appointmentsTable.merchantId, merchantId)];
  if (year && month) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    conditions.push(gte(appointmentsTable.scheduledAt, start));
    conditions.push(lt(appointmentsTable.scheduledAt, end));
  }

  const appts = await db
    .select()
    .from(appointmentsTable)
    .where(and(...conditions))
    .orderBy(appointmentsTable.scheduledAt);

  const customerIds = [...new Set(appts.filter((a) => a.customerId).map((a) => a.customerId!))];
  const staffIds = [...new Set(appts.filter((a) => a.staffId).map((a) => a.staffId!))];

  const [customers, staffMembers] = await Promise.all([
    customerIds.length > 0
      ? db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId))
      : Promise.resolve([]),
    staffIds.length > 0
      ? db.select().from(staffTable).where(eq(staffTable.merchantId, merchantId))
      : Promise.resolve([]),
  ]);

  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const staffMap = new Map(staffMembers.map((s) => [s.id, s]));

  const result = await Promise.all(appts.map((a) => formatAppointment(a, customerMap, staffMap)));
  res.json(result);
});

router.post("/appointments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const merchantId = req.session.merchantId!;
  const { scheduledAt, endAt, title, customerId, staffId, status, notes } = parsed.data;

  const start = new Date(scheduledAt);
  const end = new Date(endAt);
  const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));

  // Auto-generate a title if not provided
  let resolvedTitle = title ?? "Appointment";
  if (!title && customerId) {
    const [customer] = await db.select().from(customersTable).where(
      and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId))
    );
    if (customer) {
      resolvedTitle = `Appointment — ${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim();
    }
  }

  const [appt] = await db
    .insert(appointmentsTable)
    .values({
      merchantId,
      customerId: customerId ?? null,
      staffId: staffId ?? null,
      title: resolvedTitle,
      scheduledAt: start,
      durationMinutes,
      status: status ?? "scheduled",
      notes: notes ?? null,
    })
    .returning();

  const customers = await db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId));
  const staffMembers = await db.select().from(staffTable).where(eq(staffTable.merchantId, merchantId));
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const staffMap = new Map(staffMembers.map((s) => [s.id, s]));

  res.status(201).json(await formatAppointment(appt, customerMap, staffMap));
});

router.patch("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const merchantId = req.session.merchantId!;
  const { scheduledAt, endAt, ...rest } = parsed.data;

  const updates: Record<string, unknown> = { ...rest };
  if (scheduledAt) updates.scheduledAt = new Date(scheduledAt);
  if (scheduledAt && endAt) {
    const start = new Date(scheduledAt);
    const end = new Date(endAt);
    updates.durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  }

  const [appt] = await db
    .update(appointmentsTable)
    .set(updates)
    .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.merchantId, merchantId)))
    .returning();

  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const customers = await db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId));
  const staffMembers = await db.select().from(staffTable).where(eq(staffTable.merchantId, merchantId));
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const staffMap = new Map(staffMembers.map((s) => [s.id, s]));

  res.json(await formatAppointment(appt, customerMap, staffMap));
});

router.delete("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(appointmentsTable)
    .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
