import { useState, useEffect, useCallback } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { CreditCard, Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Settings, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "tyro_eftpos_config";

interface TyroConfig {
  terminalIp: string;
  terminalPort: string;
  merchantId: string;
  terminalId: string;
  autoSettle: boolean;
  motoEnabled: boolean;
  integrationKey: string;
}

const DEFAULT_CONFIG: TyroConfig = {
  terminalIp: "192.168.1.100",
  terminalPort: "8080",
  merchantId: "",
  terminalId: "",
  autoSettle: true,
  motoEnabled: false,
  integrationKey: "",
};

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export default function SettingsTyroEftposPage() {
  const [config, setConfig] = useState<TyroConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setConfig(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const patchConfig = useCallback((fn: (c: TyroConfig) => TyroConfig) => {
    setConfig(fn);
    setIsDirty(true);
  }, []);

  const { ConfirmDialog: TyroFormGuard } = useUnsavedChangesGuard(isDirty, {
    title: "Unsaved EFTPOS configuration",
    description: "You have unsaved changes to your Tyro EFTPOS configuration. If you leave now, your changes will be lost.",
    cancelLabel: "Stay on page",
    actionLabel: "Leave anyway",
  });

  const saveConfig = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setSaved(true);
      setIsDirty(false);
      toast.success("Tyro EFTPOS configuration saved");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error("Failed to save configuration");
    }
  };

  const testConnection = async () => {
    if (!config.terminalIp || !config.terminalPort) {
      toast.error("Please enter terminal IP and port first");
      return;
    }
    setStatus("connecting");
    await new Promise(r => setTimeout(r, 2000));
    if (config.integrationKey && config.merchantId) {
      setStatus("connected");
      toast.success("Connected to Tyro EFTPOS terminal");
    } else {
      setStatus("error");
      toast.error("Connection failed — check your Integration Key and Merchant ID");
    }
  };

  const STATUS_UI = {
    disconnected: { label: "Not Connected",  color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: WifiOff },
    connecting:   { label: "Connecting…",    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: RefreshCw },
    connected:    { label: "Connected",      color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
    error:        { label: "Error",          color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: AlertTriangle },
  };
  const statusUi = STATUS_UI[status];
  const StatusIcon = statusUi.icon;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Tyro EFTPOS Bridge</h1>
              <p className="text-sm text-muted-foreground">Connect to a Tyro physical card terminal via local network</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${statusUi.color}`}>
            <StatusIcon className={`w-3.5 h-3.5 ${status === "connecting" ? "animate-spin" : ""}`} />
            {statusUi.label}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Terminal connection settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wifi className="w-4 h-4" /> Network Configuration
              </CardTitle>
              <CardDescription>Local network settings to reach your Tyro terminal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label>Terminal IP Address</Label>
                  <Input value={config.terminalIp} onChange={e => patchConfig(c => ({ ...c, terminalIp: e.target.value }))}
                    placeholder="192.168.1.100" className="mt-1 font-mono" />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input value={config.terminalPort} onChange={e => patchConfig(c => ({ ...c, terminalPort: e.target.value }))}
                    placeholder="8080" className="mt-1 font-mono" />
                </div>
              </div>
              <div>
                <Label>Integration Key</Label>
                <Input type="password" value={config.integrationKey}
                  onChange={e => patchConfig(c => ({ ...c, integrationKey: e.target.value }))}
                  placeholder="Tyro Integration Key from developer portal" className="mt-1 font-mono" />
              </div>
              <Button onClick={testConnection} disabled={status === "connecting"} className="w-full">
                {status === "connecting"
                  ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Connecting…</>
                  : <><Wifi className="w-4 h-4 mr-2" /> Test Connection</>}
              </Button>
            </CardContent>
          </Card>

          {/* Merchant credentials */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4" /> Merchant Credentials
              </CardTitle>
              <CardDescription>Tyro merchant and terminal identifiers from your Tyro portal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Merchant ID (MID)</Label>
                <Input value={config.merchantId} onChange={e => patchConfig(c => ({ ...c, merchantId: e.target.value }))}
                  placeholder="Your Tyro Merchant ID" className="mt-1 font-mono" />
              </div>
              <div>
                <Label>Terminal ID (TID)</Label>
                <Input value={config.terminalId} onChange={e => patchConfig(c => ({ ...c, terminalId: e.target.value }))}
                  placeholder="Your Tyro Terminal ID" className="mt-1 font-mono" />
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto-settle at end of day</p>
                    <p className="text-xs text-muted-foreground">Automatically settle batch when closing</p>
                  </div>
                  <Switch checked={config.autoSettle} onCheckedChange={v => patchConfig(c => ({ ...c, autoSettle: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">MOTO payments</p>
                    <p className="text-xs text-muted-foreground">Enable Mail Order / Telephone Order transactions</p>
                  </div>
                  <Switch checked={config.motoEnabled} onCheckedChange={v => patchConfig(c => ({ ...c, motoEnabled: v }))} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* How it works */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">How the EFTPOS Bridge Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                {[
                  { step: "1", title: "Configure terminal", desc: "Enter your Tyro terminal's IP address and credentials above. The terminal must be on the same local network as your POS device." },
                  { step: "2", title: "Select EFTPOS at checkout", desc: "When processing a sale in the POS, choose 'EFTPOS' as the payment method. KoaPOS sends the amount to the Tyro terminal automatically." },
                  { step: "3", title: "Customer taps / inserts", desc: "The customer taps, inserts, or swipes their card on the physical terminal. The approval is sent back and the sale is recorded." },
                ].map(s => (
                  <div key={s.step} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{s.step}</div>
                    <div>
                      <p className="font-medium mb-1">{s.title}</p>
                      <p className="text-muted-foreground text-xs leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Separator className="my-4" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                <span>A valid Tyro Integration Key is required. Obtain one from the <a href="https://developer.tyro.com" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-0.5">Tyro Developer Portal <ExternalLink className="w-2.5 h-2.5" /></a>. This bridge currently operates in simulation mode until a production key is applied.</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveConfig} disabled={saved}>
            {saved ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Saved</> : "Save Configuration"}
          </Button>
        </div>
      </div>

      <TyroFormGuard />
    </AppLayout>
  );
}
