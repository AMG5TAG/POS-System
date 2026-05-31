import { useState, useEffect, useRef, useCallback } from "react";
import {
  useListSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, useRequestUploadUrl,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Truck, Pencil, Trash2, Search, Globe, Mail, Phone,
  Check, ChevronRight, ChevronLeft, Building2, MapPin, Users,
  FileText, CreditCard, ImageIcon, X, LayoutGrid, Table2, BarChart3,
  Download, ChevronUp, ChevronDown, ChevronsUpDown, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Contact = { name: string; role: string; email: string; phone: string };

type SupplierForm = {
  // Step 1 – Basic Info
  name: string;
  accountNumber: string;
  website: string;
  paymentTerms: string;
  notes: string;
  // Step 2 – Address & Logo
  logoUrl: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  // Step 3 – Contacts
  contacts: Contact[];
  // Step 4 – Return Auth
  raPortalLink: string;
  raProcedure: string;
  // Step 5 – Credit Account
  creditAccountNumber: string;
  creditLimit: string;
  creditTerms: string;
  creditContactName: string;
};

type Supplier = {
  id: number; name: string; accountNumber: string | null; website: string | null;
  paymentTerms: string | null; notes: string | null; logoUrl: string | null;
  street: string | null; city: string | null; state: string | null;
  postcode: string | null; country: string | null; address: string | null;
  contacts: string | null; raPortalLink: string | null; raProcedure: string | null;
  creditAccountNumber: string | null; creditLimit: string | null;
  creditTerms: string | null; creditContactName: string | null;
  contactName: string | null; email: string | null; phone: string | null;
  createdAt: string;
};


const PAYMENT_TERMS = [
  "Not specified", "Net 7", "Net 14", "Net 30", "Net 60",
  "EOM", "COD", "Prepaid", "Credit Card", "Custom",
];

const CREDIT_PAYMENT_TERMS = new Set(["Net 7", "Net 14", "Net 30", "Net 60", "EOM", "Custom"]);

const emptyForm = (): SupplierForm => ({
  name: "", accountNumber: "", website: "", paymentTerms: "", notes: "",
  logoUrl: "", street: "", city: "", state: "", postcode: "", country: "Australia",
  contacts: [],
  raPortalLink: "", raProcedure: "",
  creditAccountNumber: "", creditLimit: "", creditTerms: "", creditContactName: "",
});

function supplierToForm(s: Supplier): SupplierForm {
  let contacts: Contact[] = [];
  try { if (s.contacts) contacts = JSON.parse(s.contacts); } catch { /* */ }
  return {
    name: s.name, accountNumber: s.accountNumber ?? "", website: s.website ?? "",
    paymentTerms: s.paymentTerms ?? "", notes: s.notes ?? "",
    logoUrl: s.logoUrl ?? "", street: s.street ?? "", city: s.city ?? "",
    state: s.state ?? "", postcode: s.postcode ?? "", country: s.country ?? "Australia",
    contacts,
    raPortalLink: s.raPortalLink ?? "", raProcedure: s.raProcedure ?? "",
    creditAccountNumber: s.creditAccountNumber ?? "", creditLimit: s.creditLimit ?? "",
    creditTerms: s.creditTerms ?? "", creditContactName: s.creditContactName ?? "",
  };
}

/* ─── Wizard steps config ────────────────────────────────────────────────── */

const STEPS = [
  { label: "Basic Info",     short: "Basic Info",  icon: Building2  },
  { label: "Address",        short: "Address",      icon: MapPin     },
  { label: "Contacts",       short: "Contacts",    icon: Users      },
  { label: "Return Auth.",   short: "Return Auth.", icon: FileText   },
  { label: "Credit Acc.",    short: "Credit Acc.", icon: CreditCard },
] as const;

/* ─── Step nav ───────────────────────────────────────────────────────────── */

type StepDef = typeof STEPS[number];

function StepNav({ current, steps }: { current: number; steps: readonly StepDef[] }) {
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = navRef.current?.querySelectorAll("[data-step]")[current] as HTMLElement | null;
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [current]);

  return (
    <div ref={navRef} className="flex items-center gap-1 flex-nowrap overflow-x-auto pb-0.5 scrollbar-none">
      {steps.map((step, i) => {
        const Icon   = step.icon;
        const done   = i < current;
        const active = i === current;
        return (
          <div key={step.label} className="flex items-center gap-1 shrink-0" data-step={i}>
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap",
              active && "bg-primary text-primary-foreground",
              done   && "bg-background border border-primary/40 text-primary",
              !active && !done && "text-muted-foreground",
            )}>
              {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3 shrink-0" />}
              <span>{i + 1} {step.short}</span>
            </div>
            {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Pill input ─────────────────────────────────────────────────────────── */

function PillInput({
  label, required, prefix, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean; prefix?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground/80">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {prefix ? (
        <div className="flex items-center rounded-full border border-input bg-background focus-within:ring-2 focus-within:ring-ring/30 overflow-hidden">
          <span className="pl-3.5 pr-1 text-sm text-muted-foreground select-none">{prefix}</span>
          <input
            {...props}
            className="flex-1 py-2 pr-3.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      ) : (
        <Input
          {...props}
          className={cn("rounded-full", props.className)}
        />
      )}
    </div>
  );
}

function PillTextarea({ label, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground/80">{label}</Label>
      <Textarea {...props} className={cn("rounded-2xl resize-none", props.className)} />
    </div>
  );
}

/* ─── Step 1: Basic Info ─────────────────────────────────────────────────── */

function LogoUploaderInline({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const requestUploadUrlMutation = useRequestUploadUrl();

  const upload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    setUploading(true);
    try {
      const result = await requestUploadUrlMutation.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type } });
      const putRes = await fetch(result.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("Upload to storage failed");
      onChange(`/api/storage${result.objectPath}`);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [onChange, requestUploadUrlMutation]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground/80">Logo</Label>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-14 h-14 rounded-xl border-2 border-dashed flex items-center justify-center shrink-0 overflow-hidden transition-colors cursor-pointer",
            value ? "border-border" : "bg-muted/20 hover:bg-muted/30",
          )}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : value ? (
            <img src={value} alt="Logo" className="w-full h-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5 h-7 text-xs" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <Upload className="w-3 h-3" /> {value ? "Replace" : "Upload Logo"}
          </Button>
          {!urlMode && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors" onClick={() => { setUrlMode(true); setUrlInput(value); }}>
              <Globe className="w-3 h-3" /> Use URL instead
            </button>
          )}
          {value && (
            <button type="button" className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors" onClick={() => onChange("")}>
              <X className="w-3 h-3" /> Remove
            </button>
          )}
        </div>
      </div>
      {urlMode && (
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="https://example.com/logo.png"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && urlInput.trim()) { onChange(urlInput.trim()); setUrlMode(false); setUrlInput(""); } }}
            className="text-sm rounded-full"
            autoFocus
          />
          <Button type="button" size="sm" className="rounded-full shrink-0" onClick={() => { if (urlInput.trim()) { onChange(urlInput.trim()); setUrlMode(false); setUrlInput(""); } }}>Apply</Button>
          <Button type="button" size="sm" variant="ghost" className="rounded-full shrink-0" onClick={() => setUrlMode(false)}>Cancel</Button>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) upload(e.target.files[0]); }} />
    </div>
  );
}

