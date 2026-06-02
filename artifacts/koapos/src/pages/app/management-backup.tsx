import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetBackupConfig,
  useUpdateBackupConfig,
  useListBackups,
  useTriggerBackup,
  useRestoreBackup,
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
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type StorageType = "local" | "s3" | "gcs" | "sftp";

const STORAGE_META: Record<
  StorageType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  local: { label: "Local server", icon: HardDrive },
  s3: { label: "Amazon S3", icon: Cloud },
  gcs: { label: "Google Cloud Storage", icon: Cloud },
  sftp: { label: "SFTP server", icon: Server },
};

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

export default function ManagementBackupPage() {
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

  const [frequency, setFrequency] = useState<string>("disabled");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [drafts, setDrafts] = useState<DestDraft[]>([]);
  const [passwordIsSet, setPasswordIsSet] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [restorePassword, setRestorePassword] = useState("");

  const config = configQuery.data as BackupConfig | undefined;

  useEffect(() => {
    if (!config) return;
    setFrequency(config.frequency);
    setPasswordIsSet(config.passwordIsSet);
    setDrafts(config.destinations.map(toDraft));
  }, [config]);

  const backups = (backupsQuery.data?.items ?? []) as Backup[];
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
      <AppLayout>
        <div className="space-y-4 p-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
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
                  {backups.map((b) => (
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
    </AppLayout>
  );
}
