import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Plus, Eye, Trash2, ClipboardCheck, Printer, Save } from "lucide-react";
import {
  useListForms, useListFormSubmissions, useCreateFormSubmission, useDeleteFormSubmission,
  type FormTemplate, type FormSubmission,
} from "@/lib/forms-api";
import { FormRenderer } from "./FormRenderer";
import { useGetMerchant } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";

interface Props {
  sourceType: "transaction" | "service_job" | "appointment" | "manual";
  sourceId?: number;
  customerId?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  staffId?: number;
}

export function FormsAttachmentPanel({
  sourceType, sourceId, customerId, customerName, customerEmail, customerPhone, staffId,
}: Props) {
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile } = useBusinessProfile();
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [fillingFormId, setFillingFormId] = useState<number | null>(null);
  const [viewingSubmission, setViewingSubmission] = useState<FormSubmission | null>(null);
  const [showPrintSave, setShowPrintSave] = useState<{ data: Record<string, unknown>; formId: number } | null>(null);

  const { data: forms = [] } = useListForms();
  const { data: submissions = [], refetch: refetchSubmissions } = useListFormSubmissions(
    sourceId ? { sourceType, sourceId } : undefined,
  );
  const createSubmission = useCreateFormSubmission();
  const deleteSubmission = useDeleteFormSubmission();

  const fillingForm = fillingFormId ? forms.find(f => f.id === fillingFormId) : null;

  const businessProfile = {
    name:         merchant?.businessName ?? "",
    phone:        (merchant as unknown as { phone?: string })?.phone ?? "",
    email:        (merchant as unknown as { email?: string })?.email ?? "",
    address:      (merchant as unknown as { address?: string })?.address ?? "",
    primaryColor: profile.brandColors?.[0] ?? "#0f766e",
  };

  const handleSubmit = async (data: Record<string, unknown>, formId: number, staffFilled = true) => {
    try {
      await createSubmission.mutateAsync({
        formId,
        customerId:  customerId ?? undefined,
        sourceType,
        sourceId:    sourceId ?? undefined,
        staffId:     staffId ?? undefined,
        data,
      });

      if (staffFilled) {
        setShowPrintSave({ data, formId });
      } else {
        toast.success("Form submitted and saved");
      }

      setFillingFormId(null);
      await refetchSubmissions();
    } catch {
      toast.error("Failed to save form submission");
    }
  };

  const handlePrint = () => {
    window.print();
    setShowPrintSave(null);
    toast.success("Sent to printer");
  };

  const handleSaveToProfile = () => {
    setShowPrintSave(null);
    toast.success("Form saved to customer profile");
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this submission?")) return;
    await deleteSubmission.mutateAsync(id);
    await refetchSubmissions();
    toast.success("Submission deleted");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Forms
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={selectedFormId} onValueChange={setSelectedFormId}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="Select a form…" />
              </SelectTrigger>
              <SelectContent>
                {forms.map(f => (
                  <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedFormId}
              onClick={() => {
                if (selectedFormId) setFillingFormId(Number(selectedFormId));
              }}
              className="h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Fill Form
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No forms attached yet</p>
        ) : (
          <div className="space-y-2">
            {submissions.map(sub => {
              const form = forms.find(f => f.id === sub.formId);
              return (
                <div
                  key={sub.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                >
                  <ClipboardCheck className="h-4 w-4 text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{form?.name ?? `Form #${sub.formId}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(sub.createdAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                      {sub.customerId && " · Saved to profile"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setViewingSubmission(sub)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(sub.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Fill form dialog */}
      <Dialog open={!!fillingForm} onOpenChange={() => setFillingFormId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{fillingForm?.name}</DialogTitle>
          </DialogHeader>
          {fillingForm && (
            <FormRenderer
              form={fillingForm}
              customer={{
                firstName: customerName?.split(" ")[0],
                lastName:  customerName?.split(" ").slice(1).join(" "),
                email:     customerEmail,
                phone:     customerPhone,
              }}
              business={businessProfile}
              staffMode
              isSubmitting={createSubmission.isPending}
              onSubmit={data => handleSubmit(data, fillingForm.id, true)}
              onPrint={handlePrint}
              onSaveToProfile={handleSaveToProfile}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Print / Save prompt after submission */}
      <Dialog open={!!showPrintSave} onOpenChange={() => setShowPrintSave(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Form Submitted</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">The form has been saved. What would you like to do next?</p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1.5" /> Print Form
            </Button>
            <Button className="flex-1" onClick={handleSaveToProfile}>
              <Save className="h-4 w-4 mr-1.5" /> Save to Profile
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowPrintSave(null)}>Dismiss</Button>
        </DialogContent>
      </Dialog>

      {/* View submission dialog */}
      <Dialog open={!!viewingSubmission} onOpenChange={() => setViewingSubmission(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Form Submission</DialogTitle>
          </DialogHeader>
          {viewingSubmission && (() => {
            const form = forms.find(f => f.id === viewingSubmission.formId);
            if (!form) return <p className="text-sm text-muted-foreground">Form not found</p>;
            return (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Submitted {new Date(viewingSubmission.createdAt).toLocaleString("en-AU", { dateStyle: "long", timeStyle: "short" })}
                </p>
                {form.fields.filter(f => f.type !== "section_header" && f.type !== "divider").map(field => {
                  const val = viewingSubmission.data[field.id];
                  if (val === undefined || val === null || val === "") return null;
                  return (
                    <div key={field.id} className="space-y-0.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{field.label}</p>
                      {field.type === "signature" && typeof val === "string" && val.startsWith("data:") ? (
                        <img src={val} alt="Signature" className="border rounded h-20 bg-white" />
                      ) : (
                        <p className="text-sm">{String(val)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
