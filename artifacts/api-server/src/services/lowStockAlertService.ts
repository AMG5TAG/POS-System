import { db, lowStockAlertSettingsTable, lowStockAlertLogTable, productsTable, merchantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendEmail } from "./email";
import type { Logger } from "pino";

export interface LowStockItem {
  productId: number;
  productName: string;
  sku: string | null;
  stockQuantity: number;
  threshold: number;
}

function getInventoryUrl(): string {
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
  if (domain) return `https://${domain}/app/inventory`;
  return "/app/inventory";
}

function buildEmailHtml(items: LowStockItem[], merchantName: string): string {
  const rows = items.map((item) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${item.productName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#666;">${item.sku ?? "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;color:#e53e3e;">${item.stockQuantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#888;">${item.threshold}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;background:#f9fafb;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#efbf04;padding:24px 32px;">
      <h1 style="margin:0;font-size:20px;color:#1a1a1a;">⚠️ Low Stock Alert</h1>
      <p style="margin:4px 0 0;font-size:14px;color:#4a4a1a;">${merchantName}</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="color:#555;font-size:14px;margin-top:0;">
        The following ${items.length === 1 ? "product has" : `${items.length} products have`} reached or dropped below the low-stock threshold.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888;font-weight:600;">Product</th>
            <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888;font-weight:600;">SKU</th>
            <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888;font-weight:600;">In Stock</th>
            <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888;font-weight:600;">Threshold</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:24px;">
        <a href="${getInventoryUrl()}" style="display:inline-block;background:#efbf04;color:#1a1a1a;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px;">View Inventory</a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f0f0f0;">
      <p style="margin:0;font-size:12px;color:#aaa;">Sent by KoaPOS · Manage alerts in Settings → Business Info</p>
    </div>
  </div>
</body>
</html>`;
}

function buildEmailText(items: LowStockItem[], merchantName: string): string {
  const lines = items.map((i) => `- ${i.productName}${i.sku ? ` (${i.sku})` : ""}: ${i.stockQuantity} in stock (threshold: ${i.threshold})`);
  return `Low Stock Alert — ${merchantName}\n\n${lines.join("\n")}\n\nVisit your Inventory page to restock.`;
}

async function logAlert(merchantId: number, mode: string, items: LowStockItem[], emailAddresses: string[]): Promise<void> {
  await db.insert(lowStockAlertLogTable).values({
    merchantId,
    mode,
    itemCount: items.length,
    emailAddresses: JSON.stringify(emailAddresses),
    items: JSON.stringify(items),
  });
}

export async function sendLowStockAlert(merchantId: number, items: LowStockItem[], mode: string, emailAddresses: string[]): Promise<void> {
  if (!items.length || !emailAddresses.length) return;

  const [merchant] = await db.select({ businessName: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));
  const merchantName = merchant?.businessName ?? "Your Store";

  const subject = items.length === 1
    ? `Low Stock Alert: ${items[0]!.productName} (${items[0]!.stockQuantity} left)`
    : `Low Stock Alert: ${items.length} products need restocking`;

  for (const email of emailAddresses) {
    await sendEmail(merchantId, {
      to: email,
      subject,
      html: buildEmailHtml(items, merchantName),
      text: buildEmailText(items, merchantName),
    });
  }

  await logAlert(merchantId, mode, items, emailAddresses);
}

export async function maybeQueueImmediateAlert(
  merchantId: number,
  product: { id: number; name: string; sku: string | null; stockQuantity: number; lowStockThreshold: number | null; trackInventory: string },
  previousStockQuantity: number,
): Promise<void> {
  if (product.trackInventory !== "true") return;

  const [settings] = await db.select()
    .from(lowStockAlertSettingsTable)
    .where(eq(lowStockAlertSettingsTable.merchantId, merchantId));

  if (!settings || settings.enabled !== "true" || settings.mode !== "immediate") return;

  const emailAddresses: string[] = JSON.parse(settings.emailAddresses ?? "[]");
  if (!emailAddresses.length) return;

  const threshold = product.lowStockThreshold ?? settings.globalThreshold ?? 5;

  // Only alert when stock crosses from above the threshold to at-or-below (newly low).
  // Skip if it was already at or below threshold before this update.
  const wasAlreadyLow = previousStockQuantity <= threshold;
  const isNowLow = product.stockQuantity <= threshold;
  if (!isNowLow || wasAlreadyLow) return;

  await sendLowStockAlert(merchantId, [{
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    stockQuantity: product.stockQuantity,
    threshold,
  }], "immediate", emailAddresses);
}

export async function sendDigestForAllMerchants(logger: Logger): Promise<void> {
  const settingsRows = await db.select()
    .from(lowStockAlertSettingsTable)
    .where(and(
      eq(lowStockAlertSettingsTable.enabled, "true"),
      eq(lowStockAlertSettingsTable.mode, "digest"),
    ));

  for (const settings of settingsRows) {
    try {
      const emailAddresses: string[] = JSON.parse(settings.emailAddresses ?? "[]");
      if (!emailAddresses.length) continue;

      const products = await db.select()
        .from(productsTable)
        .where(and(
          eq(productsTable.merchantId, settings.merchantId),
          eq(productsTable.trackInventory, "true"),
        ));

      const items: LowStockItem[] = products
        .filter((p) => {
          const threshold = p.lowStockThreshold ?? settings.globalThreshold ?? 5;
          return p.stockQuantity <= threshold;
        })
        .map((p) => ({
          productId: p.id,
          productName: p.name,
          sku: p.sku ?? null,
          stockQuantity: p.stockQuantity,
          threshold: p.lowStockThreshold ?? settings.globalThreshold ?? 5,
        }));

      if (!items.length) continue;

      await sendLowStockAlert(settings.merchantId, items, "digest", emailAddresses);
      logger.info({ merchantId: settings.merchantId, itemCount: items.length }, "Low-stock digest sent");
    } catch (err) {
      logger.error({ err, merchantId: settings.merchantId }, "Failed to send low-stock digest");
    }
  }
}
