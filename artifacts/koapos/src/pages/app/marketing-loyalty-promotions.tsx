import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetLoyaltySettings, useUpdateLoyaltySettings,
  useListCategories, useListProducts,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, Pen, Zap, CalendarDays,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PromotionType = "double_points" | "category_bonus" | "product_bonus" | "spend_threshold" | "birthday";

interface LoyaltyPromotion {
  id: string;
  name: string;
  type: PromotionType;
  active: boolean;
  multiplier?: number;
  bonusAmount?: number;
  categoryId?: number | null;
  productId?: number | null;
  minSpend?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  double_points:    "Double Points",
  category_bonus:   "Category Bonus",
  product_bonus:    "Product Bonus",
  spend_threshold:  "Spend Threshold",
  birthday:         "Birthday Bonus",
};

export default function MarketingLoyaltyPromotionsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetLoyaltySettings();
  const updateMutation = useUpdateLoyaltySettings();
  const { data: categoriesData } = useListCategories();
  const { data: productsData } = useListProducts({ limit: 500 });
  const categories = categoriesData ?? [];
  const products = productsData?.items ?? [];

  const [promotions, setPromotions] = useState<LoyaltyPromotion[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LoyaltyPromotion | null>(null);

  useEffect(() => {
    if (settings) {
      setPromotions((settings.promotions ?? []) as LoyaltyPromotion[]);
    }
  }, [settings]);

  const blank = (): LoyaltyPromotion => ({
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    type: "double_points",
    active: true,
    multiplier: 2,
    categoryId: null,
    productId: null,
    minSpend: null,
    startDate: null,
    endDate: null,
  });

  const openNew  = () => { setEditing(blank()); setDialogOpen(true); };
  const openEdit = (p: LoyaltyPromotion) => { setEditing({ ...p }); setDialogOpen(true); };

  const savePromotion = () => {
    if (!editing || !editing.name.trim()) { toast.error("Promotion name is required"); return; }
    const exists = promotions.find((p) => p.id === editing.id);
    const next = exists
      ? promotions.map((p) => (p.id === editing.id ? editing : p))
      : [...promotions, editing];
    setPromotions(next);
    setDialogOpen(false);
    setEditing(null);
    toast.success("Promotion saved — click Save to persist");
  };

  const remove = (id: string) => setPromotions((p) => p.filter((x) => x.id !== id));

  const toggleActive = (id: string) =>
    setPromotions((p) => p.map((x) => (x.id === id ? { ...x, active: !x.active } : x)));

  const handleSave = () => {
    if (!settings) return;
    updateMutation.mutate({
      data: {
        programType:            settings.programType,
        isEnabled:              settings.isEnabled ?? true,
        cashbackRate:           settings.cashbackRate ?? 0.01,
        pointsPerDollar:        settings.pointsPerDollar ?? 1,
        dollarPerPoint:         settings.dollarPerPoint ?? 0.01,
        tiers:                  (settings.tiers ?? []),
        stampsRequired:         settings.stampsRequired ?? 10,
        stampRewardValue:       settings.stampRewardValue ?? 10,
        customDescription:      settings.customDescription ?? "",
        customValue:            settings.customValue ?? 0.01,
        excludedCustomerGroups: (settings.excludedCustomerGroups ?? []) as string[],
        expiryMode:             (settings.expiryMode ?? "none") as "none" | "daysSinceLastPurchase" | "fixedDays" | "endOfYear" | "fixedDate",
        expiryValue:            settings.expiryValue ?? null,
        promotions,
      },
    }, {
      onSuccess: () => {
        toast.success("Promotions saved");
        queryClient.invalidateQueries({ queryKey: ["/api/loyalty/settings"] });
      },
      onError: () => toast.error("Failed to save promotions"),
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 md:p-8 text-center text-muted-foreground">Loading promotions...</div>
      </AppLayout>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Loyalty Promotions</h1>
            <p className="text-muted-foreground mt-1">Run special loyalty campaigns to boost customer engagement.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-1" onClick={openNew}>
              <Plus className="w-3.5 h-3.5" /> New Promotion
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Active Promotions</CardTitle>
            </div>
            <CardDescription>
              Double Points, category bonuses, spend threshold rewards, and birthday bonuses. Changes take effect immediately after saving.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {promotions.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center space-y-3">
                <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-medium">No promotions yet</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Create promotions to boost customer engagement during special events or for specific products.
                </p>
                <Button variant="outline" size="sm" onClick={openNew} className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> New Promotion
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {promotions.map((p) => {
                  const inRange = (!p.startDate || p.startDate <= today) && (!p.endDate || p.endDate >= today);
                  const status  = p.active && inRange ? "Active" : p.active ? "Paused" : "Disabled";
                  const statusColor = p.active && inRange
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : p.active
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-muted text-muted-foreground";

                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                      <div className={cn("rounded-lg p-2 shrink-0", p.active ? "bg-primary/10" : "bg-muted")}>
                        <Zap className={cn("w-4 h-4", p.active ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{p.name}</p>
                          <Badge className={cn("text-[10px] border-0", statusColor)}>{status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {PROMOTION_TYPE_LABELS[p.type]}
                          {p.multiplier ? ` · ${p.multiplier}x multiplier` : ""}
                          {p.bonusAmount ? ` · +${p.bonusAmount} bonus` : ""}
                          {p.categoryId ? ` · ${categories.find((c) => c.id === p.categoryId)?.name ?? "Category"}` : ""}
                          {p.productId ? ` · ${products.find((pr) => pr.id === p.productId)?.name ?? "Product"}` : ""}
                          {p.minSpend ? ` · from $${p.minSpend}` : ""}
                          {(p.startDate || p.endDate) ? ` · ${p.startDate ?? ""}${p.startDate && p.endDate ? " – " : ""}${p.endDate ?? ""}` : ""}
                        </p>
                      </div>
                      <Switch checked={p.active} onCheckedChange={() => toggleActive(p.id)} />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                        <Pen className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(p.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing && promotions.find((p) => p.id === editing.id) ? "Edit Promotion" : "New Promotion"}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Promotion Name</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Weekend Double Points" />
                </div>

                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v as PromotionType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROMOTION_TYPE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {["double_points", "category_bonus", "product_bonus", "spend_threshold", "birthday"].includes(editing.type) && (
                  <div className="space-y-1.5">
                    <Label>Multiplier</Label>
                    <Input type="number" min="1" step="0.5" value={editing.multiplier ?? 1} onChange={(e) => setEditing({ ...editing, multiplier: parseFloat(e.target.value) || 1 })} />
                    <p className="text-xs text-muted-foreground">e.g. 2 = double points, 3 = triple points</p>
                  </div>
                )}

                {editing.type === "category_bonus" && (
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={editing.categoryId ? String(editing.categoryId) : ""} onValueChange={(v) => setEditing({ ...editing, categoryId: v ? parseInt(v) : null })}>
                      <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {editing.type === "product_bonus" && (
                  <div className="space-y-1.5">
                    <Label>Product</Label>
                    <Select value={editing.productId ? String(editing.productId) : ""} onValueChange={(v) => setEditing({ ...editing, productId: v ? parseInt(v) : null })}>
                      <SelectTrigger><SelectValue placeholder="Select product…" /></SelectTrigger>
                      <SelectContent>
                        {products.map((pr) => <SelectItem key={pr.id} value={String(pr.id)}>{pr.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {editing.type === "spend_threshold" && (
                  <div className="space-y-1.5">
                    <Label>Minimum Spend ($)</Label>
                    <Input type="number" min="0" step="0.01" value={editing.minSpend ?? ""} onChange={(e) => setEditing({ ...editing, minSpend: e.target.value ? parseFloat(e.target.value) : null })} placeholder="e.g. 50" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Start Date</Label>
                    <Input type="date" value={editing.startDate ?? ""} onChange={(e) => setEditing({ ...editing, startDate: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> End Date</Label>
                    <Input type="date" value={editing.endDate ?? ""} onChange={(e) => setEditing({ ...editing, endDate: e.target.value || null })} />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
                    <Label className="text-sm">Active</Label>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={savePromotion}>Save Promotion</Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
