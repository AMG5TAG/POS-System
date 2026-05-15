import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListStaff, useCreateStaff, useUpdateStaff, useDeleteStaff, Staff } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserSquare2, Plus, Pencil, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type StaffForm = {
  name: string;
  email: string;
  role: string;
  pin: string;
  isActive: boolean;
};

const defaultForm: StaffForm = {
  name: "",
  email: "",
  role: "cashier",
  pin: "",
  isActive: true,
};

const ROLES = ["owner", "manager", "cashier", "stock_controller"];

export default function StaffPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState<StaffForm>(defaultForm);

  const { data: staffList, isLoading } = useListStaff({ query: { queryKey: ["staff"] } });

  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const deleteMutation = useDeleteStaff();

  const members = staffList || [];

  const openCreate = () => {
    setEditingStaff(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (s: Staff) => {
    setEditingStaff(s);
    setForm({
      name: s.name,
      email: s.email || "",
      role: s.role,
      pin: s.pin || "",
      isActive: s.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name) {
      toast.error("Name is required");
      return;
    }
    const payload = {
      name: form.name,
      email: form.email || undefined,
      role: form.role,
      pin: form.pin || undefined,
      isActive: form.isActive,
    };

    if (editingStaff) {
      updateMutation.mutate(
        { id: editingStaff.id, data: payload },
        {
          onSuccess: () => {
            toast.success("Staff member updated");
            setDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ["staff"] });
          },
          onError: () => toast.error("Failed to update staff member"),
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast.success("Staff member added");
            setDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ["staff"] });
          },
          onError: () => toast.error("Failed to add staff member"),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deletingStaff) return;
    deleteMutation.mutate(
      { id: deletingStaff.id },
      {
        onSuccess: () => {
          toast.success("Staff member removed");
          setDeleteDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["staff"] });
        },
        onError: () => toast.error("Failed to remove staff member"),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Staff</h1>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Add Staff Member
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading staff...</div>
        ) : members.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <UserSquare2 className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No staff added yet</p>
                <p className="text-muted-foreground text-sm">Add staff members to manage access and track sales.</p>
              </div>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" /> Add Staff Member
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium">Name</th>
                  <th className="text-left p-4 font-medium hidden md:table-cell">Email</th>
                  <th className="text-left p-4 font-medium hidden sm:table-cell">Role</th>
                  <th className="text-center p-4 font-medium hidden lg:table-cell">Status</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((member) => (
                  <tr key={member.id} className="bg-background hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="font-medium">{member.name}</p>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell text-muted-foreground">
                      {member.email || "—"}
                    </td>
                    <td className="p-4 hidden sm:table-cell">
                      <Badge variant="secondary" className="capitalize">{member.role.replace("_", " ")}</Badge>
                    </td>
                    <td className="p-4 text-center hidden lg:table-cell">
                      <Badge variant={member.isActive ? "default" : "secondary"}>
                        {member.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(member)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { setDeletingStaff(member); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStaff ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="staff@example.com" />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>POS PIN (optional)</Label>
              <Input
                type="password"
                maxLength={6}
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                placeholder="4–6 digits"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingStaff ? "Save Changes" : "Add Staff Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Staff Member</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Remove <strong>{deletingStaff?.name}</strong> from your team? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
