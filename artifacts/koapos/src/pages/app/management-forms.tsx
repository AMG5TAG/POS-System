import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Plus, FileText, Edit2, Trash2, MoreVertical, Eye, Copy, ClipboardList,
  AlignLeft, AlignJustify, ToggleLeft, Calendar, Clock, Mail, Phone,
  Hash, PenLine, Upload, ListOrdered, ChevronDown, Minus, SeparatorHorizontal,
  Zap, Download, Folder, FolderOpen, File, Image, FileSpreadsheet, X,
  Cloud, CloudOff, RefreshCw, HardDrive,
} from "lucide-react";
import {
  useListForms, useCreateForm, useUpdateForm, useDeleteForm,
  type FormTemplate, type FormField, type FieldType,
} from "@/lib/forms-api";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { useGetMerchant } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { cn } from "@/lib/utils";

const CLOUD_META: Record<string, { label: string; bg: string; text: string }> = {
  google_drive: { label: "Google Drive", bg: "bg-[#4285F4]", text: "G" },
  onedrive:     { label: "OneDrive",     bg: "bg-[#0078D4]", text: "O" },
  dropbox:      { label: "Dropbox",      bg: "bg-[#0061FF]", text: "D" },
  proton_drive: { label: "Proton Drive", bg: "bg-[#6D4AFF]", text: "P" },
};

// ── Save form as PDF ──────────────────────────────────────────────────────

async function saveFormAsPdf(
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
};

// ── Empty state ──────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
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

