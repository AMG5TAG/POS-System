import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListDiscounts,
  useCreateDiscount,
  useUpdateDiscount,
  useDeleteDiscount,
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
import { formatCurrency } from "@/lib/utils";
import { Percent, Plus, Tag, Pencil, Trash2, Copy, CheckCircle } from "lucide-react";
import { toast } from "sonner";

type DiscountType = "percentage" | "fixed" | "bogo";

const TYPE_LABELS: Record<DiscountType, string> = {
  percentage: "% Off",
  fixed: "$ Off",
  bogo: "Buy One Get One",
};

const EMPTY_FORM = {
  name: "",
  code: "",
  type: "percentage" as DiscountType,
  value: "",
  minOrderAmount: "",
  maxUses: "",
  startDate: "",
  endDate: "",
  isActive: "true",
};

export default function ManagementDiscountsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: discounts = [], isLoading } = useListDiscounts();
  const createDiscount = useCreateDiscount();
  const updateDiscount = useUpdateDiscount();
  const deleteDiscount = useDeleteDiscount();

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (d: (typeof discounts)[0]) => {
    setEditingId(d.id);
    setForm({
      name: d.name,
      code: d.code ?? "",
      type: d.type as DiscountType,
      value: String(d.value ?? ""),
      minOrderAmount: d.minOrderAmount ? String(d.minOrderAmount) : "",
      maxUses: d.maxUses ? String(d.maxUses) : "",
      startDate: d.startDate ?? "",
      endDate: d.endDate ?? "",
      isActive: d.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name) { toast.error("Name is required"); return; }
    if (!form.value) { toast.error("Value is required"); return; }
    const payload = {
      name: form.name,
      code: form.code || undefined,
      type: form.type,
      value: parseFloat(form.value),
      minOrderAmount: form.minOrderAmount ? parseFloat(form.minOrderAmount) : undefined,
      maxUses: form.maxUses ? parseInt(form.maxUses) : undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      isActive: form.isActive,
    };
    if (editingId !== null) {
      updateDiscount.mutate({ id: editingId, data: payload }, {
        onSuccess: () => { toast.success("Discount updated"); setDialogOpen(false); },
        onError: () => toast.error("Failed to update"),
      });
    } else {
      createDiscount.mutate({ data: payload }, {
        onSuccess: () => { toast.success("Discount created"); setDialogOpen(false); },
        onError: () => toast.error("Failed to create"),
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteDiscount.mutate({ id }, {
      onSuccess: () => toast.success("Discount deleted"),
      onError: () => toast.error("Failed to delete"),
    });
  };

  const toggleActive = (d: (typeof discounts)[0]) => {
    updateDiscount.mutate(
      {
        id: d.id,
        data: {
          name: d.name,
          type: d.type,
          value: d.value ?? 0,
          isActive: d.isActive === "true" ? "false" : "true",
        },
      },
      { onSuccess: () => toast.success(`Discount ${d.isActive === "true" ? "deactivated" : "activated"}`) }
    );
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatValue = (d: (typeof discounts)[0]) => {
    if (d.type === "percentage") return `${d.value}% off`;
    if (d.type === "fixed") return `${formatCurrency(d.value ?? 0)} off`;
    return "BOGO";
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Percent className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Discounts & Promotions</h1>
              <p className="text-sm text-muted-foreground">Manage discount codes and automatic promotions</p>
            </div>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Discount</Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
        ) : discounts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Percent className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No discounts yet</p>
                <p className="text-muted-foreground text-sm">Create discount codes and promotions to reward your customers.</p>
              </div>
              <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Create First Discount</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {discounts.map((d) => (
              <Card key={d.id} className={d.isActive === "true" ? "" : "opacity-60"}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Tag className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{d.name}</p>
                          <Badge variant="secondary" className="font-mono text-xs">{formatValue(d)}</Badge>
                          {d.isActive !== "true" && <Badge variant="outline">Inactive</Badge>}
                        </div>
                        {d.code && (
                          <button
                            onClick={() => copyCode(d.code!)}
                            className="flex items-center gap-1.5 mt-1 font-mono text-sm text-primary hover:text-primary/80 transition-colors"
                          >
                            {copiedCode === d.code ? (
                              <><CheckCircle className="w-3.5 h-3.5" /> Copied!</>
                            ) : (
                              <><Copy className="w-3.5 h-3.5" /> {d.code}</>
                            )}
                          </button>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {!d.code && <span>Automatic discount</span>}
                          {d.minOrderAmount && <span>Min. order: {formatCurrency(d.minOrderAmount)}</span>}
                          {d.maxUses && <span>Uses: {d.usedCount}/{d.maxUses}</span>}
                          {d.startDate && <span>From {d.startDate}</span>}
                          {d.endDate && <span>Until {d.endDate}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={d.isActive === "true"}
                        onCheckedChange={() => toggleActive(d)}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(d.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit Discount" : "New Discount"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Discount Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Summer Sale, VIP Discount" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as DiscountType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{form.type === "percentage" ? "Percentage (%)" : form.type === "fixed" ? "Amount ($)" : "Value"}</Label>
                <Input type="number" step="0.01" value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={form.type === "percentage" ? "10" : "5.00"}
                  disabled={form.type === "bogo"} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Coupon Code <span className="text-muted-foreground text-xs">(leave blank for automatic)</span></Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. SUMMER20" className="font-mono uppercase" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Min. Order Amount ($)</Label>
                <Input type="number" step="0.01" value={form.minOrderAmount}
                  onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Max Uses</Label>
                <Input type="number" value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="Unlimited" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <Label className="cursor-pointer">Active</Label>
              <Switch checked={form.isActive === "true"}
                onCheckedChange={(v) => setForm({ ...form, isActive: v ? "true" : "false" })} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createDiscount.isPending || updateDiscount.isPending}>
                {editingId ? "Save Changes" : "Create Discount"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
