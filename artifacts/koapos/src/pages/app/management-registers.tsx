import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListStaff } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Monitor, CreditCard, Briefcase, Banknote, SplitSquareHorizontal, Landmark, Ticket, Wallet, CalendarClock, Star } from "lucide-react";

export const FORCE_STAFF_LOGIN_KEY = "koapos_force_staff_login";
export const PAYMENT_METHODS_KEY = "koapos_enabled_payment_methods";

export const ALL_PAYMENT_METHODS = [
  { id: "cash",           label: "Cash",                description: "Physical cash and change",                icon: Banknote },
  { id: "card",           label: "Credit / Debit Card", description: "EFTPOS and card payments",                icon: CreditCard },
  { id: "direct_deposit", label: "Direct Deposit",      description: "Bank transfer / direct deposit",          icon: Landmark },
  { id: "voucher",        label: "Voucher",             description: "Gift vouchers and coupon codes",          icon: Ticket },
  { id: "store_credit",   label: "Store Credit",        description: "Accumulated store credit balance",        icon: Wallet },
  { id: "laybuy",         label: "Layby",               description: "Deferred payment / instalment plan",      icon: CalendarClock },
  { id: "loyalty",        label: "Loyalty Dollars",     description: "Redeem earned loyalty rewards",           icon: Star },
  { id: "split",          label: "Split Payment",        description: "Divide the total across methods",        icon: SplitSquareHorizontal },
] as const;

export type PaymentMethodId = (typeof ALL_PAYMENT_METHODS)[number]["id"];

export function getEnabledPaymentMethods(): PaymentMethodId[] {
  try {
    const stored = localStorage.getItem(PAYMENT_METHODS_KEY);
    if (stored) return JSON.parse(stored) as PaymentMethodId[];
  } catch { /* ignore */ }
  return ALL_PAYMENT_METHODS.map((m) => m.id);
}

/* ─── Integration payment methods ────────────────────────────────────────── */

export const INTEGRATION_PAYMENT_METHODS_KEY = "koapos_enabled_integration_payments";

export const PAYMENT_INTEGRATION_CATEGORIES = [
  "Payments & EFTPOS",
  "Buy Now, Pay Later",
  "Digital Wallets",
] as const;

export const INTEGRATION_PAYMENT_LABELS: Record<string, string> = {
  stripe_own:      "Stripe",
  commbank_eftpos: "CommBank EFTPOS",
  tyro_eftpos:     "Tyro",
  square_terminal: "Square Terminal",
  paypal:          "PayPal",
  afterpay:        "Afterpay",
  zip:             "Zip",
  klarna:          "Klarna",
  apple_wallet:    "Apple Wallet",
  google_pay:      "Google Pay",
  wechat_alipay:   "WeChat / Alipay",
};

export function getEnabledIntegrationPayments(): string[] {
  try {
    const stored = localStorage.getItem(INTEGRATION_PAYMENT_METHODS_KEY);
    if (stored) return JSON.parse(stored) as string[];
  } catch { /* ignore */ }
  return [];
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

type RegisterType = "Cash" | "Cashless" | "Operations";

interface PosRegister {
  id: string;
  name: string;
  type: RegisterType;
  staffName: string;
  staffEmail: string;
}

/* ─── Register type definitions ──────────────────────────────────────────── */

const REGISTER_TYPES: {
  type: RegisterType;
  description: string;
  icon: React.ElementType;
  bg: string;
  text: string;
  badgeBg: string;
  badgeText: string;
}[] = [
  {
    type: "Cash",
    description: "Full POS — all payment types",
    icon: Monitor,
    bg: "bg-green-50 dark:bg-green-950/30",
    text: "text-green-700 dark:text-green-400",
    badgeBg: "bg-green-100 dark:bg-green-900/40",
    badgeText: "text-green-700 dark:text-green-300",
  },
  {
    type: "Cashless",
    description: "Card payments only",
    icon: CreditCard,
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-400",
    badgeBg: "bg-blue-100 dark:bg-blue-900/40",
    badgeText: "text-blue-700 dark:text-blue-300",
  },
  {
    type: "Operations",
    description: "Invoicing & quoting only",
    icon: Briefcase,
    bg: "bg-purple-50 dark:bg-purple-950/30",
    text: "text-purple-700 dark:text-purple-400",
    badgeBg: "bg-purple-100 dark:bg-purple-900/40",
    badgeText: "text-purple-700 dark:text-purple-300",
  },
];

const STORAGE_KEY = "koapos_pos_registers";

function loadRegisters(): PosRegister[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as PosRegister[]) : [];
  } catch {
    return [];
  }
}

