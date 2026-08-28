import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListStaff, useListPosRegisters, useCreatePosRegister,
  useUpdatePosRegister, useDeletePosRegister,
  useGetPosSettings, useUpsertPosSettings,
  useListIntegrations,
  useListPosRegisterSessions, useUpdatePosRegisterSession,
  useListCashDrawerEntries, useGetPaymentTotals,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Plus, Pencil, Trash2, Monitor, CreditCard, Briefcase, Banknote,
  SplitSquareHorizontal, Landmark, Ticket, Wallet, CalendarClock, Star,
  ArrowRight, ArrowLeft, Printer, ScanLine, Keyboard, HardDrive,
  Wifi, Usb, Zap, Settings2, ShieldCheck,
  Lock, LockOpen, DollarSign, Gift, ArrowDownLeft, ArrowUpRight, Clock, User,
} from "lucide-react";
import { KEYBOARD_SHORTCUTS } from "@/lib/keyboard-shortcuts";
import {
  parseHardwareConfig, resolvePrinterConnection, findPrinterModel, PRINTER_MODELS,
  RECEIPT_PROFILE_ID,
  type HardwareCfg, type CashDrawerCfg, type PrinterCfg, type ScannerCfg,
} from "@/lib/hardware-config";
import { connectUsbPrinter, connectSerialPrinter, printTestReceipt, openCashDrawer } from "@/lib/thermal-printer";
import {
  PrintBridgeCard, PrinterRoutingCard, useBridgeStatus,
} from "@/components/hardware/PrintBridgePanel";
import {
  getEnabledPaymentMethods, getEnabledIntegrationPayments, INTEGRATION_PAYMENT_LABELS,
  parseCustomPaymentMethods, type CustomPaymentMethod,
} from "@/lib/pos-local-settings";
import {
  CUSTOM_PAYMENT_ICONS, CUSTOM_PAYMENT_ICON_KEYS, DEFAULT_CUSTOM_PAYMENT_ICON,
  resolveCustomPaymentIcon,
} from "@/lib/custom-payment-icons";

export {
  FORCE_STAFF_LOGIN_KEY,
  PAYMENT_METHODS_KEY,
  STAFF_LOGIN_MSG_KEY,
  INTEGRATION_PAYMENT_METHODS_KEY,
  POS_GRID_SETTINGS_KEY,
  ACTIVE_REGISTER_KEY,
  INTEGRATION_PAYMENT_LABELS,
  ASYNC_PAYMENT_PROVIDERS,
  PAYMENT_INTEGRATION_CATEGORIES,
  POS_GRID_DEFAULTS,
  getStaffLoginMessage,
  saveStaffLoginMessage,
  hasStaffAcknowledged,
  setStaffAcknowledged,
  getEnabledPaymentMethods,
  getEnabledIntegrationPayments,
  loadPosGridSettings,
  type StaffLoginMessage,
  type PaymentMethodId,
  type PosGridSettings,
} from "@/lib/pos-local-settings";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const REGISTER_TABS = [
  { href: "#registers",    label: "Registers",    icon: Monitor    },
  { href: "#pos-settings", label: "POS Settings", icon: CreditCard },
  { href: "#shortcuts",    label: "Shortcuts",    icon: Keyboard   },
];
void REGISTER_TABS; // referenced in UI anchor links

export const ALL_PAYMENT_METHODS = [
  { id: "cash",           label: "Cash",                description: "Physical cash and change",                icon: Banknote },
  { id: "eftpos",         label: "EFTPOS",              description: "EFTPOS terminal / tap & go",              icon: CreditCard },
  { id: "card",           label: "Credit / Debit Card", description: "Manually keyed card payments",            icon: CreditCard },
  { id: "direct_deposit", label: "Direct Deposit",      description: "Bank transfer / direct deposit",          icon: Landmark },
  { id: "voucher",        label: "Voucher",             description: "Gift vouchers and coupon codes",          icon: Ticket },
  { id: "store_credit",   label: "Store Credit",        description: "Accumulated store credit balance",        icon: Wallet },
  { id: "laybuy",         label: "Layby",               description: "Deferred payment / instalment plan",      icon: CalendarClock },
  { id: "loyalty",        label: "Loyalty Dollars",     description: "Redeem earned loyalty rewards",           icon: Star },
  { id: "split",          label: "Split Payment",        description: "Divide the total across methods",        icon: SplitSquareHorizontal },
] as const;

type PaymentMethodIdLocal = (typeof ALL_PAYMENT_METHODS)[number]["id"];

const PAYMENT_INTEGRATION_CATS = [
  "Payments & EFTPOS",
  "Buy Now, Pay Later",
  "Digital Wallets",
] as const;

const INTEGRATION_LABELS: Record<string, string> = {
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

/* ─── Types ──────────────────────────────────────────────────────────────── */

type RegisterType = "Cash" | "Cashless" | "Operations";

interface PosRegister {
  id: string;
  name: string;
  type: RegisterType;
  staffName: string;
  staffEmail: string;
}

function apiToRegister(r: Record<string, unknown>): PosRegister {
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    type: (String(r.type ?? "Cash")) as RegisterType,
    staffName: String(r.staffName ?? ""),
    staffEmail: String(r.staffEmail ?? ""),
  };
}

const REGISTER_TYPES: {
  type: RegisterType; description: string; icon: React.ElementType;
  bg: string; text: string; badgeBg: string; badgeText: string;
}[] = [
  { type: "Cash",       description: "Full POS — all payment types",  icon: Monitor,   bg: "bg-green-50 dark:bg-green-950/30",  text: "text-green-700 dark:text-green-400",  badgeBg: "bg-green-100 dark:bg-green-900/40",  badgeText: "text-green-700 dark:text-green-300"  },
  { type: "Cashless",   description: "Card payments only",            icon: CreditCard,bg: "bg-blue-50 dark:bg-blue-950/30",    text: "text-blue-700 dark:text-blue-400",    badgeBg: "bg-blue-100 dark:bg-blue-900/40",    badgeText: "text-blue-700 dark:text-blue-300"    },
  { type: "Operations", description: "Invoicing & quoting only",      icon: Briefcase, bg: "bg-purple-50 dark:bg-purple-950/30",text: "text-purple-700 dark:text-purple-400",badgeBg: "bg-purple-100 dark:bg-purple-900/40",badgeText: "text-purple-700 dark:text-purple-300" },
];

const EMPTY_FORM = { name: "", type: "Cash" as RegisterType, staffId: "", staffName: "", staffEmail: "" };

