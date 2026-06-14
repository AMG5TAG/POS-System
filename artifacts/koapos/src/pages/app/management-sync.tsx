import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  RefreshCw, Cloud, Users, Loader2, Plug, CheckCircle2, DatabaseBackup, FolderSync,
  Clock, FolderUp, ShieldCheck, Lightbulb, Save,
} from "lucide-react";
import { useListIntegrations, useDisconnectIntegration } from "@workspace/api-client-react";
import { MicrosoftIcon, OneDriveIcon } from "@/components/provider-icons";
import { BackupSettingsPanel } from "./management-backup";
import {
  loadCustomerFilesCloudSettings, fetchCustomerFilesCloudSettings, putCustomerFilesCloudSettings,
  getLastCustomerSync, recordCustomerSync, formatRelativeTime,
  type CustomerFilesCloudSettings,
} from "@/lib/cloud-files-settings";

/* Minimal shape of an integration returned by GET /integrations. */
interface SyncIntegration {
  key: string;
  label: string;
  description: string;
  status: "connected" | "disconnected";
  accountHandle: string | null;
  oauthConfigured: boolean | null;
}

/* ── Brand logos (simple-icons CDN) ──────────────────────────────────────── */
const SI = (slug: string, hex: string) => `https://cdn.simpleicons.org/${slug}/${hex}`;
// `src` => simple-icons CDN <img>; `node` => inline SVG (used where the CDN slug 404s, e.g. Microsoft).
const LOGOS: Record<string, { bg: string; src?: string; node?: React.ReactNode }> = {
  google_drive:       { bg: "bg-white border", src: SI("googledrive", "4285F4") },
  onedrive:           { bg: "bg-white border", node: <OneDriveIcon className="w-5 h-5" /> },
  dropbox:            { bg: "bg-[#0061FF]",     src: SI("dropbox",     "ffffff") },
  proton_drive:       { bg: "bg-[#6D4AFF]",     src: SI("proton",      "ffffff") },
  google_contacts:    { bg: "bg-white border", src: SI("google",      "4285F4") },
  microsoft_contacts: { bg: "bg-white border", node: <MicrosoftIcon className="w-5 h-5" /> },
  apple_account:      { bg: "bg-black",         src: SI("apple",       "ffffff") },
};

const ACCOUNT_KEYS = ["google_contacts", "microsoft_contacts", "apple_account"];
const STORAGE_KEYS = ["google_drive", "onedrive", "dropbox", "proton_drive"];
// Customer (contacts) sync is supported for Google & Microsoft accounts.
const CONTACT_SYNC_KEYS = new Set(["google_contacts", "microsoft_contacts"]);

