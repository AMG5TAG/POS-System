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
  description: string;
  authType: "oauth" | "credentials";
  fields: IntegrationField[];
  status: "connected" | "disconnected";
  connectedAt: string | null;
  oauthConfigured: boolean | null;
}

/* ─── Integration logos ──────────────────────────────────────────────────── */

function IntegrationLogo({ integrationKey }: { integrationKey: string }) {
  const logos: Record<string, { bg: string; text: string; symbol: string }> = {
    google_business: { bg: "bg-blue-500",   text: "text-white", symbol: "G"  },
    stripe_own:      { bg: "bg-[#635BFF]",  text: "text-white", symbol: "S"  },
    australia_post:  { bg: "bg-red-600",    text: "text-white", symbol: "AP" },
    apple_wallet:    { bg: "bg-black",      text: "text-white", symbol: "🍎" },
    commbank_eftpos: { bg: "bg-yellow-400", text: "text-black", symbol: "CB" },
    tyro_eftpos:     { bg: "bg-blue-600",   text: "text-white", symbol: "TY" },
    square_terminal: { bg: "bg-black",      text: "text-white", symbol: "□"  },
    paypal:          { bg: "bg-[#003087]",  text: "text-white", symbol: "P"  },
    wechat_alipay:   { bg: "bg-green-500",  text: "text-white", symbol: "W"  },
    openai:          { bg: "bg-emerald-600",text: "text-white", symbol: "AI" },
  };
  const cfg = logos[integrationKey] ?? { bg: "bg-muted", text: "text-foreground", symbol: "?" };
  return (
    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm", cfg.bg, cfg.text)}>
      {cfg.symbol}
    </div>
  );
}

/* ─── Connect modal (credential-based) ──────────────────────────────────── */

interface ConnectModalProps {
  integration: Integration | null;
  onClose: () => void;
  onSaved: () => void;
}

function ConnectModal({ integration, onClose, onSaved }: ConnectModalProps) {
  const [values, setValues]     = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState(false);

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
          <DialogTitle className="flex items-center gap-2">
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

  useEffect(() => {
    fetchIntegrations();
  }, []);

  // Handle OAuth success/error query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error   = params.get("error");
    if (success) {
      const intg = integrations.find((i) => i.key === success);
      toast.success(`${intg?.label ?? success} connected successfully`);
      fetchIntegrations();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      if (error.endsWith("_oauth_not_configured")) {
        toast.error("OAuth is not configured for this integration yet.");
      } else if (error.endsWith("_oauth_denied")) {
        toast.error("OAuth authorisation was cancelled.");
      } else {
        toast.error("Failed to connect integration.");
      }
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

  const handleOAuthStart = (intg: Integration) => {
    window.location.href = `/api/integrations/oauth/${intg.key}/start`;
  };

  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrations.map((intg) => {
              const isConnected = intg.status === "connected";
              const isBusy      = connecting[intg.key];

              return (
                <div
                  key={intg.key}
                  className={cn(
                    "rounded-xl border bg-background p-5 flex flex-col gap-4 transition-shadow hover:shadow-sm",
                    isConnected && "border-emerald-200 bg-emerald-50/30"
                  )}
                >
                  {/* Top row */}
                  <div className="flex items-start gap-3">
                    <IntegrationLogo integrationKey={intg.key} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{intg.label}</span>
                        {intg.authType === "oauth" && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <ShieldCheck className="w-3 h-3" /> OAuth
                          </span>
                        )}
                        {isConnected && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" /> Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
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
                  {intg.authType === "oauth" && intg.oauthConfigured === false && !isConnected && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      OAuth credentials not yet configured. Contact your admin.
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-auto">
                    {isConnected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => handleDisconnect(intg)}
                        disabled={isBusy}
                      >
                        {isBusy
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Unplug className="w-3.5 h-3.5" />}
                        Disconnect
                      </Button>
                    ) : intg.authType === "oauth" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => handleOAuthStart(intg)}
                        disabled={isBusy}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {intg.key === "google_business" ? "Connect with Google" : "Connect with Stripe"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setModalTarget(intg)}
                        disabled={isBusy}
                      >
                        <Plug className="w-3.5 h-3.5" />
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
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