function saveRegisters(registers: PosRegister[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registers));
}

/* ─── TypeBadge ──────────────────────────────────────────────────────────── */

function TypeBadge({ type }: { type: RegisterType }) {
  const def = REGISTER_TYPES.find((t) => t.type === type)!;
  const Icon = def.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${def.badgeBg} ${def.badgeText}`}
    >
      <Icon className="h-3 w-3" />
      {type}
    </span>
  );
}

/* ─── Empty form ─────────────────────────────────────────────────────────── */

const EMPTY_FORM = { name: "", type: "Cash" as RegisterType, staffId: "", staffName: "", staffEmail: "" };

/* ─── Payment Methods section ────────────────────────────────────────────── */

type ConnectedPayIntegration = { key: string; label: string; category: string };

function PaymentMethodsSection() {
  const [enabled, setEnabled] = useState<PaymentMethodId[]>(getEnabledPaymentMethods);
  const [enabledIntegrations, setEnabledIntegrations] = useState<string[]>(getEnabledIntegrationPayments);
  const [payIntegrations, setPayIntegrations] = useState<ConnectedPayIntegration[]>([]);

  useEffect(() => {
    fetch("/api/integrations", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: (ConnectedPayIntegration & { status: string })[]) => {
        setPayIntegrations(
          data.filter(i =>
            i.status === "connected" &&
            (PAYMENT_INTEGRATION_CATEGORIES as readonly string[]).includes(i.category)
          )
        );
      })
      .catch(() => {});
  }, []);

  const toggle = (id: PaymentMethodId, checked: boolean) => {
    const next = checked ? [...enabled, id] : enabled.filter((m) => m !== id);
    if (next.length === 0) { toast.error("At least one payment method must be enabled"); return; }
    setEnabled(next);
    localStorage.setItem(PAYMENT_METHODS_KEY, JSON.stringify(next));
    toast.success(checked ? `${ALL_PAYMENT_METHODS.find(m => m.id === id)?.label} enabled` : `${ALL_PAYMENT_METHODS.find(m => m.id === id)?.label} disabled`);
  };

  const toggleIntegration = (key: string, checked: boolean) => {
    const next = checked ? [...enabledIntegrations, key] : enabledIntegrations.filter(k => k !== key);
    setEnabledIntegrations(next);
    localStorage.setItem(INTEGRATION_PAYMENT_METHODS_KEY, JSON.stringify(next));
    const label = INTEGRATION_PAYMENT_LABELS[key] ?? key;
    toast.success(checked ? `${label} payment enabled` : `${label} payment disabled`);
  };

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b bg-muted/20">
        <p className="font-semibold text-sm">Payment Methods</p>
        <p className="text-xs text-muted-foreground mt-0.5">Choose which payment options appear in the POS checkout screen.</p>
      </div>
      <div className="divide-y">
        {ALL_PAYMENT_METHODS.map(({ id, label, description, icon: Icon }) => {
          const isOn = enabled.includes(id);
          return (
            <div key={id} className="flex items-center gap-4 px-5 py-3.5">
              <div className={`p-2 rounded-lg shrink-0 transition-colors ${isOn ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium transition-colors ${!isOn && "text-muted-foreground"}`}>{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch checked={isOn} onCheckedChange={(v) => toggle(id, v)} />
            </div>
          );
        })}

        {payIntegrations.length > 0 && (
          <>
            <div className="px-5 py-2.5 bg-muted/30 flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Connected Integrations</p>
            </div>
            {payIntegrations.map(({ key, label, category }) => {
              const isOn = enabledIntegrations.includes(key);
              return (
                <div key={key} className="flex items-center gap-4 px-5 py-3.5">
                  <div className={`p-2 rounded-lg shrink-0 transition-colors ${isOn ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium transition-colors ${!isOn && "text-muted-foreground"}`}>{label}</p>
                    <p className="text-xs text-muted-foreground">{category}</p>
                  </div>
                  <Switch checked={isOn} onCheckedChange={(v) => toggleIntegration(key, v)} />
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Force Staff Login toggle ───────────────────────────────────────────── */

function ForceStaffLoginToggle() {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem(FORCE_STAFF_LOGIN_KEY) === "true"
  );
  const toggle = (v: boolean) => {
    setEnabled(v);
    localStorage.setItem(FORCE_STAFF_LOGIN_KEY, String(v));
  };
  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <p className="text-sm font-medium">Force Staff Login</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Require a staff PIN before every sale is processed.
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={toggle} />
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementRegistersPage() {
  const [registers, setRegisters] = useState<PosRegister[]>(loadRegisters);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PosRegister | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: staffData } = useListStaff({ query: { queryKey: ["staff"] } });
  const staffList = Array.isArray(staffData) ? staffData : [];

  useEffect(() => {
    saveRegisters(registers);
  }, [registers]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (reg: PosRegister) => {
    setEditing(reg);
    const matched = staffList.find((s) => s.name === reg.staffName);
    setForm({ name: reg.name, type: reg.type, staffId: matched ? String(matched.id) : "", staffName: reg.staffName, staffEmail: reg.staffEmail });
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setRegisters((prev) => prev.filter((r) => r.id !== id));
    toast.success("Register deleted");
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Register name is required");
      return;
    }
    if (editing) {
      setRegisters((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r))
      );
      toast.success("Register updated");
    } else {
      setRegisters((prev) => [...prev, { id: crypto.randomUUID(), ...form }]);
      toast.success("Register created");
    }
    setDialogOpen(false);
  };

  const handleStaffSelect = (val: string) => {
    if (val === "__none__") {
      setForm((f) => ({ ...f, staffId: "", staffName: "", staffEmail: "" }));
      return;
    }
    const member = staffList.find((s) => String(s.id) === val);
    if (member) {
      setForm((f) => ({
        ...f,
        staffId: String(member.id),
        staffName: member.name,
        staffEmail: member.email ?? "",
      }));
    }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">POS Registers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Assign each register to a staff member — it becomes their default till when they log in to KoaPOS.
            </p>
          </div>
          <Button onClick={openNew} className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" />New Register
          </Button>
        </div>

        {/* Register type cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {REGISTER_TYPES.map(({ type, description, icon: Icon, bg, text }) => (
            <div key={type} className={`rounded-xl border border-border p-4 flex items-center gap-3 ${bg}`}>
              <div className={`p-2 rounded-lg bg-white/60 dark:bg-black/20 ${text}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className={`font-semibold text-sm ${text}`}>{type}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Register list */}
        {registers.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
            <Monitor className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No registers yet</p>
            <p className="text-sm mt-1">Click "+ New Register" to create your first POS terminal.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {registers.map((reg) => (
              <div
                key={reg.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{reg.name}</p>
                    {(reg.staffName || reg.staffEmail) && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {reg.staffName && <span className="mr-1">{reg.staffName}</span>}
                        {reg.staffEmail && (
                          <span className="text-muted-foreground/70">({reg.staffEmail})</span>
                        )}
                      </p>
                    )}
                    <div className="mt-2">
                      <TypeBadge type={reg.type} />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-1 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(reg)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 px-3"
                    onClick={() => handleDelete(reg.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payment Methods */}
        <div className="border-t pt-6 space-y-3">
          <h2 className="text-base font-semibold">POS Settings</h2>
          <PaymentMethodsSection />
          <div className="rounded-xl border divide-y">
            <ForceStaffLoginToggle />
          </div>
        </div>

      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Register" : "New Register"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Register Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Front Counter"
                autoFocus
              />
            </div>
            <div>
              <Label>Register Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as RegisterType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGISTER_TYPES.map(({ type, description }) => (
                    <SelectItem key={type} value={type}>
                      <span className="font-medium">{type}</span>
                      <span className="text-muted-foreground ml-1 text-xs">— {description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assign to Staff Member</Label>
              <Select onValueChange={handleStaffSelect} value={form.staffId || "__none__"}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Unassigned —</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                      {s.email && <span className="text-muted-foreground ml-1 text-xs">({s.email})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save Changes" : "Create Register"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
