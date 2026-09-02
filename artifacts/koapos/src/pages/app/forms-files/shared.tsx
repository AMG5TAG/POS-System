/**
 * Pieces shared by the three Forms & Files pages.
 *
 * Forms, Files and Cloud Storage were one page with a tab switcher; they are now
 * three pages, one per menu entry. What they still have in common lives here —
 * the form card and its field styling, the PDF export, and the cloud provider
 * badges — so splitting the page did not mean copying it.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, FileText, Edit2, Trash2, MoreVertical, Eye, Copy, ClipboardList,
  AlignLeft, AlignJustify, ToggleLeft, Calendar, Clock, Mail, Phone,
  Hash, PenLine, Upload, ListOrdered, ChevronDown, Minus, SeparatorHorizontal,
  ShieldCheck, CheckSquare, Zap, Cloud,
} from "lucide-react";
import type { FormTemplate, FormField, FieldType } from "@/lib/forms-api";
import { cn } from "@/lib/utils";

const _SI = (slug: string, hex: string) => `https://cdn.simpleicons.org/${slug}/${hex}`;

export const CLOUD_META: Record<string, { label: string; bg: string; text: string; src?: string }> = {
  google_drive: { label: "Google Drive", bg: "bg-[#4285F4]", text: "G", src: _SI("googledrive", "ffffff") },
  onedrive:     { label: "OneDrive",     bg: "bg-[#0078D4]", text: "O", src: _SI("onedrive",    "ffffff") },
  dropbox:      { label: "Dropbox",      bg: "bg-[#0061FF]", text: "D", src: _SI("dropbox",     "ffffff") },
};

export function CloudFallbackImg({ src, alt, size, fallback }: { src: string; alt: string; size: string; fallback: string }) {
  const [err, setErr] = useState(false);
  if (err) return <Cloud className={cn("text-white/90", size)} />;
  return <img src={src} alt={alt} className={cn("object-contain", size)} onError={() => setErr(true)} />;
}


export async function saveFormAsPdf(
  form: FormTemplate,
  businessName: string,
) {
  const { default: jsPDF } = await import("jspdf");
  const doc        = new jsPDF();
  const pageWidth  = doc.internal.pageSize.getWidth();
  const margin     = 20;
  const usableW    = pageWidth - margin * 2;
  let y            = 20;

  const checkPage = (needed = 20) => {
    if (y + needed > 270) { doc.addPage(); y = 20; }
  };

  // ── Header ──
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(form.name, margin, y);
  y += 8;

  if (businessName) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(businessName, margin, y);
    doc.setTextColor(0);
    y += 6;
  }

  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ── Description ──
  if (form.description) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80);
    const descLines = doc.splitTextToSize(form.description, usableW) as string[];
    doc.text(descLines, margin, y);
    doc.setTextColor(0);
    y += descLines.length * 5 + 8;
  }

  // ── Fields ──
  for (const field of form.fields as FormField[]) {
    if (field.type === "divider") {
      checkPage(10);
      doc.setDrawColor(220);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;
      continue;
    }

    if (field.type === "section_header") {
      checkPage(14);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40);
      doc.text(field.label, margin, y);
      doc.setTextColor(0);
      y += 10;
      continue;
    }

    checkPage(24);

    // Label
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const labelText = field.required ? `${field.label}  *` : field.label;
    const labelLines = doc.splitTextToSize(labelText, usableW) as string[];
    doc.text(labelLines, margin, y);
    y += labelLines.length * 5 + 2;

    // Help text
    if (field.helpText) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(130);
      doc.text(field.helpText, margin, y);
      doc.setTextColor(0);
      y += 5;
    }

    // Input area
    doc.setDrawColor(180);
    doc.setLineWidth(0.4);
    doc.setFont("helvetica", "normal");

    if (field.type === "long_answer") {
      checkPage(36);
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(margin, y, usableW, 28, 1, 1, "FD");
      y += 34;
    } else if (field.type === "yes_no") {
      doc.setFontSize(10);
      doc.text("☐  Yes          ☐  No", margin + 2, y + 5);
      y += 12;
    } else if ((field.type === "multiple_choice" || field.type === "dropdown") && field.options?.length) {
      doc.setFontSize(9);
      for (const opt of field.options) {
        checkPage(7);
        doc.text(`☐  ${opt}`, margin + 4, y);
        y += 6;
      }
      y += 2;
    } else if (field.type === "signature") {
      checkPage(22);
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(margin, y, usableW * 0.6, 18, 1, 1, "FD");
      doc.setFontSize(8);
      doc.setTextColor(160);
      doc.text("Signature", margin + 3, y + 12);
      doc.setTextColor(0);
      y += 24;
    } else {
      // Single-line input
      doc.line(margin, y + 6, pageWidth - margin, y + 6);
      y += 12;
    }

    y += 4;
  }

  // ── Footer ──
  const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160);
    doc.text(
      `${form.name}  ·  Page ${i} of ${pageCount}`,
      margin,
      doc.internal.pageSize.getHeight() - 8,
    );
    doc.setTextColor(0);
  }

  doc.save(`${form.name.replace(/[^a-z0-9]/gi, "_")}.pdf`);
}

// ── Field type icons (for card summary) ─────────────────────────────────

const FIELD_ICONS: Record<FieldType, React.ComponentType<{ className?: string }>> = {
  short_answer:    AlignLeft,
  long_answer:     AlignJustify,
  yes_no:          ToggleLeft,
  date:            Calendar,
  time:            Clock,
  email:           Mail,
  phone:           Phone,
  number:          Hash,
  signature:       PenLine,
  file_upload:     Upload,
  multiple_choice: ListOrdered,
  dropdown:        ChevronDown,
  section_header:  Minus,
  divider:         SeparatorHorizontal,
  privacy_notice:  ShieldCheck,
  marketing_consent: CheckSquare,
};

const FIELD_COLORS: Record<FieldType, string> = {
  short_answer:    "text-blue-500",
  long_answer:     "text-blue-500",
  yes_no:          "text-green-500",
  date:            "text-orange-500",
  time:            "text-orange-400",
  email:           "text-green-600",
  phone:           "text-blue-600",
  number:          "text-purple-500",
  signature:       "text-rose-500",
  file_upload:     "text-indigo-500",
  multiple_choice: "text-purple-600",
  dropdown:        "text-blue-500",
  section_header:  "text-muted-foreground",
  divider:         "text-muted-foreground",
  privacy_notice:  "text-blue-600",
  marketing_consent: "text-green-600",
};

// ── Empty state ──────────────────────────────────────────────────────────

export function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
        <ClipboardList className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">No forms yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Build custom forms to collect data from customers, attach them to sales, services and appointments.
        </p>
      </div>
      <Button onClick={onNew}>
        <Plus className="h-4 w-4 mr-2" /> Create Your First Form
      </Button>
    </div>
  );
}

// ── Form card ────────────────────────────────────────────────────────────

export function FormCard({
  form,
  onEdit,
  onDuplicate,
  onDelete,
  onPreview,
}: {
  form: FormTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const dataFields = (form.fields as FormField[]).filter(
    f => f.type !== "section_header" && f.type !== "divider"
  );
  const hasQuickCodes = (form.fields as FormField[]).some(f =>
    f.label?.includes("{{") || f.placeholder?.includes("{{")
  );

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold truncate">{form.name}</h3>
              {form.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{form.description}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit2 className="h-4 w-4 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPreview}>
                <Eye className="h-4 w-4 mr-2" /> Preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Field type chips */}
        {form.fields.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {(form.fields as FormField[]).slice(0, 8).map(field => {
              const Icon = FIELD_ICONS[field.type] ?? AlignLeft;
              return (
                <div key={field.id} className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5">
                  <Icon className={`h-3 w-3 ${FIELD_COLORS[field.type] ?? ""}`} />
                  <span className="text-[11px] text-muted-foreground">
                    {field.label || field.type.replace("_", " ")}
                  </span>
                </div>
              );
            })}
            {form.fields.length > 8 && (
              <div className="flex items-center bg-muted rounded-full px-2 py-0.5">
                <span className="text-[11px] text-muted-foreground">+{form.fields.length - 8} more</span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 mt-4 pt-3 border-t">
          <span className="text-xs text-muted-foreground">
            {dataFields.length} field{dataFields.length !== 1 ? "s" : ""}
          </span>
          {hasQuickCodes && (
            <Badge variant="outline" className="text-[10px] h-5 gap-1 text-amber-600 border-amber-300">
              <Zap className="h-2.5 w-2.5" /> Quick Codes
            </Badge>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {new Date(form.updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onPreview}>
              <Eye className="h-3.5 w-3.5 mr-1" /> Preview
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onEdit}>
              <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Quick Codes reference panel ──────────────────────────────────────────

export function QuickCodesInfo() {
  return (
    <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">Quick Codes</h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              Add variables like <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">{"{{customer.firstName}}"}</code> to field labels or placeholders.
              When a form is opened for a known customer, these auto-fill with their real details.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["{{customer.firstName}}", "{{customer.email}}", "{{business.name}}", "{{date.today}}"].map(c => (
                <code key={c} className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded">{c}</code>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

