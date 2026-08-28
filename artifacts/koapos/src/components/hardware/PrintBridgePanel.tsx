import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Link2, Link2Off, Loader2, Network, Plus, Printer, RefreshCw, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_ROUTING, PRINTER_MODELS, PRINT_PURPOSES, paperFamily,
  type HardwareCfg, type PrinterPaper, type PrinterProfile, type PrinterTransport, type PrintPurpose,
} from "@/lib/hardware-config";
import {
  DEFAULT_BRIDGE_URL, getBridgeUrl, getPrinterOverrides, pairBridge, probeBridge,
  setBridgeUrl, setPrinterOverride, unpairBridge, type BridgeStatus,
} from "@/lib/print-bridge";

/**
 * Hardware settings for the KoaPOS Print Bridge and per-purpose printer routing.
 *
 * The bridge is the local service that lets the browser print to a *named*
 * printer with no OS print dialog. Without it the app can only print silently to
 * a USB/serial ESC/POS receipt printer; with it, every document type can be sent
 * to its own printer.
 *
 * The split of settings matters: printer *profiles* and the purpose→profile
 * routing are merchant-level (saved in `pos_settings.hardwareConfig`, shared by
 * every till), while the bridge URL, the pairing token and any queue-name
 * override are device-local (localStorage), because Windows queue names differ
 * from machine to machine.
 */

const TRANSPORT_LABELS: Record<PrinterTransport, string> = {
  usb: "USB (ESC/POS, WebUSB)",
  serial: "Serial / RS-232 (Web Serial)",
  bridge: "Print Bridge (named printer, silent)",
  network: "Network / LAN",
  system: "System print dialog",
};

const PAPER_LABELS: Record<PrinterPaper, string> = {
  "80mm": "80mm thermal roll",
  "58mm": "58mm thermal roll",
  a4: "A4 / paper",
  label: "Label roll (DYMO etc.)",
};

const BROWSER_ROUTE = "__browser__";

/** Poll the bridge and expose a manual refresh. */
export function useBridgeStatus(enabled: boolean) {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await probeBridge());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) { setStatus(null); return; }
    void refresh();
  }, [enabled, refresh]);

  return { status, checking, refresh };
}

/* ─── Print Bridge card ─────────────────────────────────────────────────────── */

export function PrintBridgeCard({
  hw,
  onChange,
  status,
  checking,
  refresh,
}: {
  hw: HardwareCfg;
  onChange: (patch: Partial<HardwareCfg>) => void;
  status: BridgeStatus | null;
  checking: boolean;
  refresh: () => Promise<void>;
}) {
  const [url, setUrl] = useState(getBridgeUrl());
  const [pairing, setPairing] = useState(false);

  const saveUrl = () => {
    setBridgeUrl(url || DEFAULT_BRIDGE_URL);
    setUrl(getBridgeUrl());
    void refresh();
  };

  const pair = async () => {
    setPairing(true);
    try {
      await pairBridge();
      await refresh();
      toast.success("This device is now paired with the print bridge");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pairing failed");
    } finally {
      setPairing(false);
    }
  };

  const unpair = async () => {
    unpairBridge();
    await refresh();
    toast.success("This device is no longer paired");
  };

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4 border-b bg-muted/20">
        <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
          <Link2 className="w-4 h-4 text-violet-700 dark:text-violet-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">Print Bridge</p>
          <p className="text-xs text-muted-foreground">Silent printing to named printers, no Windows print dialog</p>
        </div>
        <Switch checked={hw.bridge.enabled} onCheckedChange={(v) => onChange({ bridge: { ...hw.bridge, enabled: v } })} />
      </div>

      {hw.bridge.enabled && (
        <div className="px-5 py-4 space-y-4">
          <BridgeStatusLine status={status} checking={checking} />

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">Bridge address (this device)</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={saveUrl}
                placeholder={DEFAULT_BRIDGE_URL}
                className="mt-1 font-mono text-xs"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void refresh()} disabled={checking}>
              {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Check
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {status?.paired ? (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void unpair()}>
                <Link2Off className="w-3.5 h-3.5" /> Unpair this device
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => void pair()}
                disabled={pairing || !status?.reachable || !status?.originAllowed}
              >
                {pairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                Pair this device
              </Button>
            )}
          </div>

          {status?.reachable && status.originAllowed && !status.paired && !status.pairingOpen && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Pairing is closed on the bridge. On this computer, focus the KoaPOS Print Bridge window and press
              &quot;p&quot; (or restart it), then press Pair.
            </p>
          )}

          {status?.paired && status.printers.length > 0 && (
            <div className="rounded-lg border divide-y">
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                Printers this computer can see
              </div>
              {status.printers.map((p) => (
                <div key={p.name} className="flex items-center gap-2 px-4 py-2 text-sm">
                  {p.isNetwork
                    ? <Network className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    : <Printer className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.isNetwork && <Badge variant="outline" className="text-[10px]">Network</Badge>}
                  {p.isDefault && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                  {p.status && <span className="text-xs text-muted-foreground">{p.status}</span>}
                </div>
              ))}
            </div>
          )}

          {status?.paired && status.runningAsService && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              The bridge is running as a Windows service. Printers <strong>shared from another PC</strong> are
              connected per-user, so it can&apos;t see them — if a network label printer is missing from the list
              above, either install it here on a TCP/IP port (machine-wide) or run the bridge from the Startup
              folder instead of as a service.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            The bridge runs on this computer and only listens to itself — nothing on your network can reach it.
            Receipts and 80mm dockets go out as raw ESC/POS; A4 documents and labels are rendered and printed
            silently. Chrome or Edge required.
          </p>
        </div>
      )}
    </div>
  );
}

