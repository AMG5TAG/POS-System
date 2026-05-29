import { useState, useEffect, useMemo } from "react";
import {
  useCreateCustomer,
  useUpdateCustomer,
  useGetMerchant,
  useListCustomers,
  getListCustomersQueryKey,
  Customer,
} from "@workspace/api-client-react";
import { useCustomerSettings } from "@/lib/customer-settings";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { User, MapPin, Settings2, CheckCircle2, AlertTriangle, Check, ChevronsUpDown, X, UserSearch } from "lucide-react";
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
  heardFrom: string; heardFromDetails: string; referredByCustomerId: string;
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
  heardFrom: "", heardFromDetails: "", referredByCustomerId: "",
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
  const [referralOpen, setReferralOpen] = useState(false);
  const [referralQuery, setReferralQuery] = useState("");

  const { data: allCustomersData } = useListCustomers({ limit: 500 });
  const allCustomers = useMemo(() => (allCustomersData?.items ?? []) as Customer[], [allCustomersData]);

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
        heardFrom: c.heardFrom || "", heardFromDetails: c.heardFromDetails || "",
        referredByCustomerId: c.referredByCustomerId ? String(c.referredByCustomerId) : "",
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
    heardFrom: form.heardFrom || undefined,
    heardFromDetails: form.heardFromDetails || undefined,
    referredByCustomerId: form.referredByCustomerId ? Number(form.referredByCustomerId) : undefined,
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
      <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 max-h-[90vh]">
        {/* Header — locked, never scrolls */}
        <div className="px-6 pt-5 pb-4 shrink-0 border-b">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingCustomer ? "Edit Customer" : "Add New Customer"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <StepPill label="Personal Info" icon={<User className="w-4 h-4" />} active={step === "personal"} done={currentIndex > 0} />
            <span className="text-muted-foreground text-xs">›</span>
            <StepPill label="Address" icon={<MapPin className="w-4 h-4" />} active={step === "address"} done={currentIndex > 1} />
            <span className="text-muted-foreground text-xs">›</span>
            <StepPill label="Account Settings" icon={<Settings2 className="w-4 h-4" />} active={step === "account"} done={false} />
          </div>
        </div>

        {/* Scrollable step content — min-h keeps the window rigid across all steps */}
        <div className="flex-1 overflow-y-auto px-6 pt-4 min-h-[520px]">
        <div className="space-y-4 pb-2">
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
                <Field label="Heard From">
                  <Select value={form.heardFrom} onValueChange={(v) => { setField("heardFrom", v); setField("heardFromDetails", ""); }}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Google">Google</SelectItem>
                      <SelectItem value="Social Media">Social Media</SelectItem>
                      <SelectItem value="Friend">Friend</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {form.heardFrom === "Friend" && (
                  <Field label="Friend's Name">
                    <Input value={form.heardFromDetails} onChange={(e) => setField("heardFromDetails", e.target.value)} placeholder="Who referred them?" />
                  </Field>
                )}
                {form.heardFrom === "Other" && (
                  <Field label="Other Details">
                    <Input value={form.heardFromDetails} onChange={(e) => setField("heardFromDetails", e.target.value)} placeholder="e.g. Billboard, Flyer..." />
                  </Field>
                )}
                {form.heardFrom !== "Friend" && form.heardFrom !== "Other" && <div />}
              </FieldRow>
              <FieldRow>
                <Field label="Referral" full>
                  <div className="space-y-1.5">
                    {/* Referral Picker */}
                    <div className="relative">
                      <Popover open={referralOpen} onOpenChange={setReferralOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                              !form.referredByCustomerId && "text-muted-foreground"
                            )}
                          >
                            <UserSearch className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="truncate flex-1 text-left">
                              {form.referredByCustomerId
                                ? (() => {
                                    const c = allCustomers.find((cust) => String(cust.id) === form.referredByCustomerId);
                                    return c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Customer" : "Select customer...";
                                  })()
                                : "Select existing customer..."}
                            </span>
                            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[320px] p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder="Search customers..."
                              value={referralQuery}
                              onValueChange={setReferralQuery}
                            />
                            <CommandList>
                              <CommandEmpty>No customers found.</CommandEmpty>
                              <CommandGroup>
                                {allCustomers
                                  .filter((cust) => {
                                    const term = referralQuery.toLowerCase();
                                    const name = `${cust.firstName ?? ""} ${cust.lastName ?? ""}`.trim().toLowerCase();
                                    return name.includes(term) || (cust.email ?? "").toLowerCase().includes(term) || (cust.phone ?? "").toLowerCase().includes(term);
                                  })
                                  .map((cust) => (
                                    <CommandItem
                                      key={cust.id}
                                      value={String(cust.id)}
                                      onSelect={() => {
                                        setField("referredByCustomerId", String(cust.id));
                                        setField("referralCode", cust.referralCode ?? "");
                                        setReferralOpen(false);
                                      }}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", form.referredByCustomerId === String(cust.id) ? "opacity-100" : "opacity-0")} />
                                      <span className="truncate">{`${cust.firstName ?? ""} ${cust.lastName ?? ""}`.trim() || "Unnamed"}</span>
                                      {cust.phone && <span className="ml-2 text-xs text-muted-foreground">{cust.phone}</span>}
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {form.referredByCustomerId && (
                        <button
                          type="button"
                          onClick={() => { setField("referredByCustomerId", ""); setField("referralCode", ""); }}
                          className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive transition-colors"
                          title="Clear selection"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Divider or active selection */}
                    {form.referredByCustomerId && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="secondary" className="font-normal">
                          <Check className="w-3 h-3 mr-1 text-green-600" />
                          {(() => {
                            const c = allCustomers.find((cust) => String(cust.id) === form.referredByCustomerId);
                            return c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Customer" : "Customer";
                          })()}
                          {form.referralCode && (
                            <span className="ml-1.5 font-mono text-xs text-muted-foreground">({form.referralCode})</span>
                          )}
                        </Badge>
                      </div>
                    )}

                    {/* Manual promo code */}
                    <div className="flex items-center gap-2">
                      <Input
                        value={form.referralCode}
                        onChange={(e) => {
                          setField("referralCode", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""));
                          if (form.referredByCustomerId) setField("referredByCustomerId", "");
                        }}
                        placeholder="Or enter a manual promo code"
                      />
                      {editingCustomer && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 h-10 px-3 text-sm"
                          onClick={() => {
                            const f = (form.firstName || "X")[0].toUpperCase();
                            const l = (form.lastName || "X")[0].toUpperCase();
                            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                            let suffix = "";
                            for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
                            setField("referralCode", `${f}${l}-${suffix}`);
                            setField("referredByCustomerId", "");
                          }}
                          type="button"
                        >
                          Generate
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {editingCustomer ? "Customers can share this code to refer friends." : "Choose a referring customer or type a manual promo code."}
                    </p>
                  </div>
                </Field>
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
        </div>{/* end scrollable content */}

        {/* Footer — pinned below scroll area, never moves */}
        <div className="px-6 py-4 border-t shrink-0">
          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
