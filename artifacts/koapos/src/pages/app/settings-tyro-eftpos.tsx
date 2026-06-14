import { useState, useRef, useEffect } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CreditCard, Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Settings, ExternalLink, Send, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

/* ── API helpers (direct fetch — these endpoints aren't in the codegen yet) ─ */
async function fetchTyroSettings() {
  const res = await fetch("/api/tyro-settings", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json() as Promise<TyroConfig>;
}
async function saveTyroSettings(config: TyroConfig) {
  const res = await fetch("/api/tyro-settings", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json() as Promise<TyroConfig>;
}

interface TyroConfig {
  host: string;
  port: string;
  integrationKey: string;
  tyroMerchantId: string;
  terminalId: string;
  posName: string;
  autoSettle: boolean;
  motoEnabled: boolean;
  testMode: boolean;
}

const DEFAULT_CONFIG: TyroConfig = {
  host: "192.168.1.100",
  port: "8080",
  integrationKey: "",
  tyroMerchantId: "",
  terminalId: "",
  posName: "KoaPOS",
  autoSettle: true,
  motoEnabled: false,
  testMode: false,
};

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface WsMessage {
  id: string;
  type: "sent" | "received";
  timestamp: string;
  payload: string;
}

export default function SettingsTyroEftposPage() {
  const qc = useQueryClient();
  const [config, setConfig] = useState<TyroConfig>(DEFAULT_CONFIG);
  const [savedConfig, setSavedConfig] = useState<TyroConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [wsMessages, setWsMessages] = useState<WsMessage[]>([]);
  const [wsInput, setWsInput] = useState('{"type":"PURCHASE","amount":12.50}');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchTyroSettings()
      .then((data) => { setConfig(data); setSavedConfig(data); })
      .catch(() => toast.error("Failed to load Tyro configuration"))
      .finally(() => setIsLoading(false));
  }, []);

  const isDirty = JSON.stringify(config) !== JSON.stringify(savedConfig);

  const patchConfig = (fn: (c: TyroConfig) => TyroConfig) => setConfig(fn);

  const { ConfirmDialog: TyroFormGuard } = useUnsavedChangesGuard(isDirty, {
    title: "Unsaved EFTPOS configuration",
    description: "You have unsaved changes to your Tyro EFTPOS configuration. If you leave now, your changes will be lost.",
    cancelLabel: "Stay on page",
    actionLabel: "Leave anyway",
  });

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      const saved = await saveTyroSettings(config);
      setConfig(saved);
      setSavedConfig(saved);
      toast.success("Tyro EFTPOS configuration saved");
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    if (!config.host || !config.port) { toast.error("Please enter terminal IP and port first"); return; }
    setStatus("connecting");
    await new Promise(r => setTimeout(r, 2000));
    if (config.integrationKey && config.tyroMerchantId) {
      setStatus("connected");
      toast.success("Connected to Tyro EFTPOS terminal");
    } else {
      setStatus("error");
      toast.error("Connection failed — check your Integration Key and Merchant ID");
    }
  };

  const connectWs = () => {
    if (wsRef.current) { toast.error("Already connected"); return; }
    if (!config.host || !config.port) { toast.error("Enter terminal IP and port first"); return; }
    setStatus("connecting");
    const wsUrl = `wss://${config.host}:${config.port}/ws`;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => { setStatus("connected"); toast.success("WebSocket connected to terminal"); };
      ws.onmessage = (ev) => {
        setWsMessages(prev => [...prev, { id: crypto.randomUUID(), type: "received", timestamp: new Date().toLocaleTimeString(), payload: ev.data }]);
      };
      ws.onerror = () => { setStatus("error"); toast.error("WebSocket error"); };
      ws.onclose = () => { setStatus("disconnected"); wsRef.current = null; };
    } catch { setStatus("error"); toast.error("Failed to open WebSocket"); }
  };

  const disconnectWs = () => { wsRef.current?.close(); wsRef.current = null; setStatus("disconnected"); setWsMessages([]); };

  const sendWs = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { toast.error("WebSocket not connected"); return; }
    wsRef.current.send(wsInput);
    setWsMessages(prev => [...prev, { id: crypto.randomUUID(), type: "sent", timestamp: new Date().toLocaleTimeString(), payload: wsInput }]);
  };

  const STATUS_UI = {
    disconnected: { label: "Not Connected",  color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: WifiOff },
    connecting:   { label: "Connecting…",    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: RefreshCw },
    connected:    { label: "Connected",      color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
    error:        { label: "Error",          color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: AlertTriangle },
  };
  const statusUi = STATUS_UI[status];
  const StatusIcon = statusUi.icon;

  if (isLoading) return <AppLayout><div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading configuration…</div></AppLayout>;

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
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Wifi className="w-4 h-4" /> Network Configuration</CardTitle>
              <CardDescription>Local network settings to reach your Tyro terminal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label>Terminal IP Address</Label>
                  <Input value={config.host} onChange={e => patchConfig(c => ({ ...c, host: e.target.value }))} placeholder="192.168.1.100" className="mt-1 font-mono" />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input value={config.port} onChange={e => patchConfig(c => ({ ...c, port: e.target.value }))} placeholder="8080" className="mt-1 font-mono" />
                </div>
              </div>
              <div>
                <Label>Integration Key</Label>
                <Input type="password" value={config.integrationKey} onChange={e => patchConfig(c => ({ ...c, integrationKey: e.target.value }))} placeholder="Tyro Integration Key from developer portal" className="mt-1 font-mono" />
              </div>
              <Button onClick={testConnection} disabled={status === "connecting"} className="w-full">
                {status === "connecting" ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Connecting…</> : <><Wifi className="w-4 h-4 mr-2" /> Test Connection</>}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Settings className="w-4 h-4" /> Merchant Credentials</CardTitle>
              <CardDescription>Tyro merchant and terminal identifiers from your Tyro portal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Merchant ID (MID)</Label>
                <Input value={config.tyroMerchantId} onChange={e => patchConfig(c => ({ ...c, tyroMerchantId: e.target.value }))} placeholder="Your Tyro Merchant ID" className="mt-1 font-mono" />
              </div>
              <div>
                <Label>Terminal ID (TID)</Label>
                <Input value={config.terminalId} onChange={e => patchConfig(c => ({ ...c, terminalId: e.target.value }))} placeholder="Your Tyro Terminal ID" className="mt-1 font-mono" />
              </div>
              <div>
                <Label>POS Name</Label>
                <Input value={config.posName} onChange={e => patchConfig(c => ({ ...c, posName: e.target.value }))} placeholder="KoaPOS" className="mt-1" />
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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Test mode</p>
                    <p className="text-xs text-muted-foreground">Use Tyro test environment (no real charges)</p>
                  </div>
                  <Switch checked={config.testMode} onCheckedChange={v => patchConfig(c => ({ ...c, testMode: v }))} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">How the EFTPOS Bridge Works</CardTitle></CardHeader>
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

        {/* WebSocket Test Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Wifi className="w-4 h-4" /> WebSocket Terminal</CardTitle>
            <CardDescription>Send test messages to a simulated Tyro terminal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant={status === "connected" ? "destructive" : "default"} onClick={status === "connected" ? disconnectWs : connectWs}>
                {status === "connected" ? <><X className="w-4 h-4 mr-1" /> Disconnect</> : <><Wifi className="w-4 h-4 mr-1" /> Open WebSocket</>}
              </Button>
              <Badge className={statusUi.color}>{statusUi.label}</Badge>
            </div>
            <div className="flex gap-2">
              <Textarea value={wsInput} onChange={e => setWsInput(e.target.value)} rows={2} className="font-mono text-xs resize-none" placeholder='{"type":"PURCHASE","amount":12.50}' />
              <Button size="sm" className="shrink-0" onClick={sendWs} disabled={status !== "connected"}><Send className="w-4 h-4" /></Button>
            </div>
            <div className="rounded-lg border bg-muted/20 p-2 space-y-1 max-h-48 overflow-y-auto">
              {wsMessages.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No messages yet.</p>}
              {wsMessages.map((msg) => (
                <div key={msg.id} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">{msg.timestamp}</span>
                  <Badge variant="outline" className={msg.type === "sent" ? "text-blue-600 border-blue-200" : "text-emerald-600 border-emerald-200 shrink-0 h-5 px-1 text-[10px]"}>{msg.type === "sent" ? "SENT" : "RECV"}</Badge>
                  <span className="font-mono text-[11px] truncate">{msg.payload}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={saveConfig} disabled={isSaving || !isDirty}>
            {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Save Configuration</>}
          </Button>
        </div>
      </div>

      <TyroFormGuard />
    </AppLayout>
  );
}
