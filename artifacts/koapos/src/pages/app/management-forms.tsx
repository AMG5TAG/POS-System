import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Zap,
} from "lucide-react";
import {
  useListForms, useCreateForm, useUpdateForm, useDeleteForm,
  type FormTemplate, type FormField, type FieldType,
} from "@/lib/forms-api";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { useGetMerchant } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";

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

  // Builder view
  const [builderOpen, setBuilderOpen]       = useState(false);
  const [editingForm, setEditingForm]        = useState<FormTemplate | null>(null);

  // Preview dialog
  const [previewForm, setPreviewForm]        = useState<FormTemplate | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId]          = useState<number | null>(null);

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
              <h1 className="text-2xl font-bold">Forms</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Build custom forms, attach them to sales, services &amp; appointments.
              </p>
            </div>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> New Form
            </Button>
          </div>

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
            <DialogTitle>Preview: {previewForm?.name}</DialogTitle>
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
