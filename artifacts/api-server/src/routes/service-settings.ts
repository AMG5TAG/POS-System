import { Router, type IRouter } from "express";
import { db, serviceSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateServiceSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

/** Every service job menu section is visible unless a merchant turns it off. */
const DEFAULT_CONFIG = {
  showPartsLabour: true,
  showApprovalDeposit: true,
  showDiagnostics: true,
  showWarranty: true,
  showTechnicianTime: true,
  showSignOff: true,
  showShipping: true,
  showNotes: true,
};

function formatSettings(row: typeof serviceSettingsTable.$inferSelect | undefined) {
  const cfg = (row?.config ?? {}) as Partial<typeof DEFAULT_CONFIG>;
  return {
    showPartsLabour:    cfg.showPartsLabour    ?? DEFAULT_CONFIG.showPartsLabour,
    showApprovalDeposit: cfg.showApprovalDeposit ?? DEFAULT_CONFIG.showApprovalDeposit,
    showDiagnostics:    cfg.showDiagnostics    ?? DEFAULT_CONFIG.showDiagnostics,
    showWarranty:       cfg.showWarranty       ?? DEFAULT_CONFIG.showWarranty,
    showTechnicianTime: cfg.showTechnicianTime ?? DEFAULT_CONFIG.showTechnicianTime,
    showSignOff:        cfg.showSignOff        ?? DEFAULT_CONFIG.showSignOff,
    showShipping:       cfg.showShipping       ?? DEFAULT_CONFIG.showShipping,
    showNotes:          cfg.showNotes          ?? DEFAULT_CONFIG.showNotes,
  };
}

router.get("/service-settings", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(serviceSettingsTable)
    .where(eq(serviceSettingsTable.merchantId, req.session.merchantId!));
  res.json(formatSettings(row));
});

router.put("/service-settings", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateServiceSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(serviceSettingsTable)
    .where(eq(serviceSettingsTable.merchantId, req.session.merchantId!));

  const config = { ...((existing?.config ?? {}) as object), ...parsed.data };

  let row: typeof serviceSettingsTable.$inferSelect;
  if (existing) {
    [row] = await db
      .update(serviceSettingsTable)
      .set({ config })
      .where(eq(serviceSettingsTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(serviceSettingsTable)
      .values({ merchantId: req.session.merchantId!, config })
      .returning();
  }

  res.json(formatSettings(row));
});

export default router;
