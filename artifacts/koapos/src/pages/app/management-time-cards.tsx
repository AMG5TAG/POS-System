import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProducts,
  useListProductTypes,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  getListProductsQueryKey,
  type Product,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { Clock, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

/* Render a minutes count as "1h 30m" / "45m". */
function fmtDuration(mins: number): string {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m";
}

const emptyForm = () => ({ name: "", price: "", hours: "", minutes: "" });

export default function ManagementTimeCardsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm());

  const { data: typesData } = useListProductTypes();
  const timeCardType = (typesData?.items ?? []).find((t) => t.slug === "time_card");

  const { data, isLoading } = useListProducts({ limit: 1000 }, { query: { queryKey: getListProductsQueryKey({ limit: 1000 }) } });
  const timeCards = (data?.items ?? []).filter((p) => p.productType === "time_card");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey({ limit: 1000 }) });
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    const mins = p.timeCardMinutes ?? 0;
    setForm({ name: p.name, price: String(p.price), hours: String(Math.floor(mins / 60) || ""), minutes: String(mins % 60 || "") });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!timeCardType) { toast.error("The Time Card product type isn't set up yet"); return; }
    if (!form.name.trim()) { toast.error("Enter a name"); return; }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) { toast.error("Enter a valid price"); return; }
    const minutes = (parseInt(form.hours) || 0) * 60 + (parseInt(form.minutes) || 0);
    if (minutes <= 0) { toast.error("Enter a duration greater than zero"); return; }

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data: { name: form.name.trim(), price, timeCardMinutes: minutes } as never });
        toast.success("Time card updated");
      } else {
        await createMutation.mutateAsync({ data: { name: form.name.trim(), price, productTypeId: timeCardType.id, timeCardMinutes: minutes, trackInventory: false } as never });
        toast.success("Time card created");
      }
      invalidate();
      setDialogOpen(false);
    } catch {
      toast.error(`Couldn't ${editing ? "update" : "create"} the time card`);
    }
  };

  const handleDelete = async (p: Product) => {
    try {
      await deleteMutation.mutateAsync({ id: p.id });
      toast.success(`"${p.name}" deleted`);
      invalidate();
    } catch {
      toast.error("Couldn't delete the time card");
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Time Cards</h1>
              <p className="text-sm text-muted-foreground">Configure prepaid time products. These sell through the POS and start a timer on the dashboard.</p>
            </div>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Time Card</Button>
        </div>

        {!timeCardType && !isLoading && (
          <Card><CardContent className="py-4 text-sm text-amber-600">
            The "Time Card" product type isn't set up yet. Run the product-types setup (db:push) to enable selling time cards.
          </CardContent></Card>
        )}

        {isLoading ? (
          <Card><CardContent className="flex items-center justify-center py-16">
            <p className="text-muted-foreground text-sm">Loading time cards…</p>
          </CardContent></Card>
        ) : timeCards.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Clock className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No time cards yet</p><p className="text-muted-foreground text-sm">Create a time card to sell prepaid time at the POS.</p></div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> New Time Card</Button>
          </CardContent></Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Duration</th>
                  <th className="text-right p-3 font-medium">Price</th>
                  <th className="p-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {timeCards.map((p) => (
                  <tr key={p.id} className="bg-background hover:bg-muted/20">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-muted-foreground">{fmtDuration(p.timeCardMinutes ?? 0)}</td>
                    <td className="p-3 text-right">{formatCurrency(p.price)}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(p)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Time Card" : "New Time Card"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 1 Hour Pass" />
            </div>
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min="0" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="0" className="w-20" />
                <span className="text-sm text-muted-foreground">hours</span>
                <Input type="number" min="0" max="59" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} placeholder="0" className="w-20" />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Price ($)</Label>
              <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving}>{isSaving ? "Saving…" : editing ? "Save Changes" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
