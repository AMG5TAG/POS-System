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
    email: s.email ?? null,
    role: s.role,
    pin: s.pin ?? null,
    isActive: s.isActive === "true",
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
  const [member] = await db
    .insert(staffTable)
    .values({ ...parsed.data, merchantId: req.session.merchantId! })
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
  const { isActive, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (isActive !== undefined) updates.isActive = isActive ? "true" : "false";

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
