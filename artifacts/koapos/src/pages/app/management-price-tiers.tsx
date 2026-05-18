import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListPriceTiers,
  useCreatePriceTier,
  useUpdatePriceTier,
  useDeletePriceTier,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { Layers, Plus, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

const EMPTY_FORM = {
  name: "",
  description: "",
  discountType: "percentage" as "percentage" | "fixed",
  discountValue: "",
  isActive: "true",
};

export default function ManagementPriceTiersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: tiers = [], isLoading } = useListPriceTiers();
  const createTier = useCreatePriceTier();
  const updateTier = useUpdatePriceTier();
  const deleteTier = useDeletePriceTier();

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (t: (typeof tiers)[0]) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description ?? "",
      discountType: t.discountType as "percentage" | "fixed",
      discountValue: String(t.discountValue ?? 0),
      isActive: t.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name) { toast.error("Name is required"); return; }
    if (!form.discountValue) { toast.error("Discount value is required"); return; }
    const payload = {
      name: form.name,
      description: form.description || undefined,
      discountType: form.discountType,
      discountValue: parseFloat(form.discountValue),
      isActive: form.isActive,
    };
    if (editingId !== null) {
      updateTier.mutate({ id: editingId, data: payload }, {
        onSuccess: () => { toast.success("Price tier updated"); setDialogOpen(false); },
        onError: () => toast.error("Failed to update"),
      });
    } else {
      createTier.mutate({ data: payload }, {
        onSuccess: () => { toast.success("Price tier created"); setDialogOpen(false); },
        onError: () => toast.error("Failed to create"),
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteTier.mutate({ id }, {
      onSuccess: () => toast.success("Price tier deleted"),
      onError: () => toast.error("Failed to delete"),
    });
  };

  const toggleActive = (t: (typeof tiers)[0]) => {
    updateTier.mutate(
      {
        id: t.id,
        data: {
          name: t.name,
          discountType: t.discountType as "percentage" | "fixed",
          discountValue: t.discountValue ?? 0,
          isActive: t.isActive === "true" ? "false" : "true",
        },
      },
      { onSuccess: () => toast.success(`Tier ${t.isActive === "true" ? "deactivated" : "activated"}`) }
    );
  };

  const formatDiscount = (t: (typeof tiers)[0]) => {
    if (t.discountType === "percentage") return `${t.discountValue}% off`;
    return `${formatCurrency(t.discountValue ?? 0)} off`;
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Layers className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Price Tiers</h1>
              <p className="text-sm text-muted-foreground">Wholesale, VIP, staff and other customer price groups</p>
            </div>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Tier</Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
        ) : tiers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Users className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No price tiers yet</p>
                <p className="text-muted-foreground text-sm">
                  Create price tiers for wholesale customers, VIP members, staff, and other groups.
                </p>
              </div>
              <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Create First Tier</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tiers.map((t) => (
              <Card key={t.id} className={t.isActive === "true" ? "" : "opacity-60"}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{t.name}</p>
                        <Badge variant="secondary">{formatDiscount(t)}</Badge>
                      </div>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    </div>
                    <Switch checked={t.isActive === "true"} onCheckedChange={() => toggleActive(t)} />
                  </div>
                  <div className="flex justify-end gap-1 pt-1 border-t">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(t.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Edit Price Tier" : "New Price Tier"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tier Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Wholesale, VIP, Staff" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description for this tier" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Discount Type</Label>
                <Select value={form.discountType}
                  onValueChange={(v) => setForm({ ...form, discountType: v as "percentage" | "fixed" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{form.discountType === "percentage" ? "Discount (%)" : "Discount ($)"}</Label>
                <Input type="number" step="0.01" value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                  placeholder={form.discountType === "percentage" ? "10" : "5.00"} />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <Label className="cursor-pointer">Active</Label>
              <Switch checked={form.isActive === "true"}
                onCheckedChange={(v) => setForm({ ...form, isActive: v ? "true" : "false" })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createTier.isPending || updateTier.isPending}>
                {editingId ? "Save Changes" : "Create Tier"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
