import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetBackupConfig,
  useUpdateBackupConfig,
  useListBackups,
  useTriggerBackup,
  useRestoreBackup,
  useListIntegrations,
  getGetBackupConfigQueryKey,
  getListBackupsQueryKey,
  type BackupConfig,
  type BackupStorageDestination,
  type BackupStorageDestinationInput,
  type BackupConfigInputFrequency,
  type Backup,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  HardDrive,
  Cloud,
  Server,
  ShieldCheck,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  Lock,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  AlertTriangle,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { OneDriveIcon, NextcloudIcon } from "@/components/provider-icons";

type StorageType = "local" | "s3" | "gcs" | "sftp" | "onedrive" | "nextcloud";

const STORAGE_META: Record<
  StorageType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  local: { label: "Local server", icon: HardDrive },
  s3: { label: "Amazon S3", icon: Cloud },
  gcs: { label: "Google Cloud Storage", icon: Cloud },
  sftp: { label: "SFTP server", icon: Server },
  onedrive: { label: "OneDrive", icon: OneDriveIcon },
  nextcloud: { label: "Nextcloud", icon: NextcloudIcon },
};

/** Where Nextcloud archives land when the sub-folder is left blank. */
const NEXTCLOUD_DEFAULT_FOLDER = "KoaPOS/Backups";

