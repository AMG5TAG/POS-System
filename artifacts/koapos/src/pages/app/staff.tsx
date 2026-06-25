import { useState, useEffect, useMemo } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListStaff, useCreateStaff, useUpdateStaff, useDeleteStaff,
  useGetStaffSalesReport, useListTransactions,
  Staff, StaffInput, StaffUpdate, useListPosRegisters,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  UserSquare2, Plus, Pencil, Trash2, User, MapPin, Settings2, DollarSign,
  Check, ChevronRight, ChevronLeft, Lock, Monitor, ShieldCheck, Upload,
  ArrowUpDown, ArrowUp, ArrowDown, BarChart2, Download, Calendar, Receipt,
  RefreshCw, Mail, Phone, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTabArrowKeys } from "@/lib/use-tab-arrow-keys";
import { expandStreetType, expandState } from "@/lib/address-format";
import { StateSelectInput } from "@/components/ui/state-select-input";
import { parseStaffPosPrefs, type StaffPosPrefs } from "@/lib/pos-local-settings";
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type AddressFields = {
  street: string; city: string; state: string; postcode: string; country: string;
};

type WizardForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  company: string;
  abn: string;
  billing: AddressFields;
  postalSameAsBilling: boolean;
  postal: AddressFields;
  role: string;
  isActive: boolean;
  pin: string;
  defaultRegisterType: string;
  /* Per-staff POS preferences — "" means "use store default". */
  posPrefs: {
    gridColumns: string;
    tileSize: string;
    showPrices: string;
    showStockBadges: string;
    cartPosition: string;
  };
  payRate: string;
  loadingRate: string;
  superRate: string;
};

const emptyPosPrefs = (): WizardForm["posPrefs"] => ({
  gridColumns: "", tileSize: "", showPrices: "", showStockBadges: "", cartPosition: "",
});

const emptyAddress = (): AddressFields => ({ street: "", city: "", state: "", postcode: "", country: "Australia" });

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const defaultForm = (): WizardForm => ({
  firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", company: "", abn: "",
  billing: emptyAddress(), postalSameAsBilling: true, postal: emptyAddress(),
  role: "cashier", isActive: true, pin: generatePin(),
  defaultRegisterType: "", posPrefs: emptyPosPrefs(),
  payRate: "", loadingRate: "", superRate: "",
});

function staffToForm(s: Staff): WizardForm {
  let billing = emptyAddress();
  let postal  = emptyAddress();
  try { if (s.billingAddress) billing = JSON.parse(s.billingAddress); } catch { /* */ }
  try { if (s.postalAddress)  postal  = JSON.parse(s.postalAddress);  } catch { /* */ }
  const parts = s.name.split(" ");
  return {
    firstName: s.firstName ?? parts[0] ?? "",
    lastName:  s.lastName  ?? parts.slice(1).join(" ") ?? "",
    email:   s.email   ?? "",
    phone:   s.phone   ?? "",
    dateOfBirth: s.dateOfBirth ?? "",
    company: s.company ?? "",
    abn:     s.abn     ?? "",
    billing, postalSameAsBilling: false, postal,
    role:    s.role,
    isActive: s.isActive,
    /* The server masks PINs ("****") — start blank; blank means "unchanged". */
    pin:     "",
    defaultRegisterType: s.defaultRegisterType ?? "",
    posPrefs: (() => {
      const p = parseStaffPosPrefs(s.posPrefs);
      return {
        gridColumns:     p.gridColumns != null ? String(p.gridColumns) : "",
        tileSize:        p.tileSize ?? "",
        showPrices:      p.showPrices != null ? (p.showPrices ? "show" : "hide") : "",
        showStockBadges: p.showStockBadges != null ? (p.showStockBadges ? "show" : "hide") : "",
        cartPosition:    p.cartPosition ?? "",
      };
    })(),
    payRate:     s.payRate     ?? "",
    loadingRate: s.loadingRate ?? "",
    superRate:   s.superRate   ?? "",
  };
}

/* ─── Step breadcrumb ────────────────────────────────────────────────────── */

const STEPS = [
  { label: "Personal",   icon: User       },
  { label: "Address",    icon: MapPin     },
  { label: "Account",    icon: Settings2  },
  { label: "Employment", icon: DollarSign },
];

/* ─── POS Register selector ──────────────────────────────────────────────── */

function PosRegisterSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: registersData } = useListPosRegisters({ query: { queryKey: ["pos-registers"] } });
  const registers = (registersData?.items ?? []).map((r) => ({ id: String(r.id), name: r.name, type: r.type ?? "" }));

  return (
    <div className="rounded-xl border p-4 bg-muted/10 space-y-3">
      <SectionHeader icon={Monitor} label="POS Register Default" />
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground/80">Default Register</Label>
        <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
          <SelectTrigger className="rounded-full">
            <SelectValue placeholder="Select register…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {registers.length === 0 ? (
              <SelectItem value="__no_registers__" disabled>
                No registers configured — add them in Management → POS Registers
              </SelectItem>
            ) : (
              registers.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                  {r.type && <span className="text-muted-foreground ml-1 text-xs">({r.type})</span>}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1.5">
          When this employee opens the POS, it will default to this register. If using PIN login, the existing register is kept.
        </p>
      </div>
    </div>
  );
}

