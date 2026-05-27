import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, ExternalLink, Plug, Unplug, Loader2, AlertCircle,
  ShieldCheck, Clock, HardDrive, Briefcase, Share2, ChevronDown, ChevronRight, Zap,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface IntegrationField { name: string; label: string; type: "text" | "password"; }

interface Integration {
  key: string;
  label: string;
  section: string;
  category: string;
  description: string;
  authType: "oauth" | "credentials";
  fields: IntegrationField[];
  comingSoon: boolean;
  useVault: boolean;
  status: "connected" | "disconnected";
  connectedAt: string | null;
  accountHandle: string | null;
  accountId: string | null;
  oauthConfigured: boolean | null;
}

/* ─── Brand logos ────────────────────────────────────────────────────────── */

const SI = (slug: string, hex: string) => `https://cdn.simpleicons.org/${slug}/${hex}`;

type LogoCfg =
  | { type: "img";  src: string; bg: string; pad?: boolean }
  | { type: "text"; bg: string; color: string; label: string; cls?: string };

const LOGO_MAP: Record<string, LogoCfg> = {
  google_drive:         { type: "img",  bg: "bg-white border",  src: SI("googledrive",  "4285F4") },
  onedrive:             { type: "img",  bg: "bg-[#0078D4]",    src: SI("onedrive",      "ffffff") },
  dropbox:              { type: "img",  bg: "bg-[#0061FF]",    src: SI("dropbox",       "ffffff") },
  proton_drive:         { type: "img",  bg: "bg-[#6D4AFF]",    src: SI("proton",        "ffffff") },
  xero:                 { type: "img",  bg: "bg-[#13B5EA]",    src: SI("xero",          "ffffff") },
  quickbooks:           { type: "img",  bg: "bg-[#2CA01C]",    src: SI("quickbooks",    "ffffff") },
  myob:                 { type: "img",  bg: "bg-[#6A1F70]",    src: SI("myob",          "ffffff") },
  stripe_own:           { type: "img",  bg: "bg-[#635BFF]",    src: SI("stripe",        "ffffff") },
  square_terminal:      { type: "img",  bg: "bg-black",         src: SI("square",        "ffffff") },
  shopify:              { type: "img",  bg: "bg-[#96BF48]",    src: SI("shopify",       "ffffff") },
  meta_business:        { type: "img",  bg: "bg-[#0082FB]",    src: SI("meta",          "ffffff") },
  instagram_business:   { type: "img",  bg: "bg-[#E4405F]",    src: SI("instagram",     "ffffff") },
  twitter_x:            { type: "img",  bg: "bg-black",         src: SI("x",             "ffffff") },
  linkedin_business:    { type: "img",  bg: "bg-[#0A66C2]",    src: SI("linkedin",      "ffffff") },
  tiktok_business:      { type: "img",  bg: "bg-black",         src: SI("tiktok",        "ffffff") },
  google_business:      { type: "img",  bg: "bg-white border",  src: SI("google",        "4285F4") },
  youtube_channel:      { type: "img",  bg: "bg-[#FF0000]",    src: SI("youtube",       "ffffff") },
  google_ads:           { type: "img",  bg: "bg-white border",  src: SI("googleads",     "4285F4") },
  mailchimp:            { type: "img",  bg: "bg-[#FFE01B]",    src: SI("mailchimp",     "000000") },
  commbank_eftpos:      { type: "text", bg: "bg-[#FFD200]",    color: "text-black",   label: "CBA",  cls: "text-[11px] font-black tracking-tight" },
  tyro_eftpos:          { type: "text", bg: "bg-[#00B9E4]",    color: "text-white",   label: "TYRO", cls: "text-[10px] font-black tracking-tight" },
  paypal:               { type: "img",  bg: "bg-[#003087]",    src: SI("paypal",        "ffffff") },
  wechat_alipay:        { type: "img",  bg: "bg-[#07C160]",    src: SI("wechat",        "ffffff") },
  afterpay:             { type: "img",  bg: "bg-[#B2FCE4]",    src: SI("afterpay",      "000000") },
  zip:                  { type: "img",  bg: "bg-[#1A0826]",    src: SI("zippay",        "ffffff") },
  klarna:               { type: "img",  bg: "bg-[#FFB3C7]",    src: SI("klarna",        "000000") },
  apple_wallet:         { type: "img",  bg: "bg-black",         src: SI("apple",         "ffffff") },
  google_pay:           { type: "img",  bg: "bg-white border",  src: SI("googlepay",     "000000") },
  deputy:               { type: "img",  bg: "bg-[#FF8C00]",    src: SI("deputy",        "ffffff") },
  australia_post:       { type: "img",  bg: "bg-[#DC1928]",    src: SI("australiapost", "ffffff"), pad: true },
  sendle:               { type: "text", bg: "bg-[#00BFA5]",    color: "text-white",   label: "SND",  cls: "text-[10px] font-black tracking-tight" },
  google_contacts:      { type: "img",  bg: "bg-white border",  src: SI("google",        "4285F4") },
  microsoft_contacts:   { type: "img",  bg: "bg-[#0078D4]",    src: SI("microsoft",     "ffffff") },
  apple_contacts:       { type: "img",  bg: "bg-black",         src: SI("apple",         "ffffff") },
  openai:               { type: "img",  bg: "bg-black",         src: SI("openai",        "ffffff") },
  zapier:               { type: "img",  bg: "bg-[#FF4A00]",    src: SI("zapier",        "ffffff") },
};

