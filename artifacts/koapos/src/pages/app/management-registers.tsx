import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListStaff, useListPosRegisters, useCreatePosRegister,
  useUpdatePosRegister, useDeletePosRegister,
  useGetPosSettings, useUpsertPosSettings,
  useListIntegrations,
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
  Wifi, Usb, Zap, Settings2,
} from "lucide-react";
import { KEYBOARD_SHORTCUTS } from "@/lib/keyboard-shortcuts";

export {
  FORCE_STAFF_LOGIN_KEY,
  PAYMENT_METHODS_KEY,
  STAFF_LOGIN_MSG_KEY,
  INTEGRATION_PAYMENT_METHODS_KEY,
  POS_GRID_SETTINGS_KEY,
  ACTIVE_REGISTER_KEY,
  INTEGRATION_PAYMENT_LABELS,
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
  { href: "#hardware",     label: "Hardware",     icon: HardDrive  },
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

/* ─── POS Grid Layout settings ───────────────────────────────────────────── */

interface PosGridSettingsLocal {
  columns: 2 | 3 | 4 | 5;
  tileSize: "compact" | "normal" | "large";
  showPrices: boolean;
  showStockBadges: boolean;
  cartPosition: "right" | "left";
}

const GRID_DEFAULTS: PosGridSettingsLocal = {
  columns: 3, tileSize: "normal", showPrices: true, showStockBadges: false, cartPosition: "right",
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
      gridCartPosition: next.cartPosition,
    } });
  };

  const summary = [
    `${s.columns} columns`, `${s.tileSize} tiles`, `cart ${s.cartPosition}`,
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
        <div>
          <p className="text-sm font-medium mb-2">Product Grid Columns</p>
          <div className="grid grid-cols-4 gap-2">
            {([2, 3, 4, 5] as const).map((n) => (
              <button key={n} onClick={() => update({ columns: n })}
                className={cn("flex flex-col items-center justify-center py-3 rounded-xl border-2 text-xs font-medium transition-all",
                  s.columns === n ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
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
                  s.tileSize === size ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
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
        </div>
        <div>
          <p className="text-sm font-medium mb-2">Cart Position</p>
          <div className="grid grid-cols-2 gap-2">
            {(["right", "left"] as const).map((pos) => (
              <button key={pos} onClick={() => update({ cartPosition: pos })}
                className={cn("flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all",
                  s.cartPosition === pos ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
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
        <p className="text-xs text-muted-foreground mt-0.5">Require a staff PIN before every sale is processed.</p>
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

/* ─── Hardware section ───────────────────────────────────────────────────── */

interface CashDrawerCfg  { enabled: boolean; interface: "usb"|"serial"|"network"; openOnCashSale: boolean; pulseMs: number; }
interface PrinterCfg     { enabled: boolean; type: "thermal"|"network"|"pdf"; paperWidth: "80mm"|"58mm"; autoPrintOnSale: boolean; autoPrintOnRefund: boolean; ipAddress: string; port: string; }
interface ScannerCfg     { enabled: boolean; interface: "usb-hid"|"serial"|"bluetooth"; beepOnScan: boolean; prefix: string; suffix: string; }
interface HardwareCfg    { cashDrawer: CashDrawerCfg; printer: PrinterCfg; scanner: ScannerCfg; }

const DEFAULT_HW: HardwareCfg = {
  cashDrawer: { enabled: false, interface: "usb",     openOnCashSale: true,  pulseMs: 200 },
  printer:    { enabled: false, type: "thermal",      paperWidth: "80mm",    autoPrintOnSale: false, autoPrintOnRefund: false, ipAddress: "", port: "9100" },
  scanner:    { enabled: false, interface: "usb-hid", beepOnScan: true,      prefix: "", suffix: "" },
};

function HardwareSection() {
  const { settings, upsert } = usePosSettings();

  const hw = useMemo((): HardwareCfg => {
    try {
      if (settings?.hardwareConfig) return { ...DEFAULT_HW, ...JSON.parse(settings.hardwareConfig) } as HardwareCfg;
    } catch { /* ignore */ }
    return DEFAULT_HW;
  }, [settings]);

  const save = (next: HardwareCfg) => {
    upsert.mutate({ data: { hardwareConfig: JSON.stringify(next) } });
  };
  const patchCD = (p: Partial<CashDrawerCfg>)  => save({ ...hw, cashDrawer: { ...hw.cashDrawer, ...p } });
  const patchPR = (p: Partial<PrinterCfg>)      => save({ ...hw, printer:    { ...hw.printer,    ...p } });
  const patchSC = (p: Partial<ScannerCfg>)      => save({ ...hw, scanner:    { ...hw.scanner,    ...p } });

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
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.success("Test signal sent to cash drawer")}><Zap className="w-3.5 h-3.5" /> Test Open</Button>
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
              <div><Label className="text-xs">Printer Type</Label>
                <Select value={hw.printer.type} onValueChange={(v) => patchPR({ type: v as PrinterCfg["type"] })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thermal">USB Thermal (ESC/POS)</SelectItem>
                    <SelectItem value="network">Network (ESC/POS)</SelectItem>
                    <SelectItem value="pdf">PDF / Virtual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            {hw.printer.type === "network" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label className="text-xs">IP Address</Label><Input placeholder="192.168.1.100" value={hw.printer.ipAddress} onChange={(e) => patchPR({ ipAddress: e.target.value })} className="mt-1" /></div>
                <div><Label className="text-xs">Port</Label><Input placeholder="9100" value={hw.printer.port} onChange={(e) => patchPR({ port: e.target.value })} className="mt-1" /></div>
              </div>
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
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.success("Test page sent to printer")}><Zap className="w-3.5 h-3.5" /> Print Test Page</Button>
          </div>
        )}
      </div>
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

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementRegistersPage() {
  const { data: rawRegisters, refetch } = useListPosRegisters({ query: { queryKey: ["pos-registers"] } });
  const createRegister = useCreatePosRegister();
  const updateRegister = useUpdatePosRegister();
  const deleteRegister = useDeletePosRegister();
  const { settings, upsert: upsertSettings } = usePosSettings();

  const registers: PosRegister[] = ((rawRegisters?.items ?? []) as unknown as Record<string, unknown>[]).map(apiToRegister);

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
          </div>

          <div id="pos-settings" className="space-y-3">
            <GridLayoutSection />
            <div className="rounded-xl border divide-y">
              <ForceStaffLoginToggle />
              <StaffLoginMessageToggle />
            </div>
            <div id="hardware"><HardwareSection /></div>
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