/* ─── Pill input ─────────────────────────────────────────────────────────── */

function PillInput({ label, required, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground/80">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <Input
        {...props}
        className={cn(
          "rounded-full border-border bg-background focus-visible:ring-primary/40",
          props.className,
        )}
      />
    </div>
  );
}

/* ─── Section header ─────────────────────────────────────────────────────── */

function SectionHeader({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      <span className="text-xs font-bold uppercase tracking-widest text-foreground/70">{label}</span>
    </div>
  );
}

/* ─── Address block ──────────────────────────────────────────────────────── */

function AddressBlock({
  title, addr, onChange,
}: {
  title: string;
  addr: AddressFields;
  onChange: (a: AddressFields) => void;
}) {
  const set = (key: keyof AddressFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...addr, [key]: e.target.value });
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-foreground/70">{title}</p>
      <PillInput label="Street Address" value={addr.street} onChange={set("street")} onBlur={(e) => onChange({ ...addr, street: expandStreetType(e.target.value) })} />
      <div className="grid grid-cols-2 gap-3">
        <PillInput label="City"  value={addr.city}  onChange={set("city")} />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground/80">State</label>
          <StateSelectInput value={addr.state} onChange={(v) => onChange({ ...addr, state: v })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PillInput label="Postcode" value={addr.postcode} onChange={set("postcode")} />
        <PillInput label="Country"  value={addr.country}  onChange={set("country")} onBlur={(e) => onChange({ ...addr, country: expandState(e.target.value) })} />
      </div>
    </div>
  );
}

/* ─── Wizard dialog ──────────────────────────────────────────────────────── */

interface WizardDialogProps {
  open: boolean;
  onClose: () => void;
  editingStaff: Staff | null;
  onSave: (form: WizardForm) => void;
  saving: boolean;
  onTouched?: () => void;
}

