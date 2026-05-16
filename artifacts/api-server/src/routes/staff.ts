import { Router, type IRouter } from "express";
import { db, staffTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateStaffBody,
  GetStaffMemberParams,
  UpdateStaffParams,
  UpdateStaffBody,
  DeleteStaffParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatStaff(s: typeof staffTable.$inferSelect) {
  return {
    id: s.id,
    merchantId: s.merchantId,
    name: s.name,
    firstName: s.firstName ?? null,
    lastName: s.lastName ?? null,
    email: s.email ?? null,
    phone: s.phone ?? null,
    dateOfBirth: s.dateOfBirth ?? null,
    company: s.company ?? null,
    abn: s.abn ?? null,
    billingAddress: s.billingAddress ?? null,
    postalAddress: s.postalAddress ?? null,
    role: s.role,
    pin: s.pin ?? null,
    isActive: s.isActive === "true",
    defaultRegisterType: s.defaultRegisterType ?? null,
    payRate: s.payRate ?? null,
    loadingRate: s.loadingRate ?? null,
    superRate: s.superRate ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/staff", requireAuth, async (req, res): Promise<void> => {
  const staff = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.merchantId, req.session.merchantId!))
    .orderBy(staffTable.name);
  res.json(staff.map(formatStaff));
});

router.post("/staff", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { firstName, lastName, isActive, ...rest } = parsed.data as typeof parsed.data & { isActive?: boolean };
  // Derive combined name from firstName + lastName if provided
  const derivedName =
    firstName || lastName
      ? `${firstName ?? ""} ${lastName ?? ""}`.trim() || parsed.data.name
      : parsed.data.name;
  const [member] = await db
    .insert(staffTable)
    .values({
      ...rest,
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      name: derivedName,
      merchantId: req.session.merchantId!,
    })
    .returning();
  res.status(201).json(formatStaff(member));
});

router.get("/staff/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetStaffMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [member] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.id, params.data.id), eq(staffTable.merchantId, req.session.merchantId!)));
  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  res.json(formatStaff(member));
});

router.patch("/staff/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { isActive, firstName, lastName, name, ...rest } = parsed.data as typeof parsed.data & {
    firstName?: string;
    lastName?: string;
  };
  const updates: Record<string, unknown> = { ...rest };
  if (isActive !== undefined) updates.isActive = isActive ? "true" : "false";
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  // Recompute combined name if first/last supplied
  if (firstName !== undefined || lastName !== undefined) {
    const existing = await db
      .select()
      .from(staffTable)
      .where(and(eq(staffTable.id, params.data.id), eq(staffTable.merchantId, req.session.merchantId!)))
      .limit(1);
    const base = existing[0];
    const fn = firstName ?? base?.firstName ?? "";
    const ln = lastName ?? base?.lastName ?? "";
    updates.name = `${fn} ${ln}`.trim() || name || base?.name || "Staff";
  } else if (name !== undefined) {
    updates.name = name;
  }

  const [member] = await db
    .update(staffTable)
    .set(updates)
    .where(and(eq(staffTable.id, params.data.id), eq(staffTable.merchantId, req.session.merchantId!)))
    .returning();
  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  res.json(formatStaff(member));
});

router.delete("/staff/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(staffTable)
    .where(and(eq(staffTable.id, params.data.id), eq(staffTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
