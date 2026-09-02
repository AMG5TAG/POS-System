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
  Clock, FolderUp, ShieldCheck, Lightbulb, Save, CalendarClock, AlertTriangle,
} from "lucide-react";
import { useListIntegrations, useDisconnectIntegration } from "@workspace/api-client-react";
import { MicrosoftIcon, OneDriveIcon, NextcloudIcon } from "@/components/provider-icons";
import { NextcloudConnectModal } from "@/components/nextcloud-connect-modal";
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
  nextcloud:          { bg: "bg-white border", node: <NextcloudIcon className="w-5 h-5" /> },
  google_contacts:    { bg: "bg-white border", src: SI("google",      "4285F4") },
  microsoft_contacts: { bg: "bg-white border", node: <MicrosoftIcon className="w-5 h-5" /> },
  apple_icloud:       { bg: "bg-black",         src: SI("apple",       "ffffff") },
};

const ACCOUNT_KEYS = ["google_contacts", "microsoft_contacts", "apple_icloud"];
const STORAGE_KEYS = ["google_drive", "onedrive", "dropbox", "nextcloud"];
// Customer (contacts) + calendar sync — Google & Microsoft (OAuth) and Apple iCloud (CalDAV/CardDAV).
const CONTACT_SYNC_KEYS = new Set(["google_contacts", "microsoft_contacts", "apple_icloud"]);
// Apple connects via an Apple ID + app-specific password form, not an OAuth redirect.
const CREDENTIALS_KEYS = new Set(["apple_icloud"]);
// Nextcloud is self-hosted: the merchant's own server issues the credential via
// Login Flow v2, so it uses its own dialog rather than an OAuth redirect.
const LOGIN_FLOW_KEYS = new Set(["nextcloud"]);
/* Fallback names for sync accounts, so a saved-but-now-disconnected provider is
   still described in words rather than as a raw key like "microsoft_contacts". */
const ACCOUNT_LABELS: Record<string, string> = {
  google_contacts:    "Google Account",
  microsoft_contacts: "Microsoft Account",
  apple_icloud:       "Apple iCloud",
};

function SyncCard({ intg, onConnect, onDisconnect, onSync, onSyncCalendar, calendarBusy, busy }: {
  intg: SyncIntegration;
  onConnect: (i: SyncIntegration) => void;
  onDisconnect: (i: SyncIntegration) => void;
  onSync?: (i: SyncIntegration) => void;
  onSyncCalendar?: (i: SyncIntegration) => void;
  calendarBusy?: boolean;
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
                <RefreshCw className="w-3.5 h-3.5" /> Contacts
              </Button>
            )}
            {onSyncCalendar && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onSyncCalendar(intg)} disabled={calendarBusy}>
                {calendarBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />} Calendar
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

/* Automatic sync schedule for contacts + calendar. */
const AUTO_FREQUENCIES: { value: string; label: string }[] = [
  { value: "disabled", label: "Off" },
  { value: "instant", label: "Instant (on change)" },
  { value: "8h", label: "Every 8 hours" },
  { value: "24h", label: "Every 24 hours" },
  { value: "monthly", label: "Monthly" },
];

interface SyncTypeState { provider: string; frequency: string; lastSyncAt: string | null; lastError?: string | null; lastErrorAt?: string | null }
interface AutoSyncState {
  contacts: SyncTypeState & { includeNotes: boolean };
  calendar: SyncTypeState;
}