function WizardDialog({ open, onClose, editingStaff, onSave, saving, onTouched }: WizardDialogProps) {
  const [step, setStep] = useState(0);
  const [invitingLogin, setInvitingLogin] = useState(false);

  // Invite an existing staff member to enable email sign-in (sends a set-password
  // link). The register PIN is unaffected.
  const sendLoginInvite = async () => {
    if (!editingStaff?.id) return;
    setInvitingLogin(true);
    try {
      const r = await fetch("/api/staff-auth/enable", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: editingStaff.id }),
      });
      if (r.ok) {
        toast.success("Invite sent — they'll get an email to set a password.");
      } else {
        const d = await r.json().catch(() => null);
        toast.error(d && typeof d.error === "string" ? d.error : "Failed to send invite");
      }
    } catch {
      toast.error("Failed to send invite");
    } finally {
      setInvitingLogin(false);
    }
  };
  const [form, setForm] = useState<WizardForm>(defaultForm);

  useEffect(() => {
    if (open) {
      setStep(0);
      setForm(editingStaff ? staffToForm(editingStaff) : defaultForm());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  const set = <K extends keyof WizardForm>(key: K) => (val: WizardForm[K]) => {
    onTouched?.();
    setForm((f) => ({ ...f, [key]: val }));
  };

  const setField = <K extends keyof WizardForm>(key: K) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onTouched?.();
    setForm((f) => ({ ...f, [key]: (e.target as HTMLInputElement).value }));
  };

  const isLastStep = step === STEPS.length - 1;

  const handleNext = () => {
    if (step === 0 && !form.firstName && !form.lastName) {
      toast.error("Please enter a first or last name"); return;
    }
    if (step === 0 && !form.email) {
      toast.error("Email is required"); return;
    }
    if (isLastStep) { onSave(form); } else { setStep((s) => s + 1); }
  };

  const togglePostalSame = (v: boolean) => {
    onTouched?.();
    setForm((f) => ({ ...f, postalSameAsBilling: v, postal: v ? { ...f.billing } : f.postal }));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg font-bold">
            {editingStaff ? "Edit Employee" : "Add Employee"}
          </DialogTitle>
          <div className="mt-3">
            <Stepper steps={STEPS} current={step} />
          </div>
        </DialogHeader>

        <div className="px-6 py-5 min-h-[300px]">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground/50 bg-muted/20 shrink-0">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Profile Photo</p>
                  <Button variant="outline" size="sm" className="mt-1 h-7 text-xs rounded-full gap-1.5">
                    <Upload className="w-3 h-3" /> Upload Photo
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PillInput label="First Name" value={form.firstName} onChange={setField("firstName")} />
                <PillInput label="Last Name"  value={form.lastName}  onChange={setField("lastName")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PillInput label="Email" required type="email" value={form.email} onChange={setField("email")} />
                <PillInput label="Phone"          type="tel"   value={form.phone} onChange={setField("phone")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PillInput label="Date of Birth" type="date" value={form.dateOfBirth} onChange={setField("dateOfBirth")} />
                <PillInput label="Company"               value={form.company}     onChange={setField("company")} />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <AddressBlock title="Billing Address" addr={form.billing} onChange={set("billing")} />
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-foreground/70">
                  Postal Address <span className="font-normal normal-case">(if different)</span>
                </p>
                <label className="flex items-center gap-2 text-xs cursor-pointer text-muted-foreground">
                  <Checkbox
                    checked={form.postalSameAsBilling}
                    onCheckedChange={(v) => togglePostalSame(!!v)}
                  />
                  Same as billing
                </label>
              </div>
              {!form.postalSameAsBilling && (
                <AddressBlock title="" addr={form.postal} onChange={set("postal")} />
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground/80">Role</Label>
                <Select value={form.role} onValueChange={set("role")}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="cashier">Cashier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 border rounded-full px-4 py-2.5">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={set("isActive")}
                  className="data-[state=checked]:bg-primary"
                />
                <span className="text-sm font-medium">Active Employee</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm font-semibold text-primary">4-Digit POS PIN</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type={editingStaff ? "password" : "text"}
                    maxLength={4}
                    value={form.pin}
                    onChange={(e) => { onTouched?.(); setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })); }}
                    placeholder={editingStaff ? (editingStaff.pin ? "•••• (unchanged)" : "No PIN set") : "••••"}
                    className="rounded-md w-28 text-center tracking-widest font-mono"
                  />
                  {!editingStaff && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => { onTouched?.(); setForm((f) => ({ ...f, pin: generatePin() })); }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Regenerate
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {editingStaff
                    ? "Used for the day login and one-sale staff switching on the POS. Leave blank to keep the current PIN; enter a new 4-digit PIN to change it."
                    : "Used for the day login and one-sale staff switching on the POS. Leave blank to disable PIN login for this employee."}
                </p>
                {!editingStaff && form.email && form.pin && (
                  <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                    <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>A welcome email containing this PIN will be sent to <strong>{form.email}</strong> when saved.</span>
                  </div>
                )}
                {editingStaff && (
                  <div className="rounded-xl border px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-sm font-medium">Email sign-in</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Let this employee sign in remotely with their email and password — their role controls what they can access, and their register PIN stays the same. We'll email them a link to set a password.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      disabled={!editingStaff.email || invitingLogin}
                      onClick={() => void sendLoginInvite()}
                    >
                      {invitingLogin ? "Sending…" : "Send email login invite"}
                    </Button>
                    {!editingStaff.email && (
                      <p className="text-xs text-amber-600">Add an email address and save before sending an invite.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <PosRegisterSelect value={form.defaultRegisterType} onChange={set("defaultRegisterType")} />
              <div className="rounded-xl border p-4 bg-muted/10 space-y-3">
                <SectionHeader icon={Monitor} label="POS Layout Preferences" />
                <p className="text-xs text-muted-foreground -mt-1">
                  Applied to whichever terminal this employee signs in for the day. "Store default" uses the account-wide POS settings.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {([
                    { key: "gridColumns",     label: "Grid Columns", options: [["2", "2 columns"], ["3", "3 columns"], ["4", "4 columns"], ["5", "5 columns"]] },
                    { key: "tileSize",        label: "Tile Size",    options: [["compact", "Compact"], ["normal", "Normal"], ["large", "Large"]] },
                    { key: "showPrices",      label: "Prices",       options: [["show", "Show"], ["hide", "Hide"]] },
                    { key: "showStockBadges", label: "Stock Badges", options: [["show", "Show"], ["hide", "Hide"]] },
                    { key: "cartPosition",    label: "Cart Side",    options: [["right", "Right"], ["left", "Left"]] },
                  ] as const).map(({ key, label, options }) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-xs font-medium text-foreground/80">{label}</Label>
                      <Select
                        value={form.posPrefs[key] || "__default__"}
                        onValueChange={(v) => {
                          onTouched?.();
                          setForm((f) => ({ ...f, posPrefs: { ...f.posPrefs, [key]: v === "__default__" ? "" : v } }));
                        }}
                      >
                        <SelectTrigger className="rounded-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__default__">Store default</SelectItem>
                          {options.map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border p-4 bg-muted/10 space-y-3">
                <SectionHeader icon={DollarSign} label="Payroll Details" />
                <div className="grid grid-cols-3 gap-3">
                  <PillInput label="Pay Rate ($/hr)" type="number" min="0" step="0.01" value={form.payRate}     onChange={setField("payRate")}     placeholder="e.g. 25.00" />
                  <PillInput label="Loading (%)"     type="number" min="0" step="0.1"  value={form.loadingRate} onChange={setField("loadingRate")} placeholder="e.g. 25" />
                  <PillInput label="Super (%)"       type="number" min="0" step="0.1"  value={form.superRate}   onChange={setField("superRate")}   placeholder="e.g. 11.5" />
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                  Payroll information is only visible to Owners.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-6 py-4">
          {step === 0 ? (
            <Button variant="outline" size="sm" className="rounded-full" onClick={onClose}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="rounded-full gap-1" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </Button>
          )}
          <p className="text-xs text-muted-foreground font-medium">Step {step + 1} of {STEPS.length}</p>
          <Button
            size="sm"
            className="rounded-full gap-1"
            onClick={handleNext}
            disabled={saving}
          >
            {isLastStep ? (
              <><Check className="w-3.5 h-3.5" /> Save Changes</>
            ) : (
              <>Next <ChevronRight className="w-3.5 h-3.5" /></>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Date range helpers ──────────────────────────────────────────────────── */

type Preset = "today" | "week" | "month" | "custom";

function getPresetRange(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date();
  if (preset === "today") {
    const d = format(today, "yyyy-MM-dd");
    return { from: d, to: d };
  }
  if (preset === "week") {
    return {
      from: format(subDays(today, 6), "yyyy-MM-dd"),
      to: format(today, "yyyy-MM-dd"),
    };
  }
  if (preset === "month") {
    return {
      from: format(startOfMonth(today), "yyyy-MM-dd"),
      to: format(endOfMonth(today), "yyyy-MM-dd"),
    };
  }
  return { from: customFrom, to: customTo };
}

/* ─── Drill-down transactions dialog ─────────────────────────────────────── */

function DrillDownDialog({
  open,
  onClose,
  staffId,
  staffName,
  from,
  to,
}: {
  open: boolean;
  onClose: () => void;
  staffId: number | null;
  staffName: string;
  from: string;
  to: string;
}) {
  const DRILL_LIMIT = 500;
  const enabled = open && staffId !== null;
  const { data, isLoading } = useListTransactions(
    { staffId: staffId ?? undefined, from, to, limit: DRILL_LIMIT },
    { query: { queryKey: ["transactions", "staff-drill", staffId, from, to], enabled } },
  );
  const transactions = data?.items ?? [];
  const totalCount = data?.total ?? 0;
  const isTruncated = totalCount > DRILL_LIMIT;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            {staffName} — Transactions
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {from} to {to}
            {!isLoading && (
              <span className="ml-2">
                · {totalCount} transaction{totalCount !== 1 ? "s" : ""}
                {isTruncated && ` (showing first ${DRILL_LIMIT})`}
              </span>
            )}
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading transactions…</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No transactions found for this period.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-2 font-medium text-muted-foreground">Date</th>
                  <th className="text-left pb-2 font-medium text-muted-foreground hidden sm:table-cell">Receipt #</th>
                  <th className="text-left pb-2 font-medium text-muted-foreground hidden md:table-cell">Status</th>
                  <th className="text-left pb-2 font-medium text-muted-foreground hidden md:table-cell">Payment</th>
                  <th className="text-right pb-2 font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/30">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium">{format(new Date(tx.createdAt), "dd MMM yyyy")}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(tx.createdAt), "h:mm a")}</p>
                    </td>
                    <td className="py-2.5 pr-4 hidden sm:table-cell text-muted-foreground font-mono text-xs">{tx.receiptNumber}</td>
                    <td className="py-2.5 pr-4 hidden md:table-cell">
                      <Badge
                        variant={tx.status === "completed" ? "default" : "secondary"}
                        className="capitalize text-xs"
                      >
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 hidden md:table-cell capitalize text-muted-foreground">{tx.paymentMethod}</td>
                    <td className={cn(
                      "py-2.5 text-right font-semibold",
                      tx.status === "refunded" || tx.status === "partial_refund"
                        ? "text-destructive"
                        : "text-foreground",
                    )}>
                      {tx.status === "refunded" || tx.status === "partial_refund" ? "−" : ""}
                      ${tx.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Sales Report view ───────────────────────────────────────────────────── */

function SalesReportView() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(today);

  const { from, to } = getPresetRange(preset, customFrom, customTo);

  const { data, isLoading } = useGetStaffSalesReport(
    { from, to },
    { query: { queryKey: ["staff-sales-report", from, to] } },
  );
  const rows = data?.items ?? [];

  type ReportSortKey = "staffName" | "transactionCount" | "grossRevenue" | "refundCount" | "refundAmount" | "netRevenue" | "avgBasket";
  const [sortKey, setSortKey] = useState<ReportSortKey>("netRevenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: ReportSortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    const arr = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "staffName") return (a.staffName ?? "").localeCompare(b.staffName ?? "") * dir;
      return ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * dir;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const SortIcon = ({ k }: { k: ReportSortKey }) =>
    sortKey === k
      ? sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      : <ArrowUpDown className="w-3 h-3 text-muted-foreground" />;

  const SortBtn = ({ k, children }: { k: ReportSortKey; children: React.ReactNode }) => (
    <button onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:text-primary whitespace-nowrap">
      {children} <SortIcon k={k} />
    </button>
  );

  const exportCsv = () => {
    const headers = ["Staff", "Role", "Sales", "Gross Revenue", "Refunds", "Refund Amount", "Net Revenue", "Avg Basket", "Top Product"];
    const csvRows = [
      headers.join(","),
      ...sorted.map((r) =>
        [
          `"${r.staffName}"`,
          `"${r.role ?? ""}"`,
          r.transactionCount,
          r.grossRevenue.toFixed(2),
          r.refundCount,
          r.refundAmount.toFixed(2),
          r.netRevenue.toFixed(2),
          r.avgBasket.toFixed(2),
          `"${r.topProduct ?? ""}"`,
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvRows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staff-sales-report_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* Drill-down state */
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillStaff, setDrillStaff] = useState<{ staffId: number | null; staffName: string } | null>(null);

  const openDrill = (staffId: number | null, staffName: string) => {
    setDrillStaff({ staffId, staffName });
    setDrillOpen(true);
  };

  /* Summary totals */
  const totals = useMemo(() => ({
    transactionCount: rows.reduce((s, r) => s + r.transactionCount, 0),
    grossRevenue:     rows.reduce((s, r) => s + r.grossRevenue, 0),
    refundCount:      rows.reduce((s, r) => s + r.refundCount, 0),
    refundAmount:     rows.reduce((s, r) => s + r.refundAmount, 0),
    netRevenue:       rows.reduce((s, r) => s + r.netRevenue, 0),
  }), [rows]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        {/* Preset pills */}
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
          {(["today", "week", "month", "custom"] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={cn(
                "px-3 py-1 rounded-md text-sm font-medium transition-all capitalize",
                preset === p
                  ? "bg-background shadow-sm text-foreground"
                  : "pill-selector text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "week" ? "Last 7d" : p === "month" ? "This month" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {preset === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm bg-background"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={today}
              onChange={(e) => setCustomTo(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm bg-background"
            />
          </div>
        )}

        <div className="sm:ml-auto">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary KPI cards */}
      {!isLoading && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Sales", value: totals.transactionCount.toString() },
            { label: "Gross Revenue", value: `$${totals.grossRevenue.toFixed(2)}` },
            { label: "Refunds", value: totals.refundCount.toString() },
            { label: "Net Revenue", value: `$${totals.netRevenue.toFixed(2)}` },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold mt-1">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Report table */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading report…</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <BarChart2 className="w-12 h-12 text-muted-foreground/30" />
            <p className="font-medium">No sales data for this period</p>
            <p className="text-sm text-muted-foreground">Try a different date range.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">
                  <SortBtn k="staffName">Staff</SortBtn>
                </th>
                <th className="text-right p-3 font-medium hidden sm:table-cell">
                  <SortBtn k="transactionCount">Sales</SortBtn>
                </th>
                <th className="text-right p-3 font-medium">
                  <SortBtn k="grossRevenue">Gross</SortBtn>
                </th>
                <th className="text-right p-3 font-medium hidden lg:table-cell">
                  <SortBtn k="refundCount">Refunds</SortBtn>
                </th>
                <th className="text-right p-3 font-medium hidden lg:table-cell">
                  <SortBtn k="refundAmount">Refund $</SortBtn>
                </th>
                <th className="text-right p-3 font-medium">
                  <SortBtn k="netRevenue">Net</SortBtn>
                </th>
                <th className="text-right p-3 font-medium hidden md:table-cell">
                  <SortBtn k="avgBasket">Avg Basket</SortBtn>
                </th>
                <th className="text-left p-3 font-medium hidden xl:table-cell">Top Product</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((row) => (
                <tr
                  key={row.staffId ?? "unassigned"}
                  className="bg-background hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => openDrill(row.staffId ?? null, row.staffName)}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {row.staffName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{row.staffName}</p>
                        {row.role && (
                          <Badge variant="secondary" className="capitalize text-xs mt-0.5">{row.role}</Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-right hidden sm:table-cell">{row.transactionCount}</td>
                  <td className="p-3 text-right">${row.grossRevenue.toFixed(2)}</td>
                  <td className="p-3 text-right hidden lg:table-cell text-muted-foreground">{row.refundCount}</td>
                  <td className="p-3 text-right hidden lg:table-cell text-destructive">
                    {row.refundAmount > 0 ? `$${row.refundAmount.toFixed(2)}` : "—"}
                  </td>
                  <td className="p-3 text-right font-semibold">${row.netRevenue.toFixed(2)}</td>
                  <td className="p-3 text-right hidden md:table-cell text-muted-foreground">
                    {row.transactionCount > 0 ? `$${row.avgBasket.toFixed(2)}` : "—"}
                  </td>
                  <td className="p-3 hidden xl:table-cell text-muted-foreground text-xs">
                    {row.topProduct ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drillStaff && (
        <DrillDownDialog
          open={drillOpen}
          onClose={() => setDrillOpen(false)}
          staffId={drillStaff.staffId}
          staffName={drillStaff.staffName}
          from={from}
          to={to}
        />
      )}
    </div>
  );
}

/* ─── Staff detail dialog ────────────────────────────────────────────────── */

function formatAddress(json: string | null | undefined): string {
  if (!json) return "";
  try {
    const a = JSON.parse(json) as Partial<AddressFields>;
    return [a.street, a.city, a.state, a.postcode, a.country].filter(Boolean).join(", ");
  } catch { return ""; }
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium break-words">{value || <span className="text-muted-foreground font-normal">—</span>}</div>
      </div>
    </div>
  );
}

function StaffDetailDialog({
  staff, onClose, onEdit, onDelete, registerName,
}: {
  staff: Staff | null;
  onClose: () => void;
  onEdit: (s: Staff) => void;
  onDelete?: (s: Staff) => void;
  registerName: string;
}) {
  const billing = formatAddress(staff?.billingAddress);
  const postal  = formatAddress(staff?.postalAddress);

  const STAFF_TABS = [
    { key: "details",    label: "Details" },
    { key: "address",    label: "Address" },
    { key: "access",     label: "Access" },
    { key: "employment", label: "Employment" },
  ] as const;
  type StaffTab = typeof STAFF_TABS[number]["key"];

  const [tab, setTab] = useState<StaffTab>("details");
  const tabIndex = STAFF_TABS.findIndex((t) => t.key === tab);
  const goPrevTab = () => { if (tabIndex > 0) setTab(STAFF_TABS[tabIndex - 1].key); };
  const goNextTab = () => { if (tabIndex < STAFF_TABS.length - 1) setTab(STAFF_TABS[tabIndex + 1].key); };
  useTabArrowKeys(!!staff, goPrevTab, goNextTab);
  useEffect(() => { setTab("details"); }, [staff?.id]);

  return (
    <Dialog open={!!staff} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 h-[80vh] overflow-hidden">
        {staff && (
          <>
            <DialogHeader className="p-6 pb-4 border-b space-y-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary shrink-0">
                  {staff.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate">{staff.name}</DialogTitle>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className="capitalize">{staff.role.replace("_", " ")}</Badge>
                    <Badge variant={staff.isActive ? "default" : "secondary"}>{staff.isActive ? "Active" : "Inactive"}</Badge>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="flex border-b px-6 gap-0 shrink-0">
              {STAFF_TABS.map(({ key, label }) => (
                <button key={key} onClick={() => setTab(key)} className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3">
              {tab === "details" && (
                <div className="divide-y">
                  <section className="py-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Contact</h3>
                    <DetailRow icon={Mail} label="Email" value={staff.email} />
                    <DetailRow icon={Phone} label="Phone" value={staff.phone} />
                    <DetailRow icon={Calendar} label="Date of birth" value={staff.dateOfBirth} />
                  </section>
                  <section className="py-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Company</h3>
                    <DetailRow icon={Building2} label="Company" value={staff.company} />
                    <DetailRow icon={Receipt} label="ABN" value={staff.abn} />
                  </section>
                </div>
              )}

              {tab === "address" && (
                <section className="py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Addresses</h3>
                  <DetailRow icon={MapPin} label="Billing address" value={billing} />
                  <DetailRow icon={MapPin} label="Postal address" value={postal} />
                </section>
              )}

              {tab === "access" && (
                <section className="py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Access</h3>
                  <DetailRow icon={ShieldCheck} label="Role" value={<span className="capitalize">{staff.role.replace("_", " ")}</span>} />
                  <DetailRow icon={Lock} label="PIN" value={staff.pin ? "Set" : "Not set"} />
                  <DetailRow icon={Monitor} label="Default register" value={registerName} />
                </section>
              )}

              {tab === "employment" && (
                <section className="py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Employment</h3>
                  <DetailRow icon={DollarSign} label="Pay rate" value={staff.payRate ? `$${staff.payRate}/hr` : ""} />
                  <DetailRow icon={DollarSign} label="Loading" value={staff.loadingRate ? `${staff.loadingRate}%` : ""} />
                  <DetailRow icon={DollarSign} label="Super" value={staff.superRate ? `${staff.superRate}%` : ""} />
                </section>
              )}
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between gap-2 px-6 pb-5 pt-4 border-t shrink-0">
              <div className="flex gap-2 items-center">
                {onDelete && (
                  <Button
                    variant="destructive" size="sm" className="w-8 h-8 p-0"
                    onClick={() => onDelete(staff)}
                    title="Remove staff member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                <Button size="sm" className="w-8 h-8 p-0" onClick={() => onEdit(staff)} title="Edit staff member">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 px-3" onClick={goPrevTab} disabled={tabIndex === 0} title="Previous tab">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 px-3" onClick={goNextTab} disabled={tabIndex === STAFF_TABS.length - 1} title="Next tab">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex gap-2 items-center">
                <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function StaffPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"staff" | "report">("staff");
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [delDialogOpen, setDelDialog]   = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [deletingStaff, setDeleting]    = useState<Staff | null>(null);
  const [viewingStaff, setViewing]      = useState<Staff | null>(null);

  const { data: staffList, isLoading } = useListStaff({ query: { queryKey: ["staff"] } });
  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const deleteMutation = useDeleteStaff();
  const { data: registersData } = useListPosRegisters({ query: { queryKey: ["pos-registers"] } });

  const members = staffList || [];
  const registerMap = Object.fromEntries(
    (registersData?.items ?? []).map((r) => [String(r.id), r.name])
  );

  const { isDirty, markClean, markDirty } = useFormDirty(null);

  const { ConfirmDialog: StaffFormGuard } = useUnsavedChangesGuard(isDirty, {
    title: "Close staff form?",
    description: "The staff form has unsaved changes. If you leave now, your changes will be lost.",
    cancelLabel: "Stay on page",
    actionLabel: "Leave anyway",
  });

  type SortKey = "name" | "email" | "role" | "status" | "register";
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    const sortedMembers = [...members];
    const dir = sortDir === "asc" ? 1 : -1;
    sortedMembers.sort((a, b) => {
      const aReg = registerMap[String(a.defaultRegisterType ?? "")] ?? "—";
      const bReg = registerMap[String(b.defaultRegisterType ?? "")] ?? "—";
      switch (sortKey) {
        case "name":     return (a.name ?? "").localeCompare(b.name ?? "") * dir;
        case "email":    return (a.email ?? "").localeCompare(b.email ?? "") * dir;
        case "role":     return (a.role ?? "").localeCompare(b.role ?? "") * dir;
        case "status":   return (a.isActive ? 1 : 0) - (b.isActive ? 1 : 0) * dir;
        case "register": return aReg.localeCompare(bReg) * dir;
      }
    });
    return sortedMembers;
  }, [members, sortKey, sortDir, registerMap]);

  const openCreate = () => { setEditingStaff(null); markClean(); setDialogOpen(true); };
  const openEdit   = (s: Staff) => { setEditingStaff(s); markClean(); setDialogOpen(true); };

  const handleSave = (form: WizardForm) => {
    /* Serialize only the explicitly-set POS preferences; "" = store default. */
    const prefs: StaffPosPrefs = {};
    if (form.posPrefs.gridColumns)     prefs.gridColumns = Number(form.posPrefs.gridColumns) as 2 | 3 | 4 | 5;
    if (form.posPrefs.tileSize)        prefs.tileSize = form.posPrefs.tileSize as StaffPosPrefs["tileSize"];
    if (form.posPrefs.showPrices)      prefs.showPrices = form.posPrefs.showPrices === "show";
    if (form.posPrefs.showStockBadges) prefs.showStockBadges = form.posPrefs.showStockBadges === "show";
    if (form.posPrefs.cartPosition)    prefs.cartPosition = form.posPrefs.cartPosition as StaffPosPrefs["cartPosition"];

    const payload = {
      firstName:   form.firstName   || undefined,
      lastName:    form.lastName    || undefined,
      name:        `${form.firstName} ${form.lastName}`.trim() || "Staff",
      email:       form.email       || undefined,
      phone:       form.phone       || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      company:     form.company     || undefined,
      abn:         form.abn         || undefined,
      billingAddress: JSON.stringify(form.billing),
      postalAddress:  JSON.stringify(form.postalSameAsBilling ? form.billing : form.postal),
      role:        form.role,
      pin:         form.pin         || undefined,
      isActive:    form.isActive,
      defaultRegisterType: form.defaultRegisterType || undefined,
      posPrefs:    JSON.stringify(prefs),
      payRate:     form.payRate     || undefined,
      loadingRate: form.loadingRate || undefined,
      superRate:   form.superRate   || undefined,
    };

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["staff"] });

    if (editingStaff) {
      updateMutation.mutate(
        { id: editingStaff.id, data: payload as unknown as StaffUpdate },
        {
          onSuccess: () => { toast.success("Staff member updated"); setDialogOpen(false); markClean(); invalidate(); },
          onError:   () => toast.error("Failed to update staff member"),
        },
      );
    } else {
      createMutation.mutate(
        { data: payload as unknown as StaffInput },
        {
          onSuccess: () => { toast.success("Staff member added"); setDialogOpen(false); markClean(); invalidate(); },
          onError:   () => toast.error("Failed to add staff member"),
        },
      );
    }
  };

  const handleDelete = () => {
    if (!deletingStaff) return;
    deleteMutation.mutate(
      { id: deletingStaff.id },
      {
        onSuccess: () => {
          toast.success("Staff member removed");
          setDelDialog(false);
          queryClient.invalidateQueries({ queryKey: ["staff"] });
        },
        onError: () => toast.error("Failed to remove staff member"),
      },
    );
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">{view === "staff" ? "Employees" : "Sales Report"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {view === "staff"
                ? "Manage your team members, roles, and access permissions."
                : "Sales performance by staff member."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border bg-muted/30 p-1 gap-1">
              <button
                onClick={() => setView("staff")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5",
                  view === "staff" ? "bg-background shadow-sm" : "pill-selector text-muted-foreground hover:text-foreground",
                )}
              >
                <UserSquare2 className="w-4 h-4" /> Employees
              </button>
              <button
                onClick={() => setView("report")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5",
                  view === "report" ? "bg-background shadow-sm" : "pill-selector text-muted-foreground hover:text-foreground",
                )}
              >
                <BarChart2 className="w-4 h-4" /> Sales Report
              </button>
            </div>
            {view === "staff" && (
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" /> Add Staff Member
              </Button>
            )}
          </div>
        </div>

        {/* Staff list view */}
        {view === "staff" && (
          isLoading ? (
            <div className="text-center py-16 text-muted-foreground">Loading staff...</div>
          ) : members.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <UserSquare2 className="w-16 h-16 text-muted-foreground/30" />
                <div>
                  <p className="font-medium text-lg">No staff added yet</p>
                  <p className="text-muted-foreground text-sm">Add staff members to manage access and track sales.</p>
                </div>
                <Button onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-2" /> Add Staff Member
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">
                      <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-primary">
                        Name
                        {sortKey === "name" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-muted-foreground" />}
                      </button>
                    </th>
                    <th className="text-left p-4 font-medium hidden md:table-cell">
                      <button onClick={() => toggleSort("email")} className="flex items-center gap-1 hover:text-primary">
                        Email
                        {sortKey === "email" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-muted-foreground" />}
                      </button>
                    </th>
                    <th className="text-left p-4 font-medium hidden sm:table-cell">
                      <button onClick={() => toggleSort("role")} className="flex items-center gap-1 hover:text-primary">
                        Role
                        {sortKey === "role" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-muted-foreground" />}
                      </button>
                    </th>
                    <th className="text-center p-4 font-medium hidden lg:table-cell">
                      <button onClick={() => toggleSort("status")} className="flex items-center gap-1 hover:text-primary mx-auto">
                        Status
                        {sortKey === "status" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-muted-foreground" />}
                      </button>
                    </th>
                    <th className="text-left p-4 font-medium hidden lg:table-cell">
                      <button onClick={() => toggleSort("register")} className="flex items-center gap-1 hover:text-primary">
                        Register
                        {sortKey === "register" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-muted-foreground" />}
                      </button>
                    </th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sorted.map((member) => (
                    <tr
                      key={member.id}
                      onClick={() => setViewing(member)}
                      className="bg-background hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{member.name}</p>
                            {member.company && <p className="text-xs text-muted-foreground">{member.company}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell text-muted-foreground">{member.email || "—"}</td>
                      <td className="p-4 hidden sm:table-cell">
                        <Badge variant="secondary" className="capitalize">{member.role.replace("_", " ")}</Badge>
                      </td>
                      <td className="p-4 text-center hidden lg:table-cell">
                        <Badge variant={member.isActive ? "default" : "secondary"}>
                          {member.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="p-4 hidden lg:table-cell text-muted-foreground">
                        {registerMap[String(member.defaultRegisterType ?? "")] || "—"}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(member); }}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeleting(member); setDelDialog(true); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Sales report view */}
        {view === "report" && <SalesReportView />}
      </div>

      {/* Staff detail view */}
      <StaffDetailDialog
        staff={viewingStaff}
        onClose={() => setViewing(null)}
        onEdit={(s) => { setViewing(null); openEdit(s); }}
        onDelete={(s) => { setViewing(null); setDeleting(s); setDelDialog(true); }}
        registerName={registerMap[String(viewingStaff?.defaultRegisterType ?? "")] || "—"}
      />

      {/* 4-step wizard */}
      <WizardDialog
        open={dialogOpen}
        onClose={() => { markClean(); setDialogOpen(false); }}
        editingStaff={editingStaff}
        onSave={handleSave}
        saving={isSaving}
        onTouched={markDirty}
      />

      {/* Delete confirm */}
      <Dialog open={delDialogOpen} onOpenChange={setDelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Staff Member</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Remove <strong>{deletingStaff?.name}</strong> from your team? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDelDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>Remove</Button>
          </div>
        </DialogContent>
      </Dialog>

      <StaffFormGuard />
    </AppLayout>
  );
}
