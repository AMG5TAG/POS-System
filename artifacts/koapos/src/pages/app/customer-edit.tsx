import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useParams } from "wouter";
import {
  useCreateCustomer,
  useUpdateCustomer,
  useGetCustomer,
  getGetCustomerQueryKey,
  useGetMerchant,
  useListCustomers,
  getListCustomersQueryKey,
  Customer,
} from "@workspace/api-client-react";
import { useCustomerSettings } from "@/lib/customer-settings";
import { validateABN } from "@/lib/abn";
import { AppLayout } from "@/components/layout/app-layout";
import { AccordionScreen, type AccordionSectionDef } from "@/components/ui/accordion-screen";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { User, MapPin, Settings2, AlertTriangle, Check, ChevronsUpDown, X, UserSearch, Save } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { COUNTRY_CODE_TO_NAME } from "@/lib/localisation";
import { StateSelectInput } from "@/components/ui/state-select-input";

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

export default function CustomerFormPage() {
  const params = useParams();
  const [, navigate] = useLocation();
  const editId = params.id ? Number(params.id) : undefined;
  const isEdit = editId != null && !Number.isNaN(editId);

  const queryClient = useQueryClient();
  const { settings: customerSettings } = useCustomerSettings();
  const customerGroups = customerSettings.groups.map((g) => g.name);
  const { data: merchantData } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const merchantCountryCode = (merchantData as any)?.country ?? "AU";
  const defaultCountryName = COUNTRY_CODE_TO_NAME[merchantCountryCode] ?? "Australia";

  const { data: editingCustomer, isLoading: loadingCustomer } = useGetCustomer(editId as number, {
    query: { queryKey: getGetCustomerQueryKey(editId as number), enabled: isEdit },
  });

  const [form, setForm] = useState<CustomerForm>(defaultForm);
  const [referralOpen, setReferralOpen] = useState(false);
  const [referralQuery, setReferralQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const initialFormRef = useRef<CustomerForm>(defaultForm);

  const { data: allCustomersData } = useListCustomers({ limit: 500 });
  const allCustomers = useMemo(() => (allCustomersData?.items ?? []) as Customer[], [allCustomersData]);

  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();

  useEffect(() => {
    if (loaded) return;
    let initialForm: CustomerForm;
    if (isEdit) {
      if (!editingCustomer) return; // wait for fetch
      const c = editingCustomer as Customer;
      initialForm = {
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
      };
    } else {
      initialForm = { ...defaultForm, billingCountry: defaultCountryName, shippingCountry: defaultCountryName };
    }
    initialFormRef.current = initialForm;
    setForm(initialForm);
    setLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, editingCustomer, defaultCountryName]);

  const saving = createMutation.isPending || updateMutation.isPending;
  const isDirty = loaded && !saving && JSON.stringify(form) !== JSON.stringify(initialFormRef.current);
  const { ConfirmDialog: CustomerNavGuard } = useUnsavedChangesGuard(isDirty);

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
    // Mark clean so the navigation guard doesn't fire after a successful save.
    initialFormRef.current = form;
    if (isEdit) {
      updateMutation.mutate({ id: editId as number, data: payload }, {
        onSuccess: () => { toast.success("Customer updated"); inv(); navigate("/customers"); },
        onError: () => toast.error("Failed to update customer"),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => { toast.success("Customer added"); inv(); navigate("/customers"); },
        onError: () => toast.error("Failed to add customer"),
      });
    }
  };

  if (isEdit && loadingCustomer && !loaded) {
    return (
      <AppLayout>
        <div className="h-full flex items-center justify-center"><Spinner size="lg" /></div>
      </AppLayout>
    );
  }

  const sections: AccordionSectionDef[] = [
    {
      id: "personal",
      title: "Personal Info",
      description: "Name, contact details and referral",
      icon: User,
      summary: `${form.firstName} ${form.lastName}`.trim() || undefined,
      content: (
        <div className="space-y-4">
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
                Also use for WhatsApp
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
              <Input
                value={form.abn}
                onChange={(e) => setField("abn", e.target.value)}
                placeholder="12 345 678 901"
                className={form.abn && !validateABN(form.abn) ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {form.abn && !validateABN(form.abn) && <p className="text-xs text-destructive mt-1">Invalid ABN</p>}
            </Field>
            <Field label="Heard From">
              <Select value={form.heardFrom} onValueChange={(v) => { setField("heardFrom", v); setField("heardFromDetails", ""); }}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {customerSettings.heardFromSources.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </FieldRow>
          {customerSettings.heardFromSources.find((s) => s.name === form.heardFrom)?.requiresDetails && (
            <Field label="Details" full>
              <Input value={form.heardFromDetails} onChange={(e) => setField("heardFromDetails", e.target.value)} placeholder="Please specify…" />
            </Field>
          )}
          <Field label="Referral" full>
            <div className="space-y-1.5">
              <div className="relative">
                <Popover open={referralOpen} onOpenChange={setReferralOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        !form.referredByCustomerId && "text-muted-foreground",
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
                      <CommandInput placeholder="Search customers..." value={referralQuery} onValueChange={setReferralQuery} />
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
              {form.referredByCustomerId && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary" className="font-normal">
                    <Check className="w-3 h-3 mr-1 text-green-600" />
                    {(() => {
                      const c = allCustomers.find((cust) => String(cust.id) === form.referredByCustomerId);
                      return c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Customer" : "Customer";
                    })()}
                    {form.referralCode && <span className="ml-1.5 font-mono text-xs text-muted-foreground">({form.referralCode})</span>}
                  </Badge>
                </div>
              )}
              <Input
                noAutoCapitalize
                value={form.referralCode}
                onChange={(e) => {
                  setField("referralCode", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""));
                  if (form.referredByCustomerId) setField("referredByCustomerId", "");
                }}
                placeholder="Or enter a manual promo code"
              />
              <p className="text-[11px] text-muted-foreground">Choose a referring customer or type a manual promo code.</p>
            </div>
          </Field>
        </div>
      ),
    },
    {
      id: "address",
      title: "Address",
      description: "Billing and shipping addresses",
      icon: MapPin,
      summary: form.billingCity || undefined,
      content: (
        <div className="space-y-4">
          <p className="text-xs font-bold tracking-widest text-foreground uppercase">Billing Address</p>
          <Field label="Street Address" full>
            <Input value={form.billingStreet} onChange={(e) => setField("billingStreet", e.target.value)} placeholder="123 Main St" />
          </Field>
          <FieldRow>
            <Field label="City"><Input value={form.billingCity} onChange={(e) => setField("billingCity", e.target.value)} placeholder="Sydney" /></Field>
            <Field label="State"><StateSelectInput value={form.billingState} onChange={(v) => setField("billingState", v)} countryCode={merchantCountryCode} /></Field>
          </FieldRow>
          <FieldRow>
            <Field label="Postcode"><Input value={form.billingPostcode} onChange={(e) => setField("billingPostcode", e.target.value)} placeholder="2000" /></Field>
            <Field label="Country"><Input value={form.billingCountry} onChange={(e) => setField("billingCountry", e.target.value)} placeholder="Australia" /></Field>
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
                    <Field label="City"><Input value={form.shippingCity} onChange={(e) => setField("shippingCity", e.target.value)} placeholder="Sydney" /></Field>
                    <Field label="State"><StateSelectInput value={form.shippingState} onChange={(v) => setField("shippingState", v)} countryCode={merchantCountryCode} /></Field>
                  </FieldRow>
                  <FieldRow>
                    <Field label="Postcode"><Input value={form.shippingPostcode} onChange={(e) => setField("shippingPostcode", e.target.value)} placeholder="2000" /></Field>
                    <Field label="Country"><Input value={form.shippingCountry} onChange={(e) => setField("shippingCountry", e.target.value)} placeholder="Australia" /></Field>
                  </FieldRow>
                </>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      id: "account",
      title: "Account Settings",
      description: "Group, warnings and notes",
      icon: Settings2,
      summary: form.customerGroup || undefined,
      content: (
        <div className="space-y-4">
          <Field label="Customer Group" full>
            <Select value={form.customerGroup} onValueChange={(v) => setField("customerGroup", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{customerGroups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
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
          <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
            <p className="text-xs font-bold tracking-widest text-foreground uppercase">Summary</p>
            <div className="grid grid-cols-2 text-sm gap-1">
              {form.firstName && <span>Name: <strong>{form.firstName} {form.lastName}</strong></span>}
              {form.email && <span>Email: <strong>{form.email}</strong></span>}
              {form.phone && <span>Phone: <strong>{form.phone}</strong></span>}
              {form.company && <span>Company: <strong>{form.company}</strong></span>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="font-medium">Additional Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Any other notes about this customer..." className="resize-none" rows={3} />
          </div>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <AccordionScreen
        title={isEdit ? "Edit Customer" : "Add New Customer"}
        subtitle={isEdit ? "Update this customer's details" : "Create a new customer record"}
        onBack={() => navigate("/customers")}
        sections={sections}
        completeLabel={saving ? "Saving…" : isEdit ? "Update Customer" : "Add Customer"}
        completeDisabled={saving}
        onComplete={handleSave}
        headerActions={
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : isEdit ? "Update" : "Save"}
          </Button>
        }
      />
      <CustomerNavGuard />
    </AppLayout>
  );
}
