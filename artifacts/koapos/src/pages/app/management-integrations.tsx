import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ExternalLink,
  Plug,
  Unplug,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Clock,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface IntegrationField {
  name: string;
  label: string;
  type: "text" | "password";
}

interface Integration {
  key: string;
  label: string;
  category: string;
  description: string;
  authType: "oauth" | "credentials";
  fields: IntegrationField[];
  comingSoon: boolean;
  status: "connected" | "disconnected";
  connectedAt: string | null;
  oauthConfigured: boolean | null;
}

/* ─── Brand logos ────────────────────────────────────────────────────────── */

const SI = (slug: string, hex: string) =>
  `https://cdn.simpleicons.org/${slug}/${hex}`;

type LogoCfg =
  | { type: "img";  src: string; bg: string; pad?: boolean }
  | { type: "text"; bg: string; color: string; label: string; cls?: string };

const LOGO_MAP: Record<string, LogoCfg> = {
  /* Payments & EFTPOS */
  stripe_own:         { type: "img",  bg: "bg-[#635BFF]",    src: SI("stripe",      "ffffff") },
  commbank_eftpos:    { type: "text", bg: "bg-[#FFD200]",    color: "text-black",   label: "CBA",  cls: "text-[11px] font-black tracking-tight" },
  tyro_eftpos:        { type: "text", bg: "bg-[#00B9E4]",    color: "text-white",   label: "TYRO", cls: "text-[10px] font-black tracking-tight" },
  square_terminal:    { type: "img",  bg: "bg-black",         src: SI("square",      "ffffff") },
  paypal:             { type: "img",  bg: "bg-[#003087]",    src: SI("paypal",      "ffffff") },
  wechat_alipay:      { type: "img",  bg: "bg-[#07C160]",    src: SI("wechat",      "ffffff") },
  /* Buy Now Pay Later */
  afterpay:           { type: "img",  bg: "bg-[#B2FCE4]",    src: SI("afterpay",    "000000") },
  zip:                { type: "text", bg: "bg-[#AA8FFF]",    color: "text-white",   label: "ZIP",  cls: "text-[11px] font-black tracking-tight" },
  klarna:             { type: "img",  bg: "bg-[#FFB3C7]",    src: SI("klarna",      "000000") },
  /* Digital Wallets */
  apple_wallet:       { type: "img",  bg: "bg-black",         src: SI("apple",       "ffffff") },
  google_pay:         { type: "img",  bg: "bg-white border",  src: SI("googlepay",   "000000") },
  /* Accounting */
  xero:               { type: "img",  bg: "bg-[#13B5EA]",    src: SI("xero",        "ffffff") },
  myob:               { type: "img",  bg: "bg-[#6A1F70]",    src: SI("myob",        "ffffff") },
  /* Payroll */
  deputy:             { type: "text", bg: "bg-[#006FEE]",    color: "text-white",   label: "DEP",  cls: "text-[10px] font-black tracking-tight" },
  /* Shipping */
  australia_post:     { type: "text", bg: "bg-[#DC1928]",    color: "text-white",   label: "AP",   cls: "text-sm font-black" },
  sendle:             { type: "text", bg: "bg-[#00BFA5]",    color: "text-white",   label: "SND",  cls: "text-[10px] font-black tracking-tight" },
  /* Marketing */
  google_business:    { type: "img",  bg: "bg-white border",  src: SI("google",      "4285F4") },
  mailchimp:          { type: "img",  bg: "bg-[#FFE01B]",    src: SI("mailchimp",   "000000") },
  meta_business:      { type: "img",  bg: "bg-[#0082FB]",    src: SI("meta",        "ffffff") },
  /* Backup & Storage */
  google_drive:       { type: "img",  bg: "bg-white border",  src: SI("googledrive", "4285F4") },
  onedrive:           { type: "img",  bg: "bg-[#0078D4]",    src: SI("onedrive",    "ffffff") },
  dropbox:            { type: "img",  bg: "bg-[#0061FF]",    src: SI("dropbox",     "ffffff") },
  proton_drive:       { type: "img",  bg: "bg-[#6D4AFF]",    src: SI("proton",      "ffffff") },
  /* Contacts & Calendar */
  google_contacts:    { type: "img",  bg: "bg-white border",  src: SI("google",      "4285F4") },
  microsoft_contacts: { type: "img",  bg: "bg-[#0078D4]",    src: SI("microsoft",   "ffffff") },
  apple_contacts:     { type: "img",  bg: "bg-black",         src: SI("apple",       "ffffff") },
  /* AI & Automation */
  openai:             { type: "img",  bg: "bg-black",         src: SI("openai",      "ffffff") },
  zapier:             { type: "img",  bg: "bg-[#FF4A00]",    src: SI("zapier",      "ffffff") },
};

