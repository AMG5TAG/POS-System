import { Router, type IRouter } from "express";
import { db, serviceSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateServiceSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

/** Every service job menu section is visible unless a merchant turns it off. */
const DEFAULT_CONFIG = {
  showQuote: true,
  showPartsLabour: true,
  showApprovalDeposit: true,
  showDiagnostics: true,
  showWarranty: true,
  showTechnicianTime: true,
  showSignOff: true,
  showShipping: true,
  showNotes: true,
  // Default warranty windows (days) pre-filled on new service jobs / reworks.
  repairWarrantyDays: 14,
  reworkWarrantyDays: 14,
  /* What the Print button produces. "ask" is the behaviour every merchant has
     today — the chooser — so an existing row with no key set is unchanged. */
  defaultPrint: "ask" as DefaultPrint,
};

const DEFAULT_PRINT_VALUES = ["ask", "a4", "80mm", "sticker"] as const;
type DefaultPrint = (typeof DEFAULT_PRINT_VALUES)[number];

/* Stored config is merchant-supplied JSON, so an unrecognised value falls back
   to the chooser rather than a paper nothing knows how to print. */
const asDefaultPrint = (v: unknown): DefaultPrint =>
  DEFAULT_PRINT_VALUES.includes(v as DefaultPrint) ? (v as DefaultPrint) : "ask";

const clampDays = (v: unknown, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

function formatSettings(row: typeof serviceSettingsTable.$inferSelect | undefined) {
  const cfg = (row?.config ?? {}) as Partial<typeof DEFAULT_CONFIG>;
  return {
    showQuote:          cfg.showQuote          ?? DEFAULT_CONFIG.showQuote,
    showPartsLabour:    cfg.showPartsLabour    ?? DEFAULT_CONFIG.showPartsLabour,
    showApprovalDeposit: cfg.showApprovalDeposit ?? DEFAULT_CONFIG.showApprovalDeposit,
    showDiagnostics:    cfg.showDiagnostics    ?? DEFAULT_CONFIG.showDiagnostics,
    showWarranty:       cfg.showWarranty       ?? DEFAULT_CONFIG.showWarranty,
    showTechnicianTime: cfg.showTechnicianTime ?? DEFAULT_CONFIG.showTechnicianTime,
    showSignOff:        cfg.showSignOff        ?? DEFAULT_CONFIG.showSignOff,
    showShipping:       cfg.showShipping       ?? DEFAULT_CONFIG.showShipping,
    showNotes:          cfg.showNotes          ?? DEFAULT_CONFIG.showNotes,
    repairWarrantyDays: clampDays(cfg.repairWarrantyDays, DEFAULT_CONFIG.repairWarrantyDays),
    reworkWarrantyDays: clampDays(cfg.reworkWarrantyDays, DEFAULT_CONFIG.reworkWarrantyDays),
    defaultPrint:       asDefaultPrint(cfg.defaultPrint),
  };
}

/** Merchant-level warranty defaults applied when creating service/rework jobs. */
export async function getServiceWarrantyDefaults(merchantId: number): Promise<{ repairWarrantyDays: number; reworkWarrantyDays: number }> {
  const [row] = await db
    .select()
    .from(serviceSettingsTable)
    .where(eq(serviceSettingsTable.merchantId, merchantId));
  const s = formatSettings(row);
  return { repairWarrantyDays: s.repairWarrantyDays, reworkWarrantyDays: s.reworkWarrantyDays };
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
