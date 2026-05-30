import type { CSSProperties } from "react";
import type { TplOpts } from "@/pages/app/management-templates";

/**
 * Unified, print-ready Service Job Sheet.
 *
 * This is the SINGLE source of truth for the printed/reprinted A4 service sheet.
 * Both the "New Service" creation flow (service-jobs-new.tsx) and the "Reprint"
 * flow (service-jobs.tsx) render this exact component so the two outputs are
 * structurally identical and always follow the configured template
 * (Management > Templates → Service Ticket).
 *
 * All styling is locked down with explicit inline styles so the browser cannot
 * re-flow or rearrange the layout away from the template bounds at print time.
 */

export interface ServiceSheetBranding {
  businessName: string;
  abn?: string;
  website?: string;
  email?: string;
  /** Single-line address (e.g. "New South Wales 2259"). */
  address?: string;
  brandColor: string;
  logo?: string;
}

export interface ServiceSheetFormFile {
  name: string;
  detail?: string;
}

/** Canonical human-readable labels for service-job status codes. */
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  "in-progress": "In Progress",
  "awaiting-partner-approval": "Awaiting Partner Approval",
  "partner-replacement": "Partner Replacement",
  "awaiting-stock": "Awaiting Stock",
  "awaiting-customer": "Awaiting Customer",
  completed: "Completed",
  cancelled: "Cancelled",
};

function humanizeStatus(s: string): string {
  if (!s) return "";
  return STATUS_LABELS[s] ?? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface ServiceSheetData {
  jobNumber: string;
  date?: string | number | Date | null;
  /** Raw status code (e.g. "awaiting-partner-approval"); humanized for display. */
  status: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  deviceType?: string;
  deviceModel?: string;
  serialNumber?: string;
  condition?: string;
  workDescription?: string;
  additionalEquipment?: string;
  /** Newline-separated PIN/password lines. */
  logins?: string;
  /** Newline-separated account lines. */
  accounts?: string;
  notes?: string;
  photos?: string[];
  /** Captured customer signature (data URL). */
  signature?: string;
  isCritical?: boolean;
  isUnderWarranty?: boolean;
  isPartnerRepair?: boolean;
  partnerRepairCode?: string;
  formsFiles?: ServiceSheetFormFile[];
}

const RULE = "#1f2937"; // dark header rule, matches template
const BORDER = "#dddddd";
const LABEL = "#888888";
const MUTED = "#666666";

const labelStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: "bold",
  textTransform: "uppercase",
  color: LABEL,
  letterSpacing: "0.5px",
  marginBottom: "8px",
};

const boxStyle: CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: "6px",
  padding: "12px",
};

/** Wrap long free-text safely so it never collapses the layout. */
const wrapStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

function mergeCredentials(accounts?: string, logins?: string): string[] {
  const accts = (accounts ?? "").split("\n").map((s) => s.trim());
  const pins = (logins ?? "").split("\n").map((s) => s.trim());
  const max = Math.max(accts.length, pins.length);
  return Array.from({ length: max }, (_, i) => {
    const a = accts[i] || "";
    const p = pins[i] || "";
    if (a && p) return `${a} — ${p}`;
    return a || p;
  }).filter(Boolean);
}

