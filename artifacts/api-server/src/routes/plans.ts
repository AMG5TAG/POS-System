import { Router, type IRouter } from "express";
import { db, plansTable, modulesTable, subscriptionsTable, merchantModulesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { GetPlanParams, EnableModuleParams, DisableModuleParams } from "@workspace/api-zod";

const router: IRouter = Router();

function formatPlan(p: typeof plansTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description ?? null,
    priceMonthly: parseFloat(p.priceMonthly),
    priceYearly: parseFloat(p.priceYearly),
    maxRegisters: p.maxRegisters ?? null,
    maxStaff: p.maxStaff ?? null,
    features: p.features ?? [],
    isPopular: p.isPopular === "true",
    sortOrder: p.sortOrder,
  };
}

function formatModule(m: typeof modulesTable.$inferSelect, isEnabled = false) {
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    description: m.description,
    priceMonthly: parseFloat(m.priceMonthly),
    category: m.category,
    icon: m.icon,
    isEnabled,
  };
}

router.get("/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(plansTable).orderBy(plansTable.sortOrder);
  res.json(plans.map(formatPlan));
});

router.get("/plans/:id", async (req, res): Promise<void> => {
  const params = GetPlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, params.data.id));
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.json(formatPlan(plan));
});

router.get("/modules", async (_req, res): Promise<void> => {
  const modules = await db.select().from(modulesTable).orderBy(modulesTable.sortOrder);
  res.json(modules.map((m) => formatModule(m)));
});

router.get("/subscriptions/me", requireAuth, async (req, res): Promise<void> => {
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.merchantId, req.session.merchantId!));

  if (!sub) {
    res.status(404).json({ error: "No subscription found" });
    return;
  }

  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, sub.planId));

  res.json({
    id: sub.id,
    merchantId: sub.merchantId,
    planId: sub.planId,
    plan: plan ? formatPlan(plan) : undefined,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart.toISOString(),
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd === "true",
  });
});

router.get("/subscriptions/me/modules", requireAuth, async (req, res): Promise<void> => {
  const merchantModules = await db
    .select()
    .from(merchantModulesTable)
    .where(eq(merchantModulesTable.merchantId, req.session.merchantId!));

  const enabledModuleIds = new Set(merchantModules.map((mm) => mm.moduleId));

  const modules = await db.select().from(modulesTable).orderBy(modulesTable.sortOrder);
  const enabledModules = modules
    .filter((m) => enabledModuleIds.has(m.id))
    .map((m) => formatModule(m, true));

  res.json(enabledModules);
});

router.post("/subscriptions/me/modules/:moduleId", requireAuth, async (req, res): Promise<void> => {
  const params = EnableModuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [module] = await db.select().from(modulesTable).where(eq(modulesTable.id, params.data.moduleId));
  if (!module) {
    res.status(404).json({ error: "Module not found" });
    return;
  }

  const [existing] = await db
    .select()
    .from(merchantModulesTable)
    .where(
      and(
        eq(merchantModulesTable.merchantId, req.session.merchantId!),
        eq(merchantModulesTable.moduleId, params.data.moduleId)
      )
    );

  if (!existing) {
    await db.insert(merchantModulesTable).values({
      merchantId: req.session.merchantId!,
      moduleId: params.data.moduleId,
    });
  }

  res.json(formatModule(module, true));
});

router.delete("/subscriptions/me/modules/:moduleId", requireAuth, async (req, res): Promise<void> => {
  const params = DisableModuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(merchantModulesTable)
    .where(
      and(
        eq(merchantModulesTable.merchantId, req.session.merchantId!),
        eq(merchantModulesTable.moduleId, params.data.moduleId)
      )
    );

  res.sendStatus(204);
});

export default router;
