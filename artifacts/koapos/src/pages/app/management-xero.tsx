import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Loader2,
  AlertTriangle,
  BookOpen,
  Building2,
  Map,
  Settings2,
  Zap,
  CheckCheck,
  XCircle,
  Clock,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface XeroStatus {
  connected: boolean;
  configured: boolean;
  tenantId?: string;
  tenantName?: string;
  mappings?: XeroMappings;
  syncSettings?: SyncSettings;
  syncLog?: SyncLogEntry[];
  connectedAt?: string;
}

interface XeroAccount {
  AccountID: string;
  Code: string;
  Name: string;
  Type: string;
}

interface XeroTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

interface XeroMappings {
  revenueAccount?: string;
  revenueAccountName?: string;
  cashAccount?: string;
  cashAccountName?: string;
  cardAccount?: string;
  cardAccountName?: string;
  taxAccount?: string;
  taxAccountName?: string;
  refundAccount?: string;
  refundAccountName?: string;
  gstTaxType?: string;
}

interface SyncSettings {
  syncTransactions: boolean;
  syncContacts: boolean;
  syncPurchaseOrders: boolean;
  autoSync: boolean;
  syncFrequency: "daily" | "weekly" | "manual";
}

interface SyncLogEntry {
  at: string;
  type: string;
  count: number;
  status: "success" | "error";
  message: string;
}

/* ── Xero logo ──────────────────────────────────────────────────────────── */

function XeroLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "w-16 h-16" : size === "md" ? "w-12 h-12" : "w-8 h-8";
  return (
    <div className={cn(dim, "rounded-xl flex items-center justify-center bg-[#13B5EA] shrink-0")}>
      <img
        src="https://cdn.simpleicons.org/xero/ffffff"
        alt="Xero"
        className={size === "lg" ? "w-9 h-9" : size === "md" ? "w-7 h-7" : "w-5 h-5"}
      />
    </div>
  );
}

/* ── Steps config ───────────────────────────────────────────────────────── */

const STEPS = [
  { id: 1, label: "Prerequisites", icon: BookOpen },
  { id: 2, label: "Connect",       icon: ShieldCheck },
  { id: 3, label: "Organisation",  icon: Building2 },
  { id: 4, label: "Map Accounts",  icon: Map },
  { id: 5, label: "Sync Settings", icon: Settings2 },
  { id: 6, label: "Go Live",       icon: Zap },
];

/* ── AccountSelect ──────────────────────────────────────────────────────── */