function IntegrationLogo({ integrationKey, size = "md" }: { integrationKey: string; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "w-12 h-12" : "w-10 h-10";
  const cfg = LOGO_MAP[integrationKey];

  if (!cfg) {
    return (
      <div className={cn(dim, "rounded-xl flex items-center justify-center shrink-0 bg-muted text-foreground font-bold text-sm")}>
        ?
      </div>
    );
  }

  if (cfg.type === "text") {
    return (
      <div className={cn(dim, "rounded-xl flex items-center justify-center shrink-0", cfg.bg, cfg.color)}>
        <span className={cfg.cls ?? "text-xs font-bold"}>{cfg.label}</span>
      </div>
    );
  }

  return (
    <div className={cn(dim, "rounded-xl flex items-center justify-center shrink-0 overflow-hidden", cfg.bg)}>
      <img
        src={cfg.src}
        alt={integrationKey}
        className={cn("object-contain", cfg.pad ? "w-6 h-6" : "w-7 h-7")}
        onError={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          img.style.display = "none";
        }}
      />
    </div>
  );
}

/* ─── Connect modal ──────────────────────────────────────────────────────── */

interface ConnectModalProps {
  integration: Integration | null;
  onClose: () => void;
  onSaved: () => void;
}

function ConnectModal({ integration, onClose, onSaved }: ConnectModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (integration) setValues({});
  }, [integration]);

  if (!integration) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/integrations/${integration.key}/connect`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`${integration.label} connected`);
      onSaved();
      onClose();
    } catch {
      toast.error("Failed to save credentials");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!integration} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <IntegrationLogo integrationKey={integration.key} />
            <span>Connect {integration.label}</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-1">
            {integration.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {integration.fields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input
                id={field.name}
                type={field.type}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                autoComplete="off"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save & Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Integration card ───────────────────────────────────────────────────── */

interface CardProps {
  intg: Integration;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onOAuth: () => void;
}

function IntegrationCard({ intg, busy, onConnect, onDisconnect, onOAuth }: CardProps) {
  const isConnected = intg.status === "connected";

  return (
    <div
      className={cn(
        "rounded-xl border bg-background p-4 flex flex-col gap-3 transition-shadow hover:shadow-sm",
        isConnected && "border-emerald-200 bg-emerald-50/30",
        intg.comingSoon && "opacity-70",
      )}
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        <IntegrationLogo integrationKey={intg.key} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm">{intg.label}</span>
            {intg.comingSoon && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground">
                <Clock className="w-2.5 h-2.5" /> Coming Soon
              </span>
            )}
            {intg.authType === "oauth" && !intg.comingSoon && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <ShieldCheck className="w-3 h-3" /> OAuth
              </span>
            )}
            {isConnected && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
            {intg.description}
          </p>
          {isConnected && intg.connectedAt && (
            <p className="text-[11px] text-emerald-600 mt-1">
              Connected {new Date(intg.connectedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      </div>

      {/* OAuth not-configured notice */}
      {intg.authType === "oauth" && intg.oauthConfigured === false && !isConnected && !intg.comingSoon && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          OAuth credentials not yet configured. Contact your admin.
        </div>
      )}

      {/* Action */}
      <div className="mt-auto">
        {intg.comingSoon ? (
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" disabled>
            <Clock className="w-3.5 h-3.5" /> Coming Soon
          </Button>
        ) : isConnected ? (
          <Button
            variant="outline" size="sm"
            className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={onDisconnect}
            disabled={busy}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
            Disconnect
          </Button>
        ) : intg.authType === "oauth" ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onOAuth} disabled={busy || intg.oauthConfigured === false}>
            <ExternalLink className="w-3.5 h-3.5" />
            {intg.key.startsWith("google") ? "Link to Google"
              : intg.key === "onedrive" || intg.key === "microsoft_contacts" ? "Link to Microsoft"
              : intg.key === "dropbox" ? "Link to Dropbox"
              : intg.key === "stripe_own" ? "Connect with Stripe"
              : "Connect"}
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

/* ─── Category section ───────────────────────────────────────────────────── */

const CATEGORY_ORDER = [
  "Payments & EFTPOS",
  "Buy Now, Pay Later",
  "Digital Wallets",
  "Accounting & Finance",
  "Payroll & Staff",
  "Shipping & Fulfilment",
  "Marketing & CRM",
  "Backup & Storage",
  "Contacts & Calendar",
  "AI & Automation",
];

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "Payments & EFTPOS":     "Accept in-store card, QR, and online payments.",
  "Buy Now, Pay Later":    "Let customers split purchases into instalments.",
  "Digital Wallets":       "Issue loyalty passes and coupons to digital wallets.",
  "Accounting & Finance":  "Push sales data to your accounting software automatically.",
  "Payroll & Staff":       "Sync rosters, timesheets, and pay rates.",
  "Shipping & Fulfilment": "Calculate rates and print labels at checkout.",
  "Marketing & CRM":       "Grow your audience and run targeted campaigns.",
  "Backup & Storage":      "Automatically back up reports, receipts, and exports to cloud storage.",
  "Contacts & Calendar":   "Sync customers and appointments with your existing contacts and calendar apps.",
  "AI & Automation":       "Supercharge your workflow with AI and no-code automation.",
};

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementIntegrationsPage() {
  const [location] = useLocation();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading]           = useState(true);
  const [connecting, setConnecting]     = useState<Record<string, boolean>>({});
  const [modalTarget, setModalTarget]   = useState<Integration | null>(null);

  const fetchIntegrations = async () => {
    try {
      const res = await fetch("/api/integrations", { credentials: "include" });
      if (res.ok) setIntegrations(await res.json());
    } finally {
      setLoading(false);
    }
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
      if (error.endsWith("_oauth_not_configured")) toast.error("OAuth is not configured for this integration yet.");
      else if (error.endsWith("_oauth_denied"))    toast.error("OAuth authorisation was cancelled.");
      else                                          toast.error("Failed to connect integration.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location, integrations.length]);

  const handleDisconnect = async (intg: Integration) => {
    if (!confirm(`Disconnect ${intg.label}? This will remove stored credentials.`)) return;
    setConnecting((c) => ({ ...c, [intg.key]: true }));
    try {
      await fetch(`/api/integrations/${intg.key}`, { method: "DELETE", credentials: "include" });
      toast.success(`${intg.label} disconnected`);
      fetchIntegrations();
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setConnecting((c) => ({ ...c, [intg.key]: false }));
    }
  };

  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  // Group by category in defined order
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: integrations.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Integrations</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Connect third-party services to extend your KoaPOS experience.
            </p>
          </div>
          {connectedCount > 0 && (
            <Badge className="gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 border">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {connectedCount} connected
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-10">
            {grouped.map(({ category, items }) => (
              <section key={category}>
                {/* Category header */}
                <div className="mb-4">
                  <h2 className="text-base font-semibold">{category}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {CATEGORY_DESCRIPTIONS[category]}
                  </p>
                </div>

                {/* Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((intg) => (
                    <IntegrationCard
                      key={intg.key}
                      intg={intg}
                      busy={!!connecting[intg.key]}
                      onConnect={() => setModalTarget(intg)}
                      onDisconnect={() => handleDisconnect(intg)}
                      onOAuth={() => { window.location.href = `/api/integrations/oauth/${intg.key}/start`; }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <ConnectModal
        integration={modalTarget}
        onClose={() => setModalTarget(null)}
        onSaved={fetchIntegrations}
      />
    </AppLayout>
  );
}