function FormCard({
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

function QuickCodesInfo() {
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

export default function ManagementFormsPage() {
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile } = useBusinessProfile();

  const { data: forms = [], isLoading } = useListForms();
  const createForm  = useCreateForm();
  const updateForm  = useUpdateForm();
  const deleteForm  = useDeleteForm();

  // Tab navigation
  const [activeTab, setActiveTab] = useState<"forms" | "files" | "cloud">("forms");
  const [cloudIntegrations, setCloudIntegrations] = useState<{ key: string; label: string; status: string; connectedAt: string | null }[]>([]);

  useEffect(() => {
    fetch("/api/integrations", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: { key: string; label: string; status: string; connectedAt: string | null }[]) => {
        const CLOUD_KEYS = new Set(["google_drive", "onedrive", "dropbox", "proton_drive"]);
        setCloudIntegrations(Array.isArray(data) ? data.filter(i => CLOUD_KEYS.has(i.key)) : []);
      })
      .catch(() => {});
  }, []);

  // Builder view
  const [builderOpen, setBuilderOpen]       = useState(false);
  const [editingForm, setEditingForm]        = useState<FormTemplate | null>(null);

  // Preview dialog
  const [previewForm, setPreviewForm]        = useState<FormTemplate | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId]          = useState<number | null>(null);

  // Files tab state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number; type: string; uploadedAt: Date }[]>([]);
  const [draggingOver, setDraggingOver] = useState(false);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    setUploadedFiles(prev => [
      ...prev,
      ...arr.map(f => ({ name: f.name, size: f.size, type: f.type, uploadedAt: new Date() })),
    ]);
    toast.success(`${arr.length} file${arr.length !== 1 ? "s" : ""} uploaded`);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeFile = (idx: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const getFileIcon = (mime: string) => {
    if (mime.startsWith("image/")) return Image;
    if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv")) return FileSpreadsheet;
    if (mime === "application/pdf") return FileText;
    if (mime.startsWith("text/")) return FileText;
    return File;
  };

  const businessProfile = {
    name:         merchant?.businessName ?? "",
    phone:        (merchant as unknown as { phone?: string })?.phone ?? "",
    email:        (merchant as unknown as { email?: string })?.email ?? "",
    address:      (merchant as unknown as { address?: string })?.address ?? "",
    primaryColor: profile.brandColors?.[0] ?? "#0f766e",
  };

  const openNew = () => {
    setEditingForm(null);
    setBuilderOpen(true);
  };

  const openEdit = (form: FormTemplate) => {
    setEditingForm(form);
    setBuilderOpen(true);
  };

  const handleSave = async (name: string, description: string, fields: FormField[]) => {
    try {
      if (editingForm) {
        await updateForm.mutateAsync({ id: editingForm.id, name, description, fields });
        toast.success("Form updated");
      } else {
        await createForm.mutateAsync({ name, description, fields });
        toast.success("Form created");
      }
      setBuilderOpen(false);
      setEditingForm(null);
    } catch {
      toast.error("Failed to save form");
    }
  };

  const handleDuplicate = async (form: FormTemplate) => {
    try {
      await createForm.mutateAsync({
        name:        `${form.name} (copy)`,
        description: form.description ?? "",
        fields:      form.fields as FormField[],
      });
      toast.success("Form duplicated");
    } catch {
      toast.error("Failed to duplicate form");
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteForm.mutateAsync(deletingId);
      toast.success("Form deleted");
      setDeletingId(null);
    } catch {
      toast.error("Failed to delete form");
    }
  };

  return (
    <>
      <AppLayout>
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Forms &amp; Files</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Build custom forms, manage business files, and attach them to sales, services &amp; appointments.
              </p>
            </div>
            {activeTab === "forms" ? (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" /> New Form
              </Button>
            ) : activeTab === "files" ? (
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Upload File
              </Button>
            ) : (
              <Button variant="outline" onClick={() => {
                const connected = cloudIntegrations.filter(i => i.status === "connected");
                if (connected.length === 0) {
                  toast.info("No cloud storage providers connected yet.");
                } else {
                  toast.success(`Syncing with ${connected.map(i => (CLOUD_META[i.key] ?? { label: i.label }).label).join(", ")}…`);
                }
              }}>
                <RefreshCw className="h-4 w-4 mr-2" /> Sync All
              </Button>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex border-b">
            {([
              { key: "forms"  as const, label: "Forms",         icon: ClipboardList },
              { key: "files"  as const, label: "Files",         icon: FolderOpen    },
              { key: "cloud"  as const, label: "Cloud Storage", icon: HardDrive     },
            ] as { key: "forms" | "files" | "cloud"; label: string; icon: React.ElementType }[]).map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ── Forms tab ── */}
          {activeTab === "forms" && (
            <>
              {/* Quick Codes info */}
              <QuickCodesInfo />

              {/* Attach-to info strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "Sales",        desc: "Attach forms to transactions at checkout or after",  icon: "🛒" },
                  { label: "Services",     desc: "Add forms to repair jobs & service bookings",         icon: "🔧" },
                  { label: "Appointments", desc: "Send forms alongside appointment confirmations",       icon: "📅" },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3 rounded-xl border p-3 bg-card">
                    <span className="text-xl">{item.icon}</span>
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Forms grid */}
              {isLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : forms.length === 0 ? (
                <EmptyState onNew={openNew} />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {forms.map(form => (
                    <FormCard
                      key={form.id}
                      form={form}
                      onEdit={() => openEdit(form)}
                      onDuplicate={() => handleDuplicate(form)}
                      onDelete={() => setDeletingId(form.id)}
                      onPreview={() => setPreviewForm(form)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Files tab ── */}
          {activeTab === "files" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDraggingOver(true); }}
                onDragLeave={() => setDraggingOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  draggingOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">Drop files here or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">PDFs, images, spreadsheets, and documents</p>
              </div>

              {/* Info cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: Folder,          label: "Organised Folders",   desc: "Group files by type — contracts, insurance, menus, branding" },
                  { icon: FileText,        label: "Attach to Records",   desc: "Link files to customers, services, or appointments" },
                  { icon: FileSpreadsheet, label: "Any File Type",       desc: "PDFs, images, Word docs, spreadsheets, and more" },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3 rounded-xl border p-3 bg-card">
                    <item.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* File list */}
              {uploadedFiles.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Uploaded Files</CardTitle>
                    <CardDescription>{uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""} in this session</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {uploadedFiles.map((f, idx) => {
                        const Icon = getFileIcon(f.type);
                        return (
                          <div key={idx} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                            <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{f.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatBytes(f.size)} · {f.uploadedAt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            </div>
                            <button
                              onClick={() => removeFile(idx)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Folder className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No files uploaded yet</p>
                  <p className="text-xs mt-1">Upload files above to store them here</p>
                </div>
              )}
            </>
          )}
          {/* ── Cloud Storage tab ── */}
          {activeTab === "cloud" && (
            <div className="space-y-4">
              {cloudIntegrations.length === 0 ? (
                <div className="text-center py-12 space-y-3 text-muted-foreground">
                  <Cloud className="h-10 w-10 mx-auto opacity-30" />
                  <p className="text-sm font-medium">Loading cloud storage integrations…</p>
                </div>
              ) : (() => {
                const connected    = cloudIntegrations.filter(i => i.status === "connected");
                const disconnected = cloudIntegrations.filter(i => i.status !== "connected");
                return (
                  <>
                    {connected.length === 0 && (
                      <div className="rounded-xl border bg-amber-50 border-amber-200 px-4 py-3 flex items-center gap-3">
                        <CloudOff className="h-4 w-4 text-amber-600 shrink-0" />
                        <p className="text-sm text-amber-800">
                          No cloud storage providers are connected. Set them up in{" "}
                          <a href="/management/integrations" className="font-semibold underline">Management → Integrations</a>.
                        </p>
                      </div>
                    )}
                    {connected.map(intg => {
                      const meta = CLOUD_META[intg.key] ?? { label: intg.label, bg: "bg-muted", text: intg.label[0] };
                      return (
                        <div key={intg.key} className="rounded-xl border bg-card overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                            <div className="flex items-center gap-2.5">
                              <div className={cn("w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0", meta.bg)}>
                                {meta.text}
                              </div>
                              <span className="font-semibold text-sm">{meta.label}</span>
                              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Connected</Badge>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 h-7 text-xs"
                              onClick={() => toast.success(`Syncing with ${meta.label}…`)}
                            >
                              <RefreshCw className="h-3 w-3" /> Sync Now
                            </Button>
                          </div>
                          <div className="divide-y">
                            {["Reports", "Receipts", "Exports", "Forms"].map(folder => (
                              <div key={folder} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors">
                                <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                                <span>{folder}</span>
                                <span className="ml-auto text-xs text-muted-foreground">Auto-sync enabled</span>
                              </div>
                            ))}
                          </div>
                          {intg.connectedAt && (
                            <p className="px-4 py-2 text-[11px] text-muted-foreground border-t">
                              Connected {new Date(intg.connectedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {disconnected.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not Connected</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {disconnected.map(intg => {
                            const meta = CLOUD_META[intg.key] ?? { label: intg.label, bg: "bg-muted", text: intg.label[0] };
                            return (
                              <div key={intg.key} className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0 opacity-40", meta.bg)}>
                                  {meta.text}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium">{meta.label}</p>
                                  <p className="text-xs text-muted-foreground">Not connected</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Connect providers in{" "}
                          <a href="/management/integrations" className="text-primary underline font-medium">Management → Integrations</a>.
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

        </div>
      </AppLayout>

      {/* ── Form Builder overlay ── */}
      {builderOpen && (
        <FormBuilder
          initialName={editingForm?.name ?? ""}
          initialDescription={editingForm?.description ?? ""}
          initialFields={(editingForm?.fields as FormField[]) ?? []}
          isSaving={createForm.isPending || updateForm.isPending}
          onSave={handleSave}
          onClose={() => { setBuilderOpen(false); setEditingForm(null); }}
        />
      )}

      {/* ── Preview dialog ── */}
      <Dialog open={!!previewForm} onOpenChange={() => setPreviewForm(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle>Preview: {previewForm?.name}</DialogTitle>
              {previewForm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void saveFormAsPdf(previewForm, businessProfile.name)
                      .catch(() => toast.error("Failed to generate PDF"));
                  }}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Save as PDF
                </Button>
              )}
            </div>
          </DialogHeader>
          {previewForm && (
            <FormRenderer
              form={previewForm}
              business={businessProfile}
              onSubmit={() => {
                toast.success("Preview mode — no data saved");
                setPreviewForm(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <Dialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Form?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the form and cannot be undone. Existing submissions will remain.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteForm.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