function Step1({ form, set }: { form: SupplierForm; set: <K extends keyof SupplierForm>(k: K, v: SupplierForm[K]) => void }) {
  return (
    <div className="space-y-4">
      {/* Logo */}
      <LogoUploaderInline value={form.logoUrl} onChange={(url) => set("logoUrl", url)} />

      <PillInput label="Supplier Name" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Supplier / wholesaler name" />
      <PillInput label="Account Number" value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} placeholder="Your account number" />
      <PillInput label="Website" type="url" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://supplier.com" />
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground/80">Payment Terms</Label>
        <Select value={form.paymentTerms || "__none__"} onValueChange={(v) => set("paymentTerms", v === "__none__" ? "" : v)}>
          <SelectTrigger className="rounded-full">
            <SelectValue placeholder="Not specified" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Not specified</SelectItem>
            {PAYMENT_TERMS.filter(t => t !== "Not specified").map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <PillTextarea label="Notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Delivery info, lead times..." />
    </div>
  );
}

/* ─── Step 2: Address ────────────────────────────────────────────────────── */

function Step2({ form, set }: { form: SupplierForm; set: <K extends keyof SupplierForm>(k: K, v: SupplierForm[K]) => void }) {
  return (
    <div className="space-y-4">
      <PillInput label="Street Address" value={form.street} onChange={(e) => set("street", e.target.value)} placeholder="123 Main St" />
      <div className="grid grid-cols-2 gap-3">
        <PillInput label="City"  value={form.city}  onChange={(e) => set("city",  e.target.value)} placeholder="Sydney" />
        <PillInput label="State" value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="NSW" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PillInput label="Postcode" value={form.postcode} onChange={(e) => set("postcode", e.target.value)} placeholder="2000" />
        <PillInput label="Country"  value={form.country}  onChange={(e) => set("country",  e.target.value)} placeholder="Australia" />
      </div>
    </div>
  );
}