function TypeBadge({ type }: { type: RegisterType }) {
  const def = REGISTER_TYPES.find((t) => t.type === type)!;
  const Icon = def.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${def.badgeBg} ${def.badgeText}`}>
      <Icon className="h-3 w-3" />{type}
    </span>
  );
}

/* ─── Shared API hook ────────────────────────────────────────────────────── */

function usePosSettings() {
  const query = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const upsert = useUpsertPosSettings({ mutation: { onSuccess: () => query.refetch() } });
  return { settings: query.data, upsert };
}

/* ─── Payment Methods section ────────────────────────────────────────────── */

type ConnectedPayIntegration = { key: string; label: string; category: string };

function PaymentMethodsSection() {
  const { settings, upsert } = usePosSettings();
  const { data: integrationsData = [] } = useListIntegrations();
  const payIntegrations = (integrationsData as unknown as (ConnectedPayIntegration & { status: string })[])
    .filter(i => i.status === "connected" && (PAYMENT_INTEGRATION_CATS as readonly string[]).includes(i.category));

  const enabled = useMemo((): PaymentMethodIdLocal[] => {
    try {
      if (settings?.enabledPaymentMethods) return JSON.parse(settings.enabledPaymentMethods) as PaymentMethodIdLocal[];
    } catch { /* ignore */ }
    return ALL_PAYMENT_METHODS.map((m) => m.id);
  }, [settings]);

  const enabledIntegrations = useMemo((): string[] => {
    try {
      if (settings?.enabledIntegrationPayments) return JSON.parse(settings.enabledIntegrationPayments) as string[];
    } catch { /* ignore */ }
    return [];
  }, [settings]);

  const toggle = (id: PaymentMethodIdLocal, checked: boolean) => {
    const next = checked ? [...enabled, id] : enabled.filter((m) => m !== id);
    if (next.length === 0) { toast.error("At least one payment method must be enabled"); return; }
    const label = ALL_PAYMENT_METHODS.find(m => m.id === id)?.label ?? id;
    upsert.mutate(
      { data: { enabledPaymentMethods: JSON.stringify(next) } },
      { onSuccess: () => toast.success(checked ? `${label} enabled` : `${label} disabled`) },
    );
  };

  const toggleIntegration = (key: string, checked: boolean) => {
    const next = checked ? [...enabledIntegrations, key] : enabledIntegrations.filter(k => k !== key);
    const label = INTEGRATION_LABELS[key] ?? key;
    upsert.mutate(
      { data: { enabledIntegrationPayments: JSON.stringify(next) } },
      { onSuccess: () => toast.success(checked ? `${label} payment enabled` : `${label} payment disabled`) },
    );
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

/* ─── Custom Payment Methods section ─────────────────────────────────────── */

function genCustomPaymentId(): string {
  try {
    if (typeof crypto?.randomUUID === "function") return `cust_${crypto.randomUUID().slice(0, 8)}`;
  } catch { /* ignore */ }
  return `cust_${Math.random().toString(36).slice(2, 10)}`;
}

interface CustomMethodDraft { label: string; description: string; icon: string; }
const EMPTY_CUSTOM_DRAFT: CustomMethodDraft = { label: "", description: "", icon: DEFAULT_CUSTOM_PAYMENT_ICON };

function CustomPaymentMethodsSection() {
  const { settings, upsert } = usePosSettings();
  const methods = useMemo(
    () => parseCustomPaymentMethods(settings?.customPaymentMethods),
    [settings],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomMethodDraft>(EMPTY_CUSTOM_DRAFT);

  const persist = (next: CustomPaymentMethod[], onDone?: () => void) => {
    upsert.mutate(
      { data: { customPaymentMethods: JSON.stringify(next) } },
      { onSuccess: () => onDone?.() },
    );
  };

  const openAdd = () => { setEditingId(null); setDraft(EMPTY_CUSTOM_DRAFT); setDialogOpen(true); };
  const openEdit = (m: CustomPaymentMethod) => {
    setEditingId(m.id);
    setDraft({ label: m.label, description: m.description, icon: m.icon });
    setDialogOpen(true);
  };

  const save = () => {
    const label = draft.label.trim();
    if (!label) { toast.error("Give the payment method a name"); return; }
    const dupe = methods.some(m => m.label.toLowerCase() === label.toLowerCase() && m.id !== editingId);
    if (dupe) { toast.error(`"${label}" already exists`); return; }
    const icon = CUSTOM_PAYMENT_ICONS[draft.icon] ? draft.icon : DEFAULT_CUSTOM_PAYMENT_ICON;

    let next: CustomPaymentMethod[];
    if (editingId) {
      next = methods.map(m => m.id === editingId
        ? { ...m, label, description: draft.description.trim(), icon }
        : m);
    } else {
      next = [...methods, { id: genCustomPaymentId(), label, description: draft.description.trim(), icon, enabled: true }];
    }
    persist(next, () => {
      toast.success(editingId ? `${label} updated` : `${label} added`);
      setDialogOpen(false);
    });
  };

  const toggle = (id: string, enabled: boolean) => {
    const m = methods.find(x => x.id === id);
    persist(methods.map(x => x.id === id ? { ...x, enabled } : x), () =>
      toast.success(`${m?.label ?? "Method"} ${enabled ? "enabled" : "disabled"}`));
  };

  const remove = (m: CustomPaymentMethod) => {
    persist(methods.filter(x => x.id !== m.id), () => toast.success(`${m.label} removed`));
  };

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b bg-muted/20 flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-sm">Custom Payment Methods</p>
          <p className="text-xs text-muted-foreground mt-0.5">Add your own tenders (e.g. Cheque, Bank Cheque, On Account). They appear at checkout and record as an "Other" payment.</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      {methods.length === 0 ? (
        <div className="px-5 py-6 text-center text-xs text-muted-foreground">
          No custom payment methods yet.
        </div>
      ) : (
        <div className="divide-y">
          {methods.map((m) => {
            const Icon = resolveCustomPaymentIcon(m.icon);
            return (
              <div key={m.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className={`p-2 rounded-lg shrink-0 transition-colors ${m.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium transition-colors ${!m.enabled && "text-muted-foreground"}`}>{m.label}</p>
                  {m.description && <p className="text-xs text-muted-foreground truncate">{m.description}</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(m)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(m)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Switch checked={m.enabled} onCheckedChange={(v) => toggle(m.id, v)} />
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Payment Method" : "New Payment Method"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="cpm-name">Name</Label>
              <Input
                id="cpm-name"
                placeholder="e.g. Cheque"
                value={draft.label}
                maxLength={40}
                onChange={(e) => setDraft(d => ({ ...d, label: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpm-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="cpm-desc"
                placeholder="Shown under the name in settings"
                value={draft.description}
                maxLength={80}
                onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="grid grid-cols-7 gap-1.5">
                {CUSTOM_PAYMENT_ICON_KEYS.map((key) => {
                  const Icon = CUSTOM_PAYMENT_ICONS[key];
                  const active = draft.icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDraft(d => ({ ...d, icon: key }))}
                      className={cn(
                        "flex items-center justify-center aspect-square rounded-lg border transition-all",
                        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/60",
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : editingId ? "Save changes" : "Add method"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── POS Grid Layout settings ───────────────────────────────────────────── */

interface PosGridSettingsLocal {
  columns: 2 | 3 | 4 | 5;
  tileSize: "compact" | "normal" | "large";
  showPrices: boolean;
  showStockBadges: boolean;
  showQuickViewSupplier: boolean;
  cartPosition: "right" | "left";
}

const GRID_DEFAULTS: PosGridSettingsLocal = {
  columns: 3, tileSize: "normal", showPrices: true, showStockBadges: false, showQuickViewSupplier: true, cartPosition: "right",
};

function ColDots({ cols }: { cols: number }) {
  return (
    <div className="flex flex-col items-center gap-1 mb-1">
      {Array.from({ length: 2 }).map((_, r) => (
        <div key={r} className="flex gap-1">
          {Array.from({ length: cols }).map((_, c) => <div key={c} className="w-2 h-2 rounded-full bg-current opacity-60" />)}
        </div>
      ))}
    </div>
  );
}

function GridLayoutSection() {
  const { settings, upsert } = usePosSettings();

  const s = useMemo((): PosGridSettingsLocal => {
    if (!settings) return GRID_DEFAULTS;
    return {
      columns: ([2, 3, 4, 5].includes(settings.gridColumns) ? settings.gridColumns : GRID_DEFAULTS.columns) as 2|3|4|5,
      tileSize: (["compact","normal","large"].includes(settings.gridTileSize) ? settings.gridTileSize : GRID_DEFAULTS.tileSize) as "compact"|"normal"|"large",
      showPrices: settings.gridShowPrices !== "false",
      showStockBadges: settings.gridShowStockBadges === "true",
      showQuickViewSupplier: settings.quickViewShowSupplier !== "false",
      cartPosition: (["right","left"].includes(settings.gridCartPosition) ? settings.gridCartPosition : GRID_DEFAULTS.cartPosition) as "right"|"left",
    };
  }, [settings]);

  const update = (patch: Partial<PosGridSettingsLocal>) => {
    const next = { ...s, ...patch };
    upsert.mutate({ data: {
      gridColumns: next.columns,
      gridTileSize: next.tileSize,
      gridShowPrices: String(next.showPrices),
      gridShowStockBadges: String(next.showStockBadges),
      quickViewShowSupplier: String(next.showQuickViewSupplier),
      gridCartPosition: next.cartPosition,
    } });
  };

  const summary = [
    `${s.columns} columns`, `${s.tileSize} tiles`, `cart ${s.cartPosition}`,
    s.showPrices ? "prices visible" : "prices hidden",
    s.showStockBadges ? "stock badges on" : "stock badges off",
    s.showQuickViewSupplier ? "quick-view supplier on" : "quick-view supplier off",
  ].join(" · ");

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b bg-muted/20">
        <p className="font-semibold text-sm">Product Grid Layout</p>
        <p className="text-xs text-muted-foreground mt-0.5">Configure how products are displayed on the POS register screen.</p>
      </div>
      <div className="p-5 space-y-6">
        <div>
          <p className="text-sm font-medium mb-2">Product Grid Columns</p>
          <div className="grid grid-cols-4 gap-2">
            {([2, 3, 4, 5] as const).map((n) => (
              <button key={n} onClick={() => update({ columns: n })}
                className={cn("flex flex-col items-center justify-center py-3 rounded-xl border-2 text-xs font-medium transition-all",
                  s.columns === n ? "border-primary bg-primary/5 text-primary" : "pill-selector border-border text-muted-foreground hover:border-primary/40")}>
                <ColDots cols={n} />{n} cols
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-2">Tile Size</p>
          <div className="grid grid-cols-3 gap-2">
            {(["compact", "normal", "large"] as const).map((size) => (
              <button key={size} onClick={() => update({ tileSize: size })}
                className={cn("flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-medium transition-all capitalize",
                  s.tileSize === size ? "border-primary bg-primary/5 text-primary" : "pill-selector border-border text-muted-foreground hover:border-primary/40")}>
                <span>{size === "compact" ? "▪️" : size === "normal" ? "🔲" : "⬛"}</span> {size.charAt(0).toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-0 divide-y border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div><p className="text-sm font-medium">Show Prices on Grid</p><p className="text-xs text-muted-foreground">Display product price on each tile</p></div>
            <Switch checked={s.showPrices} onCheckedChange={(v) => update({ showPrices: v })} />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div><p className="text-sm font-medium">Show Stock Badges</p><p className="text-xs text-muted-foreground">Show stock level on each product tile</p></div>
            <Switch checked={s.showStockBadges} onCheckedChange={(v) => update({ showStockBadges: v })} />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div><p className="text-sm font-medium">Show Supplier in Quick View</p><p className="text-xs text-muted-foreground">Display the product's supplier when quick-viewing a product on the Sell screen</p></div>
            <Switch checked={s.showQuickViewSupplier} onCheckedChange={(v) => update({ showQuickViewSupplier: v })} />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-2">Cart Position</p>
          <div className="grid grid-cols-2 gap-2">
            {(["right", "left"] as const).map((pos) => (
              <button key={pos} onClick={() => update({ cartPosition: pos })}
                className={cn("flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all",
                  s.cartPosition === pos ? "border-primary bg-primary/5 text-primary" : "pill-selector border-border text-muted-foreground hover:border-primary/40")}>
                {pos === "right" ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                {pos === "right" ? "→ Right" : "← Left"}
              </button>
            ))}
          </div>
        </div>
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
  const { settings, upsert } = usePosSettings();
  const enabled = settings?.forceStaffLogin === "true";
  const toggle = (v: boolean) => {
    upsert.mutate({ data: { forceStaffLogin: String(v) } });
  };
  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <p className="text-sm font-medium">Force Staff Login</p>
        <p className="text-xs text-muted-foreground mt-0.5">Show the staff PIN popup as soon as the POS opens — a staff member must sign in for the day before sales can be processed.</p>
      </div>
      <Switch checked={enabled} onCheckedChange={toggle} />
    </div>
  );
}

/* ─── Prompt to close all open registers toggle ──────────────────────────── */

function PromptCloseAllRegistersToggle() {
  const { settings, upsert } = usePosSettings();
  const enabled = settings?.promptCloseAllRegisters === "true";
  const toggle = (v: boolean) => {
    upsert.mutate({ data: { promptCloseAllRegisters: String(v) } });
  };
  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <p className="text-sm font-medium">Prompt to close all open registers</p>
        <p className="text-xs text-muted-foreground mt-0.5">When a register is closed, ask whether to also close every other register still open for the business — including tills open on other devices.</p>
      </div>
      <Switch checked={enabled} onCheckedChange={toggle} />
    </div>
  );
}

interface StaffLoginMsg { text: string; requireAck: boolean; enabled: boolean; }

function StaffLoginMessageToggle() {
  const { settings, upsert } = usePosSettings();
  const [editing, setEditing] = useState(false);

  const msg: StaffLoginMsg = useMemo(() => {
    try {
      if (settings?.staffLoginMessage) return JSON.parse(settings.staffLoginMessage) as StaffLoginMsg;
    } catch { /* ignore */ }
    return { text: "", requireAck: false, enabled: false };
  }, [settings]);

  const [draft, setDraft] = useState<StaffLoginMsg>(msg);

  const save = (patch: Partial<StaffLoginMsg>) => {
    const next = { ...msg, ...patch };
    upsert.mutate({ data: { staffLoginMessage: JSON.stringify(next) } });
  };

  const handleEditSave = () => {
    save(draft);
    setEditing(false);
    toast.success("Staff login message saved");
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Staff Login Message</p>
          <p className="text-xs text-muted-foreground mt-0.5">Show a message to staff when they sign in at the POS.</p>
        </div>
        <Switch checked={msg.enabled} onCheckedChange={(v) => save({ enabled: v })} />
      </div>
      {msg.enabled && (
        <div className="space-y-3 pt-1">
          {editing ? (
            <>
              <Textarea
                value={draft.text}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                placeholder="Enter the message staff will see on login..."
                rows={3}
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.requireAck}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, requireAck: v }))}
                  id="ack-switch"
                />
                <Label htmlFor="ack-switch" className="text-xs cursor-pointer">
                  Require staff to tick a box acknowledging they have read this message
                </Label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleEditSave}>Save Message</Button>
                <Button size="sm" variant="ghost" onClick={() => { setDraft(msg); setEditing(false); }}>Cancel</Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {msg.text
                ? <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{msg.text}</div>
                : <p className="text-xs text-muted-foreground italic">No message set yet.</p>
              }
              <div className="flex items-center gap-2">
                {msg.requireAck && <Badge variant="outline" className="text-[10px]">Acknowledgment Required</Badge>}
                <Button size="sm" variant="outline" onClick={() => { setDraft(msg); setEditing(true); }}>Edit Message</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Role Discount Limits section ──────────────────────────────────────── */

type RoleDiscountEntry = { hardCap: number | null; approvalThreshold: number | null };
type RoleDiscountLimits = { cashier?: RoleDiscountEntry; manager?: RoleDiscountEntry; owner?: RoleDiscountEntry };

const DISCOUNT_ROLES: { key: keyof RoleDiscountLimits; label: string; description: string }[] = [
  { key: "cashier",  label: "Cashier",  description: "Staff members with the cashier role." },
  { key: "manager",  label: "Manager",  description: "Staff members with the manager role." },
  { key: "owner",    label: "Owner",    description: "Business owners — leave blank for no limit." },
];

function parseRoleDiscountLimits(raw: string): Record<string, RoleDiscountEntry> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, RoleDiscountEntry> = {};
    for (const [role, val] of Object.entries(parsed)) {
      if (typeof val === "number") {
        result[role] = { hardCap: val, approvalThreshold: null };
      } else if (val == null) {
        result[role] = { hardCap: null, approvalThreshold: null };
      } else if (typeof val === "object") {
        const v = val as { hardCap?: number | null; approvalThreshold?: number | null };
        result[role] = { hardCap: v.hardCap ?? null, approvalThreshold: v.approvalThreshold ?? null };
      }
    }
    return result;
  } catch { return {}; }
}

function parsePctField(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const v = parseFloat(trimmed);
  if (isNaN(v) || v < 0 || v > 100) return { ok: false };
  return { ok: true, value: parseFloat(v.toFixed(2)) };
}

function RoleDiscountLimitsSection() {
  const { settings, upsert } = usePosSettings();

  const limits = useMemo((): Record<string, RoleDiscountEntry> => {
    if (settings?.roleDiscountLimits) return parseRoleDiscountLimits(settings.roleDiscountLimits);
    return {};
  }, [settings]);

  const [hardCapDrafts,    setHardCapDrafts]    = useState<Record<string, string>>({});
  const [approvalDrafts,   setApprovalDrafts]   = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const isDirty = (role: string) => role in hardCapDrafts || role in approvalDrafts;

  const handleChange = (role: string, field: "hardCap" | "approvalThreshold", val: string) => {
    if (field === "hardCap")          { setHardCapDrafts(d  => ({ ...d, [role]: val })); }
    else                              { setApprovalDrafts(d => ({ ...d, [role]: val })); }
    setSaved(s => ({ ...s, [role]: false }));
  };

  const handleSave = (role: string) => {
    const rawHardCap    = hardCapDrafts[role]  ?? (limits[role]?.hardCap    != null ? String(limits[role].hardCap)    : "");
    const rawApproval   = approvalDrafts[role] ?? (limits[role]?.approvalThreshold != null ? String(limits[role].approvalThreshold) : "");

    const hcResult = parsePctField(rawHardCap);
    if (!hcResult.ok)  { toast.error("Hard cap: enter a percentage 0–100, or leave blank for no limit."); return; }
    const atResult = parsePctField(rawApproval);
    if (!atResult.ok)  { toast.error("Approval threshold: enter a percentage 0–100, or leave blank."); return; }

    if (hcResult.value != null && atResult.value != null && atResult.value > hcResult.value) {
      toast.error("Approval threshold must be less than or equal to the hard cap."); return;
    }

    const entry: RoleDiscountEntry = { hardCap: hcResult.value, approvalThreshold: atResult.value };
    const next = { ...limits, [role]: entry };

    upsert.mutate(
      { data: { roleDiscountLimits: JSON.stringify(next) } },
      {
        onSuccess: () => {
          setSaved(s => ({ ...s, [role]: true }));
          setHardCapDrafts(d  => { const n = { ...d }; delete n[role]; return n; });
          setApprovalDrafts(d => { const n = { ...d }; delete n[role]; return n; });
          toast.success(`${role.charAt(0).toUpperCase() + role.slice(1)} discount limits saved`);
        },
      },
    );
  };

  const getHardCapDisplay = (role: string): string => {
    if (role in hardCapDrafts) return hardCapDrafts[role];
    const v = limits[role]?.hardCap;
    return v != null ? String(v) : "";
  };
  const getApprovalDisplay = (role: string): string => {
    if (role in approvalDrafts) return approvalDrafts[role];
    const v = limits[role]?.approvalThreshold;
    return v != null ? String(v) : "";
  };

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b bg-muted/20 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-muted-foreground" />
        <div>
          <p className="font-semibold text-sm">Role Discount Limits</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set a hard cap and an optional approval threshold per role. Discounts above the threshold require a manager PIN; discounts above the hard cap are blocked entirely. Leave blank for no limit.
          </p>
        </div>
      </div>
      <div className="divide-y">
        {DISCOUNT_ROLES.map(({ key, label, description }) => (
          <div key={key} className="px-5 py-3.5 space-y-2.5">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Hard cap %</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="number" min="0" max="100" step="1"
                      placeholder="No limit"
                      value={getHardCapDisplay(key)}
                      onChange={(e) => handleChange(key, "hardCap", e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSave(key)}
                      className="pr-7 text-sm"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Blocked beyond this amount.</p>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Require approval above %</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="number" min="0" max="100" step="1"
                      placeholder="No approval gate"
                      value={getApprovalDisplay(key)}
                      onChange={(e) => handleChange(key, "approvalThreshold", e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSave(key)}
                      className="pr-7 text-sm"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Manager PIN required above this.</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant={saved[key] ? "outline" : "default"}
                onClick={() => handleSave(key)}
                disabled={upsert.isPending || !isDirty(key)}
                className="shrink-0"
              >
                {saved[key] ? "Saved" : "Save"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Hardware section ───────────────────────────────────────────────────── */

function HardwareSection() {
  const { settings, upsert } = usePosSettings();

  const hw = useMemo((): HardwareCfg => parseHardwareConfig(settings?.hardwareConfig), [settings]);

  const save = (next: HardwareCfg) => {
    upsert.mutate({ data: { hardwareConfig: JSON.stringify(next) } });
  };
  const patchCD = (p: Partial<CashDrawerCfg>)  => save({ ...hw, cashDrawer: { ...hw.cashDrawer, ...p } });
  /**
   * Editing the receipt printer also updates the "Receipt printer" profile that
   * document routing points at, so the two generations of config can't drift
   * apart and start printing to different places.
   */
  const patchPR = (p: Partial<PrinterCfg>) => {
    const printer = { ...hw.printer, ...p };
    const printers = hw.printers.map((profile) =>
      profile.id === RECEIPT_PROFILE_ID
        ? {
            ...profile,
            transport: p.connection ?? profile.transport,
            paper: p.paperWidth ?? profile.paper,
            model: p.model ?? profile.model,
            ipAddress: p.ipAddress ?? profile.ipAddress,
            port: p.port ?? profile.port,
          }
        : profile,
    );
    save({ ...hw, printer, printers });
  };
  const patchSC = (p: Partial<ScannerCfg>)      => save({ ...hw, scanner:    { ...hw.scanner,    ...p } });
  /** Top-level patch for the profile/routing/bridge sections. */
  const patchHW = (p: Partial<HardwareCfg>)     => save({ ...hw, ...p });

  // Probing the bridge hits localhost, so only do it once the merchant has
  // switched the feature on.
  const { status: bridgeStatus, checking: bridgeChecking, refresh: refreshBridge } = useBridgeStatus(hw.bridge.enabled);

  /* Pick a printer model preset — seeds paper width + connection defaults. */
  const applyModel = (id: string) => {
    const m = findPrinterModel(id);
    if (!m) { patchPR({ model: id }); return; }
    patchPR({ model: id, paperWidth: m.paperWidth, connection: m.defaultConnection });
  };

  const connectPrinter = async () => {
    try {
      const conn = resolvePrinterConnection(hw.printer);
      if (conn === "serial") { await connectSerialPrinter(); toast.success("Serial printer connected"); }
      else { await connectUsbPrinter(); toast.success("USB printer connected"); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect printer");
    }
  };

  const runTestPrint = async () => {
    try {
      const method = await printTestReceipt(hw);
      toast.success(`Test ticket sent (${method.toUpperCase()})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test print failed");
    }
  };

  const testDrawer = async () => {
    try {
      await openCashDrawer(hw);
      toast.success("Cash drawer kick sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open drawer");
    }
  };

  const printerConn = resolvePrinterConnection(hw.printer);
  const nativeConn = printerConn === "usb" || printerConn === "serial";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Hardware</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Configure connected peripherals — cash drawers, receipt printers, and barcode scanners.</p>
      </div>
      <div className="rounded-xl border overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-4 border-b bg-muted/20">
          <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30"><Banknote className="w-4 h-4 text-yellow-700 dark:text-yellow-400" /></div>
          <div className="flex-1"><p className="font-semibold text-sm">Cash Drawer</p><p className="text-xs text-muted-foreground">Auto-open on cash sales</p></div>
          <Switch checked={hw.cashDrawer.enabled} onCheckedChange={(v) => patchCD({ enabled: v })} />
        </div>
        {hw.cashDrawer.enabled && (
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label className="text-xs">Interface</Label>
                <Select value={hw.cashDrawer.interface} onValueChange={(v) => patchCD({ interface: v as CashDrawerCfg["interface"] })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usb"><span className="flex items-center gap-2"><Usb className="w-3.5 h-3.5 shrink-0" />USB (via receipt printer)</span></SelectItem>
                    <SelectItem value="serial"><span className="flex items-center gap-2"><Settings2 className="w-3.5 h-3.5 shrink-0" />Serial (COM port)</span></SelectItem>
                    <SelectItem value="network"><span className="flex items-center gap-2"><Wifi className="w-3.5 h-3.5 shrink-0" />Network</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Open Pulse (ms)</Label><Input type="number" min={50} max={500} value={hw.cashDrawer.pulseMs} onChange={(e) => patchCD({ pulseMs: Number(e.target.value) })} className="mt-1" /></div>
            </div>
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium">Open on cash sale</p><p className="text-xs text-muted-foreground">Automatically open drawer when a cash payment is processed</p></div>
              <Switch checked={hw.cashDrawer.openOnCashSale} onCheckedChange={(v) => patchCD({ openOnCashSale: v })} />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={testDrawer}><Zap className="w-3.5 h-3.5" /> Test Open</Button>
            <p className="text-xs text-muted-foreground">The drawer kick is sent through the receipt printer, so connect the printer over USB or serial above.</p>
          </div>
        )}
      </div>
      <div className="rounded-xl border overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-4 border-b bg-muted/20">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Printer className="w-4 h-4 text-blue-700 dark:text-blue-400" /></div>
          <div className="flex-1"><p className="font-semibold text-sm">Receipt Printer</p><p className="text-xs text-muted-foreground">ESC/POS thermal or network printer</p></div>
          <Switch checked={hw.printer.enabled} onCheckedChange={(v) => patchPR({ enabled: v })} />
        </div>
        {hw.printer.enabled && (
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label className="text-xs">Printer Model</Label>
                <Select value={hw.printer.model ?? "partner-rp700"} onValueChange={applyModel}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRINTER_MODELS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Connection</Label>
                <Select
                  value={printerConn}
                  onValueChange={(v) => patchPR({
                    connection: v as NonNullable<PrinterCfg["connection"]>,
                    // Keep the legacy `type` roughly in step for older readers.
                    type: v === "network" ? "network" : v === "system" ? "pdf" : "thermal",
                  })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usb"><span className="flex items-center gap-2"><Usb className="w-3.5 h-3.5 shrink-0" />USB (ESC/POS, WebUSB)</span></SelectItem>
                    <SelectItem value="serial"><span className="flex items-center gap-2"><Settings2 className="w-3.5 h-3.5 shrink-0" />Serial / RS-232 (Web Serial)</span></SelectItem>
                    <SelectItem value="network"><span className="flex items-center gap-2"><Wifi className="w-3.5 h-3.5 shrink-0" />Network / LAN</span></SelectItem>
                    <SelectItem value="system"><span className="flex items-center gap-2"><Printer className="w-3.5 h-3.5 shrink-0" />System print dialog</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label className="text-xs">Paper Width</Label>
                <Select value={hw.printer.paperWidth} onValueChange={(v) => patchPR({ paperWidth: v as PrinterCfg["paperWidth"] })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="80mm">80 mm</SelectItem>
                    <SelectItem value="58mm">58 mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {printerConn === "network" && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label className="text-xs">IP Address</Label><Input placeholder="192.168.1.100" value={hw.printer.ipAddress} onChange={(e) => patchPR({ ipAddress: e.target.value })} className="mt-1" /></div>
                  <div><Label className="text-xs">Port</Label><Input placeholder="9100" value={hw.printer.port} onChange={(e) => patchPR({ port: e.target.value })} className="mt-1" /></div>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400">A browser can't reach a LAN printer directly, so network printers print via the system dialog. For native ESC/POS (auto-cut + drawer kick), connect the RP-700 by USB or serial.</p>
              </div>
            )}
            {nativeConn && (
              <p className="text-xs text-muted-foreground">
                Connect the printer once per terminal — the browser remembers it. Native ESC/POS needs Chrome or Edge.
              </p>
            )}
            <div className="divide-y border rounded-lg">
              <div className="flex items-center justify-between px-4 py-3">
                <div><p className="text-sm font-medium">Auto-print on sale</p><p className="text-xs text-muted-foreground">Print a receipt automatically after each sale</p></div>
                <Switch checked={hw.printer.autoPrintOnSale} onCheckedChange={(v) => patchPR({ autoPrintOnSale: v })} />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div><p className="text-sm font-medium">Auto-print on refund</p><p className="text-xs text-muted-foreground">Print a receipt automatically after each refund</p></div>
                <Switch checked={hw.printer.autoPrintOnRefund} onCheckedChange={(v) => patchPR({ autoPrintOnRefund: v })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {nativeConn && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={connectPrinter}>
                  {printerConn === "serial" ? <Settings2 className="w-3.5 h-3.5" /> : <Usb className="w-3.5 h-3.5" />} Connect printer
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={runTestPrint} disabled={!nativeConn && !bridgeStatus?.paired}><Zap className="w-3.5 h-3.5" /> Print test ticket</Button>
            </div>
          </div>
        )}
      </div>

      {/* Silent printing to named printers, and which document goes where. */}
      <PrintBridgeCard
        hw={hw}
        onChange={patchHW}
        status={bridgeStatus}
        checking={bridgeChecking}
        refresh={refreshBridge}
      />
      <PrinterRoutingCard hw={hw} onChange={patchHW} status={bridgeStatus} />

      <div className="rounded-xl border overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-4 border-b bg-muted/20">
          <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30"><ScanLine className="w-4 h-4 text-green-700 dark:text-green-400" /></div>
          <div className="flex-1"><p className="font-semibold text-sm">Barcode Scanner</p><p className="text-xs text-muted-foreground">USB HID, serial, or Bluetooth scanner</p></div>
          <Switch checked={hw.scanner.enabled} onCheckedChange={(v) => patchSC({ enabled: v })} />
        </div>
        {hw.scanner.enabled && (
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><Label className="text-xs">Interface</Label>
                <Select value={hw.scanner.interface} onValueChange={(v) => patchSC({ interface: v as ScannerCfg["interface"] })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usb-hid">USB HID (plug &amp; play)</SelectItem>
                    <SelectItem value="serial">Serial port</SelectItem>
                    <SelectItem value="bluetooth">Bluetooth</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Scan Prefix</Label><Input placeholder="(none)" value={hw.scanner.prefix} onChange={(e) => patchSC({ prefix: e.target.value })} className="mt-1 font-mono" /></div>
              <div><Label className="text-xs">Scan Suffix (e.g. \r)</Label><Input placeholder="\r" value={hw.scanner.suffix} onChange={(e) => patchSC({ suffix: e.target.value })} className="mt-1 font-mono" /></div>
            </div>
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium">Beep on scan</p><p className="text-xs text-muted-foreground">Play an audio cue when a barcode is successfully scanned</p></div>
              <Switch checked={hw.scanner.beepOnScan} onCheckedChange={(v) => patchSC({ beepOnScan: v })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Shortcuts section ──────────────────────────────────────────────────── */

function ShortcutsSection() {
  const { settings, upsert } = usePosSettings();

  const enabled = useMemo((): string[] => {
    try {
      if (settings?.enabledShortcuts) return JSON.parse(settings.enabledShortcuts) as string[];
    } catch { /* ignore */ }
    return KEYBOARD_SHORTCUTS.map((sc) => sc.id);
  }, [settings]);

  const toggle = (id: string, on: boolean) => {
    const next = on ? [...enabled, id] : enabled.filter((e) => e !== id);
    upsert.mutate(
      { data: { enabledShortcuts: JSON.stringify(next) } },
      { onSuccess: () => toast.success(on ? "Shortcut enabled" : "Shortcut disabled") },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Enable or disable global keyboard shortcuts. Shortcuts are ignored when focus is inside a text field or input.</p>
      </div>
      <div className="rounded-xl border overflow-hidden">
        <div className="px-5 py-3 bg-muted/20 border-b grid grid-cols-[1fr_160px_80px_56px] gap-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Action</span><span>Shortcut</span><span>Scope</span><span className="text-right">On</span>
        </div>
        <div className="divide-y">
          {KEYBOARD_SHORTCUTS.map((sc) => {
            const isOn = enabled.includes(sc.id);
            return (
              <div key={sc.id} className={cn("grid grid-cols-[1fr_160px_80px_56px] gap-4 items-center px-5 py-3 transition-colors", !isOn && "opacity-50")}>
                <div><p className="text-sm font-medium">{sc.label}</p><p className="text-xs text-muted-foreground">{sc.description}</p></div>
                <kbd className="inline-flex items-center font-mono text-xs px-2 py-1 rounded border bg-muted text-muted-foreground whitespace-nowrap">{sc.keys}</kbd>
                <span className="text-xs text-muted-foreground">{sc.scope}</span>
                <div className="flex justify-end"><Switch checked={isOn} onCheckedChange={(v) => toggle(sc.id, v)} /></div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">⌘K / Ctrl+K (open search) is always available and cannot be disabled here.</p>
    </div>
  );
}

/* ─── Open Tills — remote close & cash up ────────────────────────────────── */

type OpenSession = {
  id: number;
  registerId: string;
  openedAt: string;
  openedBy: string;
  openingFloat: string;
  closedAt: string | null;
};

const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
const TODAY_ISO = new Date().toISOString().split("T")[0];

function PaymentIcon({ id }: { id: string }) {
  const cls = "w-3.5 h-3.5 text-muted-foreground shrink-0";
  if (id === "cash") return <Banknote className={cls} />;
  if (id === "card" || id === "eftpos" || id.includes("eftpos") || id.includes("terminal")) return <CreditCard className={cls} />;
  if (id === "loyalty") return <Star className={cls} />;
  if (id === "store_credit") return <Wallet className={cls} />;
  if (id === "laybuy") return <CalendarClock className={cls} />;
  if (id === "direct_deposit") return <Landmark className={cls} />;
  if (id === "voucher") return <Ticket className={cls} />;
  if (id === "gift_card") return <Gift className={cls} />;
  return <DollarSign className={cls} />;
}

function OpenTillsSection({ registerNames }: { registerNames: Record<string, string> }) {
  const qc = useQueryClient();
  const updateSession = useUpdatePosRegisterSession();

  const { data: sessData } = useListPosRegisterSessions({}, { query: { queryKey: ["pos-register-sessions"] } });
  const openSessions = ((sessData as { items?: OpenSession[] })?.items ?? []).filter((s) => !s.closedAt);
  const hasOpen = openSessions.length > 0;

  /* Today's cash movements + system payment totals (merchant-wide) for cash-up reconciliation. */
  const { data: rawEntries = [] } = useListCashDrawerEntries(
    { date: TODAY_ISO },
    { query: { queryKey: ["cash-drawer", TODAY_ISO], enabled: hasOpen } },
  );
  const entries = rawEntries as { type: string; amount: number }[];
  const cashIn  = entries.filter((e) => e.type === "cash_in").reduce((s, e) => s + e.amount, 0);
  const cashOut = entries.filter((e) => e.type === "cash_out").reduce((s, e) => s + e.amount, 0);

  const { data: paymentSystemTotals = {} } = useGetPaymentTotals(
    { date: TODAY_ISO },
    { query: { queryKey: ["payment-totals", TODAY_ISO], staleTime: 30_000, enabled: hasOpen } },
  );

  const paymentRows = useMemo(() => {
    const builtIn = getEnabledPaymentMethods();
    const rows: { id: string; label: string }[] = [];
    for (const id of builtIn.filter((m) => m !== "split")) {
      const meta = ALL_PAYMENT_METHODS.find((m) => m.id === id);
      if (meta) rows.push({ id, label: meta.label });
    }
    if (!(builtIn as string[]).includes("gift_card")) rows.push({ id: "gift_card", label: "Gift Card" });
    for (const key of getEnabledIntegrationPayments()) rows.push({ id: key, label: INTEGRATION_PAYMENT_LABELS[key] ?? key });
    return rows;
  }, []);

  const [closing, setClosing] = useState<OpenSession | null>(null);
  const [paymentDeclared, setPaymentDeclared] = useState<Record<string, string>>({});
  const [closingNotes, setClosingNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const openingFloat = parseFloat(closing?.openingFloat ?? "0");
  const expectedCash = openingFloat + cashIn - cashOut;
  const cashDeclaredVal = parseFloat(paymentDeclared["cash"] ?? "");
  const cashVariance = !isNaN(cashDeclaredVal) ? cashDeclaredVal - expectedCash : null;

  function openClose(session: OpenSession) {
    const expected = parseFloat(session.openingFloat ?? "0") + cashIn - cashOut;
    const prefill: Record<string, string> = {};
    for (const row of paymentRows) {
      if (row.id === "cash") { prefill["cash"] = expected.toFixed(2); continue; }
      const sys = (paymentSystemTotals as Record<string, { total: number }>)[row.id];
      prefill[row.id] = sys ? sys.total.toFixed(2) : "0.00";
    }
    setPaymentDeclared(prefill);
    setClosingNotes("");
    setClosing(session);
  }

  function handleClose() {
    if (!closing) return;
    setSaving(true);
    const totals: Record<string, number> = {};
    for (const row of paymentRows) totals[row.id] = parseFloat(paymentDeclared[row.id] ?? "0") || 0;
    updateSession.mutate(
      {
        id: closing.id,
        data: {
          closedAt: new Date().toISOString(),
          cashCounted: String(totals["cash"] ?? 0),
          eftposDeclared: String(totals["eftpos"] ?? totals["tyro_eftpos"] ?? totals["commbank_eftpos"] ?? 0),
          paymentTotals: JSON.stringify(totals),
          closingNotes,
        },
      },
      {
        onSuccess: () => {
          toast.success(`${registerNames[closing.registerId] ?? "Register"} closed — Z-Read recorded`);
          setClosing(null);
          qc.invalidateQueries({ queryKey: ["pos-register-sessions"] });
        },
        onError: () => toast.error("Failed to close register"),
        onSettled: () => setSaving(false),
      },
    );
  }

  if (!hasOpen) return null;

  return (
    <div className="rounded-xl border border-green-300 dark:border-green-900/50 overflow-hidden">
      <div className="px-5 py-4 border-b bg-green-50 dark:bg-green-950/20 flex items-center gap-2">
        <LockOpen className="w-4 h-4 text-green-600 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-sm text-green-800 dark:text-green-300">Open Tills</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {openSessions.length} register{openSessions.length !== 1 ? "s" : ""} currently open. Close and cash up any till remotely.
          </p>
        </div>
      </div>
      <div className="divide-y">
        {openSessions.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-5 py-3.5">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 shrink-0">
              <Monitor className="w-4 h-4 text-green-700 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{registerNames[s.registerId] ?? s.registerId}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{s.openedBy || "Unknown"}</span>
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(s.openedAt), "d MMM, h:mm a")}</span>
                <span>Float {fmtMoney(parseFloat(s.openingFloat))}</span>
              </p>
            </div>
            <Button size="sm" variant="destructive" className="shrink-0 text-xs gap-1.5" onClick={() => openClose(s)}>
              <Lock className="w-3.5 h-3.5" /> Close & Cash Up
            </Button>
          </div>
        ))}
      </div>

      {/* Close & cash up dialog */}
      <Dialog open={!!closing} onOpenChange={(o) => { if (!o) setClosing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-primary" />
              Close &amp; Cash Up — {closing ? (registerNames[closing.registerId] ?? closing.registerId) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            {closing && (
              <p className="text-xs text-muted-foreground">
                Opened{closing.openedBy ? ` by ${closing.openedBy}` : ""} at {format(new Date(closing.openedAt), "d MMM, h:mm a")}.
                This will end the till session and record a Z-Read.
              </p>
            )}

            {/* Cash drawer summary */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening Float</span>
                <span>{fmtMoney(openingFloat)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><ArrowDownLeft className="w-3 h-3 text-green-600" /> Cash In</span>
                <span className="text-green-600">+{fmtMoney(cashIn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-red-500" /> Cash Out</span>
                <span className="text-red-500">−{fmtMoney(cashOut)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1.5 mt-0.5">
                <span>Expected Cash in Drawer</span>
                <span>{fmtMoney(expectedCash)}</span>
              </div>
            </div>

            {/* Declare totals by payment type */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Declare Totals by Payment Type</p>
              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-muted/50 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Method</span>
                  <span className="text-right">POS Total</span>
                  <span className="text-right">Counted / Declared</span>
                </div>
                <div className="divide-y">
                  {paymentRows.map((row) => {
                    const sys = (paymentSystemTotals as Record<string, { total: number; txCount: number }>)[row.id];
                    const sysTotal = sys?.total ?? 0;
                    const declared = paymentDeclared[row.id] ?? "";
                    const declaredNum = parseFloat(declared);
                    const diff = !isNaN(declaredNum) && sysTotal > 0 ? declaredNum - sysTotal : null;
                    const isCash = row.id === "cash";
                    return (
                      <div key={row.id} className="grid grid-cols-3 gap-2 items-center px-3 py-2.5">
                        <span className="text-sm font-medium flex items-center gap-1.5">
                          <PaymentIcon id={row.id} />
                          <span className="truncate">{row.label}</span>
                        </span>
                        <div className="text-right">
                          <span className={cn("text-sm tabular-nums", sysTotal > 0 ? "text-foreground" : "text-muted-foreground/50")}>
                            {sysTotal > 0 ? fmtMoney(sysTotal) : "—"}
                          </span>
                          {sys?.txCount ? (
                            <p className="text-[10px] text-muted-foreground">{sys.txCount} txn{sys.txCount !== 1 ? "s" : ""}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <Input
                            type="number" min="0" step="0.01"
                            className="h-7 text-sm text-right w-28 tabular-nums"
                            value={declared}
                            onChange={(e) => setPaymentDeclared((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          />
                          {isCash && cashVariance !== null && (
                            <p className={cn("text-[10px] font-medium",
                              cashVariance < -0.005 ? "text-red-500" : cashVariance > 0.005 ? "text-amber-500" : "text-green-600")}>
                              {cashVariance >= 0 ? "+" : ""}{fmtMoney(cashVariance)}{Math.abs(cashVariance) < 0.01 && " ✓"}
                            </p>
                          )}
                          {!isCash && diff !== null && Math.abs(diff) > 0.005 && (
                            <p className={cn("text-[10px] font-medium", diff < 0 ? "text-red-500" : "text-amber-500")}>
                              {diff >= 0 ? "+" : ""}{fmtMoney(diff)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <Label>Closing Notes (optional)</Label>
              <Textarea rows={2} placeholder="Handover notes, discrepancies…" value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>Cancel</Button>
            <Button variant="destructive" className="gap-1.5" onClick={handleClose} disabled={saving}>
              <Lock className="w-4 h-4" /> Close Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementRegistersPage() {
  const { data: rawRegisters, refetch } = useListPosRegisters({ query: { queryKey: ["pos-registers"] } });
  const createRegister = useCreatePosRegister();
  const updateRegister = useUpdatePosRegister();
  const deleteRegister = useDeletePosRegister();
  const { settings, upsert: upsertSettings } = usePosSettings();

  const rawRegisterItems = (rawRegisters?.items ?? []) as unknown as Record<string, unknown>[];
  const registers: PosRegister[] = rawRegisterItems.map(apiToRegister);
  const registerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rawRegisterItems) map[String(r.registerId ?? "")] = String(r.name ?? "");
    return map;
  }, [rawRegisterItems]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PosRegister | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const activeRegisterId = settings?.activeRegisterId ?? "";

  const activateRegister = (id: string) => {
    upsertSettings.mutate(
      { data: { activeRegisterId: id } },
      { onSuccess: () => toast.success("Register activated for POS — favourites are now register-specific") },
    );
  };

  const { data: staffData } = useListStaff({ query: { queryKey: ["staff"] } });
  const staffList = Array.isArray(staffData) ? staffData : [];

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };

  const openEdit = (reg: PosRegister) => {
    setEditing(reg);
    const matched = staffList.find((s) => s.name === reg.staffName);
    setForm({ name: reg.name, type: reg.type, staffId: matched ? String(matched.id) : "", staffName: reg.staffName, staffEmail: reg.staffEmail });
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    deleteRegister.mutate({ id: Number(id) }, {
      onSuccess: () => { refetch(); toast.success("Register deleted"); },
      onError: () => toast.error("Failed to delete register"),
    });
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Register name is required"); return; }
    if (editing) {
      updateRegister.mutate({ id: Number(editing.id), data: { registerId: editing.id, name: form.name, type: form.type, staffName: form.staffName, staffEmail: form.staffEmail } }, {
        onSuccess: () => { refetch(); setDialogOpen(false); toast.success("Register updated"); },
        onError: () => toast.error("Failed to update register"),
      });
    } else {
      createRegister.mutate({ data: { registerId: `reg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: form.name, type: form.type, staffName: form.staffName, staffEmail: form.staffEmail } }, {
        onSuccess: () => { refetch(); setDialogOpen(false); toast.success("Register created"); },
        onError: () => toast.error("Failed to create register"),
      });
    }
  };

  const handleStaffSelect = (val: string) => {
    if (val === "__none__") { setForm((f) => ({ ...f, staffId: "", staffName: "", staffEmail: "" })); return; }
    const member = staffList.find((s) => String(s.id) === val);
    if (member) setForm((f) => ({ ...f, staffId: String(member.id), staffName: member.name, staffEmail: member.email ?? "" }));
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">POS Registers</h1>
            <p className="text-sm text-muted-foreground mt-1">Assign each register to a staff member — it becomes their default till when they log in to KoaPOS.</p>
          </div>
          <Button onClick={openNew} className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" />New Register
          </Button>
        </div>

        <OpenTillsSection registerNames={registerNameById} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div id="registers" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {REGISTER_TYPES.map(({ type, description, icon: Icon, bg, text }) => (
                <div key={type} className={`rounded-xl border border-border p-4 flex items-center gap-3 ${bg}`}>
                  <div className={`p-2 rounded-lg bg-white/60 dark:bg-black/20 ${text}`}><Icon className="h-5 w-5" /></div>
                  <div><p className={`font-semibold text-sm ${text}`}>{type}</p><p className="text-xs text-muted-foreground">{description}</p></div>
                </div>
              ))}
            </div>

            {registers.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                <Monitor className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No registers yet</p>
                <p className="text-sm mt-1">Click "+ New Register" to create your first POS terminal.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {registers.map((reg) => (
                  <div key={reg.id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted"><Monitor className="h-4 w-4 text-muted-foreground" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{reg.name}</p>
                        {(reg.staffName || reg.staffEmail) && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {reg.staffName && <span className="mr-1">{reg.staffName}</span>}
                            {reg.staffEmail && <span className="text-muted-foreground/70">({reg.staffEmail})</span>}
                          </p>
                        )}
                        <div className="mt-2"><TypeBadge type={reg.type} /></div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1 border-t border-border">
                      <Button variant={activeRegisterId === reg.id ? "default" : "outline"} size="sm" className="flex-1 text-xs" onClick={() => activateRegister(reg.id)}>
                        {activeRegisterId === reg.id ? "✓ Active POS" : "Set as POS"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground px-2" onClick={() => openEdit(reg)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2" onClick={() => handleDelete(reg.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <PaymentMethodsSection />
            <CustomPaymentMethodsSection />
            <div className="rounded-xl border divide-y">
              <ForceStaffLoginToggle />
              <PromptCloseAllRegistersToggle />
              <StaffLoginMessageToggle />
            </div>
            <div id="hardware"><HardwareSection /></div>
          </div>

          <div id="pos-settings" className="space-y-3">
            <GridLayoutSection />
            <RoleDiscountLimitsSection />
          </div>
        </div>

        <div id="shortcuts" className="space-y-4 pt-2">
          <ShortcutsSection />
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Register" : "New Register"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Register Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Front Counter" autoFocus />
            </div>
            <div>
              <Label>Register Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as RegisterType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <SelectTrigger><SelectValue placeholder="Select staff member…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Unassigned —</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}{s.email && <span className="text-muted-foreground ml-1 text-xs">({s.email})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createRegister.isPending || updateRegister.isPending}>
              {editing ? "Save Changes" : "Create Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
