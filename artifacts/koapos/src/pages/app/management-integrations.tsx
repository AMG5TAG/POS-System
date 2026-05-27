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
  ShieldCheck, Clock, HardDrive, Briefcase, Share2, ChevronDown, ChevronRight,
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
  /* Cloud Storage */
  google_drive:         { type: "img",  bg: "bg-white border",  src: SI("googledrive",  "4285F4") },
  onedrive:             { type: "img",  bg: "bg-[#0078D4]",    src: SI("onedrive",      "ffffff") },
  dropbox:              { type: "img",  bg: "bg-[#0061FF]",    src: SI("dropbox",       "ffffff") },
  proton_drive:         { type: "img",  bg: "bg-[#6D4AFF]",    src: SI("proton",        "ffffff") },
  /* Business & Finance */
  xero:                 { type: "img",  bg: "bg-[#13B5EA]",    src: SI("xero",          "ffffff") },
  quickbooks:           { type: "img",  bg: "bg-[#2CA01C]",    src: SI("quickbooks",    "ffffff") },
  myob:                 { type: "img",  bg: "bg-[#6A1F70]",    src: SI("myob",          "ffffff") },
  stripe_own:           { type: "img",  bg: "bg-[#635BFF]",    src: SI("stripe",        "ffffff") },
  square_terminal:      { type: "img",  bg: "bg-black",         src: SI("square",        "ffffff") },
  shopify:              { type: "img",  bg: "bg-[#96BF48]",    src: SI("shopify",       "ffffff") },
  /* Social Media & Marketing */
  meta_business:        { type: "img",  bg: "bg-[#0082FB]",    src: SI("meta",          "ffffff") },
  instagram_business:   { type: "img",  bg: "bg-[#E4405F]",    src: SI("instagram",     "ffffff") },
  twitter_x:            { type: "img",  bg: "bg-black",         src: SI("x",             "ffffff") },
  linkedin_business:    { type: "img",  bg: "bg-[#0A66C2]",    src: SI("linkedin",      "ffffff") },
  tiktok_business:      { type: "img",  bg: "bg-black",         src: SI("tiktok",        "ffffff") },
  google_business:      { type: "img",  bg: "bg-white border",  src: SI("google",        "4285F4") },
  mailchimp:            { type: "img",  bg: "bg-[#FFE01B]",    src: SI("mailchimp",     "000000") },
  /* Payments & EFTPOS */
  commbank_eftpos:      { type: "text", bg: "bg-[#FFD200]",    color: "text-black",   label: "CBA",  cls: "text-[11px] font-black tracking-tight" },
  tyro_eftpos:          { type: "text", bg: "bg-[#00B9E4]",    color: "text-white",   label: "TYRO", cls: "text-[10px] font-black tracking-tight" },
  paypal:               { type: "img",  bg: "bg-[#003087]",    src: SI("paypal",        "ffffff") },
  wechat_alipay:        { type: "img",  bg: "bg-[#07C160]",    src: SI("wechat",        "ffffff") },
  /* BNPL */
  afterpay:             { type: "img",  bg: "bg-[#B2FCE4]",    src: SI("afterpay",      "000000") },
  zip:                  { type: "img",  bg: "bg-[#1A0826]",    src: SI("zippay",        "ffffff") },
  klarna:               { type: "img",  bg: "bg-[#FFB3C7]",    src: SI("klarna",        "000000") },
  /* Wallets */
  apple_wallet:         { type: "img",  bg: "bg-black",         src: SI("apple",         "ffffff") },
  google_pay:           { type: "img",  bg: "bg-white border",  src: SI("googlepay",     "000000") },
  /* Payroll */
  deputy:               { type: "img",  bg: "bg-[#FF8C00]",    src: SI("deputy",        "ffffff") },
  /* Shipping */
  australia_post:       { type: "img",  bg: "bg-[#DC1928]",    src: SI("australiapost", "ffffff"), pad: true },
  sendle:               { type: "text", bg: "bg-[#00BFA5]",    color: "text-white",   label: "SND",  cls: "text-[10px] font-black tracking-tight" },
  /* Contacts */
  google_contacts:      { type: "img",  bg: "bg-white border",  src: SI("google",        "4285F4") },
  microsoft_contacts:   { type: "img",  bg: "bg-[#0078D4]",    src: SI("microsoft",     "ffffff") },
  apple_contacts:       { type: "img",  bg: "bg-black",         src: SI("apple",         "ffffff") },
  /* AI */
  openai:               { type: "img",  bg: "bg-black",         src: SI("openai",        "ffffff") },
  zapier:               { type: "img",  bg: "bg-[#FF4A00]",    src: SI("zapier",        "ffffff") },
};