function AccountSelect({
  label,
  hint,
  value,
  onChange,
  accounts,
  filterTypes,
  placeholder = "Select account…",
}: {
  label: string;
  hint?: string;
  value?: string;
  onChange: (code: string, name: string) => void;
  accounts: XeroAccount[];
  filterTypes?: string[];
  placeholder?: string;
}) {
  const filtered = filterTypes
    ? accounts.filter((a) => filterTypes.includes(a.Type))
    : accounts;

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Select
        value={value ?? ""}
        onValueChange={(v) => {
          const acc = filtered.find((a) => a.Code === v);
          if (acc) onChange(acc.Code, acc.Name);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {filtered.map((a) => (
            <SelectItem key={a.AccountID} value={a.Code}>
              <span className="font-mono text-xs text-muted-foreground mr-2">{a.Code}</span>
              {a.Name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ── SyncLogRow ─────────────────────────────────────────────────────────── */

function SyncLogRow({ entry }: { entry: SyncLogEntry }) {
  const typeLabel: Record<string, string> = {
    transactions:   "Sales Transactions",
    contacts:       "Contacts",
    purchase_orders: "Purchase Orders",
  };
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      {entry.status === "success"
        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{typeLabel[entry.type] ?? entry.type}</p>
        <p className="text-xs text-muted-foreground truncate">{entry.message}</p>
      </div>
      <div className="text-right shrink-0">
        <Badge variant="outline" className={cn(
          "text-[10px]",
          entry.status === "success" ? "text-emerald-600 border-emerald-200" : "text-red-600 border-red-200",
        )}>
          {entry.count} records
        </Badge>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {new Date(entry.at).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementXeroPage() {
  const [, setLocation] = useLocation();
  const [step, setStep]         = useState(1);
  const [status, setStatus]     = useState<XeroStatus | null>(null);
  const [tenants, setTenants]   = useState<XeroTenant[]>([]);
  const [accounts, setAccounts] = useState<XeroAccount[]>([]);
  const [mappings, setMappings] = useState<XeroMappings>({});
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({
    syncTransactions:   true,
    syncContacts:       true,
    syncPurchaseOrders: true,
    autoSync:           false,
    syncFrequency:      "daily",
  });
  const [loadingStatus,   setLoadingStatus]   = useState(true);
  const [loadingTenants,  setLoadingTenants]  = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [syncing,         setSyncing]         = useState<string | null>(null);
  const [disconnecting,   setDisconnecting]   = useState(false);

  /* ── Load status ─────────────────────────────────────────────────────── */

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const r = await fetch("/api/xero/status", { credentials: "include" });
      if (r.ok) {
        const s = await r.json() as XeroStatus;
        setStatus(s);
        if (s.mappings)     setMappings(s.mappings);
        if (s.syncSettings) setSyncSettings({ ...syncSettings, ...s.syncSettings });
        /* Auto-advance step based on connection state */
        if (s.connected && s.tenantId && s.mappings?.revenueAccount) {
          setStep(6);
        } else if (s.connected && s.tenantId) {
          setStep(4);
        } else if (s.connected) {
          setStep(3);
        }
      }
    } finally {
      setLoadingStatus(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Handle URL params after OAuth redirect */
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error   = params.get("error");
    if (success === "connected") {
      toast.success("Xero connected! Now select your organisation.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      const msgs: Record<string, string> = {
        oauth_denied:    "Authorisation was cancelled.",
        not_configured:  "Xero OAuth credentials are not configured yet.",
        token_failed:    "Failed to exchange token with Xero.",
        invalid_state:   "Invalid OAuth state. Please try again.",
      };
      toast.error(msgs[error] ?? "Xero connection failed.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    loadStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Load tenants ────────────────────────────────────────────────────── */

  const loadTenants = async () => {
    setLoadingTenants(true);
    try {
      const r = await fetch("/api/xero/tenants", { credentials: "include" });
      if (r.ok) setTenants(await r.json() as XeroTenant[]);
      else toast.error("Failed to load Xero organisations.");
    } finally {
      setLoadingTenants(false);
    }
  };

  /* ── Load accounts ───────────────────────────────────────────────────── */

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const r = await fetch("/api/xero/accounts", { credentials: "include" });
      if (r.ok) setAccounts(await r.json() as XeroAccount[]);
      else toast.error("Failed to load chart of accounts.");
    } finally {
      setLoadingAccounts(false);
    }
  };

  /* ── When step changes ───────────────────────────────────────────────── */

  useEffect(() => {
    if (step === 3 && tenants.length === 0 && status?.connected) loadTenants();
    if (step === 4 && accounts.length === 0 && status?.tenantId)  loadAccounts();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Select tenant ───────────────────────────────────────────────────── */

  const selectTenant = async (tenant: XeroTenant) => {
    setSaving(true);
    try {
      const r = await fetch("/api/xero/tenant", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.tenantId, tenantName: tenant.tenantName }),
      });
      if (r.ok) {
        setStatus((s) => s ? { ...s, tenantId: tenant.tenantId, tenantName: tenant.tenantName } : s);
        toast.success(`Organisation set to ${tenant.tenantName}`);
        setStep(4);
      } else {
        toast.error("Failed to save organisation.");
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── Save mappings ───────────────────────────────────────────────────── */

  const saveMappings = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/xero/mappings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings, syncSettings }),
      });
      if (r.ok) {
        toast.success("Account mappings saved.");
        setStep(5);
      } else {
        toast.error("Failed to save mappings.");
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── Save sync settings ──────────────────────────────────────────────── */

  const saveSyncSettings = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/xero/mappings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings, syncSettings }),
      });
      if (r.ok) {
        toast.success("Sync settings saved.");
        setStep(6);
      } else {
        toast.error("Failed to save settings.");
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── Trigger sync ────────────────────────────────────────────────────── */

  const triggerSync = async (type: "transactions" | "contacts" | "purchase-orders") => {
    setSyncing(type);
    try {
      const r = await fetch(`/api/xero/sync/${type}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json() as { ok?: boolean; synced?: number; message?: string; error?: string };
      if (data.ok) {
        toast.success(data.message ?? `Synced ${data.synced ?? 0} records`);
        await loadStatus();
      } else {
        toast.error(data.error ?? "Sync failed");
      }
    } catch {
      toast.error("Sync request failed");
    } finally {
      setSyncing(null);
    }
  };

  /* ── Disconnect ──────────────────────────────────────────────────────── */

  const disconnect = async () => {
    if (!confirm("Disconnect Xero? OAuth tokens and account mappings will be removed.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/xero/disconnect", { method: "DELETE", credentials: "include" });
      toast.success("Xero disconnected.");
      setStatus(null);
      setMappings({});
      setTenants([]);
      setAccounts([]);
      setStep(1);
    } finally {
      setDisconnecting(false);
    }
  };

  /* ── Loading skeleton ────────────────────────────────────────────────── */

  if (loadingStatus) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <AppLayout>
      <div className="p-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/management/integrations")} className="-mt-0.5 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <XeroLogo size="lg" />
            <div>
              <h1 className="text-2xl font-bold">Xero Integration</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Connect your KoaPOS account to Xero — push sales, contacts, and purchase orders automatically.
              </p>
            </div>
          </div>
          {status?.connected && (
            <div className="flex items-center gap-2 shrink-0">
              <Badge className="gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 border">
                <CheckCircle2 className="w-3.5 h-3.5" /> Connected
              </Badge>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/5" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Disconnect"}
              </Button>
            </div>
          )}
        </div>

        {/* ── Progress stepper ── */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, i) => {
            const Icon      = s.icon;
            const isActive  = step === s.id;
            const isDone    = step > s.id;
            const isReach   = s.id <= step;
            return (
              <div key={s.id} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { if (isReach) setStep(s.id); }}
                  disabled={!isReach}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    isActive  && "bg-[#13B5EA] text-white",
                    isDone    && !isActive && "bg-[#13B5EA]/10 text-[#0d8fb8] hover:bg-[#13B5EA]/20 cursor-pointer",
                    !isReach  && "text-muted-foreground cursor-not-allowed",
                  )}
                >
                  {isDone
                    ? <CheckCheck className="w-3.5 h-3.5" />
                    : <Icon className="w-3.5 h-3.5" />}
                  {s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Step content ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* Main panel */}
          <div className="lg:col-span-2 rounded-xl border bg-background p-6 space-y-6">

            {/* ── Step 1: Prerequisites ──────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold">Before you connect</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    You need a Xero developer app to enable OAuth2. This is free and takes about 5 minutes.
                  </p>
                </div>

                {!status?.configured && (
                  <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">OAuth credentials not yet configured</p>
                      <p className="text-xs mt-0.5">Complete the steps below, then add <code className="bg-amber-100 px-1 rounded">XERO_CLIENT_ID</code> and <code className="bg-amber-100 px-1 rounded">XERO_CLIENT_SECRET</code> as environment secrets.</p>
                    </div>
                  </div>
                )}

                <ol className="space-y-4">
                  {[
                    {
                      n: 1,
                      title: "Create a Xero Developer App",
                      body: <>Go to <a href="https://developer.xero.com/app/manage" target="_blank" rel="noreferrer" className="text-[#13B5EA] underline underline-offset-2 inline-flex items-center gap-0.5">developer.xero.com/app/manage <ExternalLink className="w-3 h-3" /></a> and click <strong>New App</strong>. Choose <strong>Web App</strong> as the integration type.</>,
                    },
                    {
                      n: 2,
                      title: "Set the redirect URI",
                      body: <>In the app settings, add this redirect URI:<br /><code className="text-xs bg-muted px-2 py-1 rounded block mt-1 break-all">{window.location.origin}/api/xero/auth/callback</code></>,
                    },
                    {
                      n: 3,
                      title: "Enable required scopes",
                      body: <>Make sure these scopes are enabled: <code className="text-xs bg-muted px-1 rounded">accounting.transactions</code>, <code className="text-xs bg-muted px-1 rounded">accounting.contacts</code>, <code className="text-xs bg-muted px-1 rounded">accounting.settings</code>, <code className="text-xs bg-muted px-1 rounded">offline_access</code>.</>,
                    },
                    {
                      n: 4,
                      title: "Copy your credentials and add them as secrets",
                      body: <>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> from your Xero app. In Replit, add them as environment secrets: <code className="text-xs bg-muted px-1 rounded">XERO_CLIENT_ID</code> and <code className="text-xs bg-muted px-1 rounded">XERO_CLIENT_SECRET</code>, then restart the API server.</>,
                    },
                  ].map((item) => (
                    <li key={item.n} className="flex gap-4">
                      <span className="w-7 h-7 rounded-full bg-[#13B5EA]/10 text-[#0d8fb8] text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {item.n}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{item.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="flex justify-end pt-2">
                  <Button onClick={() => setStep(2)} className="gap-1.5 bg-[#13B5EA] hover:bg-[#0d8fb8] text-white">
                    I've done this <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 2: Connect ────────────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold">Connect to Xero</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Click the button below to authorise KoaPOS to access your Xero account.
                  </p>
                </div>

                {status?.connected ? (
                  <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Already connected</p>
                      <p className="text-xs mt-0.5">Connected {status.connectedAt ? new Date(status.connectedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : ""}</p>
                    </div>
                  </div>
                ) : !status?.configured ? (
                  <div className="flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold">OAuth not configured</p>
                      <p className="text-xs mt-0.5">Complete Step 1 to add your Xero client credentials before connecting.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <XeroLogo size="lg" />
                    <p className="text-sm text-center text-muted-foreground max-w-sm">
                      You'll be redirected to Xero to grant access. KoaPOS will only access accounting data — never bank account details.
                    </p>
                    <a href="/api/xero/auth/start">
                      <Button className="gap-2 bg-[#13B5EA] hover:bg-[#0d8fb8] text-white px-6">
                        <ExternalLink className="w-4 h-4" />
                        Connect with Xero
                      </Button>
                    </a>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  {status?.connected && (
                    <Button onClick={() => setStep(3)} className="gap-1.5 bg-[#13B5EA] hover:bg-[#0d8fb8] text-white">
                      Next <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 3: Organisation ──────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold">Select your Xero organisation</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose which Xero organisation KoaPOS should sync data to.
                  </p>
                </div>

                {status?.tenantName && (
                  <div className="flex items-center gap-2 text-sm text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    Currently using: <strong>{status.tenantName}</strong>
                  </div>
                )}

                {loadingTenants ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading organisations…
                  </div>
                ) : tenants.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">
                    No organisations found.{" "}
                    <button className="text-[#13B5EA] underline" onClick={loadTenants}>Retry</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tenants.map((t) => (
                      <button
                        key={t.tenantId}
                        onClick={() => selectTenant(t)}
                        disabled={saving}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors hover:border-[#13B5EA] hover:bg-[#13B5EA]/5",
                          status?.tenantId === t.tenantId && "border-[#13B5EA] bg-[#13B5EA]/5",
                        )}
                      >
                        <div>
                          <p className="font-medium text-sm">{t.tenantName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t.tenantType}</p>
                        </div>
                        {status?.tenantId === t.tenantId
                          ? <CheckCircle2 className="w-4 h-4 text-[#13B5EA] shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="gap-1.5">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button variant="outline" onClick={loadTenants} disabled={loadingTenants} className="gap-1.5">
                    <RefreshCw className={cn("w-4 h-4", loadingTenants && "animate-spin")} /> Refresh
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 4: Map Accounts ──────────────────────────────────── */}
            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold">Map your Chart of Accounts</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tell KoaPOS which Xero accounts to post to. These must exist in your Xero chart of accounts.
                  </p>
                </div>

                {loadingAccounts ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading chart of accounts…
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">
                    Could not load accounts.{" "}
                    <button className="text-[#13B5EA] underline" onClick={loadAccounts}>Retry</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <AccountSelect
                      label="Sales Revenue Account"
                      hint="Where your sales income posts to (e.g. 200 – Sales)"
                      value={mappings.revenueAccount}
                      onChange={(code, name) => setMappings((m) => ({ ...m, revenueAccount: code, revenueAccountName: name }))}
                      accounts={accounts}
                      filterTypes={["REVENUE", "SALES"]}
                      placeholder="Select revenue account…"
                    />
                    <AccountSelect
                      label="Cash Clearing Account"
                      hint="Where cash payments are posted (e.g. 090 – Petty Cash)"
                      value={mappings.cashAccount}
                      onChange={(code, name) => setMappings((m) => ({ ...m, cashAccount: code, cashAccountName: name }))}
                      accounts={accounts}
                      filterTypes={["BANK", "CURRENT"]}
                      placeholder="Select cash account…"
                    />
                    <AccountSelect
                      label="Card / EFTPOS Clearing Account"
                      hint="Where card payments are posted (e.g. 091 – Stripe Clearing)"
                      value={mappings.cardAccount}
                      onChange={(code, name) => setMappings((m) => ({ ...m, cardAccount: code, cardAccountName: name }))}
                      accounts={accounts}
                      filterTypes={["BANK", "CURRENT"]}
                      placeholder="Select card clearing account…"
                    />
                    <AccountSelect
                      label="Sales Tax / GST Account"
                      hint="The GST collected account (e.g. 820 – GST)"
                      value={mappings.taxAccount}
                      onChange={(code, name) => setMappings((m) => ({ ...m, taxAccount: code, taxAccountName: name }))}
                      accounts={accounts}
                      filterTypes={["LIABILITY", "CURRLIAB"]}
                      placeholder="Select tax account…"
                    />
                    <AccountSelect
                      label="Refunds Account"
                      hint="Where refunds and returns are posted (e.g. 260 – Returns)"
                      value={mappings.refundAccount}
                      onChange={(code, name) => setMappings((m) => ({ ...m, refundAccount: code, refundAccountName: name }))}
                      accounts={accounts}
                      placeholder="Select refunds account…"
                    />

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">GST Tax Type Code</Label>
                      <p className="text-xs text-muted-foreground">Xero tax type for Australian GST (default: OUTPUT)</p>
                      <Select
                        value={mappings.gstTaxType ?? "OUTPUT"}
                        onValueChange={(v) => setMappings((m) => ({ ...m, gstTaxType: v }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OUTPUT">OUTPUT – GST on Sales (10%)</SelectItem>
                          <SelectItem value="EXEMPTOUTPUT">EXEMPTOUTPUT – GST Free Sales</SelectItem>
                          <SelectItem value="NONE">NONE – No GST</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(3)} className="gap-1.5">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={loadAccounts} disabled={loadingAccounts} className="gap-1.5">
                      <RefreshCw className={cn("w-4 h-4", loadingAccounts && "animate-spin")} /> Refresh
                    </Button>
                    <Button
                      onClick={saveMappings}
                      disabled={saving || !mappings.revenueAccount}
                      className="gap-1.5 bg-[#13B5EA] hover:bg-[#0d8fb8] text-white"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Save & Continue <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 5: Sync Settings ─────────────────────────────────── */}
            {step === 5 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold">Sync settings</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose what KoaPOS should sync to Xero and how often.
                  </p>
                </div>

                <div className="space-y-4">
                  {[
                    { key: "syncTransactions" as const, label: "Sync sales transactions", desc: "Push completed sales as Xero invoices (last 90 days)" },
                    { key: "syncContacts"     as const, label: "Sync customers & suppliers", desc: "Keep your Xero contacts in sync with KoaPOS CRM" },
                    { key: "syncPurchaseOrders" as const, label: "Sync purchase orders", desc: "Push purchase orders as Xero bills" },
                  ].map((item) => (
                    <div key={item.key} className="flex items-start justify-between gap-4 py-3 border-b">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                      </div>
                      <Switch
                        checked={syncSettings[item.key]}
                        onCheckedChange={(v) => setSyncSettings((s) => ({ ...s, [item.key]: v }))}
                      />
                    </div>
                  ))}

                  <div className="flex items-start justify-between gap-4 py-3 border-b">
                    <div>
                      <p className="text-sm font-medium">Auto-sync</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Automatically sync on a schedule</p>
                    </div>
                    <Switch
                      checked={syncSettings.autoSync}
                      onCheckedChange={(v) => setSyncSettings((s) => ({ ...s, autoSync: v }))}
                    />
                  </div>

                  {syncSettings.autoSync && (
                    <div className="space-y-1.5 pl-1">
                      <Label className="text-sm font-medium">Sync frequency</Label>
                      <Select
                        value={syncSettings.syncFrequency}
                        onValueChange={(v) => setSyncSettings((s) => ({ ...s, syncFrequency: v as SyncSettings["syncFrequency"] }))}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily (overnight)</SelectItem>
                          <SelectItem value="weekly">Weekly (Sunday night)</SelectItem>
                          <SelectItem value="manual">Manual only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(4)} className="gap-1.5">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button
                    onClick={saveSyncSettings}
                    disabled={saving}
                    className="gap-1.5 bg-[#13B5EA] hover:bg-[#0d8fb8] text-white"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Save & Go Live <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 6: Go Live ───────────────────────────────────────── */}
            {step === 6 && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Xero is live</h2>
                    <p className="text-sm text-muted-foreground">
                      Connected to <strong>{status?.tenantName ?? "your Xero organisation"}</strong>. Run your first sync below.
                    </p>
                  </div>
                </div>

                {/* Mapping summary */}
                {status?.mappings && Object.keys(status.mappings).length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account Mappings</p>
                    {[
                      { label: "Revenue",  val: status.mappings.revenueAccountName, code: status.mappings.revenueAccount },
                      { label: "Cash",     val: status.mappings.cashAccountName,    code: status.mappings.cashAccount },
                      { label: "Card",     val: status.mappings.cardAccountName,    code: status.mappings.cardAccount },
                      { label: "Tax/GST",  val: status.mappings.taxAccountName,     code: status.mappings.taxAccount },
                      { label: "Refunds",  val: status.mappings.refundAccountName,  code: status.mappings.refundAccount },
                    ].filter((r) => r.val).map((r) => (
                      <div key={r.label} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="font-medium">{r.code} – {r.val}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Manual sync buttons */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Run a manual sync</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { key: "transactions"   as const, label: "Sync Sales",          icon: Zap },
                      { key: "contacts"       as const, label: "Sync Contacts",        icon: Building2 },
                      { key: "purchase-orders" as const, label: "Sync Purchase Orders", icon: CheckCheck },
                    ].map(({ key, label, icon: Icon }) => (
                      <Button
                        key={key}
                        variant="outline"
                        onClick={() => triggerSync(key)}
                        disabled={!!syncing}
                        className="gap-1.5 justify-start"
                      >
                        {syncing === key
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Icon className="w-4 h-4" />}
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Sync log */}
                {(status?.syncLog ?? []).length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Sync history</p>
                    <div className="rounded-lg border bg-background">
                      {(status?.syncLog ?? []).slice(0, 10).map((entry, i) => (
                        <SyncLogRow key={i} entry={entry} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(5)} className="gap-1.5">
                    <ArrowLeft className="w-4 h-4" /> Settings
                  </Button>
                  <Button variant="outline" onClick={loadStatus} className="gap-1.5">
                    <RefreshCw className="w-4 h-4" /> Refresh
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar tips */}
          <div className="space-y-4">
            {/* Context tip */}
            <div className="rounded-xl border bg-[#13B5EA]/5 border-[#13B5EA]/20 p-4 space-y-3">
              <p className="text-sm font-semibold text-[#0d8fb8]">
                {step === 1 && "Why use Xero?"}
                {step === 2 && "OAuth is secure"}
                {step === 3 && "Multiple orgs?"}
                {step === 4 && "Account mapping tips"}
                {step === 5 && "Sync frequency"}
                {step === 6 && "What syncs?"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {step === 1 && "Xero is Australia's most popular accounting platform. Connecting KoaPOS means your daily sales, GST, and purchase orders land in Xero automatically — no manual reconciliation needed."}
                {step === 2 && "KoaPOS uses OAuth2 — the same technology used by banks. Your Xero password is never seen or stored by KoaPOS. You can revoke access from Xero at any time."}
                {step === 3 && "If you have multiple Xero organisations (e.g. a holding company and a trading entity), select the one that should receive POS data. You can change this later."}
                {step === 4 && "Use account codes that already exist in your Xero chart of accounts. For Australian businesses, revenue is typically 200, GST is 820. Ask your accountant if unsure."}
                {step === 5 && "Daily sync is recommended for most retailers — it runs overnight so it doesn't affect daytime performance. Enable 'auto-sync' to schedule it, or run manual syncs anytime."}
                {step === 6 && "Transactions sync as Xero invoices. Customers and suppliers sync as Xero contacts. Purchase orders become Xero bills. GST is tracked against your mapped tax account automatically."}
              </p>
            </div>

            {/* Quick status card */}
            <div className="rounded-xl border bg-background p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
              {[
                { label: "API credentials",    done: !!status?.configured },
                { label: "OAuth connected",    done: !!status?.connected },
                { label: "Organisation set",   done: !!status?.tenantId },
                { label: "Accounts mapped",    done: !!status?.mappings?.revenueAccount },
                { label: "Sync configured",    done: !!(status?.syncSettings?.syncTransactions || status?.syncSettings?.syncContacts) },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                  {item.done
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    : <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />}
                </div>
              ))}
            </div>

            {/* Help link */}
            <a
              href="https://developer.xero.com/documentation/guides/oauth2/overview/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Xero OAuth2 documentation
            </a>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
