import { useMemo, type CSSProperties } from "react";
import QRCode from "qrcode";
import type { TplOpts } from "@/pages/app/management-templates";
import { techAppJobUrl } from "@/lib/public-url";
import { humanizeStatus, mergeCredentialLines, type ServiceDocketDensity } from "@/lib/service-sheet-fields";
import type { ServiceSheetBranding, ServiceSheetData } from "@/components/printing/ServiceJobSheet";

/**
 * 80mm thermal Service Job Docket — the narrow-roll counterpart to
 * `ServiceJobSheet` (A4).
 *
 * Two things print this shape:
 *   • an ESC/POS printer, via `buildServiceJobDocketBytes` — silent, no dialog;
 *   • this component, when the docket has to go through a browser/driver print
 *     (no thermal transport configured, or the merchant routed 80mm at a
 *     Windows queue). The two outputs deliberately carry the same fields in the
 *     same order so a job looks the same whichever path it took.
 *
 * Everything is inline-styled and pinned to 72mm (80mm roll minus the printable
 * margin) so the layout survives being serialised and printed elsewhere — the
 * Print Bridge renders this exact markup in headless Chromium.
 *
 * `density` mirrors the ESC/POS encoder: "compact" carries the same job fields
 * and only trims the branding block and the whitespace around them, so a docket
 * looks the same whichever transport printed it.
 */

/** Printable width inside an 80mm roll. 58mm rolls print 48mm. */
const ROLL_WIDTH_MM = 72;

const RULE = "#000";
const MUTED = "#444";

const wrapStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

/** Type scale + spacing per density. Compact only tightens; it hides no field. */
const METRICS = {
  standard: {
    pad: "2mm", font: "11px", lineHeight: 1.35, gap: "6px",
    business: "15px", jobNo: "18px", qr: "26mm", signGap: "12mm", logo: "14mm",
  },
  compact: {
    pad: "1.5mm", font: "10px", lineHeight: 1.2, gap: "3px",
    business: "14px", jobNo: "17px", qr: "20mm", signGap: "8mm", logo: "10mm",
  },
} as const;

/** Build a QR as an SVG path synchronously so it is in the DOM before print. */
function buildQr(text: string): { path: string; size: number } | null {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
    const size = qr.modules.size;
    const cells = qr.modules.data;
    let path = "";
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (cells[y * size + x]) path += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { path, size };
  } catch {
    return null;
  }
}

function Field({ label, value }: { label: string; value?: string | null }) {
  const v = (value ?? "").trim();
  if (!v) return null;
  return (
    <div style={{ display: "flex", gap: "4px", ...wrapStyle }}>
      <span style={{ fontWeight: "bold", flexShrink: 0 }}>{label}:</span>
      <span>{v}</span>
    </div>
  );
}