function BridgeStatusLine({ status, checking }: { status: BridgeStatus | null; checking: boolean }) {
  if (checking && !status) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Looking for the print bridge…
      </div>
    );
  }
  if (status?.paired) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>
          Connected — bridge v{status.version} on {status.platform}, {status.printers.length} printer
          {status.printers.length === 1 ? "" : "s"} available.
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{status?.error ?? "Print bridge not connected."}</span>
    </div>
  );
}

/* ─── Printers & routing card ───────────────────────────────────────────────── */

export function PrinterRoutingCard({
  hw,
  onChange,
  status,
}: {
  hw: HardwareCfg;
  onChange: (patch: Partial<HardwareCfg>) => void;
  status: BridgeStatus | null;
}) {
  // Device-local queue overrides live outside React state, so mirror them here
  // to re-render on change.
  const [overrides, setOverrides] = useState<Record<string, string>>(() => getPrinterOverrides());

  const patchProfile = (id: string, patch: Partial<PrinterProfile>) => {
    onChange({ printers: hw.printers.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };

  const addProfile = () => {
    const profile: PrinterProfile = {
      id: `printer-${Date.now().toString(36)}`,
      label: `Printer ${hw.printers.length + 1}`,
      transport: "bridge",
      paper: "a4",
      bridgePrinterName: "",
    };
    onChange({ printers: [...hw.printers, profile] });
  };

  const removeProfile = (id: string) => {
    // Drop the profile and every route that pointed at it, so no purpose is left
    // referencing a printer that no longer exists.
    const routing = { ...hw.routing };
    for (const [purpose, profileId] of Object.entries(routing)) {
      if (profileId === id) delete routing[purpose as PrintPurpose];
    }
    onChange({ printers: hw.printers.filter((p) => p.id !== id), routing });
  };

  const setOverride = (profileId: string, name: string) => {
    setPrinterOverride(profileId, name);
    setOverrides(getPrinterOverrides());
  };

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4 border-b bg-muted/20">
        <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/30">
          <Printer className="w-4 h-4 text-sky-700 dark:text-sky-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">Printers &amp; Routing</p>
          <p className="text-xs text-muted-foreground">Send each document type to its own printer</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={addProfile}>
          <Plus className="w-3.5 h-3.5" /> Add printer
        </Button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {hw.printers.length === 0 && (
          <p className="text-sm text-muted-foreground">No printers configured yet. Add one to start routing documents.</p>
        )}

        {hw.printers.map((profile) => (
          <div key={profile.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={profile.label}
                  onChange={(e) => patchProfile(profile.id, { label: e.target.value })}
                  className="mt-1"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-6 text-destructive hover:text-destructive"
                onClick={() => removeProfile(profile.id)}
                aria-label={`Remove ${profile.label}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Connection</Label>
                <Select
                  value={profile.transport}
                  onValueChange={(v) => patchProfile(profile.id, { transport: v as PrinterTransport })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TRANSPORT_LABELS) as PrinterTransport[]).map((t) => (
                      <SelectItem key={t} value={t}>{TRANSPORT_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Paper</Label>
                <Select
                  value={profile.paper}
                  onValueChange={(v) => patchProfile(profile.id, { paper: v as PrinterPaper })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAPER_LABELS) as PrinterPaper[]).map((p) => (
                      <SelectItem key={p} value={p}>{PAPER_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(profile.paper === "80mm" || profile.paper === "58mm") && (
              <div>
                <Label className="text-xs">Printer model</Label>
                <Select
                  value={profile.model ?? "generic-80"}
                  onValueChange={(v) => patchProfile(profile.id, { model: v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRINTER_MODELS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {profile.transport === "bridge" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <QueueSelect
                  label="Printer queue (all tills)"
                  value={profile.bridgePrinterName ?? ""}
                  onChange={(v) => patchProfile(profile.id, { bridgePrinterName: v })}
                  status={status}
                  emptyLabel="This computer's default printer"
                />
                <QueueSelect
                  label="Override on this till only"
                  value={overrides[profile.id] ?? ""}
                  onChange={(v) => setOverride(profile.id, v)}
                  status={status}
                  emptyLabel="Use the shared setting"
                />
              </div>
            )}

            {profile.transport === "network" && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">IP Address</Label>
                    <Input
                      placeholder="192.168.1.100"
                      value={profile.ipAddress ?? ""}
                      onChange={(e) => patchProfile(profile.id, { ipAddress: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Port</Label>
                    <Input
                      placeholder="9100"
                      value={profile.port ?? ""}
                      onChange={(e) => patchProfile(profile.id, { port: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  A browser can&apos;t open a socket to a LAN printer, so this still prints through the system dialog.
                  Install the printer on this computer and use the Print Bridge for silent LAN printing.
                </p>
              </div>
            )}

            {profile.transport === "bridge" && !status?.paired && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Pair the Print Bridge above before this printer can be used — until then these documents fall back to
                the system print dialog.
              </p>
            )}

            {(profile.transport === "usb" || profile.transport === "serial") && (
              <p className="text-xs text-muted-foreground">
                Browser-native ESC/POS uses the printer granted in the Receipt Printer card above, so that card has to
                stay switched on and connected. To drive a second thermal printer, use the Print Bridge instead.
              </p>
            )}
          </div>
        ))}

        {/* ── Routing map ──────────────────────────────────────────────── */}
        <div className="rounded-lg border divide-y">
          <div className="px-4 py-2.5 bg-muted/30">
            <p className="text-sm font-medium">Document routing</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Anything left on the print dialog behaves exactly as it does today.
            </p>
          </div>
          {PRINT_PURPOSES.map((purpose) => {
            const routedId = hw.routing[purpose.id] ?? "";
            const routed = hw.printers.find((p) => p.id === routedId);
            const mismatch = routed ? paperFamily(purpose.paper) !== paperFamily(routed.paper) : false;
            return (
              <div key={purpose.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{purpose.label}</p>
                  <p className="text-xs text-muted-foreground">{purpose.hint}</p>
                </div>
                <div className="sm:w-72 shrink-0">
                  <Select
                    value={routedId || BROWSER_ROUTE}
                    onValueChange={(v) =>
                      onChange({
                        routing: { ...hw.routing, [purpose.id]: v === BROWSER_ROUTE ? "" : v },
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={BROWSER_ROUTE}>System print dialog</SelectItem>
                      {hw.printers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mismatch && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      {purpose.label} needs {PAPER_LABELS[purpose.paper].toLowerCase()}, but {routed?.label} is
                      loaded with {PAPER_LABELS[routed!.paper].toLowerCase()}.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ routing: { ...DEFAULT_ROUTING } })}
        >
          Reset routing to defaults
        </Button>
      </div>
    </div>
  );
}

function QueueSelect({
  label,
  value,
  onChange,
  status,
  emptyLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  status: BridgeStatus | null;
  emptyLabel: string;
}) {
  const printers = status?.printers ?? [];
  // A queue saved on another till won't be in this machine's list; keep it
  // selectable so opening settings here can't silently clear it.
  const options = value && !printers.some((p) => p.name === value)
    ? [{ name: value, isDefault: false }, ...printers]
    : printers;

  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value || BROWSER_ROUTE} onValueChange={(v) => onChange(v === BROWSER_ROUTE ? "" : v)}>
        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={BROWSER_ROUTE}>{emptyLabel}</SelectItem>
          {options.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
