import { Router, type IRouter } from "express";
import { db, tyroSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const DEFAULTS = {
  host: "192.168.1.100",
  port: "8080",
  integrationKey: "",
  tyroMerchantId: "",
  terminalId: "",
  posName: "KoaPOS",
  autoSettle: true,
  motoEnabled: false,
  testMode: false,
};

function fmt(row: typeof tyroSettingsTable.$inferSelect) {
  return {
    host: row.host,
    port: row.port,
    integrationKey: row.integrationKey ?? "",
    tyroMerchantId: row.tyroMerchantId ?? "",
    terminalId: row.terminalId ?? "",
    posName: row.posName,
    autoSettle: row.autoSettle === "true",
    motoEnabled: row.motoEnabled === "true",
    testMode: row.testMode === "true",
  };
}

router.get("/tyro-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(tyroSettingsTable).where(eq(tyroSettingsTable.merchantId, merchantId));
  res.json(row ? fmt(row) : DEFAULTS);
});

router.put("/tyro-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Record<string, unknown>;

  const data = {
    host: String(body.host ?? "192.168.1.100"),
    port: String(body.port ?? "8080"),
    integrationKey: body.integrationKey ? String(body.integrationKey) : null,
    tyroMerchantId: body.tyroMerchantId ? String(body.tyroMerchantId) : null,
    terminalId: body.terminalId ? String(body.terminalId) : null,
    posName: String(body.posName ?? "KoaPOS"),
    autoSettle: body.autoSettle === false ? "false" : "true",
    motoEnabled: body.motoEnabled === true ? "true" : "false",
    testMode: body.testMode === true ? "true" : "false",
  };

  const [existing] = await db.select({ id: tyroSettingsTable.id }).from(tyroSettingsTable)
    .where(eq(tyroSettingsTable.merchantId, merchantId));

  let row;
  if (existing) {
    [row] = await db.update(tyroSettingsTable).set(data)
      .where(eq(tyroSettingsTable.merchantId, merchantId)).returning();
  } else {
    [row] = await db.insert(tyroSettingsTable).values({ merchantId, ...data }).returning();
  }

  res.json(fmt(row!));
});

export default router;
