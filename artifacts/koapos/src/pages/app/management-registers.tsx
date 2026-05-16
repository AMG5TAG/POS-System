import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListStaff } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Monitor, CreditCard, Briefcase } from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type RegisterType = "Cash" | "Cashless" | "Operations";

interface PosRegister {
  id: string;
  name: string;
  type: RegisterType;
  staffName: string;
  staffEmail: string;
}

/* ─── Register type definitions ──────────────────────────────────────────── */

const REGISTER_TYPES: {
  type: RegisterType;
  description: string;
  icon: React.ElementType;
  bg: string;
  text: string;
  badgeBg: string;
  badgeText: string;
}[] = [
  {
    type: "Cash",
    description: "Full POS — all payment types",
    icon: Monitor,
    bg: "bg-green-50 dark:bg-green-950/30",
    text: "text-green-700 dark:text-green-400",
    badgeBg: "bg-green-100 dark:bg-green-900/40",
    badgeText: "text-green-700 dark:text-green-300",
  },
  {
    type: "Cashless",
    description: "Card payments only",
    icon: CreditCard,
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-400",
    badgeBg: "bg-blue-100 dark:bg-blue-900/40",
    badgeText: "text-blue-700 dark:text-blue-300",
  },
  {
    type: "Operations",
    description: "Invoicing & quoting only",
    icon: Briefcase,
    bg: "bg-purple-50 dark:bg-purple-950/30",
    text: "text-purple-700 dark:text-purple-400",
    badgeBg: "bg-purple-100 dark:bg-purple-900/40",
    badgeText: "text-purple-700 dark:text-purple-300",
  },
];

const STORAGE_KEY = "koapos_pos_registers";

function loadRegisters(): PosRegister[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as PosRegister[]) : [];
  } catch {
    return [];
  }
}

function saveRegisters(registers: PosRegister[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registers));
}

/* ─── TypeBadge ──────────────────────────────────────────────────────────── */

function TypeBadge({ type }: { type: RegisterType }) {
  const def = REGISTER_TYPES.find((t) => t.type === type)!;
  const Icon = def.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${def.badgeBg} ${def.badgeText}`}
    >
      <Icon className="h-3 w-3" />
      {type}
    </span>
  );
}

/* ─── Empty form ─────────────────────────────────────────────────────────── */

const EMPTY_FORM = { name: "", type: "Cash" as RegisterType, staffId: "", staffName: "", staffEmail: "" };

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementRegistersPage() {
  const [registers, setRegisters] = useState<PosRegister[]>(loadRegisters);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PosRegister | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: staffData } = useListStaff({ query: { queryKey: ["staff"] } });
  const staffList = staffData?.items ?? [];

  useEffect(() => {
    saveRegisters(registers);
  }, [registers]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (reg: PosRegister) => {
    setEditing(reg);
    const matched = staffList.find((s) => s.name === reg.staffName);
    setForm({ name: reg.name, type: reg.type, staffId: matched ? String(matched.id) : "", staffName: reg.staffName, staffEmail: reg.staffEmail });
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setRegisters((prev) => prev.filter((r) => r.id !== id));
    toast.success("Register deleted");
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Register name is required");
      return;
    }
    if (editing) {
      setRegisters((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r))
      );
      toast.success("Register updated");
    } else {
      setRegisters((prev) => [...prev, { id: crypto.randomUUID(), ...form }]);
      toast.success("Register created");
    }
    setDialogOpen(false);
  };

  const handleStaffSelect = (val: string) => {
    if (val === "__none__") {
      setForm((f) => ({ ...f, staffId: "", staffName: "", staffEmail: "" }));
      return;
    }
    const member = staffList.find((s) => String(s.id) === val);
    if (member) {
      setForm((f) => ({
        ...f,
        staffId: String(member.id),
        staffName: member.name,
        staffEmail: member.email ?? "",
      }));
    }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 max-w-4xl space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">POS Registers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Assign each register to a staff member — it becomes their default till when they log in to KoaPOS.
            </p>
          </div>
          <Button onClick={openNew} className="shrink-0 bg-[#0d9488] hover:bg-[#0f766e] text-white">
            <Plus className="h-4 w-4 mr-1" />New Register
          </Button>
        </div>

        {/* Register type cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {REGISTER_TYPES.map(({ type, description, icon: Icon, bg, text }) => (
            <div key={type} className={`rounded-xl border border-border p-4 flex items-center gap-3 ${bg}`}>
              <div className={`p-2 rounded-lg bg-white/60 dark:bg-black/20 ${text}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className={`font-semibold text-sm ${text}`}>{type}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Register list */}
        {registers.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
            <Monitor className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No registers yet</p>
            <p className="text-sm mt-1">Click "+ New Register" to create your first POS terminal.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {registers.map((reg) => (
              <div
                key={reg.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{reg.name}</p>
                    {(reg.staffName || reg.staffEmail) && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {reg.staffName && <span className="mr-1">{reg.staffName}</span>}
                        {reg.staffEmail && (
                          <span className="text-muted-foreground/70">({reg.staffEmail})</span>
                        )}
                      </p>
                    )}
                    <div className="mt-2">
                      <TypeBadge type={reg.type} />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-1 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(reg)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 px-3"
                    onClick={() => handleDelete(reg.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Register" : "New Register"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Register Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Front Counter"
                autoFocus
              />
            </div>
            <div>
              <Label>Register Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as RegisterType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGISTER_TYPES.map(({ type, description }) => (
                    <SelectItem key={type} value={type}>
                      <span className="font-medium">{type}</span>
                      <span className="text-muted-foreground ml-1 text-xs">— {description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assign to Staff Member</Label>
              <Select onValueChange={handleStaffSelect} value={form.staffId || "__none__"}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Unassigned —</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                      {s.email && <span className="text-muted-foreground ml-1 text-xs">({s.email})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save Changes" : "Create Register"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
