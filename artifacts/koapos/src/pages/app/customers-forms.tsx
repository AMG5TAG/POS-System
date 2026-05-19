import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListForms,
  useListFormSubmissions,
  useCreateFormSubmission,
  useDeleteFormSubmission,
  type FormTemplate,
  type FormSubmission,
} from "@/lib/forms-api";
import {
  useListCustomers,
  useGetMerchant,
  type Customer,
} from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText, Search, User, ClipboardList, Calendar,
  CheckCircle2, Loader2, X, Trash2, Printer,
} from "lucide-react";
import { toast } from "sonner";

export default function CustomersFormsPage() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch]         = useState("");
  const [formSearch, setFormSearch]                 = useState("");
  const [fillingForm, setFillingForm]               = useState<FormTemplate | null>(null);
  const [viewingSub, setViewingSub]                 = useState<FormSubmission | null>(null);

  const { data: forms = [],     isLoading: formsLoading }  = useListForms();
  const { data: allCustomers = [] }                         = useListCustomers();
  const customers = allCustomers as Customer[];
  const { data: merchant }                                  = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile }                                         = useBusinessProfile();
  const { data: submissions = [] }                          = useListFormSubmissions(
    selectedCustomerId != null ? { customerId: selectedCustomerId } : undefined,
  );

  const createSubmission = useCreateFormSubmission();
  const deleteSubmission = useDeleteFormSubmission();

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) ?? null;

  const filteredCustomers = customerSearch
    ? customers.filter(c =>
        `${c.firstName ?? ""} ${c.lastName ?? ""} ${c.email ?? ""}`
          .toLowerCase()
          .includes(customerSearch.toLowerCase()),
      )
    : customers;

  const filteredForms = formSearch
    ? forms.filter(f => f.name.toLowerCase().includes(formSearch.toLowerCase()))
    : forms;

  const businessProfile = {
    name:         merchant?.businessName ?? "",
    phone:        (merchant as unknown as { phone?: string })?.phone ?? "",
    email:        (merchant as unknown as { email?: string })?.email ?? "",
    address:      (merchant as unknown as { address?: string })?.address ?? "",
    primaryColor: profile.brandColors?.[0] ?? "#0f766e",
  };

  const customerForRenderer = selectedCustomer
    ? {
        firstName: selectedCustomer.firstName ?? "",
        lastName:  selectedCustomer.lastName  ?? "",
        email:     selectedCustomer.email     ?? "",
        phone:     selectedCustomer.phone     ?? "",
      }
    : null;

  const getFormName = (formId: number) =>
    forms.find(f => f.id === formId)?.name ?? "Form";

  const getFormFields = (formId: number) =>
    forms.find(f => f.id === formId)?.fields ?? [];

  const handleSubmit = async (data: Record<string, unknown>, formId: number) => {
    try {
      await createSubmission.mutateAsync({
        formId,
        customerId: selectedCustomerId ?? undefined,
        sourceType: "manual",
        data,
      });
      const name = selectedCustomer
        ? `${selectedCustomer.firstName ?? ""} ${selectedCustomer.lastName ?? ""}`.trim()
        : null;
      toast.success(
        name
          ? `Form submitted and saved to ${name}'s profile`
          : "Form submitted successfully",
      );
      setFillingForm(null);
    } catch {
      toast.error("Failed to save form submission");
    }
  };

  const handlePrint = (sub: FormSubmission) => {
    const fields = getFormFields(sub.formId);
    const rows = Object.entries(sub.data)
      .map(([key, val]) => {
        const field = fields.find(f => f.id === key || f.label === key);
        const label = field?.label ?? key;
        return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;color:#555;width:40%">${label}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px">${String(val ?? "—")}</td></tr>`;
      })
      .join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${getFormName(sub.formId)}</title></head><body style="font-family:sans-serif;padding:24px;max-width:640px;margin:auto"><h2>${getFormName(sub.formId)}</h2><p style="color:#888;font-size:12px">${new Date(sub.createdAt).toLocaleString("en-AU")}</p><table style="width:100%;border-collapse:collapse;margin-top:16px">${rows}</table></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const handleDeleteSub = (id: number) => {
    deleteSubmission.mutate(id, {
      onSuccess: () => { toast.success("Submission deleted"); setViewingSub(null); },
      onError:   () => toast.error("Failed to delete"),
    });
  };

  const viewingForm = viewingSub ? forms.find(f => f.id === viewingSub.formId) : null;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Customer Forms</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fill form templates for customers. Submissions are saved to the customer&apos;s profile.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ── Left: Form templates ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Form Templates</h2>
              <Badge variant="secondary">{forms.length}</Badge>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={formSearch}
                onChange={e => setFormSearch(e.target.value)}
                placeholder="Search forms…"
                className="pl-9"
              />
            </div>

            {formsLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading forms…
              </div>
            ) : !filteredForms.length ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center space-y-2">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {formSearch
                    ? "No forms match your search."
                    : "No form templates yet. Create them in Management › Forms."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredForms.map(form => (
                  <div
                    key={form.id}
                    className="rounded-xl border bg-card p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{form.name}</p>
                      {form.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{form.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {form.fields.length} field{form.fields.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setFillingForm(form)}
                    >
                      Fill Form
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: Customer selector + submissions ── */}
          <div className="space-y-4">

            {/* Customer selector card */}
            <div>
              <h2 className="text-base font-semibold mb-3">Select Customer</h2>
              <div className="rounded-xl border bg-card p-4 space-y-3">
                {selectedCustomer ? (
                  <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5">
                    <User className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary leading-tight">
                        {selectedCustomer.firstName} {selectedCustomer.lastName}
                      </p>
                      {selectedCustomer.email && (
                        <p className="text-xs text-primary/70 truncate">{selectedCustomer.email}</p>
                      )}
                    </div>
                    <button
                      onClick={() => { setSelectedCustomerId(null); setCustomerSearch(""); }}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      aria-label="Clear customer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                        placeholder="Search customers…"
                        className="pl-9"
                      />
                    </div>
                    {customerSearch ? (
                      <div className="rounded-lg border divide-y max-h-52 overflow-y-auto">
                        {filteredCustomers.length === 0 ? (
                          <p className="text-sm text-muted-foreground p-3">No customers found.</p>
                        ) : (
                          filteredCustomers.slice(0, 8).map(c => (
                            <button
                              key={c.id}
                              onClick={() => { setSelectedCustomerId(c.id); setCustomerSearch(""); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-left"
                            >
                              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="flex-1 min-w-0 truncate">
                                {c.firstName} {c.lastName}
                              </span>
                              {c.email && (
                                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                  {c.email}
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Search and select a customer to associate submissions with their profile.
                        Forms can also be filled without selecting a customer.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Recent submissions for selected customer */}
            {selectedCustomerId != null && (
              <div>
                <h2 className="text-base font-semibold mb-3">
                  Submissions for {selectedCustomer?.firstName}
                </h2>
                {!(submissions as FormSubmission[]).length ? (
                  <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center space-y-2">
                    <ClipboardList className="w-6 h-6 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      No form submissions for this customer yet.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border divide-y bg-card">
                    {(submissions as FormSubmission[]).map(sub => (
                      <div key={sub.id} className="flex items-center gap-3 px-4 py-3">
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{getFormName(sub.formId)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(sub.createdAt).toLocaleString("en-AU")}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handlePrint(sub)}>
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setViewingSub(sub)}>
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Fill Form Dialog ── */}
      {fillingForm && (
        <Dialog open onOpenChange={() => setFillingForm(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Fill Form: {fillingForm.name}</DialogTitle>
            </DialogHeader>
            {!selectedCustomerId && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                <User className="w-4 h-4 shrink-0" />
                No customer selected — submission won&apos;t be linked to a customer profile.
              </div>
            )}
            <FormRenderer
              form={fillingForm}
              customer={customerForRenderer}
              business={businessProfile}
              onSubmit={(data) => handleSubmit(data, fillingForm.id)}
              staffMode
            />
          </DialogContent>
        </Dialog>
      )}

      {/* ── View Submission Dialog ── */}
      {viewingSub && (
        <Dialog open onOpenChange={() => setViewingSub(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{getFormName(viewingSub.formId)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(viewingSub.createdAt).toLocaleString("en-AU")}
              </div>
              <div className="rounded-xl border divide-y">
                {Object.entries(viewingSub.data).map(([key, value]) => {
                  const fields = viewingForm?.fields ?? [];
                  const field  = fields.find(f => f.id === key || f.label === key);
                  const label  = field?.label ?? key;
                  return (
                    <div key={key} className="px-4 py-3 flex gap-3">
                      <span className="text-xs text-muted-foreground w-32 shrink-0 pt-0.5 leading-relaxed">
                        {label}
                      </span>
                      <span className="text-sm flex-1 min-w-0 break-words">{String(value ?? "—")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between gap-2 pt-2 border-t">
              <Button
                variant="destructive" size="sm" className="gap-1.5"
                onClick={() => handleDeleteSub(viewingSub.id)}
                disabled={deleteSubmission.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handlePrint(viewingSub)}>
                  <Printer className="w-3.5 h-3.5" /> Print
                </Button>
                <Button size="sm" onClick={() => setViewingSub(null)}>Close</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