function AutoSyncPanel({ accounts }: { accounts: SyncIntegration[] }) {
  const [state, setState] = useState<AutoSyncState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/integrations/auto-sync", { credentials: "include" })
      .then((r) => r.json())
      .then((d: AutoSyncState) => {
        setState({ contacts: d.contacts, calendar: d.calendar });
        // Notify the merchant if the most recent automatic sync failed and hasn't
        // yet recovered — the run happens in the background, so this screen is the
        // only place the failure surfaces.
        if (d.contacts?.lastError) toast.error(`Automatic contacts sync failed: ${d.contacts.lastError}`);
        if (d.calendar?.lastError) toast.error(`Automatic calendar sync failed: ${d.calendar.lastError}`);
      })
      .catch(() => { /* leave hidden */ });
  }, []);

  if (!state) return null;

  const hasAccounts = accounts.length > 0;
  const defaultProvider = accounts[0]?.key ?? "";
  const accountLabel = (key: string) => accounts.find((a) => a.key === key)?.label ?? ACCOUNT_LABELS[key] ?? key;
  const isConnected = (key: string) => accounts.some((a) => a.key === key);
  /* The account a schedule will actually target. A saved provider that is no
     longer connected (the merchant switched accounts) can't be honoured, so the
     UI shows — and saves — the first connected account instead of silently
     keeping a dead target that fails on every run. */
  const effectiveProvider = (key: string) => (isConnected(key) ? key : defaultProvider);
  /* A saved target that's no longer connected: name it so the merchant knows
     why automatic sync is failing and what to change. */
  const staleProvider = (s: SyncTypeState) =>
    s.frequency !== "disabled" && s.provider && !isConnected(s.provider) ? s.provider : null;
  /* True when a schedule points at a disconnected account and there is a
     connected one to move it to — Save alone is enough to repair it. */
  const needsRepoint = hasAccounts && Boolean(staleProvider(state.contacts) || staleProvider(state.calendar));

  const update = (patch: Partial<AutoSyncState>) => { setState((s) => ({ ...s!, ...patch })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/integrations/auto-sync", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: {
            provider: state.contacts.frequency === "disabled" ? state.contacts.provider : effectiveProvider(state.contacts.provider),
            frequency: state.contacts.frequency,
            includeNotes: state.contacts.includeNotes,
          },
          calendar: {
            provider: state.calendar.frequency === "disabled" ? state.calendar.provider : effectiveProvider(state.calendar.provider),
            frequency: state.calendar.frequency,
          },
        }),
      });
      const d = await r.json() as { ok?: boolean; error?: string; contacts?: AutoSyncState["contacts"]; calendar?: AutoSyncState["calendar"] };
      if (r.ok && d.ok && d.contacts && d.calendar) {
        setState({ contacts: d.contacts, calendar: d.calendar });
        setDirty(false);
        toast.success("Automatic sync settings saved");
      } else {
        toast.error(d.error ?? "Failed to save automatic sync settings");
      }
    } catch {
      toast.error("Failed to save automatic sync settings");
    } finally {
      setSaving(false);
    }
  };

  /* Never freeze the picker while accounts exist: with a single connected
     account it still has to be usable to move a schedule off a stale target. */
  const providerSelect = (value: string, onChange: (v: string) => void, disabled: boolean) => (
    <Select value={effectiveProvider(value)} onValueChange={onChange} disabled={disabled || !hasAccounts}>
      <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue placeholder="Account" /></SelectTrigger>
      <SelectContent>
        {accounts.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  /* Persistent failure notice for a sync kind whose last automatic run errored,
     plus a pointer when the saved target account is no longer connected — the
     usual cause of a run that fails over and over. */
  const failureBanner = (s: SyncTypeState) => {
    const stale = staleProvider(s);
    if (!s.lastError && !stale) return null;
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div>
          {s.lastError && (
            <>
              <p className="font-medium">Last automatic sync failed{s.lastErrorAt ? ` · ${formatRelativeTime(s.lastErrorAt)}` : ""}</p>
              <p className="text-destructive/90">{s.lastError}</p>
            </>
          )}
          {stale && (
            <p className="text-destructive/90">
              This schedule is still set to <span className="font-medium">{accountLabel(stale)}</span>, which isn&apos;t connected
              {hasAccounts ? <> — it will sync to <span className="font-medium">{accountLabel(defaultProvider)}</span> once you save.</> : <>. Connect an account above to resume.</>}
            </p>
          )}
        </div>
      </div>
    );
  };

  const freqSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onValueChange={onChange} disabled={!hasAccounts}>
      <SelectTrigger className="h-8 text-xs w-[170px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {AUTO_FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="mt-4 border rounded-xl bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Automatic sync</h3>
        <span className="text-xs text-muted-foreground">Keep contacts &amp; calendar in sync on a schedule.</span>
      </div>

      {!hasAccounts && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Connect a Google, Microsoft, or Apple account above to enable automatic sync.</p>
      )}

      {/* Contacts row */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        <div className="min-w-[120px]">
          <p className="text-sm font-medium">Contacts</p>
          <p className="text-[11px] text-muted-foreground">Last: {formatRelativeTime(state.contacts.lastSyncAt ?? undefined)}</p>
        </div>
        {providerSelect(state.contacts.provider, (v) => update({ contacts: { ...state.contacts, provider: v } }), state.contacts.frequency === "disabled")}
        {freqSelect(state.contacts.frequency, (v) => update({ contacts: { ...state.contacts, frequency: v } }))}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={state.contacts.includeNotes} onCheckedChange={(c) => update({ contacts: { ...state.contacts, includeNotes: c } })} disabled={!hasAccounts || state.contacts.frequency === "disabled"} />
          Include notes
        </label>
        <div className="basis-full">{failureBanner(state.contacts)}</div>
      </div>

      {/* Calendar row */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        <div className="min-w-[120px]">
          <p className="text-sm font-medium">Calendar</p>
          <p className="text-[11px] text-muted-foreground">Last: {formatRelativeTime(state.calendar.lastSyncAt ?? undefined)}</p>
        </div>
        {providerSelect(state.calendar.provider, (v) => update({ calendar: { ...state.calendar, provider: v } }), state.calendar.frequency === "disabled")}
        {freqSelect(state.calendar.frequency, (v) => update({ calendar: { ...state.calendar, frequency: v } }))}
        <div className="basis-full">{failureBanner(state.calendar)}</div>
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <p className="text-[11px] text-muted-foreground">
          {(state.contacts.frequency === "instant" || state.calendar.frequency === "instant")
            ? `Instant syncs run shortly after a customer or appointment changes, pushing to ${accountLabel(effectiveProvider(state.contacts.provider))}.`
            : "Automatic contact syncs overwrite existing matches to stay current."}
        </p>
        {/* A stale target is fixable with a plain Save (it repoints to a connected
            account), so allow saving even when the merchant hasn't edited anything. */}
        <Button size="sm" onClick={save} disabled={saving || (!dirty && !needsRepoint)}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          Save
        </Button>
      </div>
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
  /* Duplicate-overwrite warning (set when the first sync pass detects matches). */
  const [dupWarning, setDupWarning] = useState<{ duplicates: number; total: number; message: string } | null>(null);

  /* Calendar push (appointments → connected account's calendar) */
  const [calendarBusyKey, setCalendarBusyKey] = useState<string | null>(null);

  /* Apple iCloud connect form (Apple ID + app-specific password) */
  const [appleConnectOpen, setAppleConnectOpen] = useState(false);

  /* Nextcloud connect (server address → approve on their server → app password) */
  const [nextcloudConnectOpen, setNextcloudConnectOpen] = useState(false);

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
    // Apple iCloud connects via a credentials form (Apple ID + app-specific password).
    if (CREDENTIALS_KEYS.has(intg.key)) { setAppleConnectOpen(true); return; }
    if (LOGIN_FLOW_KEYS.has(intg.key)) { setNextcloudConnectOpen(true); return; }
    window.location.href = `/api/integrations/oauth/${intg.key}/start`;
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

  const runContactSync = async (duplicateStrategy?: "overwrite" | "skip") => {
    if (!syncTarget) return;
    setSyncing(true);
    try {
      const r = await fetch("/api/integrations/contacts/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: syncTarget.key, includeNotes, notesConflict, ...(duplicateStrategy ? { duplicateStrategy } : {}) }),
      });
      const data = await r.json() as { ok?: boolean; synced?: number; failed?: number; message?: string; error?: string; needsConfirmation?: boolean; duplicates?: number; total?: number };
      if (r.ok && data.ok && data.needsConfirmation) {
        // Existing contacts matched — warn before overwriting.
        setDupWarning({ duplicates: data.duplicates ?? 0, total: data.total ?? 0, message: data.message ?? "" });
      } else if (r.ok && data.ok) {
        const failMsg = (data.failed ?? 0) > 0 ? `, ${data.failed} failed` : "";
        toast.success(data.message ?? `Synced ${data.synced} contacts${failMsg}`);
        recordCustomerSync(syncTarget.label);
        setLastSync(getLastCustomerSync());
        setDupWarning(null);
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

  const runCalendarSync = async (intg: SyncIntegration) => {
    setCalendarBusyKey(intg.key);
    try {
      const r = await fetch("/api/integrations/calendar/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: intg.key }),
      });
      const data = await r.json() as { ok?: boolean; synced?: number; failed?: number; message?: string; error?: string };
      if (r.ok && data.ok) {
        toast.success(data.message ?? `Synced ${data.synced} appointments`);
      } else {
        toast.error(data.error ?? "Calendar sync failed");
      }
    } catch {
      toast.error("Calendar sync request failed — please try again");
    } finally {
      setCalendarBusyKey(null);
    }
  };

  const openSync = (i: SyncIntegration) => { setSyncTarget(i); setIncludeNotes(false); setNotesConflict("append"); setDupWarning(null); };

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
                onSync={CONTACT_SYNC_KEYS.has(i.key) ? openSync : undefined}
                onSyncCalendar={CONTACT_SYNC_KEYS.has(i.key) ? runCalendarSync : undefined}
                calendarBusy={calendarBusyKey === i.key} />
            ))}
          </div>
          <AutoSyncPanel accounts={accounts.filter((a) => CONTACT_SYNC_KEYS.has(a.key) && a.status === "connected")} />
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
            desc="Connect cloud storage to send files, reports and backups to OneDrive, Google Drive, Dropbox or your own Nextcloud." />
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
              {(() => {
                const dest = syncTarget?.key === "google_contacts" ? "Google Contacts"
                  : syncTarget?.key === "apple_icloud" ? "iCloud Contacts"
                  : "Microsoft Contacts";
                const isApple = syncTarget?.key === "apple_icloud";
                return `Push your KoaPOS customers to ${dest}. ${isApple
                  ? "Re-syncing updates the same contacts instead of creating duplicates."
                  : "Contacts that already exist (matched by email) are detected — you'll be warned before any are overwritten."}`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Include customer notes</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {syncTarget?.key === "google_contacts" ? "Maps to Google Contacts → About"
                    : syncTarget?.key === "apple_icloud" ? "Maps to the contact’s Notes field in iCloud"
                    : "Maps to Outlook Contact → Notes"}
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
            <Button disabled={syncing} onClick={() => runContactSync()}>
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Users className="w-3.5 h-3.5 mr-1.5" />}
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Duplicate overwrite warning ── */}
      <Dialog open={!!dupWarning} onOpenChange={(o) => { if (!o) setDupWarning(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" /> Duplicate contacts found
            </DialogTitle>
            <DialogDescription>
              {dupWarning?.message ?? `${dupWarning?.duplicates} existing contact(s) match your customers.`}
              {" "}Overwriting replaces their current name, email, phone{includeNotes ? " and notes" : ""} in {syncTarget?.label}. Skipping leaves them unchanged and only adds new contacts.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDupWarning(null)} disabled={syncing}>Cancel</Button>
            <Button variant="outline" onClick={() => runContactSync("skip")} disabled={syncing}>
              Skip duplicates
            </Button>
            <Button variant="destructive" onClick={() => runContactSync("overwrite")} disabled={syncing}>
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />}
              Overwrite {dupWarning?.duplicates ?? ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Apple iCloud connect (Apple ID + app-specific password) ── */}
      <AppleConnectModal
        open={appleConnectOpen}
        onClose={() => setAppleConnectOpen(false)}
        onConnected={() => { setAppleConnectOpen(false); refetch(); toast.success("Apple iCloud connected"); }}
      />

      {/* ── Nextcloud connect (Login Flow v2) ── */}
      <NextcloudConnectModal
        open={nextcloudConnectOpen}
        onClose={() => setNextcloudConnectOpen(false)}
        onConnected={(handle) => {
          setNextcloudConnectOpen(false);
          refetch();
          toast.success(handle ? `Nextcloud connected (${handle})` : "Nextcloud connected");
        }}
      />
    </AppLayout>
  );
}

