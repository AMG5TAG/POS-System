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
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, Monitor, CreditCard, Briefcase, Banknote, SplitSquareHorizontal, Landmark, Ticket, Wallet, CalendarClock, Star, ArrowRight, ArrowLeft } from "lucide-react";
import { PageTabsNav } from "@/components/ui/page-tabs-nav";

const REGISTER_TABS = [
  { href: "#registers",   label: "Registers",    icon: Monitor },
  { href: "#pos-settings", label: "POS Settings", icon: CreditCard },
];

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

/* ─── POS Grid Layout settings ───────────────────────────────────────────── */

export const POS_GRID_SETTINGS_KEY = "koapos_pos_grid_settings";

export interface PosGridSettings {
  columns:        2 | 3 | 4 | 5;
  tileSize:       "compact" | "normal" | "large";
  showPrices:     boolean;
  showStockBadges: boolean;
  cartPosition:   "right" | "left";
}

export const POS_GRID_DEFAULTS: PosGridSettings = {
  columns: 3,
  tileSize: "normal",
  showPrices: true,
  showStockBadges: false,
  cartPosition: "right",
};

export function loadPosGridSettings(): PosGridSettings {
  try {
    const raw = localStorage.getItem(POS_GRID_SETTINGS_KEY);
    return raw ? { ...POS_GRID_DEFAULTS, ...JSON.parse(raw) } : POS_GRID_DEFAULTS;
  } catch { return POS_GRID_DEFAULTS; }
}

/* Dot-grid icon for column selector */
function ColDots({ cols }: { cols: number }) {
  const rows = 2;
  return (
    <div className="flex flex-col items-center gap-1 mb-1">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-1">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="w-2 h-2 rounded-full bg-current opacity-60" />
          ))}
        </div>
      ))}
    </div>
  );
}

function GridLayoutSection() {
  const [s, setS] = useState<PosGridSettings>(loadPosGridSettings);

  const update = <K extends keyof PosGridSettings>(key: K, value: PosGridSettings[K]) => {
    const next = { ...s, [key]: value };
    setS(next);
    localStorage.setItem(POS_GRID_SETTINGS_KEY, JSON.stringify(next));
  };

  const summary = [
    `${s.columns} columns`,
    `${s.tileSize} tiles`,
    `cart ${s.cartPosition}`,
    s.showPrices ? "prices visible" : "prices hidden",
    s.showStockBadges ? "stock badges on" : "stock badges off",
  ].join(" · ");

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b bg-muted/20">
        <p className="font-semibold text-sm">Product Grid Layout</p>
        <p className="text-xs text-muted-foreground mt-0.5">Configure how products are displayed on the POS register screen.</p>
      </div>

      <div className="p-5 space-y-6">
        {/* Columns */}
        <div>
          <p className="text-sm font-medium mb-2">Product Grid Columns</p>
          <div className="grid grid-cols-4 gap-2">
            {([2, 3, 4, 5] as const).map((n) => {
              const active = s.columns === n;
              return (
                <button
                  key={n}
                  onClick={() => update("columns", n)}
                  className={cn(
                    "flex flex-col items-center justify-center py-3 rounded-xl border-2 text-xs font-medium transition-all",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  <ColDots cols={n} />
                  {n} cols
                </button>
              );
            })}
          </div>
        </div>

        {/* Tile size */}
        <div>
          <p className="text-sm font-medium mb-2">Tile Size</p>
          <div className="grid grid-cols-3 gap-2">
            {(["compact", "normal", "large"] as const).map((size) => {
              const active = s.tileSize === size;
              const emoji = size === "compact" ? "▪️" : size === "normal" ? "🔲" : "⬛";
              return (
                <button
                  key={size}
                  onClick={() => update("tileSize", size)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-medium transition-all capitalize",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  <span>{emoji}</span> {size.charAt(0).toUpperCase() + size.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-0 divide-y border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium">Show Prices on Grid</p>
              <p className="text-xs text-muted-foreground">Display product price on each tile</p>
            </div>
            <Switch checked={s.showPrices} onCheckedChange={(v) => update("showPrices", v)} />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium">Show Stock Badges</p>
              <p className="text-xs text-muted-foreground">Show stock level on each product tile</p>
            </div>
            <Switch checked={s.showStockBadges} onCheckedChange={(v) => update("showStockBadges", v)} />
          </div>
        </div>

        {/* Cart position */}
        <div>
          <p className="text-sm font-medium mb-2">Cart Position</p>
          <div className="grid grid-cols-2 gap-2">
            {(["right", "left"] as const).map((pos) => {
              const active = s.cartPosition === pos;
              return (
                <button
                  key={pos}
                  onClick={() => update("cartPosition", pos)}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {pos === "right" ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                  {pos === "right" ? "→ Right" : "← Left"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview summary */}
        <div className="rounded-xl border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Current Layout Preview</p>
          <p className="text-xs text-primary font-medium">{summary}</p>
        </div>
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
            <h1 className="text-2xl font-bold">POS Registers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Assign each register to a staff member — it becomes their default till when they log in to KoaPOS.
            </p>
          </div>
          <Button onClick={openNew} className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" />New Register
          </Button>
        </div>

        <PageTabsNav tabs={REGISTER_TABS} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* Left: Registers */}
        <div id="registers" className="space-y-4">
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
          <PaymentMethodsSection />
        </div>{/* end registers col */}

        {/* Right: POS Settings */}
        <div id="pos-settings" className="space-y-3">
          <GridLayoutSection />
          <div className="rounded-xl border divide-y">
            <ForceStaffLoginToggle />
          </div>
        </div>

        </div>{/* end 2-col grid */}
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