export function ServiceJobSheet({
  id,
  data,
  branding,
  opts,
  fontCss,
}: {
  id: string;
  data: ServiceSheetData;
  branding: ServiceSheetBranding;
  opts: TplOpts;
  fontCss: string;
}) {
  const callRows = Math.max(1, Math.min(20, parseInt(opts.callHistoryRows || "6", 10) || 6));
  const jobNoSize =
    opts.jobNoFontSize?.toLowerCase() === "xlarge"
      ? "26px"
      : opts.jobNoFontSize?.toLowerCase() === "large"
        ? "22px"
        : "16px";

  const dateStr = data.date ? new Date(data.date).toLocaleDateString("en-AU") : "";
  const credentialLines = mergeCredentials(data.accounts, data.logins);
  const photos = (data.photos ?? []).filter(Boolean);

  const showCustomer = opts.showCustomerDetails;
  const showDevice = opts.showDeviceDetails;

  return (
    <div
      id={id}
      style={{
        width: "800px",
        background: "white",
        padding: "40px",
        boxSizing: "border-box",
        fontFamily: fontCss,
        fontSize: "12px",
        color: "#111",
        lineHeight: 1.6,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          borderBottom: `2px solid ${RULE}`,
          paddingBottom: "14px",
          marginBottom: "22px",
        }}
      >
        <div>
          {opts.showLogo &&
            (branding.logo ? (
              <img
                src={branding.logo}
                alt="Logo"
                style={{ maxHeight: "40px", maxWidth: "80px", objectFit: "contain", marginBottom: "6px", display: "block" }}
              />
            ) : (
              <div style={{ width: "30px", height: "30px", borderRadius: "5px", background: branding.brandColor, marginBottom: "6px" }} />
            ))}
          <div style={{ fontSize: "18px", fontWeight: "bold" }}>{branding.businessName || "Service Centre"}</div>
          {opts.showAbn && branding.abn && <div style={{ color: MUTED, fontSize: "11px" }}>ABN {branding.abn}</div>}
          {branding.address && <div style={{ color: MUTED, fontSize: "11px" }}>{branding.address}</div>}
          {branding.email && <div style={{ color: MUTED, fontSize: "11px" }}>{branding.email}</div>}
          {opts.showWebsite && branding.website && <div style={{ color: MUTED, fontSize: "11px" }}>{branding.website}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "20px", fontWeight: "bold", textTransform: "uppercase", color: branding.brandColor, letterSpacing: "1px" }}>
            {opts.headerText || "Service Job Sheet"}
          </div>
          <div style={{ marginTop: "6px", fontSize: jobNoSize, fontWeight: "bold" }}>
            Job No: <strong>{data.jobNumber}</strong>
          </div>
          {dateStr && <div>Date: <strong>{dateStr}</strong></div>}
          <div>Status: <strong>{humanizeStatus(data.status)}</strong></div>
          <div style={{ marginTop: "6px", display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
            {data.isCritical && <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>CRITICAL</span>}
            {data.isUnderWarranty && <span style={{ background: "#d1fae5", color: "#065f46", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>WARRANTY</span>}
            {data.isPartnerRepair && <span style={{ background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>PARTNER REPAIR{data.partnerRepairCode ? ` · ${data.partnerRepairCode}` : ""}</span>}
          </div>
        </div>
      </div>

      {/* ── Customer + Device ──────────────────────────────────── */}
      {(showCustomer || showDevice) && (
        <div style={{ display: "grid", gridTemplateColumns: showCustomer && showDevice ? "1fr 1fr" : "1fr", gap: "16px", marginBottom: "16px" }}>
          {showCustomer && (
            <div style={boxStyle}>
              <div style={labelStyle}>Customer</div>
              <div><strong>Name:</strong> {data.customerName || "Walk-in"}</div>
              {data.customerPhone && <div><strong>Phone:</strong> {data.customerPhone}</div>}
              {data.customerEmail && <div style={wrapStyle}><strong>Email:</strong> {data.customerEmail}</div>}
            </div>
          )}
          {showDevice && (
            <div style={boxStyle}>
              <div style={labelStyle}>Device</div>
              {data.deviceType && <div><strong>Type:</strong> {data.deviceType}</div>}
              {data.deviceModel && <div><strong>Model:</strong> {data.deviceModel}</div>}
              {data.serialNumber && <div><strong>Serial:</strong> {data.serialNumber}</div>}
              {data.condition && <div><strong>Condition:</strong> {data.condition}</div>}
            </div>
          )}
        </div>
      )}

      {/* ── Fault / Work Required ──────────────────────────────── */}
      {opts.showWorkDescription && (
        <div style={{ ...boxStyle, marginBottom: "16px" }}>
          <div style={labelStyle}>Fault / Work Required</div>
          <div style={{ minHeight: "40px", ...wrapStyle }}>{data.workDescription || "—"}</div>
        </div>
      )}

      {/* ── Equipment / Accessories ────────────────────────────── */}
      {data.additionalEquipment && (
        <div style={{ ...boxStyle, marginBottom: "16px" }}>
          <div style={labelStyle}>Equipment / Accessories Received</div>
          <div style={wrapStyle}>{data.additionalEquipment}</div>
        </div>
      )}

      {/* ── Partner repair ─────────────────────────────────────── */}
      {data.isPartnerRepair && data.partnerRepairCode && (
        <div style={{ ...boxStyle, marginBottom: "16px", border: "1px solid #bfdbfe", background: "#eff6ff" }}>
          <div style={labelStyle}>Partner Repair</div>
          <div>Code: <strong>{data.partnerRepairCode}</strong></div>
        </div>
      )}

      {/* ── Warranty notice ────────────────────────────────────── */}
      {opts.warrantyText && (
        <div style={{ ...boxStyle, marginBottom: "16px", border: "1px solid #d1fae5", background: "#f0fdf4", color: "#065f46", fontSize: "11px", ...wrapStyle }}>
          {opts.warrantyText}
        </div>
      )}

      {/* ── Device Photos ──────────────────────────────────────── */}
      {opts.showPhotos && photos.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={labelStyle}>Device Photos</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {photos.map((p, i) => (
              <img key={i} src={p} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "4px", border: `1px solid ${BORDER}` }} alt={`device photo ${i + 1}`} />
            ))}
          </div>
        </div>
      )}

      {/* ── Notes ──────────────────────────────────────────────── */}
      {data.notes && (
        <div style={{ marginBottom: "16px" }}>
          <div style={labelStyle}>Notes</div>
          <div style={wrapStyle}>{data.notes}</div>
        </div>
      )}

      {/* ── Logins / Accounts ──────────────────────────────────── */}
      {opts.showLogins && credentialLines.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={labelStyle}>Logins / Accounts</div>
          <div style={boxStyle}>
            {credentialLines.map((line, i) => (
              <div key={i} style={{ fontFamily: "monospace", fontSize: "11px", ...wrapStyle }}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── Forms and Files ────────────────────────────────────── */}
      {opts.showFormsFiles && (data.formsFiles?.length ?? 0) > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={labelStyle}>Forms and Files</div>
          <div style={boxStyle}>
            {data.formsFiles!.map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "11px" }}>
                <span style={wrapStyle}>{f.name}</span>
                {f.detail && <span style={{ color: LABEL, whiteSpace: "nowrap" }}>{f.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Call History ───────────────────────────────────────── */}
      {opts.showCallHistory && (
        <div style={{ marginBottom: "20px" }}>
          <div style={labelStyle}>Call History</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ccc" }}>
                <th style={{ textAlign: "left", padding: "6px 10px", width: "110px", fontWeight: "bold" }}>Date</th>
                <th style={{ textAlign: "left", padding: "6px 10px", width: "130px", fontWeight: "bold" }}>Staff</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: "bold" }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: callRows }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "16px 10px" }}>&nbsp;</td>
                  <td style={{ padding: "16px 10px" }}>&nbsp;</td>
                  <td style={{ padding: "16px 10px" }}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Signature ──────────────────────────────────────────── */}
      {opts.showSignature && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", marginTop: "32px" }}>
          <div style={{ borderTop: "1px solid #aaa", paddingTop: "6px" }}>
            {data.signature && (
              <img src={data.signature} style={{ maxHeight: "60px", maxWidth: "100%", display: "block", marginBottom: "4px", marginTop: "-46px" }} alt="customer signature" />
            )}
            <div style={{ fontSize: "10px", color: MUTED }}>Customer Signature</div>
            {!data.signature && <div style={{ marginTop: "36px" }}>&nbsp;</div>}
          </div>
          <div style={{ borderTop: "1px solid #aaa", paddingTop: "6px" }}>
            <div style={{ fontSize: "10px", color: MUTED }}>Technician / Staff</div>
            <div style={{ marginTop: "36px" }}>&nbsp;</div>
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      {opts.footerText && (
        <div style={{ marginTop: "24px", paddingTop: "12px", borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: "10px", color: "#999", ...wrapStyle }}>
          {opts.footerText}
        </div>
      )}
    </div>
  );
}