export function ServiceJobDocket({
  id,
  data,
  branding,
  opts,
  fontCss,
  paperWidth = "80mm",
  density = "standard",
}: {
  id: string;
  data: ServiceSheetData;
  branding: ServiceSheetBranding;
  opts: TplOpts;
  fontCss: string;
  paperWidth?: "80mm" | "58mm";
  density?: ServiceDocketDensity;
}) {
  const widthMm = paperWidth === "58mm" ? 48 : ROLL_WIDTH_MM;
  const compact = density === "compact";
  const m = METRICS[compact ? "compact" : "standard"];
  const dividerStyle: CSSProperties = { borderTop: `1px dashed ${RULE}`, margin: `${m.gap} 0` };
  const sectionTitle: CSSProperties = {
    fontWeight: "bold",
    fontSize: compact ? "10px" : "11px",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    margin: `${m.gap} 0 2px`,
  };
  const dateStr = data.date ? new Date(data.date).toLocaleDateString("en-AU") : "";
  const credentialLines = opts.showLogins ? mergeCredentialLines(data.accounts, data.logins) : [];

  const showQr = opts.showServiceQr !== false;
  const qrTarget = useMemo(() => {
    if (data.jobId == null || !showQr) return null;
    return techAppJobUrl(branding.techAppUsername, data.jobId);
  }, [data.jobId, branding.techAppUsername, showQr]);
  const qr = useMemo(() => (qrTarget ? buildQr(qrTarget) : null), [qrTarget]);

  const flags = [
    data.isCritical ? "CRITICAL" : "",
    data.isUnderWarranty ? "WARRANTY" : "",
    data.isPartnerRepair ? `PARTNER REPAIR${data.partnerRepairCode ? ` ${data.partnerRepairCode}` : ""}` : "",
  ].filter(Boolean);

  // Same guard as every other document: only render a source we recognise, so a
  // stray value can't become an arbitrary request from a printed page.
  const customQrSrc = opts.showCustomQr && /^(https?:|data:image\/)/.test(opts.customQrImage || "")
    ? opts.customQrImage
    : "";

  const headerText = (opts.headerText || "").replace(/<[^>]*>/g, "").trim() || "SERVICE JOB";
  const footerText = (opts.footerText || "").replace(/<[^>]*>/g, "").trim();

  return (
    <div
      id={id}
      style={{
        width: `${widthMm}mm`,
        background: "white",
        color: "#000",
        boxSizing: "border-box",
        padding: m.pad,
        fontFamily: fontCss,
        fontSize: m.font,
        lineHeight: m.lineHeight,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ textAlign: "center" }}>
        {opts.showLogo && branding.logo && (
          <img
            src={branding.logo}
            alt="Logo"
            style={{ maxHeight: m.logo, maxWidth: "100%", objectFit: "contain", display: "block", margin: "0 auto 3px" }}
          />
        )}
        <div style={{ fontSize: m.business, fontWeight: "bold", ...wrapStyle }}>
          {branding.businessName || "Service Centre"}
        </div>
        {opts.showAbn && branding.abn && <div style={{ color: MUTED }}>ABN {branding.abn}</div>}
        {/* Address / web / email are the lines the compact roll drops — the
            customer has them on the receipt, and they cost three lines here. */}
        {!compact && branding.address && <div style={{ color: MUTED, ...wrapStyle }}>{branding.address}</div>}
        {!compact && opts.showWebsite && branding.website && <div style={{ color: MUTED, ...wrapStyle }}>{branding.website}</div>}
        {!compact && branding.email && <div style={{ color: MUTED, ...wrapStyle }}>{branding.email}</div>}
        <div style={{ fontWeight: "bold", marginTop: compact ? "2px" : "4px", letterSpacing: "1px" }}>{headerText}</div>
      </div>

      {/* ── Job identity ────────────────────────────────────────── */}
      <div style={dividerStyle} />
      <div style={{ textAlign: "center", fontSize: m.jobNo, fontWeight: "bold", ...wrapStyle }}>{data.jobNumber}</div>
      <div style={{ marginTop: "3px" }}>
        {dateStr && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: "bold" }}>Date</span><span>{dateStr}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
          <span style={{ fontWeight: "bold", flexShrink: 0 }}>Status</span>
          <span style={{ textAlign: "right", ...wrapStyle }}>{humanizeStatus(data.status)}</span>
        </div>
      </div>
      {flags.length > 0 && (
        <div style={{ textAlign: "center", fontWeight: "bold", marginTop: "3px" }}>
          {flags.map((f) => <div key={f}>** {f} **</div>)}
        </div>
      )}

      {/* ── Customer ────────────────────────────────────────────── */}
      {opts.showCustomerDetails && (
        <>
          <div style={dividerStyle} />
          <div style={sectionTitle}>Customer</div>
          <Field label="Name" value={data.customerName || "Walk-in"} />
          <Field label="Phone" value={data.customerPhone} />
          <Field label="Email" value={data.customerEmail} />
        </>
      )}

      {/* ── Device ──────────────────────────────────────────────── */}
      {opts.showDeviceDetails && (
        <>
          <div style={dividerStyle} />
          <div style={sectionTitle}>Device</div>
          <Field label="Type" value={data.deviceType} />
          <Field label="Model" value={data.deviceModel} />
          <Field label="Colour" value={data.deviceColour} />
          <Field label="Quantity" value={data.deviceQuantity != null ? String(data.deviceQuantity) : ""} />
          <Field label="Serial" value={data.serialNumber} />
          <Field label="Condition" value={data.condition} />
        </>
      )}

      {/* ── Fault / work required ───────────────────────────────── */}
      {opts.showWorkDescription && (
        <>
          <div style={dividerStyle} />
          <div style={sectionTitle}>Fault / Work Required</div>
          <div style={wrapStyle}>{data.workDescription || "—"}</div>
        </>
      )}

      {data.additionalEquipment && (
        <>
          <div style={dividerStyle} />
          <div style={sectionTitle}>Accessories Received</div>
          <div style={wrapStyle}>{data.additionalEquipment}</div>
        </>
      )}

      {/* ── Logins — opt-in; the docket often goes to the customer ── */}
      {credentialLines.length > 0 && (
        <>
          <div style={dividerStyle} />
          <div style={sectionTitle}>Logins / Accounts</div>
          {credentialLines.map((line, i) => (
            <div key={i} style={{ fontFamily: "monospace", ...wrapStyle }}>{line}</div>
          ))}
        </>
      )}

      {opts.showFormsFiles && (data.formsFiles?.length ?? 0) > 0 && (
        <>
          <div style={dividerStyle} />
          <div style={sectionTitle}>Forms and Files</div>
          {data.formsFiles!.map((f, i) => (
            <div key={i} style={wrapStyle}>{f.detail ? `${f.name} (${f.detail})` : f.name}</div>
          ))}
        </>
      )}

      {data.notes && (
        <>
          <div style={dividerStyle} />
          <div style={sectionTitle}>Notes</div>
          <div style={wrapStyle}>{data.notes}</div>
        </>
      )}

      {opts.warrantyText && (
        <>
          <div style={dividerStyle} />
          <div style={{ fontSize: "10px", ...wrapStyle }}>{opts.warrantyText}</div>
        </>
      )}

      {/* ── Signature ───────────────────────────────────────────── */}
      {opts.showSignature && (
        <>
          <div style={dividerStyle} />
          {data.signature ? (
            <img src={data.signature} alt="customer signature" style={{ maxHeight: "18mm", maxWidth: "100%", display: "block" }} />
          ) : (
            <div style={{ height: m.signGap }} />
          )}
          <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: "2px", fontSize: "10px" }}>
            Customer signature
          </div>
        </>
      )}

      {/* ── Tech App QR ─────────────────────────────────────────── */}
      {qr && (
        <>
          <div style={dividerStyle} />
          <div style={{ textAlign: "center" }}>
            <svg
              width={m.qr}
              height={m.qr}
              viewBox={`0 0 ${qr.size} ${qr.size}`}
              shapeRendering="crispEdges"
              role="img"
              aria-label={`QR code for job ${data.jobNumber}`}
            >
              <rect width={qr.size} height={qr.size} fill="#ffffff" />
              <path d={qr.path} fill="#000000" />
            </svg>
            <div style={{ fontSize: "10px" }}>Scan to open in the Tech App</div>
            <div style={{ fontSize: "10px", fontWeight: "bold" }}>{data.jobNumber}</div>
          </div>
        </>
      )}

      {/* ── Custom QR ───────────────────────────────────────────── */}
      {customQrSrc && (
        <>
          <div style={dividerStyle} />
          <div style={{ textAlign: "center" }}>
            <img
              src={customQrSrc}
              alt="custom qr"
              style={{ width: m.qr, height: m.qr, objectFit: "contain", display: "block", margin: "0 auto" }}
            />
            {opts.customQrCaption && <div style={{ fontSize: "10px" }}>{opts.customQrCaption}</div>}
          </div>
        </>
      )}

      {footerText && (
        <div style={{ textAlign: "center", marginTop: m.gap, fontSize: "10px", ...wrapStyle }}>{footerText}</div>
      )}
    </div>
  );
}