function IntegrationLogo({ integrationKey, size = "md" }: { integrationKey: string; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "w-12 h-12" : "w-10 h-10";
  const cfg = LOGO_MAP[integrationKey];
  if (!cfg) return <div className={cn(dim, "rounded-xl flex items-center justify-center shrink-0 bg-muted font-bold text-sm")}>?</div>;
  if (cfg.type === "text") return <div className={cn(dim, "rounded-xl flex items-center justify-center shrink-0", cfg.bg, cfg.color)}><span className={cfg.cls ?? "text-xs font-bold"}>{cfg.label}</span></div>;
  return (
    <div className={cn(dim, "rounded-xl flex items-center justify-center shrink-0 overflow-hidden", cfg.bg)}>
      <img src={cfg.src} alt={integrationKey} className={cn("object-contain", cfg.pad ? "w-6 h-6" : "w-7 h-7")} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
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

function IntegrationCard({ intg, busy, onConnect, onDisconnect, onOAuth }: { intg: Integration; busy: boolean; onConnect: () => void; onDisconnect: () => void; onOAuth: () => void }) {
  const isConnected = intg.status === "connected";
  return (
    <div className={cn("rounded-xl border bg-background p-4 flex flex-col gap-3 transition-shadow hover:shadow-sm", isConnected && "border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/20 dark:border-emerald-900", intg.comingSoon && "opacity-65")}>
      <div className="flex items-start gap-3">
        <IntegrationLogo integrationKey={intg.key} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm">{intg.label}</span>
            {intg.comingSoon && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground"><Clock className="w-2.5 h-2.5" /> Soon</span>}
            {intg.authType === "oauth" && !intg.comingSoon && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"><ShieldCheck className="w-3 h-3" /> OAuth</span>}
            {isConnected && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><CheckCircle2 className="w-3 h-3" /> Connected</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{intg.description}</p>
          {isConnected && intg.connectedAt && <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">Since {new Date(intg.connectedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>}
          {isConnected && intg.accountHandle && <p className="text-[11px] text-muted-foreground mt-0.5">@{intg.accountHandle}</p>}
        </div>
      </div>
      {intg.authType === "oauth" && intg.oauthConfigured === false && !isConnected && !intg.comingSoon && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> OAuth credentials not configured. See .env.example.
        </div>
      )}
      <div className="mt-auto">
        {intg.comingSoon ? (
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" disabled><Clock className="w-3.5 h-3.5" /> Coming Soon</Button>
        ) : isConnected ? (
          <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5" onClick={onDisconnect} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />} Disconnect
          </Button>
        ) : intg.authType === "oauth" ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onOAuth} disabled={busy || intg.oauthConfigured === false}>
            <ExternalLink className="w-3.5 h-3.5" /> Connect
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onConnect} disabled={busy}>
            <Plug className="w-3.5 h-3.5" /> Connect
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Collapsible secondary section ─────────────────────────────────────── */

function CollapsibleSection({ title, description, items, connectedCount, busy, connecting, onConnect, onDisconnect, onOAuth }: {
  title: string; description: string; items: Integration[]; connectedCount: number;
  busy: Record<string, boolean>; connecting: Record<string, boolean>;
  onConnect: (i: Integration) => void; onDisconnect: (i: Integration) => void; onOAuth: (i: Integration) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">{title}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
          {connectedCount > 0 && <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-[10px] py-0"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />{connectedCount}</Badge>}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {items.map((intg) => (
              <IntegrationCard key={intg.key} intg={intg} busy={!!connecting[intg.key]} onConnect={() => onConnect(intg)} onDisconnect={() => onDisconnect(intg)} onOAuth={() => onOAuth(intg)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Featured section config ────────────────────────────────────────────── */

const FEATURED_SECTIONS = [
  {
    id: "cloud_storage",
    title: "Cloud Storage",
    icon: HardDrive,
    description: "Securely back up your data to your preferred cloud drive",
    accent: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "business_finance",
    title: "Business & Finance",
    icon: Briefcase,
    description: "Sync sales, invoices, and payments with your business software",
    accent: "bg-violet-50 border-violet-200 dark:bg-violet-950/20 dark:border-violet-900",
    iconBg: "bg-violet-100 dark:bg-violet-900/40",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  {
    id: "social_marketing",
    title: "Social Media & Marketing",
    icon: Share2,
    description: "Connect social channels, run ads, and grow your audience",
    accent: "bg-pink-50 border-pink-200 dark:bg-pink-950/20 dark:border-pink-900",
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
    // Xero has a dedicated OAuth + tenant-selection flow at /api/xero/auth/start
    if (intg.key === "xero") { window.location.href = "/api/xero/auth/start"; return; }
    window.location.href = `/api/integrations/oauth/${intg.key}/start`;
  };

  const connectedCount = integrations.filter((i) => i.status === "connected").length;
  const bySection = (id: string) => integrations.filter((i) => i.section === id);

  return (
    <AppLayout>
      <div className="p-6 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Integrations</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Connect third-party services to extend your KoaPOS experience. OAuth tokens are stored encrypted in the platform vault.
            </p>
          </div>
          {connectedCount > 0 && (
            <Badge className="gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 border dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" /> {connectedCount} connected
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-10">
            {/* ── Featured three-column sections ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {FEATURED_SECTIONS.map((section) => {
                const Icon = section.icon;
                const items = bySection(section.id);
                const sectionConnected = items.filter((i) => i.status === "connected").length;
                return (
                  <div key={section.id} className={cn("rounded-2xl border p-5 flex flex-col gap-4", section.accent)}>
                    {/* Section header */}
                    <div className="flex items-start gap-3">
                      <div className={cn("rounded-xl p-2.5 shrink-0", section.iconBg)}>
                        <Icon className={cn("w-5 h-5", section.iconColor)} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="font-semibold text-sm">{section.title}</h2>
                          {sectionConnected > 0 && (
                            <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-white/70 text-[10px] py-0 dark:bg-emerald-950/40 dark:text-emerald-300">
                              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />{sectionConnected}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                      </div>
                    </div>
                    {/* Cards */}
                    <div className="flex flex-col gap-2.5">
                      {items.map((intg) => (
                        <IntegrationCard
                          key={intg.key} intg={intg} busy={!!connecting[intg.key]}
                          onConnect={() => setModalTarget(intg)}
                          onDisconnect={() => handleDisconnect(intg)}
                          onOAuth={() => handleOAuth(intg)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Secondary collapsible sections ── */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">More Integrations</h2>
              {SECONDARY_SECTIONS.map((sec) => {
                const items = bySection(sec.id);
                if (items.length === 0) return null;
                return (
                  <CollapsibleSection
                    key={sec.id}
                    title={sec.title}
                    description={sec.description}
                    items={items}
                    connectedCount={items.filter((i) => i.status === "connected").length}
                    busy={connecting}
                    connecting={connecting}
                    onConnect={setModalTarget}
                    onDisconnect={handleDisconnect}
                    onOAuth={handleOAuth}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ConnectModal integration={modalTarget} onClose={() => setModalTarget(null)} onSaved={fetchIntegrations} />
    </AppLayout>
  );
}
