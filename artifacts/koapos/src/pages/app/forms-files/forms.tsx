/**
 * Forms & Files › Forms — the custom forms a merchant builds and attaches to
 * sales, service jobs and appointments.
 */
import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Download } from "lucide-react";
import {
  useListForms, useCreateForm, useUpdateForm, useDeleteForm,
  type FormTemplate, type FormField,
} from "@/lib/forms-api";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { useGetMerchant } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { EmptyState, FormCard, QuickCodesInfo, saveFormAsPdf } from "./shared";

export default function FormsPage() {
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile } = useBusinessProfile();

  const { data: forms = [], isLoading } = useListForms();
  const createForm = useCreateForm();
  const updateForm = useUpdateForm();
  const deleteForm = useDeleteForm();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<FormTemplate | null>(null);
  const [previewForm, setPreviewForm] = useState<FormTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const businessProfile = {
    name:         merchant?.businessName ?? "",
    phone:        (merchant as unknown as { phone?: string })?.phone ?? "",
    email:        (merchant as unknown as { email?: string })?.email ?? "",
    address:      (merchant as unknown as { address?: string })?.address ?? "",
    primaryColor: profile.brandColors?.[0] ?? "#0f766e",
  };

  const openNew = () => { setEditingForm(null); setBuilderOpen(true); };
  const openEdit = (form: FormTemplate) => { setEditingForm(form); setBuilderOpen(true); };

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Forms</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Build custom forms and attach them to sales, services &amp; appointments.
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