function SyncCard({ intg, onConnect, onDisconnect, onSync, busy }: {
  intg: SyncIntegration;
  onConnect: (i: SyncIntegration) => void;
  onDisconnect: (i: SyncIntegration) => void;
  onSync?: (i: SyncIntegration) => void;
  busy: boolean;
}) {
  const logo = LOGOS[intg.key];
  const connected = intg.status === "connected";
  return (
    <div className="border rounded-xl p-4 flex flex-col gap-3 bg-card hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", logo?.bg)}>
          {logo?.node ?? (logo?.src && <img src={logo.src} alt="" className="w-5 h-5" />)}
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{intg.label}</p>
          {connected && intg.accountHandle && (
            <p className="text-xs text-muted-foreground truncate">{intg.accountHandle}</p>
          )}
        </div>
        {connected && (
          <Badge className="ml-auto shrink-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{intg.description}</p>
      <div className="flex items-center gap-2 mt-auto">
        {connected ? (
          <>
            {onSync && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onSync(intg)}>
                <RefreshCw className="w-3.5 h-3.5" /> Sync
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive ml-auto" onClick={() => onDisconnect(intg)}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" className="gap-1.5" onClick={() => onConnect(intg)} disabled={busy || intg.oauthConfigured === false}>
            <Plug className="w-3.5 h-3.5" /> Connect
          </Button>
        )}
      </div>
      {!connected && intg.oauthConfigured === false && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">Provider credentials not configured yet.</p>
      )}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

/**
 * Platform-user control for mirroring every customer file upload to a folder on
 * a connected cloud storage provider. When off, we encourage turning it on for
 * backup, security and storage optimisation. When on, the customer file-upload
 * flow reads these settings and routes each upload to the chosen folder.
 */
function CustomerFilesCloudPanel({ storages }: { storages: SyncIntegration[] }) {
  const connected = storages.filter((s) => s.status === "connected");
  // Seed from the localStorage cache for an instant first paint, then refresh
  // from the server (the source of truth) on mount.
  const [settings, setSettings] = useState<CustomerFilesCloudSettings>(() => loadCustomerFilesCloudSettings());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCustomerFilesCloudSettings()
      .then((s) => { setSettings(s); setDirty(false); })
      .catch(() => { /* keep cached values */ });
  }, []);

  const update = (patch: Partial<CustomerFilesCloudSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setDirty(true);
  };

  const selectedConnected = connected.find((s) => s.key === settings.storageKey);
  const canSave =
    !settings.enabled || (!!selectedConnected && settings.folder.trim().length > 0);

  const handleSave = async () => {
    if (!canSave) {
      toast.error(
        !selectedConnected
          ? "Choose a connected cloud storage first"
          : "Enter a destination folder",
      );
      return;
    }
    const next = { ...settings, folder: settings.folder.trim() };
    setSaving(true);
    try {
      await putCustomerFilesCloudSettings(next);
      setSettings(next);
      setDirty(false);
      toast.success(
        next.enabled
          ? `Customer files will sync to ${selectedConnected?.label} › ${next.folder}`
          : "Customer file cloud sync turned off",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      {/* Toggle header */}
      <div className="flex items-start gap-3 p-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FolderUp className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Save all customer files to the cloud</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automatically copy every file uploaded to a customer into a folder on your
            chosen cloud storage.
          </p>
        </div>
        <Switch
          className="mt-1"
          checked={settings.enabled}
          onCheckedChange={(v) => update({ enabled: v })}
        />
      </div>

      {settings.enabled ? (
        <div className="border-t px-4 py-4 space-y-4 bg-muted/20">
          {connected.length === 0 ? (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <Cloud className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Connect a cloud storage provider below first — then pick it here as the
                destination for customer files.
              </span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Cloud storage</Label>
                  <Select value={settings.storageKey} onValueChange={(v) => update({ storageKey: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a connected storage" />
                    </SelectTrigger>
                    <SelectContent>
                      {connected.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}{s.accountHandle ? ` — ${s.accountHandle}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Destination folder</Label>
                  <Input
                    placeholder="e.g. KoaPOS/Customer Files"
                    value={settings.folder}
                    onChange={(e) => update({ folder: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Files uploaded to any customer will be copied to{" "}
                <span className="font-medium">
                  {selectedConnected?.label ?? "your storage"}
                  {settings.folder.trim() ? ` › ${settings.folder.trim()}` : ""}
                </span>
                . Existing files aren&apos;t moved.
              </p>
            </>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />} Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t px-4 py-3 bg-muted/20">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <p>
              <span className="font-medium text-foreground">Recommended.</span> Turning this on
              keeps an off-site copy of every customer file for{" "}
              <span className="font-medium">backup &amp; disaster recovery</span>, adds a layer of{" "}
              <span className="font-medium">security</span>, and{" "}
              <span className="font-medium">optimises</span> local storage. Your current upload
              flow is unchanged until you enable it.
            </p>
          </div>
          {dirty && (
            <div className="flex justify-end mt-3">
              <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />} Save
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ManagementSyncPage() {
  const [location] = useLocation();
  const { data: raw, refetch } = useListIntegrations({ query: { queryKey: ["integrations"] } });
  const all = (raw ?? []) as unknown as SyncIntegration[];
  const disconnectMutation = useDisconnectIntegration();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  /* Sync Contacts dialog */
  const [syncTarget, setSyncTarget] = useState<SyncIntegration | null>(null);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [notesConflict, setNotesConflict] = useState<"append" | "overwrite">("append");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(() => getLastCustomerSync());

  /* OAuth callback lands back here (?success=/?error=) for sync integrations. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    if (success) {
      toast.success(`${all.find((i) => i.key === success)?.label ?? success} connected successfully`);
      refetch();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      if (error.endsWith("_oauth_not_configured")) toast.error("OAuth credentials not configured — see .env.example.");
      else if (error.endsWith("_oauth_denied")) toast.error("OAuth authorisation was cancelled.");
      else toast.error("Failed to connect.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, all.length]);

  const byKey = (k: string) => all.find((i) => i.key === k);
  const accounts = ACCOUNT_KEYS.map(byKey).filter(Boolean) as SyncIntegration[];
  const storage = STORAGE_KEYS.map(byKey).filter(Boolean) as SyncIntegration[];

  const connect = (intg: SyncIntegration) => {
    // apple_account uses the named /apple/start route (form_post callback).
    window.location.href = intg.key === "apple_account"
      ? "/api/integrations/oauth/apple/start"
      : `/api/integrations/oauth/${intg.key}/start`;
  };

  const disconnect = (intg: SyncIntegration) => {
    if (!confirm(`Disconnect ${intg.label}? This removes the stored tokens.`)) return;
    setBusyKey(intg.key);
    disconnectMutation.mutate({ key: intg.key }, {
      onSuccess: () => { toast.success(`${intg.label} disconnected`); refetch(); },
      onError: () => toast.error("Failed to disconnect"),
      onSettled: () => setBusyKey(null),
    });
  };

  const runContactSync = async () => {
    if (!syncTarget) return;
    setSyncing(true);
    try {
      const r = await fetch("/api/integrations/contacts/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: syncTarget.key, includeNotes, notesConflict }),
      });
      const data = await r.json() as { ok?: boolean; synced?: number; failed?: number; message?: string; error?: string };
      if (r.ok && data.ok) {
        const failMsg = (data.failed ?? 0) > 0 ? `, ${data.failed} failed` : "";
        toast.success(data.message ?? `Synced ${data.synced} contacts${failMsg}`);
        recordCustomerSync(syncTarget.label);
        setLastSync(getLastCustomerSync());
        setSyncTarget(null);
      } else {
        toast.error(data.error ?? "Contact sync failed");
      }
    } catch {
      toast.error("Contact sync request failed — please try again");
    } finally {
      setSyncing(false);
    }
  };

  const openSync = (i: SyncIntegration) => { setSyncTarget(i); setIncludeNotes(false); setNotesConflict("append"); };

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-10">
        <div className="flex items-center gap-3">
          <FolderSync className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Sync</h1>
            <p className="text-sm text-muted-foreground">Everything that syncs — customers, cloud backups, and cloud files — in one place.</p>
          </div>
        </div>

        {/* ── Customer Sync ── */}
        <section>
          <SectionHeader icon={Users} title="Customer Sync"
            desc="Connect an account to sync your customer list to its contacts and push appointments to its calendar." />
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>
              Customers last synced:{" "}
              <span className="font-medium text-foreground">{formatRelativeTime(lastSync?.at)}</span>
              {lastSync?.provider ? ` to ${lastSync.provider}` : ""}
              {lastSync?.at ? ` · ${new Date(lastSync.at).toLocaleString()}` : ""}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((i) => (
              <SyncCard key={i.key} intg={i} busy={busyKey === i.key}
                onConnect={connect} onDisconnect={disconnect}
                onSync={CONTACT_SYNC_KEYS.has(i.key) ? openSync : undefined} />
            ))}
          </div>
        </section>

        {/* ── Cloud Backup ── */}
        <section>
          <SectionHeader icon={DatabaseBackup} title="Cloud Backup"
            desc="Encrypted, scheduled backups of your POS data to the cloud destinations you choose." />
          <BackupSettingsPanel />
        </section>

        {/* ── Cloud Files & Folders ── */}
        <section>
          <SectionHeader icon={Cloud} title="Cloud Files & Folders"
            desc="Connect cloud storage to send files, reports and backups to OneDrive, Google Drive or Dropbox." />
          <CustomerFilesCloudPanel storages={storage} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {storage.map((i) => (
              <SyncCard key={i.key} intg={i} busy={busyKey === i.key}
                onConnect={connect} onDisconnect={disconnect} />
            ))}
          </div>
        </section>
      </div>

      {/* ── Sync Contacts dialog ── */}
      <Dialog open={!!syncTarget} onOpenChange={(o) => { if (!o) setSyncTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="w-4 h-4" /> Sync Contacts to {syncTarget?.label}</DialogTitle>
            <DialogDescription>
              Push your KoaPOS customers to {syncTarget?.key === "google_contacts" ? "Google Contacts" : "Microsoft Contacts"}.
              Existing contacts are not de-duplicated — re-syncing creates additional entries.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Include customer notes</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {syncTarget?.key === "google_contacts" ? "Maps to Google Contacts → About" : "Maps to Outlook Contact → Notes"}
                </p>
              </div>
              <Switch checked={includeNotes} onCheckedChange={setIncludeNotes} />
            </div>
            {includeNotes && (
              <div className="space-y-1.5 pl-4 border-l-2 border-muted">
                <Label className="text-xs font-medium text-muted-foreground">Notes conflict</Label>
                <Select value={notesConflict} onValueChange={(v) => setNotesConflict(v as "append" | "overwrite")}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="append">Append all notes (newest first)</SelectItem>
                    <SelectItem value="overwrite">Most recent note only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSyncTarget(null)} disabled={syncing}>Cancel</Button>
            <Button disabled={syncing} onClick={runContactSync}>
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Users className="w-3.5 h-3.5 mr-1.5" />}
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
