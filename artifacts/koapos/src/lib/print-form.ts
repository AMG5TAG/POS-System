/* ─── Customer form printing ──────────────────────────────────────────────────
 * Builds a standalone A4 document for a filled-in customer form (consent,
 * privacy notice, intake questionnaire…).
 *
 * The Print button used to call a bare `window.print()`, which printed the whole
 * app — sidebar, dialog overlay and all — rather than the form. This renders the
 * form on its own so what comes out is a document a customer can sign and keep.
 */
import type { FormField, FormTemplate } from "@/lib/forms-api";

export interface FormPrintBusiness {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  primaryColor?: string;
}

export interface FormPrintCustomer {
  name?: string;
  email?: string;
  phone?: string;
}

/** Fields that are layout, not data — they carry no answer to print. */
const LAYOUT_FIELDS = new Set(["section_header", "divider"]);

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

/** A signature field holds a data: URL; everything else is plain text. */
function isSignature(field: FormField, value: unknown): value is string {
  return field.type === "signature" && typeof value === "string" && value.startsWith("data:");
}

function renderValue(field: FormField, value: unknown): string {
  if (isSignature(field, value)) {
    return `<img class="sig" src="${esc(value)}" alt="Signature" />`;
  }
  if (Array.isArray(value)) return esc(value.join(", "));
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return esc(value);
}

/**
 * Render one form + its answers as a complete, self-contained A4 document.
 * Section headers are kept as headings so the printed form reads in the same
 * order as the on-screen one.
 */
export function buildFormPrintHtml(opts: {
  form: FormTemplate;
  data: Record<string, unknown>;
  business?: FormPrintBusiness | null;
  customer?: FormPrintCustomer | null;
  /** Defaults to now — pass a submission's createdAt when reprinting one. */
  submittedAt?: string | number | Date;
}): string {
  const { form, data, business, customer } = opts;
  const brand = /^#[0-9a-fA-F]{3,8}$/.test(business?.primaryColor ?? "") ? business!.primaryColor! : "#0f766e";
  const when = new Date(opts.submittedAt ?? Date.now()).toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const rows = form.fields
    .map((field) => {
      if (field.type === "section_header") {
        return `<h2 class="section">${esc(field.label)}</h2>`;
      }
      if (field.type === "divider") return `<hr class="rule" />`;

      const value = data[field.id];
      // Unanswered optional fields print as a blank rule so the form can be
      // completed by hand; the label alone would read as missing data.
      const rendered = value === undefined || value === null || value === ""
        ? '<span class="blank"></span>'
        : renderValue(field, value);
      return `<div class="row"><div class="label">${esc(field.label)}</div><div class="value">${rendered}</div></div>`;
    })
    .join("\n");

  const contact = [business?.address, business?.phone, business?.email]
    .filter(Boolean)
    .map((v) => esc(v))
    .join(" &nbsp;·&nbsp; ");

  const customerLine = [customer?.name, customer?.phone, customer?.email]
    .filter(Boolean)
    .map((v) => esc(v))
    .join(" &nbsp;·&nbsp; ");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(form.name)}</title>
<style>
  *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 12px;
    color: #111; background: #fff; line-height: 1.5; padding: 0; }
  header { border-bottom: 2px solid ${brand}; padding-bottom: 12px; margin-bottom: 18px; }
  .biz { font-size: 17px; font-weight: 700; }
  .contact, .meta { font-size: 10px; color: #666; margin-top: 2px; }
  h1 { font-size: 15px; font-weight: 700; color: ${brand}; margin-top: 10px;
    text-transform: uppercase; letter-spacing: 0.6px; }
  .desc { font-size: 11px; color: #555; margin-top: 4px; }
  .section { font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.5px; color: #888; margin: 16px 0 6px; }
  .rule { border: none; border-top: 1px solid #e5e5e5; margin: 12px 0; }
  .row { display: flex; gap: 12px; padding: 5px 0; border-bottom: 1px solid #f0f0f0;
    page-break-inside: avoid; }
  .label { width: 38%; font-weight: 600; color: #444; }
  .value { flex: 1; overflow-wrap: anywhere; }
  .blank { display: block; border-bottom: 1px solid #bbb; height: 13px; }
  .sig { max-height: 60px; max-width: 100%; display: block; }
  footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #eee;
    font-size: 9px; color: #999; }
  @page { size: A4 portrait; margin: 14mm; }
</style>
</head>
<body>
  <header>
    <div class="biz">${esc(business?.name) || "&nbsp;"}</div>
    ${contact ? `<div class="contact">${contact}</div>` : ""}
    <h1>${esc(form.name)}</h1>
    ${form.description ? `<div class="desc">${esc(form.description)}</div>` : ""}
    <div class="meta">${esc(when)}${customerLine ? ` &nbsp;·&nbsp; ${customerLine}` : ""}</div>
  </header>
  ${rows}
  <footer>${esc(business?.name)} &nbsp;·&nbsp; ${esc(form.name)} &nbsp;·&nbsp; ${esc(when)}</footer>
</body>
</html>`;
}

/** True when a field carries an answer worth printing (not layout). */
export function isAnswerableField(field: FormField): boolean {
  return !LAYOUT_FIELDS.has(field.type);
}
