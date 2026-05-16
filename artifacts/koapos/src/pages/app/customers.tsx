import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  Customer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import {
  Search, Plus, Pencil, Trash2, Users, Star, CheckCircle2, User, MapPin,
  Settings2, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown,
  Mail, Phone, Building2, StickyNote, Calendar, Hash,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type SortKey = "name" | "email" | "company" | "loyaltyPoints" | "visitCount";
type SortDir  = "asc" | "desc";
type DetailTab = "overview" | "address" | "account";
type Step = "personal" | "address" | "account";
const STEPS: Step[] = ["personal", "address", "account"];

type CustomerForm = {
  firstName: string; lastName: string; email: string; phone: string;
  whatsappSameAsPhone: boolean; dateOfBirth: string; company: string;
  abn: string; referredBy: string; billingStreet: string; billingCity: string;
  billingState: string; billingPostcode: string; billingCountry: string;
  addShipping: boolean; shippingSameAsBilling: boolean;
  shippingStreet: string; shippingCity: string; shippingState: string;
  shippingPostcode: string; shippingCountry: string;
  customerGroup: string; warningNote: string; agreedToMarketing: boolean; notes: string;
};

const defaultForm: CustomerForm = {
  firstName: "", lastName: "", email: "", phone: "",
  whatsappSameAsPhone: false, dateOfBirth: "", company: "",
  abn: "", referredBy: "", billingStreet: "", billingCity: "",
  billingState: "", billingPostcode: "", billingCountry: "Australia",
  addShipping: false, shippingSameAsBilling: false,
  shippingStreet: "", shippingCity: "", shippingState: "",
  shippingPostcode: "", shippingCountry: "Australia",
  customerGroup: "Standard", warningNote: "", agreedToMarketing: false, notes: "",
};

const CUSTOMER_GROUPS = ["Standard", "VIP", "Wholesale", "Trade", "Staff"];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function StepPill({ label, icon, active, done }: { label: string; icon: React.ReactNode; active: boolean; done: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors",
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

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="text-sm min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

/* ─── Sort header ────────────────────────────────────────────────────────── */

function SortTh({ label, sortKey, active, dir, onSort, className }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th
      className={cn("p-3 text-left font-medium whitespace-nowrap cursor-pointer select-none group", className)}
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        <span className={cn("transition-colors", isActive ? "text-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground")}>
          {isActive
            ? dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
            : <ChevronsUpDown className="w-3 h-3" />}
        </span>
      </span>
    </th>
  );
}

/* ─── Customer detail dialog ─────────────────────────────────────────────── */

function CustomerDetailDialog({
  customer, onClose, onEdit, onDelete, deleteIsPending,
}: {
  customer: Customer | null;
  onClose: () => void;
  onEdit: (c: Customer) => void;
  onDelete: (id: number) => void;
  deleteIsPending: boolean;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");

  if (!customer) return null;

  const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Unknown";
  const initials = ((customer.firstName?.[0] ?? "") + (customer.lastName?.[0] ?? "")).toUpperCase() || "?";

  const billingAddr = [
    customer.billingStreet, customer.billingCity,
    customer.billingState, customer.billingPostcode, customer.billingCountry,
  ].filter(Boolean).join(", ") || customer.address || null;

  const shippingAddr = [
    customer.shippingStreet, customer.shippingCity,
    customer.shippingState, customer.shippingPostcode, customer.shippingCountry,
  ].filter(Boolean).join(", ") || null;

  const TABS: { key: DetailTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "address",  label: "Address"  },
    { key: "account",  label: "Account"  },
  ];

  return (
    <Dialog open={!!customer} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center font-bold text-primary text-sm shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-base leading-tight truncate">{fullName}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {customer.customerGroup && (
                    <Badge variant="outline" className="text-xs px-2 py-0 h-5">{customer.customerGroup}</Badge>
                  )}
                  {customer.loyaltyPoints != null && customer.loyaltyPoints > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {customer.loyaltyPoints} pts
                    </span>
                  )}
                </div>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b -mx-6 px-6 gap-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="space-y-3">
            {customer.warningNote && (
              <div className="flex items-start gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-3 py-2.5 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{customer.warningNote}</span>
              </div>
            )}
            <div className="rounded-xl border bg-muted/20 divide-y">
              <InfoRow icon={Mail}     label="Email"   value={customer.email} />
              <InfoRow icon={Phone}    label="Phone"   value={customer.phone} />
              <InfoRow icon={Building2} label="Company" value={customer.company} />
            </div>
            <div className="rounded-xl border bg-muted/20 divide-y">
              <InfoRow icon={Star}     label="Loyalty Points" value={customer.loyaltyPoints ?? 0} />
              <InfoRow icon={User}     label="Visit Count"    value={`${customer.visitCount ?? 0} visits`} />
              {customer.totalSpent != null && (
                <InfoRow icon={Hash} label="Total Spent" value={formatCurrency(customer.totalSpent)} />
              )}
            </div>
            {customer.notes && (
              <div className="rounded-xl border bg-muted/20 px-4 py-3 flex gap-3">
                <StickyNote className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                  <p className="whitespace-pre-wrap">{customer.notes}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Address ── */}
        {tab === "address" && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/20">
              <p className="px-4 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billing Address</p>
              {billingAddr
                ? <InfoRow icon={MapPin} label="" value={billingAddr} />
                : <p className="px-4 pb-3 text-sm text-muted-foreground">No billing address on file.</p>}
            </div>
            <div className="rounded-xl border bg-muted/20">
              <p className="px-4 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shipping Address</p>
              {shippingAddr
                ? <InfoRow icon={MapPin} label="" value={shippingAddr} />
                : <p className="px-4 pb-3 text-sm text-muted-foreground">Same as billing / not set.</p>}
            </div>
          </div>
        )}

        {/* ── Account ── */}
        {tab === "account" && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/20 divide-y">
              <InfoRow icon={Calendar} label="Date of Birth" value={customer.dateOfBirth} />
              <InfoRow icon={Hash}     label="ABN"           value={customer.abn} />
              <InfoRow icon={User}     label="Referred By"   value={customer.referredBy} />
            </div>
            <div className="rounded-xl border bg-muted/20 divide-y">
              <div className="flex items-center gap-3 px-4 py-3">
                <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Marketing Consent</p>
                  <p className="font-medium">{customer.agreedToMarketing === "true" ? "✓ Agreed" : "Not agreed"}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button
            variant="destructive" size="sm" className="gap-1.5"
            onClick={() => { onDelete(customer.id); onClose(); }}
            disabled={deleteIsPending}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            <Button size="sm" className="gap-1.5" onClick={() => { onClose(); onEdit(customer); }}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch]             = useState("");
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer]   = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [form, setForm]                 = useState<CustomerForm>(defaultForm);
  const [step, setStep]                 = useState<Step>("personal");
  const [sortKey, setSortKey]           = useState<SortKey>("name");
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [checked, setChecked]           = useState<Set<number>>(new Set());

  const { data: customersData, isLoading } = useListCustomers(
    { search: search || undefined, limit: 1000 },
    { query: { queryKey: ["customers", search] } }
  );

  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const deleteMutation = useDeleteCustomer();

  const customers = customersData?.items || [];

  /* Sort */
  const sorted = [...customers].sort((a, b) => {
    let av: string | number = "", bv: string | number = "";
    switch (sortKey) {
      case "name":         av = `${a.firstName ?? ""} ${a.lastName ?? ""}`.toLowerCase(); bv = `${b.firstName ?? ""} ${b.lastName ?? ""}`.toLowerCase(); break;
      case "email":        av = (a.email ?? "").toLowerCase();   bv = (b.email ?? "").toLowerCase();   break;
      case "company":      av = (a.company ?? "").toLowerCase(); bv = (b.company ?? "").toLowerCase(); break;
      case "loyaltyPoints": av = a.loyaltyPoints ?? 0;   bv = b.loyaltyPoints ?? 0;   break;
      case "visitCount":   av = a.visitCount ?? 0;       bv = b.visitCount ?? 0;       break;
    }
    const r = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? r : -r;
  });

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return prev; }
      setSortDir("asc"); return key;
    });
  }, []);

  /* Checkboxes */
  const allChecked = sorted.length > 0 && sorted.every((c) => checked.has(c.id));
  const toggleAll  = () => setChecked(allChecked ? new Set() : new Set(sorted.map((c) => c.id)));
  const toggleOne  = (id: number) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const setField = <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditingCustomer(null); setForm(defaultForm); setStep("personal"); setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingCustomer(c);
    setForm({
      firstName: c.firstName || "", lastName: c.lastName || "",
      email: c.email || "", phone: c.phone || "",
      whatsappSameAsPhone: c.whatsappSameAsPhone === "true",
      dateOfBirth: c.dateOfBirth || "", company: c.company || "",
      abn: c.abn || "", referredBy: c.referredBy || "",
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
    setStep("personal"); setDialogOpen(true);
  };

  const buildPayload = () => ({
    firstName: form.firstName || undefined, lastName: form.lastName || undefined,
    email: form.email || undefined, phone: form.phone || undefined,
    whatsappSameAsPhone: form.whatsappSameAsPhone ? "true" : "false",
    dateOfBirth: form.dateOfBirth || undefined, company: form.company || undefined,
    abn: form.abn || undefined, referredBy: form.referredBy || undefined,
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

  const handleSave = () => {
    const payload = buildPayload();
    const inv = () => queryClient.invalidateQueries({ queryKey: ["customers"] });
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data: payload }, {
        onSuccess: () => { toast.success("Customer updated"); setDialogOpen(false); inv(); },
        onError: () => toast.error("Failed to update customer"),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => { toast.success("Customer added"); setDialogOpen(false); inv(); },
        onError: () => toast.error("Failed to add customer"),
      });
    }
  };

  const handleDelete = (id?: number) => {
    const targetId = id ?? deletingCustomer?.id;
    if (!targetId) return;
    deleteMutation.mutate({ id: targetId }, {
      onSuccess: () => {
        toast.success("Customer deleted");
        setDeleteDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["customers"] });
      },
      onError: () => toast.error("Failed to delete customer"),
    });
  };

  const currentIndex = STEPS.indexOf(step);
  const isLast = step === "account";
  const goNext = () => { if (!isLast) setStep(STEPS[currentIndex + 1]); else handleSave(); };
  const goBack = () => { if (currentIndex > 0) setStep(STEPS[currentIndex - 1]); };

  const sh = (label: string, key: SortKey, className?: string) => ({
    label, sortKey: key, active: sortKey, dir: sortDir, onSort: handleSort, className,
  });

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Customers</h1>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Add Customer
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="rounded-lg border">
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Users className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No customers yet</p>
                <p className="text-muted-foreground text-sm">Add customers to track their purchases and loyalty.</p>
              </div>
              <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Customer</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-3 w-10">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll}
                      className="rounded border-muted-foreground/40 accent-primary" />
                  </th>
                  <SortTh {...sh("Name", "name")} />
                  <SortTh {...sh("Email", "email", "hidden sm:table-cell")} />
                  <th className="p-3 text-left font-medium whitespace-nowrap hidden md:table-cell">Phone</th>
                  <SortTh {...sh("Company", "company", "hidden lg:table-cell")} />
                  <th className="p-3 text-left font-medium whitespace-nowrap hidden xl:table-cell">Address</th>
                  <th className="p-3 text-left font-medium whitespace-nowrap hidden lg:table-cell">Group</th>
                  <SortTh {...sh("Loyalty", "loyaltyPoints", "hidden md:table-cell")} />
                  <SortTh {...sh("Activity", "visitCount", "hidden lg:table-cell")} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((customer) => {
                  const address = [customer.billingStreet, customer.billingCity, customer.billingState]
                    .filter(Boolean).join(", ") || customer.address || "—";
                  const isChecked = checked.has(customer.id);
                  return (
                    <tr
                      key={customer.id}
                      className={cn(
                        "bg-background hover:bg-muted/30 transition-colors cursor-pointer",
                        isChecked && "bg-primary/5",
                      )}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleOne(customer.id)}
                          className="rounded border-muted-foreground/40 accent-primary" />
                      </td>
                      <td className="p-3 font-medium">
                        {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="p-3 hidden sm:table-cell text-muted-foreground">
                        {customer.email || "—"}
                      </td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">
                        {customer.phone || "—"}
                      </td>
                      <td className="p-3 hidden lg:table-cell text-muted-foreground">
                        {customer.company || "—"}
                      </td>
                      <td className="p-3 hidden xl:table-cell text-muted-foreground max-w-[180px] truncate">
                        {address}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        {customer.customerGroup
                          ? <Badge variant="outline" className="text-xs">{customer.customerGroup}</Badge>
                          : "—"}
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-500 shrink-0" />
                          {customer.loyaltyPoints ?? 0}
                        </span>
                      </td>
                      <td className="p-3 hidden lg:table-cell text-muted-foreground">
                        {customer.visitCount ?? 0} visits
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <CustomerDetailDialog
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        onEdit={openEdit}
        onDelete={handleDelete}
        deleteIsPending={deleteMutation.isPending}
      />

      {/* Add / Edit Customer — 3-step wizard */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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

          <div className="space-y-4 pt-2">
            {step === "personal" && (
              <>
                <FieldRow>
                  <Field label="First Name">
                    <Input value={form.firstName} onChange={(e) => setField("firstName", e.target.value)} placeholder="Jane" className="rounded-full" />
                  </Field>
                  <Field label="Last Name">
                    <Input value={form.lastName} onChange={(e) => setField("lastName", e.target.value)} placeholder="Doe" className="rounded-full" />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Email">
                    <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="jane@example.com" className="rounded-full" />
                  </Field>
                  <Field label="Phone">
                    <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="0400 000 000" className="rounded-full" />
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
                    <Input type="date" value={form.dateOfBirth} onChange={(e) => setField("dateOfBirth", e.target.value)} className="rounded-full" />
                  </Field>
                  <Field label="Company">
                    <Input value={form.company} onChange={(e) => setField("company", e.target.value)} placeholder="Acme Corp" className="rounded-full" />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="ABN">
                    <Input value={form.abn} onChange={(e) => setField("abn", e.target.value)} placeholder="12 345 678 901" className="rounded-full" />
                  </Field>
                  <Field label="Referred By">
                    <Input value={form.referredBy} onChange={(e) => setField("referredBy", e.target.value)} placeholder="No One" className="rounded-full" />
                  </Field>
                </FieldRow>
              </>
            )}

            {step === "address" && (
              <>
                <p className="text-xs font-bold tracking-widest text-foreground uppercase">Billing Address</p>
                <Field label="Street Address" full>
                  <Input value={form.billingStreet} onChange={(e) => setField("billingStreet", e.target.value)} placeholder="123 Main St" className="rounded-full" />
                </Field>
                <FieldRow>
                  <Field label="City">
                    <Input value={form.billingCity} onChange={(e) => setField("billingCity", e.target.value)} placeholder="Sydney" className="rounded-full" />
                  </Field>
                  <Field label="State">
                    <Input value={form.billingState} onChange={(e) => setField("billingState", e.target.value)} placeholder="NSW" className="rounded-full" />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Postcode">
                    <Input value={form.billingPostcode} onChange={(e) => setField("billingPostcode", e.target.value)} placeholder="2000" className="rounded-full" />
                  </Field>
                  <Field label="Country">
                    <Input value={form.billingCountry} onChange={(e) => setField("billingCountry", e.target.value)} placeholder="Australia" className="rounded-full" />
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
                          <Input value={form.shippingStreet} onChange={(e) => setField("shippingStreet", e.target.value)} placeholder="PO Box 123" className="rounded-full" />
                        </Field>
                        <FieldRow>
                          <Field label="City">
                            <Input value={form.shippingCity} onChange={(e) => setField("shippingCity", e.target.value)} placeholder="Sydney" className="rounded-full" />
                          </Field>
                          <Field label="State">
                            <Input value={form.shippingState} onChange={(e) => setField("shippingState", e.target.value)} placeholder="NSW" className="rounded-full" />
                          </Field>
                        </FieldRow>
                        <FieldRow>
                          <Field label="Postcode">
                            <Input value={form.shippingPostcode} onChange={(e) => setField("shippingPostcode", e.target.value)} placeholder="2000" className="rounded-full" />
                          </Field>
                          <Field label="Country">
                            <Input value={form.shippingCountry} onChange={(e) => setField("shippingCountry", e.target.value)} placeholder="Australia" className="rounded-full" />
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
                    <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-destructive font-medium">
                    <AlertTriangle className="w-4 h-4" /> Customer Warning Note
                  </Label>
                  <Input value={form.warningNote} onChange={(e) => setField("warningNote", e.target.value)} placeholder="e.g. Disputed chargeback, requires ID on collection..." className="rounded-full" />
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
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium text-right">{[form.firstName, form.lastName].filter(Boolean).join(" ") || "—"}</span>
                    <span className="text-muted-foreground">Group</span>
                    <span className="font-medium text-right">{form.customerGroup}</span>
                    {form.email && (<><span className="text-muted-foreground">Email</span><span className="font-medium text-right truncate">{form.email}</span></>)}
                    {form.company && (<><span className="text-muted-foreground">Company</span><span className="font-medium text-right">{form.company}</span></>)}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" onClick={currentIndex === 0 ? () => setDialogOpen(false) : goBack}>
              {currentIndex === 0 ? "Cancel" : "Back"}
            </Button>
            <Button onClick={goNext} disabled={createMutation.isPending || updateMutation.isPending}>
              {isLast ? (editingCustomer ? "Save Changes" : "Add Customer") : "Next →"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Customer</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete{" "}
            <strong>{[deletingCustomer?.firstName, deletingCustomer?.lastName].filter(Boolean).join(" ") || "this customer"}</strong>?
            This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDelete()} disabled={deleteMutation.isPending}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
