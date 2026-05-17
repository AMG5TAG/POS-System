import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useCustomerSettings, type CustomerGroup, type CustomerRequiredFields } from "@/lib/customer-settings";
import { useListCustomers } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users } from "lucide-react";

const GROUP_COLORS = [
  { label: "Blue",   value: "#3b82f6" },
  { label: "Amber",  value: "#f59e0b" },
  { label: "Purple", value: "#8b5cf6" },
  { label: "Green",  value: "#10b981" },
  { label: "Red",    value: "#ef4444" },
  { label: "Pink",   value: "#ec4899" },
  { label: "Orange", value: "#f97316" },
  { label: "Teal",   value: "#14b8a6" },
  { label: "Indigo", value: "#6366f1" },
  { label: "Gray",   value: "#6b7280" },
];

const REQUIRED_FIELD_LABELS: { key: keyof CustomerRequiredFields; label: string; hint?: string }[] = [
  { key: "email",          label: "Email Address" },
  { key: "phone",          label: "Phone Number" },
  { key: "dateOfBirth",    label: "Date of Birth" },
  { key: "company",        label: "Company / Business Name" },
  { key: "abn",            label: "ABN",            hint: "Australian Business Number" },
  { key: "billingAddress", label: "Billing Address" },
];

export default function SettingsCustomersPage() {
  const { settings, save } = useCustomerSettings();
  const { data: customersData } = useListCustomers(
    { limit: 1000 },
    { query: { queryKey: ["customers-settings"] } }
  );
  const customers = customersData?.items ?? [];

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup]         = useState<CustomerGroup | null>(null);
  const [groupForm, setGroupForm]               = useState({ name: "", description: "", color: "#3b82f6" });
  const [deleteConfirm, setDeleteConfirm]       = useState<string | null>(null);

  const groupCounts = (customers as { customerGroup?: string }[]).reduce<Record<string, number>>((acc, c) => {
    const g = c.customerGroup || "Standard";
    acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {});
  const total = customers.length;

  const openAdd = () => {
    setEditingGroup(null);
    setGroupForm({ name: "", description: "", color: "#3b82f6" });
    setGroupDialogOpen(true);
  };

  const openEdit = (g: CustomerGroup) => {
    setEditingGroup(g);
    setGroupForm({ name: g.name, description: g.description, color: g.color });
    setGroupDialogOpen(true);
  };

  const saveGroup = () => {
    if (!groupForm.name.trim()) return;
    const groups = [...settings.groups];
    if (editingGroup) {
      const idx = groups.findIndex(g => g.id === editingGroup.id);
      if (idx >= 0) groups[idx] = { ...editingGroup, ...groupForm, name: groupForm.name.trim() };
    } else {
      groups.push({ id: crypto.randomUUID(), ...groupForm, name: groupForm.name.trim() });
    }
    save({ groups });
    toast.success(editingGroup ? "Group updated" : "Group added");
    setGroupDialogOpen(false);
  };

  const confirmDelete = (id: string) => setDeleteConfirm(id);

  const doDelete = () => {
    if (!deleteConfirm) return;
    save({ groups: settings.groups.filter(g => g.id !== deleteConfirm) });
    toast.success("Group deleted");
    setDeleteConfirm(null);
  };

  const toggleRequired = (key: keyof CustomerRequiredFields, checked: boolean) => {
    save({ requiredFields: { ...settings.requiredFields, [key]: checked } });
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">

        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Customer Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage how customers are organised and what information is collected.
          </p>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <p className="text-3xl font-bold text-primary">{total}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Customers</p>
            </CardContent>
          </Card>
          {settings.groups.slice(0, 3).map(g => {
            const count = groupCounts[g.name] ?? 0;
            const pct   = total ? Math.round((count / total) * 100) : 0;
            return (
              <Card key={g.id}>
                <CardContent className="pt-5 pb-4 text-center">
                  <p className="text-3xl font-bold" style={{ color: g.color }}>{count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{g.name}</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: g.color }}>{pct}%</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Customer Groups */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
            <div>
              <CardTitle>Customer Groups</CardTitle>
              <CardDescription>Organise customers for segmentation, pricing, and reporting.</CardDescription>
            </div>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5" /> Add Group
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {settings.groups.map(g => {
                const count = groupCounts[g.name] ?? 0;
                const pct   = total ? Math.round((count / total) * 100) : 0;
                return (
                  <div
                    key={g.id}
                    className="rounded-xl border bg-muted/10 p-4 flex flex-col gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border"
                          style={{
                            backgroundColor: g.color + "20",
                            color: g.color,
                            borderColor: g.color + "50",
                          }}
                        >
                          {g.name}
                        </span>
                        <span className="text-sm font-bold tabular-nums">{count}</span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => confirmDelete(g.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed flex-1 min-h-[2.5rem]">
                      {g.description || <span className="italic">No description</span>}
                    </p>

                    <div className="flex items-center gap-2 pt-2 border-t">
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: g.color }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {count} · {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}

              {settings.groups.length === 0 && (
                <div className="col-span-full flex flex-col items-center gap-3 py-12 text-muted-foreground">
                  <Users className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No groups yet. Add your first customer group.</p>
                  <Button size="sm" variant="outline" onClick={openAdd}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Group
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Required Information */}
        <Card>
          <CardHeader>
            <CardTitle>Required Information</CardTitle>
            <CardDescription>
              Fields that staff must fill in when creating or editing a customer record.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {REQUIRED_FIELD_LABELS.map(({ key, label, hint }) => (
              <label
                key={key}
                className="flex items-start gap-3 py-2.5 cursor-pointer rounded-lg px-2 hover:bg-muted/40 transition-colors"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={!!settings.requiredFields[key]}
                  onCheckedChange={(v) => toggleRequired(key, !!v)}
                />
                <div>
                  <p className="text-sm font-medium leading-tight">{label}</p>
                  {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        {/* Defaults */}
        <Card>
          <CardHeader>
            <CardTitle>Default Values</CardTitle>
            <CardDescription>Values pre-filled when creating a new customer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-xs">
            <div className="space-y-1.5">
              <Label>Default Customer Group</Label>
              <Select value={settings.defaultGroup} onValueChange={(v) => save({ defaultGroup: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {settings.groups.map(g => (
                    <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Applied automatically when a new customer is added.</p>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Add / Edit Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Group" : "Add Customer Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Group Name <span className="text-destructive">*</span></Label>
              <Input
                value={groupForm.name}
                onChange={(e) => setGroupForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Wholesale"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={groupForm.description}
                onChange={(e) => setGroupForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this group"
              />
            </div>
            <div className="space-y-2">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2">
                {GROUP_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setGroupForm(f => ({ ...f, color: c.value }))}
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c.value,
                      borderColor: groupForm.color === c.value ? "#000" : "transparent",
                      transform: groupForm.color === c.value ? "scale(1.15)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <div
                  className="w-5 h-5 rounded-full border shrink-0"
                  style={{ backgroundColor: groupForm.color }}
                />
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: groupForm.color + "20",
                    color: groupForm.color,
                    borderColor: groupForm.color + "50",
                  }}
                >
                  {groupForm.name || "Preview"}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveGroup} disabled={!groupForm.name.trim()}>
              {editingGroup ? "Update Group" : "Add Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Deleting this group won't remove customers — they'll keep their current group label.
            You can reassign them later.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
}
