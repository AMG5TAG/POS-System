import { useState, useEffect } from "react";
import {
  useCreateCustomer,
  useUpdateCustomer,
  useGetMerchant,
  getListCustomersQueryKey,
  Customer,
} from "@workspace/api-client-react";
import { useCustomerSettings } from "@/lib/customer-settings";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, MapPin, Settings2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { COUNTRY_STATES, COUNTRY_CODE_TO_NAME } from "@/lib/localisation";

type Step = "personal" | "address" | "account";
const STEPS: Step[] = ["personal", "address", "account"];

type CustomerForm = {
  firstName: string; lastName: string; email: string; phone: string;
  whatsappSameAsPhone: boolean; dateOfBirth: string; company: string;
  abn: string; referredBy: string; referralCode: string;
  billingStreet: string; billingCity: string;
  billingState: string; billingPostcode: string; billingCountry: string;
  addShipping: boolean; shippingSameAsBilling: boolean;
  shippingStreet: string; shippingCity: string; shippingState: string;
  shippingPostcode: string; shippingCountry: string;
  customerGroup: string; warningNote: string; agreedToMarketing: boolean; notes: string;
};

const defaultForm: CustomerForm = {
  firstName: "", lastName: "", email: "", phone: "",
  whatsappSameAsPhone: false, dateOfBirth: "", company: "",
  abn: "", referredBy: "", referralCode: "",
  billingStreet: "", billingCity: "",
  billingState: "", billingPostcode: "", billingCountry: "Australia",
  addShipping: true, shippingSameAsBilling: true,
  shippingStreet: "", shippingCity: "", shippingState: "",
  shippingPostcode: "", shippingCountry: "Australia",
  customerGroup: "Standard", warningNote: "", agreedToMarketing: true, notes: "",
};

function StepPill({ label, icon, active, done }: { label: string; icon: React.ReactNode; active: boolean; done: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : done ? "bg-muted text-muted-foreground" : "text-muted-foreground",
    )}>
      {done && !active ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <span className="shrink-0">{icon}</span>}
      {label}
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label className="font-medium">{label}</Label>
      {children}
    </div>
  );
}

export interface AddCustomerWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCustomer?: Customer | null;
  onCreated?: (customer: Customer) => void;
  onSaved?: () => void;
  prefillName?: string;
}

