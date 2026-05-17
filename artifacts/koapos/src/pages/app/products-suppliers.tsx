import { useState, useEffect, useRef } from "react";
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
  FileText, CreditCard, ImageIcon, X,
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

const API = "/api/suppliers";
const hdrs = { "Content-Type": "application/json" };

const PAYMENT_TERMS = [
  "Not specified", "Net 7", "Net 14", "Net 30", "Net 60",
  "EOM", "COD", "Prepaid", "Credit Card", "Custom",
];

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
  { label: "Address & Logo", short: "Address",      icon: MapPin     },
  { label: "Contacts",       short: "Contacts",    icon: Users      },
  { label: "Return Auth.",   short: "Return Auth.", icon: FileText   },
  { label: "Credit Acc.",    short: "Credit Acc.", icon: CreditCard },
] as const;

/* ─── Step nav ───────────────────────────────────────────────────────────── */

function StepNav({ current }: { current: number }) {
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = navRef.current?.querySelectorAll("[data-step]")[current] as HTMLElement | null;
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [current]);

  return (
    <div ref={navRef} className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
      {STEPS.map((step, i) => {
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
            {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
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

function Step1({ form, set }: { form: SupplierForm; set: <K extends keyof SupplierForm>(k: K, v: SupplierForm[K]) => void }) {
  return (
    <div className="space-y-4">
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

/* ─── Step 2: Address & Logo ─────────────────────────────────────────────── */

function Step2({ form, set }: { form: SupplierForm; set: <K extends keyof SupplierForm>(k: K, v: SupplierForm[K]) => void }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-foreground/70">Supplier Logo</span>
        </div>
        <div className="flex items-center gap-3">
          {form.logoUrl ? (
            <div className="relative">
              <img src={form.logoUrl} alt="Logo" className="h-14 w-14 rounded-xl object-contain border bg-muted" />
              <button
                onClick={() => set("logoUrl", "")}
                className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full gap-2"
            onClick={() => {
              const url = window.prompt("Paste logo URL:");
              if (url) set("logoUrl", url);
            }}
          >
            <ImageIcon className="w-3.5 h-3.5" /> Upload Logo
          </Button>
        </div>
      </div>

      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-foreground/70">Address</span>
        </div>
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

  const canNext = () => {
    if (step === 0 && !form.name.trim()) return false;
    return true;
  };

  const handleNext = () => {
    if (step === 0 && !form.name.trim()) { toast.error("Supplier name is required"); return; }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    if (step === 0) { onClose(); return; }
    setStep(s => Math.max(s - 1, 0));
  };

  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-xl">{editing ? "Edit Supplier" : "New Supplier"}</DialogTitle>
        </DialogHeader>

        <div className="shrink-0 mt-1 mb-2">
          <StepNav current={step} />
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
          <span className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
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

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function ProductsSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch(`${API}${search ? `?search=${encodeURIComponent(search)}` : ""}`, { credentials: "include" });
    if (res.ok) setSuppliers((await res.json()).items);
  };

  useEffect(() => { load(); }, [search]);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit   = (s: Supplier) => { setEditing(s); setDialogOpen(true); };

  const handleSave = async (form: SupplierForm) => {
    if (!form.name.trim()) { toast.error("Supplier name is required"); return; }
    setSaving(true);
    const body = JSON.stringify({
      ...form,
      contacts: form.contacts.length > 0 ? form.contacts : null,
      // Populate legacy fields from first contact for backward compat
      contactName: form.contacts[0]?.name || null,
      email: form.contacts[0]?.email || null,
      phone: form.contacts[0]?.phone || null,
      address: [form.street, form.city, form.state, form.postcode, form.country].filter(Boolean).join(", ") || null,
    });
    const res = editing
      ? await fetch(`${API}/${editing.id}`, { method: "PATCH", headers: hdrs, body, credentials: "include" })
      : await fetch(API, { method: "POST", headers: hdrs, body, credentials: "include" });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to save supplier"); return; }
    toast.success(editing ? "Supplier updated" : "Supplier added");
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: number) => {
    await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
    toast.success("Supplier deleted");
    load();
  };

  const getContacts = (s: Supplier): Contact[] => {
    try { return s.contacts ? JSON.parse(s.contacts) : []; } catch { return []; }
  };

  const primaryContact = (s: Supplier) => {
    const contacts = getContacts(s);
    return contacts[0] ?? null;
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Supplier</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search suppliers..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {suppliers.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Truck className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No suppliers yet</p><p className="text-muted-foreground text-sm">Add suppliers to link them to purchase orders.</p></div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Supplier</Button>
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((s) => {
              const pc = primaryContact(s);
              const allContacts = getContacts(s);
              return (
                <Card key={s.id}>
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
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">{s.paymentTerms}</span>
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
