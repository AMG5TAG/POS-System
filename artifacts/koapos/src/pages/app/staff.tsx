import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListStaff, useCreateStaff, useUpdateStaff, useDeleteStaff, Staff, StaffInput, StaffUpdate } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  UserSquare2, Plus, Pencil, Trash2, User, MapPin, Settings2, DollarSign,
  Check, ChevronRight, ChevronLeft, Lock, Monitor, ShieldCheck, Upload,
  Clock, CalendarClock, ClipboardList, Coins, StickyNote, Target, Link2,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type AddressFields = {
  street: string; city: string; state: string; postcode: string; country: string;
};

type WizardForm = {
  // Step 1 – Personal
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  company: string;
  abn: string;
  // Step 2 – Address
  billing: AddressFields;
  postalSameAsBilling: boolean;
  postal: AddressFields;
  // Step 3 – Account
  role: string;
  isActive: boolean;
  pin: string;
  // Step 4 – Employment
  defaultRegisterType: string;
  payRate: string;
  loadingRate: string;
  superRate: string;
};

const emptyAddress = (): AddressFields => ({ street: "", city: "", state: "", postcode: "", country: "Australia" });

const defaultForm = (): WizardForm => ({
  firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", company: "", abn: "",
  billing: emptyAddress(), postalSameAsBilling: true, postal: emptyAddress(),
  role: "cashier", isActive: true, pin: "",
  defaultRegisterType: "", payRate: "", loadingRate: "", superRate: "",
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
    pin:     s.pin ?? "",
    defaultRegisterType: s.defaultRegisterType ?? "",
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
] as const;

function StepNav({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STEPS.map((step, i) => {
        const Icon      = step.icon;
        const done      = i < current;
        const active    = i === current;
        const future    = i > current;
        return (
          <div key={step.label} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
                active  && "bg-primary text-primary-foreground",
                done    && "bg-background border border-primary/40 text-primary",
                future  && "text-muted-foreground",
              )}
            >
              {done
                ? <Check className="w-3 h-3" />
                : <Icon className="w-3 h-3 shrink-0" />}
              <span className={cn("hidden sm:inline", future && "opacity-70")}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── POS Register selector ──────────────────────────────────────────────── */

const POS_REGISTERS_KEY = "koapos_pos_registers";

function PosRegisterSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const registers: { id: string; name: string; type: string }[] = (() => {
    try { return JSON.parse(localStorage.getItem(POS_REGISTERS_KEY) ?? "[]"); }
    catch { return []; }
  })();

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
      <PillInput label="Street Address" value={addr.street} onChange={set("street")} />
      <div className="grid grid-cols-2 gap-3">
        <PillInput label="City"  value={addr.city}  onChange={set("city")} />
        <PillInput label="State" value={addr.state} onChange={set("state")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PillInput label="Postcode" value={addr.postcode} onChange={set("postcode")} />
        <PillInput label="Country"  value={addr.country}  onChange={set("country")} />
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
}

function WizardDialog({ open, onClose, editingStaff, onSave, saving }: WizardDialogProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(defaultForm);

  /* Reset form whenever the dialog opens (open prop → true).
     Radix UI does NOT fire onOpenChange when the controlled `open` prop changes
     programmatically, so we use an effect to reliably reset state. */
  useEffect(() => {
    if (open) {
      setStep(0);
      setForm(editingStaff ? staffToForm(editingStaff) : defaultForm());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Sync form when dialog opens */
  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
    }
  };

  const set = <K extends keyof WizardForm>(key: K) => (val: WizardForm[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const setField = <K extends keyof WizardForm>(key: K) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: (e.target as HTMLInputElement).value }));

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

  /* Sync postal to billing when toggle is on */
  const togglePostalSame = (v: boolean) =>
    setForm((f) => ({ ...f, postalSameAsBilling: v, postal: v ? { ...f.billing } : f.postal }));

  const fullName = `${form.firstName} ${form.lastName}`.trim() || "—";

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg font-bold">
            {editingStaff ? "Edit Employee" : "Add Employee"}
          </DialogTitle>
          <div className="mt-3">
            <StepNav current={step} />
          </div>
        </DialogHeader>

        <div className="px-6 py-5 min-h-[300px]">
          {/* ── Step 1: Personal ── */}
          {step === 0 && (
            <div className="space-y-4">
              {/* Avatar */}
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

          {/* ── Step 2: Address ── */}
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

          {/* ── Step 3: Account ── */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Role */}
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

              {/* Active toggle */}
              <div className="flex items-center gap-3 border rounded-full px-4 py-2.5">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={set("isActive")}
                  className="data-[state=checked]:bg-primary"
                />
                <span className="text-sm font-medium">Active Employee</span>
              </div>

              {/* PIN */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm font-semibold text-primary">4-Digit POS PIN</span>
                </div>
                <Input
                  type="password"
                  maxLength={4}
                  value={form.pin}
                  onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  placeholder="••••"
                  className="rounded-md w-28 text-center tracking-widest font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Used to quickly switch staff on the POS without logging out. Leave blank to disable PIN login for this employee.
                </p>
              </div>

            </div>
          )}

          {/* ── Step 4: Employment ── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* POS Register Default */}
              <PosRegisterSelect value={form.defaultRegisterType} onChange={set("defaultRegisterType")} />

              {/* Payroll Details */}
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

        {/* ── Footer ── */}
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

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function StaffPage() {
  const queryClient   = useQueryClient();
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [delDialogOpen, setDelDialog]   = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [deletingStaff, setDeleting]    = useState<Staff | null>(null);

  const { data: staffList, isLoading } = useListStaff({ query: { queryKey: ["staff"] } });
  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const deleteMutation = useDeleteStaff();

  const members = staffList || [];

  const openCreate = () => { setEditingStaff(null); setDialogOpen(true); };
  const openEdit   = (s: Staff) => { setEditingStaff(s); setDialogOpen(true); };

  const handleSave = (form: WizardForm) => {
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
      payRate:     form.payRate     || undefined,
      loadingRate: form.loadingRate || undefined,
      superRate:   form.superRate   || undefined,
    };

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["staff"] });

    if (editingStaff) {
      updateMutation.mutate(
        { id: editingStaff.id, data: payload as unknown as StaffUpdate },
        {
          onSuccess: () => { toast.success("Staff member updated"); setDialogOpen(false); invalidate(); },
          onError:   () => toast.error("Failed to update staff member"),
        },
      );
    } else {
      createMutation.mutate(
        { data: payload as unknown as StaffInput },
        {
          onSuccess: () => { toast.success("Staff member added"); setDialogOpen(false); invalidate(); },
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-sm text-muted-foreground">Manage your team members, roles, and access permissions.</p>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Add Staff Member
          </Button>
        </div>

        {isLoading ? (
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
                  <th className="text-left p-4 font-medium">Name</th>
                  <th className="text-left p-4 font-medium hidden md:table-cell">Email</th>
                  <th className="text-left p-4 font-medium hidden sm:table-cell">Role</th>
                  <th className="text-center p-4 font-medium hidden lg:table-cell">Status</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((member) => (
                  <tr key={member.id} className="bg-background hover:bg-muted/30 transition-colors">
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
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(member)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { setDeleting(member); setDelDialog(true); }}
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
        )}
      </div>

      {/* 4-step wizard */}
      <WizardDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editingStaff={editingStaff}
        onSave={handleSave}
        saving={isSaving}
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
    </AppLayout>
  );
}
