/* Seed each merchant's Email template from their Invoice template.
 *
 * Invoice emails used to take their wording from the *Invoice* template: the
 * Templates page saved an Email row that nothing ever read. Now the email body
 * is the Email template's document, so without this backfill a merchant who had
 * customised their invoice email would silently fall back to stock wording on
 * the next send.
 *
 * Additive and idempotent by design:
 *   • merchants with no Email row get one, copied from their Invoice row;
 *   • merchants who already have an Email row keep every value they set — only
 *     keys that are missing or blank are filled in from the Invoice row.
 * Nothing is ever overwritten or deleted, so re-running changes nothing.
 */
import { pool } from "@workspace/db";

/** Text the invoice email renders. Blank/missing on the Email row → inherit. */
const TEXT_KEYS = [
  "subjectLine", "customGreeting", "customMessage", "customSignOff", "thankYouMsg",
  // The custom QR moved to the Email row with the body it prints on.
  "customQrImage", "customQrCaption", "customQrCodeId", "customQrCodeLabel", "customQrData",
] as const;

/** Flags the email renders. Absent on the Email row → inherit; false is a value. */
const FLAG_KEYS = [
  "showGstBreakdown", "showWebsite", "showSocialLinks", "socialIconBrandColors", "showCustomQr",
] as const;

interface TemplateRow {
  id: string;
  merchant_id: number;
  template_type: string;
  footer_html: string;
  show_logo: boolean;
  font_family: string;
  is_default: boolean;
  selected_style: string;
  options: Record<string, unknown>;
}

function blank(v: unknown): boolean {
  return v == null || (typeof v === "string" && v.trim() === "");
}

/** Email options carried over from the invoice row, without clobbering. */
function mergedOptions(invoice: Record<string, unknown>, email: Record<string, unknown>) {
  const out = { ...email };
  let changed = false;
  for (const k of TEXT_KEYS) {
    if (blank(out[k]) && !blank(invoice[k])) { out[k] = invoice[k]; changed = true; }
  }
  for (const k of FLAG_KEYS) {
    if (out[k] === undefined && invoice[k] !== undefined) { out[k] = invoice[k]; changed = true; }
  }
  return { options: out, changed };
}

async function main() {
  try {
    const { rows } = await pool.query<TemplateRow>(
      `SELECT id, merchant_id, template_type, footer_html, show_logo, font_family,
              is_default, selected_style, options
         FROM sales_templates
        WHERE template_type IN ('Invoice', 'Email')`,
    );

    const invoices = new Map<number, TemplateRow>();
    const emails = new Map<number, TemplateRow>();
    for (const r of rows) {
      (r.template_type === "Invoice" ? invoices : emails).set(r.merchant_id, r);
    }

    let created = 0;
    let filled = 0;

    for (const [merchantId, inv] of invoices) {
      const invOpts = (inv.options ?? {}) as Record<string, unknown>;
      const existing = emails.get(merchantId);

      if (!existing) {
        const { options } = mergedOptions(invOpts, {});
        await pool.query(
          `INSERT INTO sales_templates
             (merchant_id, template_type, header_html, footer_html, show_logo,
              font_family, is_default, selected_style, options)
           VALUES ($1, 'Email', '', $2, $3, $4, $5, 'e-pro', $6)
           ON CONFLICT (merchant_id, template_type) DO NOTHING`,
          [merchantId, inv.footer_html ?? "", inv.show_logo ?? true, inv.font_family ?? "inter",
           inv.is_default ?? true, JSON.stringify(options)],
        );
        created++;
        continue;
      }

      const { options, changed } = mergedOptions(invOpts, (existing.options ?? {}) as Record<string, unknown>);
      const footer = blank(existing.footer_html) && !blank(inv.footer_html) ? inv.footer_html : existing.footer_html;
      const footerChanged = footer !== existing.footer_html;
      if (!changed && !footerChanged) continue;

      await pool.query(
        `UPDATE sales_templates SET options = $2, footer_html = $3 WHERE id = $1`,
        [existing.id, JSON.stringify(options), footer],
      );
      filled++;
    }

    console.log(`Email templates seeded from Invoice: ${created} created, ${filled} filled in`);
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