/* Connect an Apple/iCloud account for Contacts + Calendar sync. Apple has no
   OAuth sync API, so the merchant supplies their Apple ID and an app-specific
   password; the server verifies it against iCloud CalDAV/CardDAV before storing. */
function AppleConnectModal({ open, onClose, onConnected }: { open: boolean; onClose: () => void; onConnected: () => void }) {
  const [appleId, setAppleId] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setAppleId(""); setAppPassword(""); setSaving(false); } }, [open]);

  const save = async () => {
    if (!appleId.trim() || !appPassword.trim()) { toast.error("Enter your Apple ID and app-specific password"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/integrations/apple_icloud/connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appleId: appleId.trim(), appPassword: appPassword.trim() }),
      });
      const data = await r.json().catch(() => ({})) as { error?: string };
      if (r.ok) { onConnected(); }
      else { toast.error(data.error ?? "Couldn't connect this Apple account."); }
    } catch {
      toast.error("Connection request failed — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
              <img src={SI("apple", "ffffff")} alt="" className="w-4 h-4" />
            </span>
            Connect Apple iCloud
          </DialogTitle>
          <DialogDescription>
            Syncs customers to iCloud Contacts and pushes appointments to Apple Calendar. Apple requires an
            {" "}<span className="font-medium text-foreground">app-specific password</span> (not your normal password).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="appleId">Apple ID (email)</Label>
            <Input id="appleId" type="text" autoComplete="off" placeholder="you@icloud.com"
              value={appleId} onChange={(e) => setAppleId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appPassword">App-specific password</Label>
            <Input id="appPassword" type="password" autoComplete="off" placeholder="xxxx-xxxx-xxxx-xxxx"
              value={appPassword} onChange={(e) => setAppPassword(e.target.value)} />
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
            <p className="flex items-center gap-1.5 font-medium text-foreground"><ShieldCheck className="w-3.5 h-3.5" /> How to create one</p>
            <p>
              Sign in at{" "}
              <a href="https://appleid.apple.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">appleid.apple.com</a>{" "}
              → Sign-In &amp; Security → App-Specific Passwords → generate one for “KoaPOS”, then paste it above. Requires two-factor authentication.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />} Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