function IntegrationLogo({ integrationKey, size = "md" }: { integrationKey: string; size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "w-14 h-14" : size === "md" ? "w-10 h-10" : "w-8 h-8";
  const imgSize = size === "lg" ? "w-8 h-8" : size === "md" ? "w-6 h-6" : "w-5 h-5";
  const cfg = LOGO_MAP[integrationKey];
  if (!cfg) return <div className={cn(dim, "rounded-2xl flex items-center justify-center shrink-0 bg-muted font-bold text-sm")}>?</div>;
  if (cfg.type === "text") return <div className={cn(dim, "rounded-2xl flex items-center justify-center shrink-0", cfg.bg, cfg.color)}><span className={cfg.cls ?? "text-xs font-bold"}>{cfg.label}</span></div>;
  return (
    <div className={cn(dim, "rounded-2xl flex items-center justify-center shrink-0 overflow-hidden", cfg.bg)}>
      <img src={cfg.src} alt={integrationKey} className={cn("object-contain", cfg.pad ? imgSize : imgSize)} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
    </div>
  );
}

/* ─── Connect modal ──────────────────────────────────────────────────────── */

function ConnectModal({ integration, onClose, onSaved }: { integration: Integration | null; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (integration) setValues({}); }, [integration]);
  if (!integration) return null;
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/integrations/${integration.key}/connect`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) throw new Error();
      toast.success(`${integration.label} connected`);
      onSaved(); onClose();
    } catch { toast.error("Failed to save credentials"); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={!!integration} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <IntegrationLogo integrationKey={integration.key} />
            <span>Connect {integration.label}</span>
          </DialogTitle>
          <DialogDescription>{integration.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {integration.fields.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input id={f.name} type={f.type} value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} autoComplete="off" />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save & Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Integration card ───────────────────────────────────────────────────── */

function IntegrationCard({ intg, busy, onConnect, onDisconnect, onOAuth }: {
  intg: Integration; busy: boolean;
  onConnect: () => void; onDisconnect: () => void; onOAuth: () => void;
}) {
  const isConnected = intg.status === "connected";

  return (
    <div className={cn(
      "rounded-2xl border bg-card flex flex-col overflow-hidden transition-all duration-200",
      "hover:shadow-md",
      isConnected
        ? "border-emerald-300 dark:border-emerald-700 shadow-sm shadow-emerald-100 dark:shadow-emerald-950"
        : "border-border hover:-translate-y-0.5",
      intg.comingSoon && "opacity-60",
    )}>
      {/* Connected accent strip */}
      {isConnected && <div className="h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400" />}

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Logo + title row */}
        <div className="flex items-start gap-3.5">
          <IntegrationLogo integrationKey={intg.key} size="lg" />
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm leading-tight">{intg.label}</span>
              {intg.comingSoon && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground">
                  <Clock className="w-2.5 h-2.5" /> Soon
                </span>
              )}
              {!intg.comingSoon && intg.authType === "oauth" && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">
                  <ShieldCheck className="w-3 h-3" /> OAuth
                </span>
              )}
            </div>
            {isConnected && intg.accountHandle ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium truncate max-w-[180px]">
                {intg.accountHandle}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {intg.authType === "oauth" ? "Authorise via OAuth 2.0" : "Enter API credentials"}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 flex-1">
          {intg.description}
        </p>

        {/* OAuth not configured warning */}
        {intg.authType === "oauth" && intg.oauthConfigured === false && !isConnected && !intg.comingSoon && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>OAuth credentials not configured — see .env.example</span>
          </div>
        )}

        {/* Action row */}
        <div className={cn("pt-3 border-t flex items-center justify-between gap-2", isConnected && "border-emerald-200 dark:border-emerald-800")}>
          {intg.comingSoon ? (
            <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground w-full" disabled>
              <Clock className="w-3.5 h-3.5" /> Coming Soon
            </Button>
          ) : isConnected ? (
            <div className="flex items-center justify-between w-full gap-2">
              <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700 px-2 py-0.5 text-[11px]">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/8 text-xs h-7 px-2.5"
                onClick={onDisconnect}
                disabled={busy}
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
                Disconnect
              </Button>
            </div>
          ) : intg.authType === "oauth" ? (
            <Button
              size="sm"
              className="gap-1.5 w-full"
              onClick={onOAuth}
              disabled={busy || intg.oauthConfigured === false}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              Connect Account
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5 w-full" onClick={onConnect} disabled={busy}>
              <Plug className="w-3.5 h-3.5" /> Connect Account
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Featured section ───────────────────────────────────────────────────── */

function FeaturedSection({
  id, title, description, icon: Icon, accent, iconBg, iconColor,
  items, connecting, onConnect, onDisconnect, onOAuth,
}: {
  id: string; title: string; description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; iconBg: string; iconColor: string;
  items: Integration[];
  connecting: Record<string, boolean>;
  onConnect: (i: Integration) => void;
  onDisconnect: (i: Integration) => void;
  onOAuth: (i: Integration) => void;
}) {
  const connected = items.filter((i) => i.status === "connected").length;
  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className={cn("rounded-2xl border px-5 py-4 flex items-center gap-4", accent)}>
        <div className={cn("rounded-xl p-2.5 shrink-0", iconBg)}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="font-semibold text-base">{title}</h2>
            {connected > 0 && (
              <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700 text-[11px]">
                <CheckCircle2 className="w-3 h-3" /> {connected} connected
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((intg) => (
          <IntegrationCard
            key={intg.key}
            intg={intg}
            busy={!!connecting[intg.key]}
            onConnect={() => onConnect(intg)}
            onDisconnect={() => onDisconnect(intg)}
            onOAuth={() => onOAuth(intg)}
          />
        ))}
      </div>
    </section>
  );
}

/* ─── Collapsible secondary section ─────────────────────────────────────── */

function CollapsibleSection({ title, description, items, connecting, onConnect, onDisconnect, onOAuth }: {
  title: string; description: string; items: Integration[];
  connecting: Record<string, boolean>;
  onConnect: (i: Integration) => void;
  onDisconnect: (i: Integration) => void;
  onOAuth: (i: Integration) => void;
}) {
  const [open, setOpen] = useState(false);
  const connected = items.filter((i) => i.status === "connected").length;
  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">{title}</span>
          <span className="text-xs text-muted-foreground hidden sm:block">{description}</span>
          {connected > 0 && (
            <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700 text-[10px] py-0">
              <CheckCircle2 className="w-2.5 h-2.5" />{connected}
            </Badge>
          )}
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
            {items.map((intg) => (
              <IntegrationCard
                key={intg.key}
                intg={intg}
                busy={!!connecting[intg.key]}
                onConnect={() => onConnect(intg)}
                onDisconnect={() => onDisconnect(intg)}
                onOAuth={() => onOAuth(intg)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Section config ─────────────────────────────────────────────────────── */

const FEATURED_SECTIONS = [
  {
    id: "cloud_storage",
    title: "Cloud Storage & Backups",
    icon: HardDrive,
    description: "Automatically back up reports, receipts, and exports to your preferred cloud drive",
    accent: "bg-blue-50/60 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "business_finance",
    title: "Business & Accounting",
    icon: Briefcase,
    description: "Sync sales, invoices, tax data, and payments with your accounting software",
    accent: "bg-violet-50/60 border-violet-200 dark:bg-violet-950/20 dark:border-violet-900",
    iconBg: "bg-violet-100 dark:bg-violet-900/40",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  {
    id: "social_marketing",
    title: "Marketing & Social Media",
    icon: Share2,
    description: "Connect social channels, schedule posts, run ad campaigns, and track performance",
    accent: "bg-pink-50/60 border-pink-200 dark:bg-pink-950/20 dark:border-pink-900",
    iconBg: "bg-pink-100 dark:bg-pink-900/40",
    iconColor: "text-pink-600 dark:text-pink-400",
  },
];

const SECONDARY_SECTIONS = [
  { id: "payments",  title: "Payments & EFTPOS",    description: "In-store card, QR, and online payment terminals" },
  { id: "bnpl",      title: "Buy Now, Pay Later",    description: "Instalment and pay-later options at checkout" },
  { id: "wallets",   title: "Digital Wallets",       description: "Issue loyalty passes and coupons to wallets" },
  { id: "payroll",   title: "Payroll & Staff",        description: "Roster, timesheet, and payroll sync" },
  { id: "shipping",  title: "Shipping & Fulfilment",  description: "Real-time rates, labels, and pickup booking" },
  { id: "contacts",  title: "Contacts & Calendar",   description: "Sync customers and appointments" },
  { id: "ai",        title: "AI & Automation",        description: "AI insights and no-code workflow automation" },
];

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementIntegrationsPage() {
  const [location, setLocation] = useLocation();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading]           = useState(true);
  const [connecting, setConnecting]     = useState<Record<string, boolean>>({});
  const [modalTarget, setModalTarget]   = useState<Integration | null>(null);

  const fetchIntegrations = async () => {
    try {
      const res = await fetch("/api/integrations", { credentials: "include" });
      if (res.ok) setIntegrations(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchIntegrations(); }, []);

  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error   = params.get("error");
    if (success) {
      const intg = integrations.find((i) => i.key === success);
      toast.success(`${intg?.label ?? success} connected successfully`);
      fetchIntegrations();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      if (error.endsWith("_oauth_not_configured")) toast.error("OAuth credentials not configured — see .env.example.");
      else if (error.endsWith("_oauth_denied"))    toast.error("OAuth authorisation was cancelled.");
      else                                          toast.error("Failed to connect integration.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location, integrations.length]);

  const handleDisconnect = async (intg: Integration) => {
    if (!confirm(`Disconnect ${intg.label}? This will remove stored credentials and tokens.`)) return;
    setConnecting((c) => ({ ...c, [intg.key]: true }));
    try {
      await fetch(`/api/integrations/${intg.key}`, { method: "DELETE", credentials: "include" });
      toast.success(`${intg.label} disconnected`);
      fetchIntegrations();
    } catch { toast.error("Failed to disconnect"); }
    finally { setConnecting((c) => ({ ...c, [intg.key]: false })); }
  };

  const handleOAuth = (intg: Integration) => {
    if (intg.key === "xero") { window.location.href = "/api/xero/auth/start"; return; }
    window.location.href = `/api/integrations/oauth/${intg.key}/start`;
  };

  const connectedCount = integrations.filter((i) => i.status === "connected").length;
  const bySection = (id: string) => integrations.filter((i) => i.section === id);

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-10">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="w-6 h-6 text-primary" />
              Integrations
            </h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-xl">
              Connect third-party services to extend KoaPOS. OAuth tokens are encrypted and stored securely in the platform vault.
            </p>
          </div>
          {connectedCount > 0 && (
            <Badge className="gap-1.5 bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 px-3 py-1.5 text-sm shrink-0">
              <CheckCircle2 className="w-4 h-4" /> {connectedCount} connected
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-12">
            {/* ── Featured sections ── */}
            {FEATURED_SECTIONS.map((sec) => (
              <FeaturedSection
                key={sec.id}
                {...sec}
                items={bySection(sec.id)}
                connecting={connecting}
                onConnect={setModalTarget}
                onDisconnect={handleDisconnect}
                onOAuth={handleOAuth}
              />
            ))}

            {/* ── More integrations ── */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                More Integrations
              </h2>
              {SECONDARY_SECTIONS.map((sec) => {
                const items = bySection(sec.id);
                if (items.length === 0) return null;
                return (
                  <CollapsibleSection
                    key={sec.id}
                    title={sec.title}
                    description={sec.description}
                    items={items}
                    connecting={connecting}
                    onConnect={setModalTarget}
                    onDisconnect={handleDisconnect}
                    onOAuth={handleOAuth}
                  />
                );
              })}
            </section>
          </div>
        )}
      </div>

      <ConnectModal integration={modalTarget} onClose={() => setModalTarget(null)} onSaved={fetchIntegrations} />
    </AppLayout>
  );
}
