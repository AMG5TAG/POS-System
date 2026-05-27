import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Camera, Plus, Pencil, Trash2, Eye, EyeOff, Loader2,
  Image, Shield, Tv2, X, AlertTriangle, CheckCircle2,
  GripVertical, Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  useListCameras,
  useCreateCamera,
  useUpdateCamera,
  useDeleteCamera,
  useGetCameraSettings,
  useUpdateCameraSettings,
  useListCameraSnapshots,
  useDeleteCameraSnapshot,
  type Camera as CameraType,
  type CameraInput,
} from "@workspace/api-client-react";

/* ─── Types ───────────────────────────────────────────────────────────────── */

type Tab = "setup" | "snapshots" | "access";

const ROLES = [
  { key: "admin",   label: "Admin / Owner" },
  { key: "manager", label: "Manager"        },
  { key: "cashier", label: "Cashier"        },
];

/* ─── Camera form dialog ──────────────────────────────────────────────────── */

function CameraFormDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: CameraType;
}) {
  const isEdit = !!initial;
  const createCamera = useCreateCamera();
  const updateCamera = useUpdateCamera();
  const [form, setForm] = useState<CameraInput>({
    name: initial?.name ?? "",
    streamUrl: initial?.streamUrl ?? "",
    port: initial?.port ?? "",
    username: initial?.username ?? "",
    password: initial?.password ?? "",
    status: initial?.status ?? "active",
    sortOrder: initial?.sortOrder ?? 0,
  });
  const [showPass, setShowPass] = useState(false);

  const set = (k: keyof CameraInput, v: string | number | null | undefined) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.streamUrl.trim()) {
      toast.error("Camera Name and Stream URL are required.");
      return;
    }
    try {
      if (isEdit) {
        await updateCamera.mutateAsync({ id: initial!.id, data: form });
        toast.success("Camera updated");
      } else {
        await createCamera.mutateAsync({ data: form });
        toast.success("Camera added");
      }
      onClose();
    } catch {
      toast.error("Failed to save camera");
    }
  };

  const busy = createCamera.isPending || updateCamera.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Camera" : "Add Camera"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Camera Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Front Door" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Stream URL / IP Address *</Label>
              <Input
                value={form.streamUrl}
                onChange={(e) => set("streamUrl", e.target.value)}
                placeholder="http://192.168.1.100/mjpeg or rtsp://..."
              />
              <p className="text-xs text-muted-foreground">
                MJPEG (http://) streams are shown live in browser. RTSP streams display a placeholder.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Port</Label>
              <Input value={form.port ?? ""} onChange={(e) => set("port", e.target.value)} placeholder="e.g. 554" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status ?? "active"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={form.username ?? ""} onChange={(e) => set("username", e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  value={form.password ?? ""}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Optional"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Display Order</Label>
              <Input
                type="number"
                value={form.sortOrder ?? 0}
                onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {isEdit ? "Save Changes" : "Add Camera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Camera setup tab ────────────────────────────────────────────────────── */

function CameraSetupTab() {
  const { data: cameras = [], isLoading } = useListCameras();
  const deleteCamera = useDeleteCamera();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CameraType | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    try {
      await deleteCamera.mutateAsync({ id });
      toast.success("Camera deleted");
    } catch {
      toast.error("Failed to delete camera");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{cameras.length} camera{cameras.length !== 1 ? "s" : ""} configured</p>
        <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Camera
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && cameras.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <Camera className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="font-medium text-sm">No cameras yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add your first IP camera to start monitoring.</p>
        </div>
      )}

      {!isLoading && cameras.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium text-muted-foreground w-8"></th>
                <th className="text-left p-3 font-medium text-muted-foreground">Camera Name</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Stream URL</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Port</th>
                <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cameras.map((cam) => (
                <tr key={cam.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-muted-foreground">
                    <GripVertical className="w-4 h-4" />
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{cam.name}</div>
                    {cam.username && <div className="text-xs text-muted-foreground">User: {cam.username}</div>}
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <code className="text-xs text-muted-foreground break-all">{cam.streamUrl}</code>
                  </td>
                  <td className="p-3 hidden sm:table-cell text-muted-foreground">{cam.port || "—"}</td>
                  <td className="p-3 text-center">
                    <Badge variant={cam.status === "active" ? "default" : "secondary"} className="text-xs">
                      {cam.status === "active"
                        ? <><CheckCircle2 className="w-3 h-3 mr-1" />Active</>
                        : <><AlertTriangle className="w-3 h-3 mr-1" />Inactive</>}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(cam); setFormOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(cam.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CameraFormDialog open={formOpen} onClose={() => setFormOpen(false)} initial={editing} />

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Camera?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete the camera and all associated snapshots. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)} disabled={deleteCamera.isPending}>
              {deleteCamera.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Snapshot history tab ────────────────────────────────────────────────── */

function SnapshotHistoryTab() {
  const { data: snapshots = [], isLoading } = useListCameraSnapshots();
  const deleteSnapshot = useDeleteCameraSnapshot();
  const [viewSnap, setViewSnap] = useState<typeof snapshots[0] | null>(null);

  const handleDelete = async (id: number) => {
    try {
      await deleteSnapshot.mutateAsync({ id });
      toast.success("Snapshot deleted");
    } catch {
      toast.error("Failed to delete snapshot");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && snapshots.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <Image className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="font-medium text-sm">No snapshots yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Hover over a camera card on the Cameras page and click Snapshot to save frames here.
          </p>
        </div>
      )}

      {!isLoading && snapshots.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {snapshots.map((snap) => (
            <div key={snap.id} className="group relative rounded-lg overflow-hidden border bg-muted/30">
              {/* Thumbnail */}
              <div className="aspect-video bg-zinc-900 relative">
                <img
                  src={snap.imageData}
                  alt={snap.cameraName}
                  className="w-full h-full object-cover"
                />
                {/* Overlay actions */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => setViewSnap(snap)}
                    className="p-2 rounded-lg bg-white/90 text-black hover:bg-white transition-colors"
                    title="View full size"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(snap.id)}
                    className="p-2 rounded-lg bg-destructive/90 text-white hover:bg-destructive transition-colors"
                    title="Delete snapshot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Meta */}
              <div className="p-2">
                <p className="text-xs font-medium truncate">{snap.cameraName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(snap.takenAt), "dd MMM yyyy HH:mm")}
                </p>
                <Badge variant="secondary" className="text-[10px] h-4 px-1 mt-0.5 capitalize">{snap.source}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full size view */}
      <Dialog open={!!viewSnap} onOpenChange={(o) => { if (!o) setViewSnap(null); }}>
        <DialogContent className="max-w-4xl p-0 bg-black border-zinc-800 [&>button]:hidden">
          {viewSnap && (
            <>
              <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
                <div>
                  <p className="text-white text-sm font-semibold">{viewSnap.cameraName}</p>
                  <p className="text-zinc-400 text-xs">{format(new Date(viewSnap.takenAt), "dd MMM yyyy HH:mm:ss")}</p>
                </div>
                <button onClick={() => setViewSnap(null)} className="text-zinc-400 hover:text-white transition-colors p-1 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <img src={viewSnap.imageData} alt={viewSnap.cameraName} className="w-full max-h-[80vh] object-contain" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Access & PiP tab ────────────────────────────────────────────────────── */

function AccessPipTab() {
  const { data: cameras = [] } = useListCameras();
  const { data: settings, isLoading } = useGetCameraSettings();
  const updateSettings = useUpdateCameraSettings();
  const [saving, setSaving] = useState(false);

  const allowedRoles = settings?.allowedRoles?.split(",").filter(Boolean) ?? ["admin", "manager", "cashier"];
  const pipEnabled = settings?.pipEnabled === "true";
  const pipCameraId = settings?.pipCameraId ?? null;

  const save = async (patch: { pipEnabled?: string; pipCameraId?: number | null; allowedRoles?: string }) => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync({ data: patch });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = async (role: string) => {
    const current = new Set(allowedRoles);
    if (current.has(role)) {
      if (current.size === 1) {
        toast.error("At least one role must have camera access.");
        return;
      }
      current.delete(role);
    } else {
      current.add(role);
    }
    await save({ allowedRoles: Array.from(current).join(",") });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* PiP Settings */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Tv2 className="w-4 h-4" /> POS Picture-in-Picture</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Show a floating live camera feed on top of the POS Sell Screen.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable PiP Mode</p>
            <p className="text-xs text-muted-foreground">Overlay a camera on the POS screen</p>
          </div>
          <Switch
            checked={pipEnabled}
            disabled={saving}
            onCheckedChange={(checked) => save({ pipEnabled: checked ? "true" : "false" })}
          />
        </div>

        {pipEnabled && (
          <div className="space-y-1.5">
            <Label>PiP Camera</Label>
            <Select
              value={pipCameraId?.toString() ?? "none"}
              onValueChange={(v) => save({ pipCameraId: v === "none" ? null : parseInt(v) })}
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a camera" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {cameras.filter((c) => c.status === "active").map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This camera's feed will appear as a floating window on the POS Sell Screen.
            </p>
          </div>
        )}

        {pipEnabled && !pipCameraId && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">Select a camera above to activate the PiP overlay.</p>
          </div>
        )}
      </div>

      {/* Access permissions */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Shield className="w-4 h-4" /> Access Permissions</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Control which staff roles can view the camera dashboard.
          </p>
        </div>

        <div className="space-y-3">
          {ROLES.map(({ key, label }) => {
            const enabled = allowedRoles.includes(key);
            return (
              <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{enabled ? "Can view cameras" : "Access denied"}</p>
                </div>
                <Switch checked={enabled} disabled={saving} onCheckedChange={() => toggleRole(key)} />
              </div>
            );
          })}
        </div>

        <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
          <p><strong>Note:</strong> Admin/Owner always retains full access regardless of this setting.</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "setup",     label: "Camera Setup",    icon: Camera  },
  { id: "snapshots", label: "Snapshot History", icon: Image  },
  { id: "access",    label: "Access & PiP",    icon: Shield  },
];

export default function ManagementCamerasPage() {
  const [tab, setTab] = useState<Tab>("setup");

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Camera className="w-6 h-6 text-primary" />
            Camera Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure IP cameras, review snapshots, and set access permissions.
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b flex gap-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "setup"     && <CameraSetupTab />}
        {tab === "snapshots" && <SnapshotHistoryTab />}
        {tab === "access"    && <AccessPipTab />}
      </div>
    </AppLayout>
  );
}