/* ─── Step 3: Contacts ───────────────────────────────────────────────────── */

function Step3({ form, set }: { form: SupplierForm; set: <K extends keyof SupplierForm>(k: K, v: SupplierForm[K]) => void }) {
  const updateContact = (i: number, field: keyof Contact, value: string) => {
    const updated = form.contacts.map((c, idx) => idx === i ? { ...c, [field]: value } : c);
    set("contacts", updated);
  };
  const addContact = () => set("contacts", [...form.contacts, { name: "", role: "", email: "", phone: "" }]);
  const removeContact = (i: number) => set("contacts", form.contacts.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Add one or more contacts for this supplier, each with an optional role.</p>
      {form.contacts.map((c, i) => (
        <div key={i} className="rounded-2xl border bg-muted/20 p-4 space-y-3 relative">
          <button
            type="button"
            onClick={() => removeContact(i)}
            className="absolute top-3 right-3 text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <p className="text-xs font-bold uppercase tracking-widest text-foreground/60">Contact {i + 1}</p>
          <div className="grid grid-cols-2 gap-3">
            <PillInput label="Name"  value={c.name}  onChange={(e) => updateContact(i, "name",  e.target.value)} placeholder="Jane Smith" />
            <PillInput label="Role"  value={c.role}  onChange={(e) => updateContact(i, "role",  e.target.value)} placeholder="Accounts" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PillInput label="Email" type="email" value={c.email} onChange={(e) => updateContact(i, "email", e.target.value)} placeholder="jane@supplier.com" />
            <PillInput label="Phone" type="tel"   value={c.phone} onChange={(e) => updateContact(i, "phone", e.target.value)} placeholder="+61 2 0000 0000" />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" className="w-full rounded-full gap-2" onClick={addContact}>
        <Plus className="w-4 h-4" /> Add Another Contact
      </Button>
    </div>
  );
}

/* ─── Step 4: Return Auth ────────────────────────────────────────────────── */

function Step4({ form, set }: { form: SupplierForm; set: <K extends keyof SupplierForm>(k: K, v: SupplierForm[K]) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-foreground/70">RA Portal Link</span>
      </div>
      <PillInput label="" value={form.raPortalLink} onChange={(e) => set("raPortalLink", e.target.value)} placeholder="https://supplier.com/ra-portal" type="url" className="-mt-2" />
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-foreground/70">RA Procedure</span>
      </div>
      <Textarea
        rows={5}
        value={form.raProcedure}
        onChange={(e) => set("raProcedure", e.target.value)}
        placeholder="Describe the return authority process..."
        className="rounded-2xl resize-none -mt-2"
      />
    </div>
  );
}

/* ─── Step 5: Credit Account ─────────────────────────────────────────────── */

function Step5({ form, set }: { form: SupplierForm; set: <K extends keyof SupplierForm>(k: K, v: SupplierForm[K]) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-primary/5 px-4 py-3 flex items-center gap-2 mb-2">
        <CreditCard className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-primary">Credit Account Information</span>
      </div>
      <PillInput label="Credit Account Number" value={form.creditAccountNumber} onChange={(e) => set("creditAccountNumber", e.target.value)} placeholder="e.g. CR-12345" />
      <PillInput label="Credit Limit ($)" prefix="$" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} placeholder="0.00" type="number" min="0" step="0.01" />
      <PillInput label="Credit Terms" value={form.creditTerms} onChange={(e) => set("creditTerms", e.target.value)} placeholder="e.g. Net 30, EOM" />
      <PillInput label="Credit Contact Name" value={form.creditContactName} onChange={(e) => set("creditContactName", e.target.value)} placeholder="Accounts department contact" />

      {form.name && (
        <div className="rounded-2xl border bg-muted/30 p-4 space-y-2 mt-2">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Ready to Save</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{form.name}</span>
          </div>
          {form.paymentTerms && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Payment Terms</span>
              <span className="font-medium">{form.paymentTerms}</span>
            </div>
          )}
          {form.contacts.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Contacts</span>
              <span className="font-medium">{form.contacts.length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Wizard Dialog ──────────────────────────────────────────────────────── */

function WizardDialog({
  open, onClose, editing, onSave, saving,
}: {
  open: boolean;
  onClose: () => void;
  editing: Supplier | null;
  onSave: (form: SupplierForm) => void;
  saving: boolean;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SupplierForm>(emptyForm);

  useEffect(() => {
    if (open) {
      setStep(0);
      setForm(editing ? supplierToForm(editing) : emptyForm());
    }
  }, [open, editing]);

  const set = <K extends keyof SupplierForm>(k: K, v: SupplierForm[K]) => setForm(f => ({ ...f, [k]: v }));

  const showCreditTab = CREDIT_PAYMENT_TERMS.has(form.paymentTerms);
  const visibleSteps = STEPS.filter((_, i) => i !== 4 || showCreditTab) as readonly StepDef[];

  useEffect(() => {
    if (step >= visibleSteps.length) setStep(visibleSteps.length - 1);
  }, [visibleSteps.length, step]);

  const canNext = () => {
    if (step === 0 && !form.name.trim()) return false;
    return true;
  };

  const handleNext = () => {
    if (step === 0 && !form.name.trim()) { toast.error("Supplier name is required"); return; }
    setStep(s => Math.min(s + 1, visibleSteps.length - 1));
  };

  const handleBack = () => {
    if (step === 0) { onClose(); return; }
    setStep(s => Math.max(s - 1, 0));
  };

  const isLast = step === visibleSteps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-xl">{editing ? "Edit Supplier" : "New Supplier"}</DialogTitle>
        </DialogHeader>

        <div className="shrink-0 mt-1 mb-2">
          <StepNav current={step} steps={visibleSteps} />
        </div>

        <div className="flex-1 overflow-y-auto pr-1 -mr-1">
          {step === 0 && <Step1 form={form} set={set} />}
          {step === 1 && <Step2 form={form} set={set} />}
          {step === 2 && <Step3 form={form} set={set} />}
          {step === 3 && <Step4 form={form} set={set} />}
          {step === 4 && <Step5 form={form} set={set} />}
        </div>

        <div className="shrink-0 border-t pt-4 mt-4 flex items-center justify-between">
          <Button variant="outline" className="rounded-full gap-1.5" onClick={handleBack}>
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          <span className="text-sm text-muted-foreground">Step {step + 1} of {visibleSteps.length}</span>
          {isLast ? (
            <Button onClick={() => onSave(form)} disabled={saving || !form.name.trim()} className="rounded-full gap-1.5">
              <Check className="w-4 h-4" />
              {editing ? "Save Changes" : "Add Supplier"}
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={!canNext()} className="rounded-full gap-1.5">
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ViewMode = "cards" | "table" | "performance";
type SortKey = "name" | "paymentTerms" | "creditAccountNumber" | "city" | "contact";
type SortDir = "asc" | "desc";

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function ProductsSuppliersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: suppliersData, refetch: refetchSuppliers } = useListSuppliers(
    search ? { search } : undefined,
    { query: { queryKey: ["suppliers", search] } }
  );
  const suppliers = ((suppliersData?.items ?? []) as unknown as Supplier[]);

  const createSupplierMutation = useCreateSupplier();
  const updateSupplierMutation = useUpdateSupplier();
  const deleteSupplierMutation = useDeleteSupplier();

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit   = (s: Supplier) => { setEditing(s); setDialogOpen(true); };

  const handleSave = async (form: SupplierForm) => {
    if (!form.name.trim()) { toast.error("Supplier name is required"); return; }
    setSaving(true);
    const payload = {
      ...form,
      contacts: form.contacts.length > 0 ? form.contacts : null,
      contactName: form.contacts[0]?.name || null,
      email: form.contacts[0]?.email || null,
      phone: form.contacts[0]?.phone || null,
      address: [form.street, form.city, form.state, form.postcode, form.country].filter(Boolean).join(", ") || null,
    };
    try {
      if (editing) {
        await updateSupplierMutation.mutateAsync({ id: editing.id, data: payload as unknown as Parameters<typeof updateSupplierMutation.mutateAsync>[0]["data"] });
      } else {
        await createSupplierMutation.mutateAsync({ data: payload as unknown as Parameters<typeof createSupplierMutation.mutateAsync>[0]["data"] });
      }
      toast.success(editing ? "Supplier updated" : "Supplier added");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    } catch { toast.error("Failed to save supplier"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    await deleteSupplierMutation.mutateAsync({ id });
    toast.success("Supplier deleted");
    refetchSuppliers();
  };

  const getContacts = (s: Supplier): Contact[] => {
    try { return s.contacts ? JSON.parse(s.contacts) : []; } catch { return []; }
  };

  const primaryContact = (s: Supplier) => {
    const contacts = getContacts(s);
    return contacts[0] ?? null;
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...suppliers].sort((a, b) => {
    let av = "", bv = "";
    if (sortKey === "name") { av = a.name; bv = b.name; }
    else if (sortKey === "paymentTerms") { av = a.paymentTerms ?? ""; bv = b.paymentTerms ?? ""; }
    else if (sortKey === "creditAccountNumber") { av = a.creditAccountNumber ?? ""; bv = b.creditAccountNumber ?? ""; }
    else if (sortKey === "city") { av = a.city ?? ""; bv = b.city ?? ""; }
    else if (sortKey === "contact") {
      av = primaryContact(a)?.name ?? "";
      bv = primaryContact(b)?.name ?? "";
    }
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground/40" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3.5 h-3.5 text-foreground" />
      : <ChevronDown className="w-3.5 h-3.5 text-foreground" />;
  };

  const PAYMENT_TERM_COLORS: Record<string, string> = {
    "Cash": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    "Account": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "Credit Card": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    "COD": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "Other": "bg-muted text-muted-foreground",
  };
  const termColor = (term: string | null) =>
    term ? (PAYMENT_TERM_COLORS[term] ?? "bg-muted text-muted-foreground") : "";

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Suppliers</h1>
            <p className="text-sm text-muted-foreground">Manage supplier contacts, pricing terms, and purchase order history.</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Left: search + view tabs */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search suppliers..." className="pl-9 w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center border rounded-lg overflow-hidden">
              <button
                onClick={() => setView("cards")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors", view === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Cards
              </button>
              <button
                onClick={() => setView("table")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l border-r", view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
              >
                <Table2 className="w-3.5 h-3.5" /> Table
              </button>
              <button
                onClick={() => setView("performance")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors", view === "performance" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
              >
                <BarChart3 className="w-3.5 h-3.5" /> Performance
              </button>
            </div>
          </div>

          {/* Right: count + export + add */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-muted-foreground">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</span>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Supplier
            </Button>
          </div>
        </div>

        {/* Empty state */}
        {suppliers.length === 0 && (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Truck className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No suppliers yet</p><p className="text-muted-foreground text-sm">Add suppliers to link them to purchase orders.</p></div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Supplier</Button>
          </CardContent></Card>
        )}

        {/* ── Table view ── */}
        {suppliers.length > 0 && view === "table" && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      <button className="flex items-center gap-1.5 hover:text-foreground transition-colors" onClick={() => toggleSort("name")}>
                        Name <SortIcon k="name" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      <button className="flex items-center gap-1.5 hover:text-foreground transition-colors" onClick={() => toggleSort("paymentTerms")}>
                        Payment Terms <SortIcon k="paymentTerms" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      <button className="flex items-center gap-1.5 hover:text-foreground transition-colors" onClick={() => toggleSort("creditAccountNumber")}>
                        Account No. <SortIcon k="creditAccountNumber" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      <button className="flex items-center gap-1.5 hover:text-foreground transition-colors" onClick={() => toggleSort("city")}>
                        City <SortIcon k="city" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      <button className="flex items-center gap-1.5 hover:text-foreground transition-colors" onClick={() => toggleSort("contact")}>
                        Contact <SortIcon k="contact" />
                      </button>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, idx) => {
                    const pc = primaryContact(s);
                    return (
                      <tr key={s.id} onClick={() => openEdit(s)} className={cn("border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer", idx % 2 === 0 ? "" : "bg-muted/5")}>
                        {/* Name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {s.logoUrl ? (
                              <img src={s.logoUrl} alt={s.name} className="h-7 w-7 rounded-lg object-contain border bg-muted shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <Truck className="w-3.5 h-3.5 text-primary" />
                              </div>
                            )}
                            <span className="font-medium text-primary truncate">
                              {s.name}
                            </span>
                          </div>
                        </td>
                        {/* Payment Terms */}
                        <td className="px-4 py-3">
                          {s.paymentTerms ? (
                            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", termColor(s.paymentTerms))}>
                              {s.paymentTerms}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        {/* Account No. */}
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.creditAccountNumber || <span className="text-muted-foreground/50">—</span>}
                        </td>
                        {/* City */}
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.city || <span className="text-muted-foreground/50">—</span>}
                        </td>
                        {/* Contact */}
                        <td className="px-4 py-3 text-muted-foreground">
                          {pc?.name || <span className="text-muted-foreground/50">—</span>}
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-0.5 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(s); }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-muted/10">
              {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
            </div>
          </Card>
        )}

        {/* ── Cards view ── */}
        {suppliers.length > 0 && view === "cards" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((s) => {
              const pc = primaryContact(s);
              const allContacts = getContacts(s);
              return (
                <Card key={s.id} onClick={() => openEdit(s)} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {s.logoUrl ? (
                          <img src={s.logoUrl} alt={s.name} className="h-9 w-9 rounded-lg object-contain border bg-muted shrink-0" />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Truck className="w-4 h-4 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{s.name}</p>
                          {pc?.name && <p className="text-xs text-muted-foreground truncate">{pc.name}{pc.role ? ` · ${pc.role}` : ""}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(s); }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {(pc?.email || s.email) && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 shrink-0" />{pc?.email || s.email}</p>}
                      {(pc?.phone || s.phone) && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 shrink-0" />{pc?.phone || s.phone}</p>}
                      {s.website && <p className="flex items-center gap-1.5 truncate"><Globe className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{s.website}</span></p>}
                      {allContacts.length > 1 && (
                        <p className="text-xs text-muted-foreground">+{allContacts.length - 1} more contact{allContacts.length > 2 ? "s" : ""}</p>
                      )}
                    </div>
                    {(s.paymentTerms || s.creditAccountNumber) && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {s.paymentTerms && (
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", termColor(s.paymentTerms))}>
                            {s.paymentTerms}
                          </span>
                        )}
                        {s.creditAccountNumber && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                            <CreditCard className="w-2.5 h-2.5" /> {s.creditAccountNumber}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Performance view ── */}
        {suppliers.length > 0 && view === "performance" && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <BarChart3 className="w-14 h-14 text-muted-foreground/30" />
              <div>
                <p className="font-medium">Supplier Performance</p>
                <p className="text-sm text-muted-foreground mt-1">Purchase order history and performance metrics will appear here once purchase orders are recorded.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <WizardDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
        onSave={handleSave}
        saving={saving}
      />
    </AppLayout>
  );
}