export function AddCustomerWizard({
  open,
  onOpenChange,
  editingCustomer,
  onCreated,
  onSaved,
  prefillName,
}: AddCustomerWizardProps) {
  const queryClient = useQueryClient();
  const { settings: customerSettings } = useCustomerSettings();
  const customerGroups = customerSettings.groups.map((g) => g.name);
  const { data: merchantData } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const merchantCountryCode = (merchantData as any)?.country ?? "AU";
  const defaultCountryName = COUNTRY_CODE_TO_NAME[merchantCountryCode] ?? "Australia";
  const stateOptions = COUNTRY_STATES[merchantCountryCode] ?? [];

  const [form, setForm] = useState<CustomerForm>(defaultForm);
  const [step, setStep] = useState<Step>("personal");

  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();

  useEffect(() => {
    if (!open) return;
    if (editingCustomer) {
      const c = editingCustomer;
      setForm({
        firstName: c.firstName || "", lastName: c.lastName || "",
        email: c.email || "", phone: c.phone || "",
        whatsappSameAsPhone: c.whatsappSameAsPhone === "true",
        dateOfBirth: c.dateOfBirth || "", company: c.company || "",
        abn: c.abn || "", referredBy: c.referredBy || "", referralCode: c.referralCode || "",
        billingStreet: c.billingStreet || "", billingCity: c.billingCity || "",
        billingState: c.billingState || "", billingPostcode: c.billingPostcode || "",
        billingCountry: c.billingCountry || "Australia",
        addShipping: !!(c.shippingStreet || c.shippingCity), shippingSameAsBilling: false,
        shippingStreet: c.shippingStreet || "", shippingCity: c.shippingCity || "",
        shippingState: c.shippingState || "", shippingPostcode: c.shippingPostcode || "",
        shippingCountry: c.shippingCountry || "Australia",
        customerGroup: c.customerGroup || "Standard", warningNote: c.warningNote || "",
        agreedToMarketing: c.agreedToMarketing === "true", notes: c.notes || "",
      });
    } else {
      const parts = (prefillName ?? "").trim().split(/\s+/).filter(Boolean);
      setForm({
        ...defaultForm,
        billingCountry: defaultCountryName,
        shippingCountry: defaultCountryName,
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" "),
      });
    }
    setStep("personal");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingCustomer, prefillName]);

  const setField = <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () => ({
    firstName: form.firstName || undefined, lastName: form.lastName || undefined,
    email: form.email || undefined, phone: form.phone || undefined,
    whatsappSameAsPhone: form.whatsappSameAsPhone ? "true" : "false",
    dateOfBirth: form.dateOfBirth || undefined, company: form.company || undefined,
    abn: form.abn || undefined, referredBy: form.referredBy || undefined, referralCode: form.referralCode || undefined,
    billingStreet: form.billingStreet || undefined, billingCity: form.billingCity || undefined,
    billingState: form.billingState || undefined, billingPostcode: form.billingPostcode || undefined,
    billingCountry: form.billingCountry || undefined,
    shippingStreet: form.addShipping && !form.shippingSameAsBilling ? form.shippingStreet || undefined : form.addShipping && form.shippingSameAsBilling ? form.billingStreet || undefined : undefined,
    shippingCity: form.addShipping && !form.shippingSameAsBilling ? form.shippingCity || undefined : form.addShipping && form.shippingSameAsBilling ? form.billingCity || undefined : undefined,
    shippingState: form.addShipping && !form.shippingSameAsBilling ? form.shippingState || undefined : form.addShipping && form.shippingSameAsBilling ? form.billingState || undefined : undefined,
    shippingPostcode: form.addShipping && !form.shippingSameAsBilling ? form.shippingPostcode || undefined : form.addShipping && form.shippingSameAsBilling ? form.billingPostcode || undefined : undefined,
    shippingCountry: form.addShipping && !form.shippingSameAsBilling ? form.shippingCountry || undefined : form.addShipping && form.shippingSameAsBilling ? form.billingCountry || undefined : undefined,
    customerGroup: form.customerGroup || undefined, warningNote: form.warningNote || undefined,
    agreedToMarketing: form.agreedToMarketing ? "true" : "false", notes: form.notes || undefined,
  });

  const inv = () => queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });

  const handleSave = () => {
    const payload = buildPayload();
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data: payload }, {
        onSuccess: () => {
          toast.success("Customer updated");
          onOpenChange(false);
          inv();
          onSaved?.();
        },
        onError: () => toast.error("Failed to update customer"),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: (customer) => {
          toast.success("Customer added");
          onOpenChange(false);
          inv();
          onCreated?.(customer as Customer);
          onSaved?.();
        },
        onError: () => toast.error("Failed to add customer"),
      });
    }
  };

  const currentIndex = STEPS.indexOf(step);
  const isLast = step === "account";
  const goNext = () => { if (!isLast) setStep(STEPS[currentIndex + 1]); else handleSave(); };
  const goBack = () => { if (currentIndex > 0) setStep(STEPS[currentIndex - 1]); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {editingCustomer ? "Edit Customer" : "Add New Customer"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <StepPill label="Personal Info" icon={<User className="w-4 h-4" />} active={step === "personal"} done={currentIndex > 0} />
          <span className="text-muted-foreground text-xs">›</span>
          <StepPill label="Address" icon={<MapPin className="w-4 h-4" />} active={step === "address"} done={currentIndex > 1} />
          <span className="text-muted-foreground text-xs">›</span>
          <StepPill label="Account Settings" icon={<Settings2 className="w-4 h-4" />} active={step === "account"} done={false} />
        </div>

        <div className="space-y-4 pt-2 min-h-[400px]">
          {step === "personal" && (
            <>
              <FieldRow>
                <Field label="First Name">
                  <Input value={form.firstName} onChange={(e) => setField("firstName", e.target.value)} placeholder="Jane" />
                </Field>
                <Field label="Last Name">
                  <Input value={form.lastName} onChange={(e) => setField("lastName", e.target.value)} placeholder="Doe" />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="jane@example.com" />
                </Field>
                <Field label="Phone">
                  <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="0400 000 000" />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer mt-1 pl-1">
                    <Checkbox checked={form.whatsappSameAsPhone} onCheckedChange={(v) => setField("whatsappSameAsPhone", !!v)} />
                    <span className="flex items-center gap-1">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-green-500" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      Also use for WhatsApp
                    </span>
                  </label>
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Date of Birth">
                  <Input type="date" value={form.dateOfBirth} onChange={(e) => setField("dateOfBirth", e.target.value)} />
                </Field>
                <Field label="Company">
                  <Input value={form.company} onChange={(e) => setField("company", e.target.value)} placeholder="Acme Corp" />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="ABN">
                  <Input value={form.abn} onChange={(e) => setField("abn", e.target.value)} placeholder="12 345 678 901" />
                </Field>
                <Field label="Referral Code">
                  <div className="flex items-center gap-2">
                    <Input
                      value={form.referralCode}
                      onChange={(e) => setField("referralCode", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
                      placeholder="AB-1X2Y"
                      className="font-mono"
                    />
                    {editingCustomer && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 h-9 px-2 text-xs"
                        onClick={() => {
                          const f = (form.firstName || "X")[0].toUpperCase();
                          const l = (form.lastName || "X")[0].toUpperCase();
                          const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                          let suffix = "";
                          for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
                          setField("referralCode", `${f}${l}-${suffix}`);
                        }}
                        type="button"
                      >
                        Regenerate
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {editingCustomer ? "Customers can share this code to refer friends." : "Auto-generated on save based on initials."}
                  </p>
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Referred By">
                  <Input value={form.referredBy} onChange={(e) => setField("referredBy", e.target.value)} placeholder="No One" />
                </Field>
                <div />
              </FieldRow>
            </>
          )}

          {step === "address" && (
            <>
              <p className="text-xs font-bold tracking-widest text-foreground uppercase">Billing Address</p>
              <Field label="Street Address" full>
                <Input value={form.billingStreet} onChange={(e) => setField("billingStreet", e.target.value)} placeholder="123 Main St" />
              </Field>
              <FieldRow>
                <Field label="City">
                  <Input value={form.billingCity} onChange={(e) => setField("billingCity", e.target.value)} placeholder="Sydney" />
                </Field>
                <Field label="State">
                  {stateOptions.length > 0 ? (
                    <Select value={form.billingState} onValueChange={(v) => setField("billingState", v)}>
                      <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent>
                        {stateOptions.map((s) => (
                          <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={form.billingState} onChange={(e) => setField("billingState", e.target.value)} placeholder="State" />
                  )}
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Postcode">
                  <Input value={form.billingPostcode} onChange={(e) => setField("billingPostcode", e.target.value)} placeholder="2000" />
                </Field>
                <Field label="Country">
                  <Input value={form.billingCountry} onChange={(e) => setField("billingCountry", e.target.value)} placeholder="Australia" />
                </Field>
              </FieldRow>
              <label className="flex items-center gap-2 text-sm cursor-pointer font-medium">
                <Checkbox checked={form.addShipping} onCheckedChange={(v) => setField("addShipping", !!v)} />
                Add a shipping address
              </label>
              {form.addShipping && (
                <>
                  <div className="border-t pt-4" />
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold tracking-widest text-foreground uppercase">Shipping / Postal Address</p>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.shippingSameAsBilling} onCheckedChange={(v) => setField("shippingSameAsBilling", !!v)} />
                      Same as billing
                    </label>
                  </div>
                  {!form.shippingSameAsBilling && (
                    <>
                      <Field label="Street / PO Box" full>
                        <Input value={form.shippingStreet} onChange={(e) => setField("shippingStreet", e.target.value)} placeholder="PO Box 123" />
                      </Field>
                      <FieldRow>
                        <Field label="City">
                          <Input value={form.shippingCity} onChange={(e) => setField("shippingCity", e.target.value)} placeholder="Sydney" />
                        </Field>
                        <Field label="State">
                          {stateOptions.length > 0 ? (
                            <Select value={form.shippingState} onValueChange={(v) => setField("shippingState", v)}>
                              <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                              <SelectContent>
                                {stateOptions.map((s) => (
                                  <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input value={form.shippingState} onChange={(e) => setField("shippingState", e.target.value)} placeholder="State" />
                          )}
                        </Field>
                      </FieldRow>
                      <FieldRow>
                        <Field label="Postcode">
                          <Input value={form.shippingPostcode} onChange={(e) => setField("shippingPostcode", e.target.value)} placeholder="2000" />
                        </Field>
                        <Field label="Country">
                          <Input value={form.shippingCountry} onChange={(e) => setField("shippingCountry", e.target.value)} placeholder="Australia" />
                        </Field>
                      </FieldRow>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {step === "account" && (
            <>
              <Field label="Customer Group" full>
                <Select value={form.customerGroup} onValueChange={(v) => setField("customerGroup", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {customerGroups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-destructive font-medium">
                  <AlertTriangle className="w-4 h-4" /> Customer Warning Note
                </Label>
                <Input value={form.warningNote} onChange={(e) => setField("warningNote", e.target.value)} placeholder="e.g. Disputed chargeback, requires ID on collection..." />
                <p className="text-xs text-muted-foreground pl-1">Displayed as a warning banner at POS and in service forms</p>
              </div>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer font-medium">
                <Checkbox checked={form.agreedToMarketing} onCheckedChange={(v) => setField("agreedToMarketing", !!v)} />
                Customer Agrees to Marketing
              </label>
              <div className="border-t pt-2" />
              <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
                <p className="text-xs font-bold tracking-widest text-foreground uppercase">Ready to Add</p>
                <div className="grid grid-cols-2 text-sm gap-1">
                  {form.firstName && <span>Name: <strong>{form.firstName} {form.lastName}</strong></span>}
                  {form.email && <span>Email: <strong>{form.email}</strong></span>}
                  {form.phone && <span>Phone: <strong>{form.phone}</strong></span>}
                  {form.company && <span>Company: <strong>{form.company}</strong></span>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-medium">Additional Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Any other notes about this customer..."
                  className="resize-none"
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2 pt-2">
          <Button variant="outline" onClick={goBack} disabled={currentIndex === 0}>Back</Button>
          <Button
            onClick={goNext}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {isLast
              ? (createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingCustomer ? "Update Customer" : "Add Customer")
              : "Next →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