const FREQUENCY_OPTIONS = [
  { value: "disabled", label: "Manual only (no schedule)" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

/* A destination row in the editor; mirrors BackupStorageDestination plus
   transient plaintext secret fields the user is typing. */
interface DestDraft {
  id: string;
  type: StorageType;
  directory: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  secretAccessKeySet: boolean;
  projectId: string;
  gcsBucket: string;
  serviceAccountJson: string;
  serviceAccountJsonSet: boolean;
  host: string;
  port: string;
  username: string;
  remotePath: string;
  password: string;
  passwordSet: boolean;
  folder: string;
}

function emptyDraft(type: StorageType): DestDraft {
  return {
    id: `new_${Math.random().toString(36).slice(2, 9)}`,
    type,
    directory: "",
    bucket: "",
    region: "",
    accessKeyId: "",
    secretAccessKey: "",
    secretAccessKeySet: false,
    projectId: "",
    gcsBucket: "",
    serviceAccountJson: "",
    serviceAccountJsonSet: false,
    host: "",
    port: "22",
    username: "",
    remotePath: "",
    password: "",
    passwordSet: false,
    folder: "",
  };
}

function toDraft(d: BackupStorageDestination): DestDraft {
  return {
    id: d.id,
    type: d.type,
    directory: d.directory ?? "",
    bucket: d.bucket ?? "",
    region: d.region ?? "",
    accessKeyId: d.accessKeyId ?? "",
    secretAccessKey: "",
    secretAccessKeySet: d.secretAccessKeySet ?? false,
    projectId: d.projectId ?? "",
    gcsBucket: d.gcsBucket ?? "",
    serviceAccountJson: "",
    serviceAccountJsonSet: d.serviceAccountJsonSet ?? false,
    host: d.host ?? "",
    port: d.port != null ? String(d.port) : "22",
    username: d.username ?? "",
    remotePath: d.remotePath ?? "",
    password: "",
    passwordSet: d.passwordSet ?? false,
    folder: d.folder ?? "",
  };
}

function draftToInput(d: DestDraft): BackupStorageDestinationInput {
  const base: BackupStorageDestinationInput = { id: d.id, type: d.type };
  if (d.type === "local") {
    if (d.directory) base.directory = d.directory;
  } else if (d.type === "s3") {
    if (d.bucket) base.bucket = d.bucket;
    if (d.region) base.region = d.region;
    if (d.accessKeyId) base.accessKeyId = d.accessKeyId;
    if (d.secretAccessKey) base.secretAccessKey = d.secretAccessKey;
  } else if (d.type === "gcs") {
    if (d.projectId) base.projectId = d.projectId;
    if (d.gcsBucket) base.gcsBucket = d.gcsBucket;
    if (d.serviceAccountJson) base.serviceAccountJson = d.serviceAccountJson;
  } else if (d.type === "sftp") {
    if (d.host) base.host = d.host;
    if (d.port) base.port = Number(d.port);
    if (d.username) base.username = d.username;
    if (d.remotePath) base.remotePath = d.remotePath;
    if (d.password) base.password = d.password;
  } else if (d.type === "onedrive" || d.type === "nextcloud") {
    if (d.folder) base.folder = d.folder;
  }
  return base;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Completed
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="destructive">
        <XCircle className="mr-1 h-3 w-3" /> Failed
      </Badge>
    );
  return (
    <Badge variant="secondary">
      <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Pending
    </Badge>
  );
}

/* ── Named backup schedules (multiple per merchant) ──────────────────────────── */

interface ScheduleItem {
  id: number;
  label: string;
  frequency: string;
  destinationIds: string[];
  enabled: boolean;
  lastBackupAt: string | null;
}

const SCHEDULE_FREQ_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

function destinationLabel(d: BackupStorageDestination): string {
  const base = STORAGE_META[d.type as StorageType]?.label ?? d.type;
  const hint = d.bucket || d.gcsBucket || d.folder || d.directory || d.host || "";
  return hint ? `${base} · ${hint}` : base;
}

function BackupSchedulesCard({ destinations, passwordIsSet }: { destinations: BackupStorageDestination[]; passwordIsSet: boolean }) {
  const [items, setItems] = useState<ScheduleItem[] | null>(null);
  const [editing, setEditing] = useState<ScheduleItem | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () =>
    fetch("/api/backups/schedules", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { items?: ScheduleItem[] }) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  useEffect(() => { void load(); }, []);

  const freqLabel = (v: string) => SCHEDULE_FREQ_OPTIONS.find((o) => o.value === v)?.label ?? v;
  const destNameById = (id: string) => {
    const d = destinations.find((x) => x.id === id);
    return d ? destinationLabel(d) : id;
  };

  const openNew = () => setEditing({ id: 0, label: "Backup", frequency: "daily", destinationIds: [], enabled: true, lastBackupAt: null });

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const isNew = editing.id === 0;
      const r = await fetch(isNew ? "/api/backups/schedules" : `/api/backups/schedules/${editing.id}`, {
        method: isNew ? "POST" : "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editing.label, frequency: editing.frequency, destinationIds: editing.destinationIds, enabled: editing.enabled }),
      });
      if (r.ok) { toast.success(isNew ? "Schedule added" : "Schedule updated"); setEditing(null); await load(); }
      else { const d = await r.json().catch(() => ({})); toast.error((d as { error?: string }).error ?? "Failed to save schedule"); }
    } catch { toast.error("Failed to save schedule"); } finally { setSaving(false); }
  };

  const toggleEnabled = async (s: ScheduleItem) => {
    const r = await fetch(`/api/backups/schedules/${s.id}`, {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...s, enabled: !s.enabled }),
    });
    if (r.ok) void load(); else toast.error("Failed to update schedule");
  };

  const remove = async (s: ScheduleItem) => {
    if (!confirm(`Delete schedule "${s.label}"?`)) return;
    const r = await fetch(`/api/backups/schedules/${s.id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) { toast.success("Schedule deleted"); void load(); } else toast.error("Failed to delete schedule");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Scheduled backups</CardTitle>
            <CardDescription>
              Run several backups on different schedules and destinations — e.g. Daily → OneDrive and Monthly → S3.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={openNew} disabled={!passwordIsSet}><Plus className="mr-1 h-4 w-4" /> Add schedule</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!passwordIsSet && (
          <p className="text-amber-600 dark:text-amber-400 text-xs">Set an encryption password above before adding schedules.</p>
        )}
        {items === null ? (
          <Skeleton className="h-20 w-full" />
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No additional schedules. The single frequency above still applies.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {items.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{s.label}</span>
                    <Badge variant="secondary">{freqLabel(s.frequency)}</Badge>
                    {!s.enabled && <Badge variant="outline">Paused</Badge>}
                  </div>
                  <p className="text-muted-foreground text-xs mt-0.5 truncate">
                    {s.destinationIds.length > 0 ? s.destinationIds.map(destNameById).join(", ") : "Server copy only"}
                    {s.lastBackupAt ? ` · last ${formatDate(s.lastBackupAt)}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggleEnabled(s)}>{s.enabled ? "Pause" : "Resume"}</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing({ ...s })}>Edit</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(s)} aria-label="Delete schedule">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add / edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit schedule" : "Add schedule"}</DialogTitle>
            <DialogDescription>Choose how often this backup runs and which destinations it copies to.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="e.g. Nightly OneDrive" />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={editing.frequency} onValueChange={(v) => setEditing({ ...editing, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_FREQ_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Destinations</Label>
                {destinations.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No external destinations configured above. This schedule will keep a server copy only.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {destinations.map((d) => {
                      const on = editing.destinationIds.includes(d.id);
                      return (
                        <Button
                          key={d.id} type="button" size="sm" variant={on ? "default" : "outline"}
                          onClick={() => setEditing({
                            ...editing,
                            destinationIds: on ? editing.destinationIds.filter((x) => x !== d.id) : [...editing.destinationIds, d.id],
                          })}
                        >
                          {on && <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}{destinationLabel(d)}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !editing?.label.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing?.id ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * The full Backup & Restore settings UI, without an AppLayout wrapper, so it can
 * be embedded inside the consolidated Sync page (Management → Settings &
 * Integrations → Sync) as well as rendered as its own page.
 */
export function BackupSettingsPanel() {
  const qc = useQueryClient();
  const configQuery = useGetBackupConfig();
  const backupsQuery = useListBackups(
    { limit: 50 },
    {
      query: {
        queryKey: getListBackupsQueryKey({ limit: 50 }),
        // While any backup is still pending, poll so the row transitions to
        // completed/failed without a manual refresh.
        refetchInterval: (query) => {
          const items = query.state.data?.items ?? [];
          return items.some((b) => b.status === "pending") ? 2000 : false;
        },
      },
    },
  );
  const updateConfig = useUpdateBackupConfig();
  const triggerBackup = useTriggerBackup();
  const restoreBackup = useRestoreBackup();

  // OneDrive and Nextcloud backups reuse the accounts connected on the Sync
  // page rather than holding their own credentials on the destination.
  const { data: integrationsRaw } = useListIntegrations({
    query: { queryKey: ["integrations"] },
  });
  const integrations = (integrationsRaw ?? []) as unknown as Array<{
    key: string;
    status: string;
    accountHandle: string | null;
  }>;
  const oneDrive = integrations.find((i) => i.key === "onedrive");
  const oneDriveConnected = oneDrive?.status === "connected";
  const nextcloud = integrations.find((i) => i.key === "nextcloud");
  const nextcloudConnected = nextcloud?.status === "connected";

  const [frequency, setFrequency] = useState<string>("disabled");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [drafts, setDrafts] = useState<DestDraft[]>([]);
  const [passwordIsSet, setPasswordIsSet] = useState(false);
  const [showAllBackups, setShowAllBackups] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [logTarget, setLogTarget] = useState<Backup | null>(null);

  const config = configQuery.data as BackupConfig | undefined;

  useEffect(() => {
    if (!config) return;
    setFrequency(config.frequency);
    setPasswordIsSet(config.passwordIsSet);
    setDrafts(config.destinations.map(toDraft));
  }, [config]);

  const backups = (backupsQuery.data?.items ?? []) as Backup[];
  const visibleBackups = showAllBackups ? backups : backups.slice(0, 5);
  const hasPendingBackup = backups.some((b) => b.status === "pending");

  const canSave = useMemo(() => {
    if (password || confirmPassword) {
      return password.length >= 8 && password === confirmPassword;
    }
    return true;
  }, [password, confirmPassword]);

  function updateDraft(id: string, patch: Partial<DestDraft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function addDestination(type: StorageType) {
    setDrafts((prev) => [...prev, emptyDraft(type)]);
  }

  function removeDestination(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleSave() {
    if (!canSave) {
      toast.error("Passwords must match and be at least 8 characters");
      return;
    }
    try {
      await updateConfig.mutateAsync({
        data: {
          frequency: frequency as BackupConfigInputFrequency,
          ...(password ? { password } : {}),
          destinations: drafts.map(draftToInput),
        },
      });
      setPassword("");
      setConfirmPassword("");
      await qc.invalidateQueries({ queryKey: getGetBackupConfigQueryKey() });
      toast.success("Backup settings saved");
    } catch {
      toast.error("Failed to save backup settings");
    }
  }

  async function handleRunNow() {
    if (!passwordIsSet) {
      toast.error("Set an encryption password before running a backup");
      return;
    }
    try {
      await triggerBackup.mutateAsync();
      // The server returns immediately with a pending record; refetch so the
      // pending row appears and polling takes over until it finishes.
      await qc.invalidateQueries({ queryKey: getListBackupsQueryKey() });
      toast.success("Backup started — this may take a moment");
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      toast.error(
        status === 409
          ? "A backup is already running"
          : "Failed to start backup",
      );
    }
  }

  async function handleRestore() {
    if (!restoreTarget) return;
    if (!restorePassword) {
      toast.error("Enter your encryption password");
      return;
    }
    try {
      await restoreBackup.mutateAsync({
        id: restoreTarget.id,
        data: { password: restorePassword },
      });
      toast.success("Backup restored successfully");
      setRestoreTarget(null);
      setRestorePassword("");
      await qc.invalidateQueries();
    } catch (err) {
      const msg =
        err instanceof Error && /invalid password/i.test(err.message)
          ? "Invalid password"
          : "Restore failed";
      toast.error(msg);
    }
  }

  if (configQuery.isLoading) {
    return (
      <div className="space-y-4 p-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Backup &amp; Restore</h1>
            <p className="text-muted-foreground text-sm">
              Encrypted, scheduled backups of your store data to the destinations
              you choose.
            </p>
          </div>
          <Button
            onClick={handleRunNow}
            disabled={
              triggerBackup.isPending || hasPendingBackup || !passwordIsSet
            }
          >
            {triggerBackup.isPending || hasPendingBackup ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {hasPendingBackup ? "Backing up…" : "Back up now"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
          {/* Left column: Encryption + scheduled backups stacked in a half box */}
          <div className="space-y-6">
          {/* Encryption + schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Encryption &amp; schedule
              </CardTitle>
              <CardDescription>
                Backups are encrypted with AES-256. You&apos;ll need this password
                to restore — keep it safe, it cannot be recovered.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Backup frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Lock className="h-4 w-4" /> Encryption password
                  {passwordIsSet && (
                    <Badge variant="secondary" className="ml-1">
                      Set
                    </Badge>
                  )}
                </Label>
                <Input
                  type="password"
                  placeholder={
                    passwordIsSet ? "Leave blank to keep current" : "Enter a password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <Input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                {password && password.length < 8 && (
                  <p className="text-destructive text-xs">
                    Password must be at least 8 characters.
                  </p>
                )}
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-destructive text-xs">Passwords do not match.</p>
                )}
              </div>

              <div className="text-muted-foreground text-xs">
                Last backup: {formatDate(config?.lastBackupAt)}
              </div>
            </CardContent>
          </Card>

          {/* Scheduled backups sit directly under Encryption in the left half */}
          <BackupSchedulesCard destinations={config?.destinations ?? []} passwordIsSet={passwordIsSet} />
          </div>

          {/* Destinations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" /> Storage destinations
              </CardTitle>
              <CardDescription>
                Where encrypted archives are copied. A local copy is always kept
                on the server for restore.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {drafts.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No external destinations. Backups are stored locally on the
                  server only.
                </p>
              )}
              {drafts.map((d) => {
                const Meta = STORAGE_META[d.type];
                const Icon = Meta.icon;
                return (
                  <div key={d.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-medium">
                        <Icon className="h-4 w-4" /> {Meta.label}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDestination(d.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {d.type === "local" && (
                      <div className="space-y-1">
                        <Label className="text-xs">Directory (optional)</Label>
                        <Input
                          placeholder="/var/backups/koapos"
                          value={d.directory}
                          onChange={(e) =>
                            updateDraft(d.id, { directory: e.target.value })
                          }
                        />
                      </div>
                    )}

                    {d.type === "s3" && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Bucket</Label>
                          <Input
                            value={d.bucket}
                            onChange={(e) =>
                              updateDraft(d.id, { bucket: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Region</Label>
                          <Input
                            placeholder="ap-southeast-2"
                            value={d.region}
                            onChange={(e) =>
                              updateDraft(d.id, { region: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Access Key ID</Label>
                          <Input
                            value={d.accessKeyId}
                            onChange={(e) =>
                              updateDraft(d.id, { accessKeyId: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Secret Access Key
                            {d.secretAccessKeySet && (
                              <span className="text-muted-foreground"> (set)</span>
                            )}
                          </Label>
                          <Input
                            type="password"
                            placeholder={d.secretAccessKeySet ? "••••••••" : ""}
                            value={d.secretAccessKey}
                            onChange={(e) =>
                              updateDraft(d.id, { secretAccessKey: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    )}

                    {d.type === "gcs" && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Project ID</Label>
                            <Input
                              value={d.projectId}
                              onChange={(e) =>
                                updateDraft(d.id, { projectId: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Bucket</Label>
                            <Input
                              value={d.gcsBucket}
                              onChange={(e) =>
                                updateDraft(d.id, { gcsBucket: e.target.value })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Service account JSON
                            {d.serviceAccountJsonSet && (
                              <span className="text-muted-foreground"> (set)</span>
                            )}
                          </Label>
                          <Textarea
                            rows={4}
                            placeholder={
                              d.serviceAccountJsonSet
                                ? "•••••• (leave blank to keep)"
                                : '{ "type": "service_account", ... }'
                            }
                            value={d.serviceAccountJson}
                            onChange={(e) =>
                              updateDraft(d.id, {
                                serviceAccountJson: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                    )}

                    {d.type === "sftp" && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Host</Label>
                          <Input
                            value={d.host}
                            onChange={(e) =>
                              updateDraft(d.id, { host: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Port</Label>
                          <Input
                            value={d.port}
                            onChange={(e) =>
                              updateDraft(d.id, { port: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Username</Label>
                          <Input
                            value={d.username}
                            onChange={(e) =>
                              updateDraft(d.id, { username: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Password
                            {d.passwordSet && (
                              <span className="text-muted-foreground"> (set)</span>
                            )}
                          </Label>
                          <Input
                            type="password"
                            placeholder={d.passwordSet ? "••••••••" : ""}
                            value={d.password}
                            onChange={(e) =>
                              updateDraft(d.id, { password: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs">Remote path (optional)</Label>
                          <Input
                            placeholder="/backups/koapos"
                            value={d.remotePath}
                            onChange={(e) =>
                              updateDraft(d.id, { remotePath: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    )}

                    {d.type === "onedrive" && (
                      <div className="space-y-3">
                        {oneDriveConnected ? (
                          <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>
                              Using your connected OneDrive
                              {oneDrive?.accountHandle
                                ? ` (${oneDrive.accountHandle})`
                                : ""}
                              . Archives upload to its app folder.
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            <span>
                              OneDrive isn't connected. Connect it to back up
                              here.
                            </span>
                            <Link
                              href="/management/settings-integrations/sync"
                              className="font-medium underline shrink-0"
                            >
                              Connect
                            </Link>
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs">Sub-folder (optional)</Label>
                          <Input
                            placeholder="koapos-backups"
                            value={d.folder}
                            onChange={(e) =>
                              updateDraft(d.id, { folder: e.target.value })
                            }
                          />
                          <p className="text-muted-foreground text-[11px]">
                            A folder inside the KoaPOS app folder in your
                            OneDrive. Leave blank to use the app folder root.
                          </p>
                        </div>
                      </div>
                    )}

                    {d.type === "nextcloud" && (
                      <div className="space-y-3">
                        {nextcloudConnected ? (
                          <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>
                              Using your connected Nextcloud
                              {nextcloud?.accountHandle
                                ? ` (${nextcloud.accountHandle})`
                                : ""}
                              .
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            <span>
                              Nextcloud isn't connected. Connect your server to
                              back up here.
                            </span>
                            <Link
                              href="/management/settings-integrations/sync"
                              className="font-medium underline shrink-0"
                            >
                              Connect
                            </Link>
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs">Folder (optional)</Label>
                          <Input
                            placeholder={NEXTCLOUD_DEFAULT_FOLDER}
                            value={d.folder}
                            onChange={(e) =>
                              updateDraft(d.id, { folder: e.target.value })
                            }
                          />
                          <p className="text-muted-foreground text-[11px]">
                            A folder in your Nextcloud files, created if it
                            doesn't exist. Leave blank to use{" "}
                            <span className="font-mono">
                              {NEXTCLOUD_DEFAULT_FOLDER}
                            </span>
                            .
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-2">
                {(Object.keys(STORAGE_META) as StorageType[]).map((t) => {
                  const Icon = STORAGE_META[t].icon;
                  return (
                    <Button
                      key={t}
                      variant="outline"
                      size="sm"
                      onClick={() => addDestination(t)}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      <Icon className="mr-1 h-3 w-3" />
                      {STORAGE_META[t].label}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateConfig.isPending || !canSave}>
            {updateConfig.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save settings
          </Button>
        </div>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Backup history
            </CardTitle>
            <CardDescription>
              Restore replaces all current data for your store with the contents
              of the selected backup.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {backupsQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : backups.length === 0 ? (
              <p className="text-muted-foreground text-sm">No backups yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Destinations</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleBackups.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(b.startedAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={b.status} />
                      </TableCell>
                      <TableCell className="capitalize">{b.trigger}</TableCell>
                      <TableCell>
                        {b.locations.length > 0
                          ? b.locations.map((l) => l.type).join(", ")
                          : b.storageType ?? "—"}
                      </TableCell>
                      <TableCell>{formatBytes(b.fileSizeBytes)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-8 w-8",
                              b.status === "failed" &&
                                "text-destructive hover:text-destructive",
                            )}
                            title={
                              b.status === "failed"
                                ? "Backup failed — view log"
                                : "View backup log"
                            }
                            aria-label={
                              b.status === "failed"
                                ? "Backup failed — view log"
                                : "View backup log"
                            }
                            onClick={() => setLogTarget(b)}
                          >
                            {b.status === "failed" ? (
                              <AlertTriangle className="h-4 w-4" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={b.status !== "completed"}
                            title="Download backup to this computer"
                            aria-label="Download backup"
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = `/api/backups/${b.id}/download`;
                              a.rel = "noopener";
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={b.status !== "completed"}
                            onClick={() => {
                              setRestoreTarget(b);
                              setRestorePassword("");
                            }}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" /> Restore
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {backups.length > 5 && (
              <div className="mt-3 flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setShowAllBackups((v) => !v)}>
                  {showAllBackups ? "Show less" : `Show more (${backups.length - 5})`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Restore dialog */}
      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRestoreTarget(null);
            setRestorePassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore backup</DialogTitle>
            <DialogDescription>
              This will permanently replace all current store data with the backup
              from {formatDate(restoreTarget?.startedAt)}. This cannot be undone.
              Enter your encryption password to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Encryption password</Label>
            <Input
              type="password"
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRestoreTarget(null);
                setRestorePassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={restoreBackup.isPending}
            >
              {restoreBackup.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Restore &amp; replace data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backup log / details dialog */}
      <Dialog
        open={logTarget !== null}
        onOpenChange={(open) => { if (!open) setLogTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {logTarget?.status === "failed" ? (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
              Backup log
            </DialogTitle>
            <DialogDescription>
              {logTarget ? `Started ${formatDate(logTarget.startedAt)}` : ""}
            </DialogDescription>
          </DialogHeader>

          {logTarget && (
            <div className="space-y-4">
              {logTarget.status === "failed" && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertTriangle className="h-4 w-4" /> This backup failed
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-destructive/90">
                    {logTarget.errorMessage?.trim()
                      ? logTarget.errorMessage
                      : "No error detail was recorded. Check the destination credentials and that the encryption password is set, then run the backup again."}
                  </p>
                </div>
              )}
              {logTarget.status === "pending" && (
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> This backup is still
                    running.
                  </p>
                </div>
              )}

              <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="col-span-2"><StatusBadge status={logTarget.status} /></dd>

                <dt className="text-muted-foreground">Trigger</dt>
                <dd className="col-span-2 capitalize">{logTarget.trigger}</dd>

                <dt className="text-muted-foreground">Started</dt>
                <dd className="col-span-2">{formatDate(logTarget.startedAt)}</dd>

                <dt className="text-muted-foreground">Completed</dt>
                <dd className="col-span-2">
                  {logTarget.completedAt ? formatDate(logTarget.completedAt) : "—"}
                </dd>

                <dt className="text-muted-foreground">Destinations</dt>
                <dd className="col-span-2">
                  {logTarget.locations.length > 0
                    ? logTarget.locations.map((l) => l.type).join(", ")
                    : logTarget.storageType ?? "—"}
                </dd>

                <dt className="text-muted-foreground">Size</dt>
                <dd className="col-span-2">{formatBytes(logTarget.fileSizeBytes)}</dd>
              </dl>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLogTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ManagementBackupPage() {
  return (
    <AppLayout>
      <BackupSettingsPanel />
    </AppLayout>
  );
}
