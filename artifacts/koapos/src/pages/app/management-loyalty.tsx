import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetLoyaltySettings, useUpdateLoyaltySettings, LoyaltySettings,
  useListCategories, useListProducts,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useCustomerSettings } from "@/lib/customer-settings";
import {
  Gift, Percent, Star, Stamp, Wrench, Check, ChevronRight,
  Plus, Trash2, Info, Pen, Clock, Zap, Tag, CalendarDays,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ─── Loyalty naming (localStorage) ─────────────────────────────────────── */

const LOYALTY_NAMING_KEY = "koapos_loyalty_naming";

interface LoyaltyNaming {
  programName:      string;
  cashbackUnit:     string;
  pointsUnit:       string;
  stampUnit:        string;
  tieredUnit:       string;
  customUnit:       string;
}

const NAMING_DEFAULTS: LoyaltyNaming = {
  programName:  "",
  cashbackUnit: "Credits",
  pointsUnit:   "Points",
  stampUnit:    "Stamps",
  tieredUnit:   "Credits",
  customUnit:   "Rewards",
};

function loadLoyaltyNaming(): LoyaltyNaming {
  try {
    const raw = localStorage.getItem(LOYALTY_NAMING_KEY);
    return raw ? { ...NAMING_DEFAULTS, ...JSON.parse(raw) } : NAMING_DEFAULTS;
  } catch { return NAMING_DEFAULTS; }
}

function saveLoyaltyNaming(s: LoyaltyNaming) {
  localStorage.setItem(LOYALTY_NAMING_KEY, JSON.stringify(s));
}

const LOYALTY_TABS = [
  { href: "#program-type",     label: "Program Type" },
  { href: "#program-settings", label: "Settings" },
  { href: "#program-identity", label: "Naming" },
  { href: "#promotions",       label: "Promotions" },
  { href: "#excluded-groups",  label: "Excluded Groups" },
  { href: "#expiry",           label: "Expiry" },
  { href: "#program-summary",  label: "Summary" },
];

/* ─── Program types ──────────────────────────────────────────────────────── */

type ProgramType = "cashback" | "points" | "tiered" | "stamp" | "custom";

type PromotionType = "double_points" | "category_bonus" | "product_bonus" | "spend_threshold" | "birthday";

interface Tier {
  name: string;
  minSpend?: number;
  pointsRequired?: number;
  rate?: number;
  discountPct?: number;
  freeShipping?: boolean;
  bonusMultiplier?: number;
  description?: string;
}

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

const PROGRAMS: {
  type: ProgramType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}[] = [
  {
    type: "cashback",
    label: "Cash Back",
    description: "Customers earn a percentage of each sale back as store credit.",
    icon: Percent,
    badge: "Default",
  },
  {
    type: "points",
    label: "Points",
    description: "Earn points per dollar spent, redeemable for discounts.",
    icon: Star,
  },
  {
    type: "tiered",
    label: "Tiered Cash Back",
    description: "Different cashback rates based on customer's total spend history.",
    icon: ChevronRight,
  },
  {
    type: "stamp",
    label: "Stamp Card",
    description: "Earn a stamp per visit. Collect enough stamps to claim a reward.",
    icon: Stamp,
  },
  {
    type: "custom",
    label: "Custom",
    description: "Define your own loyalty reward system with a custom description.",
    icon: Wrench,
  },
];

const ICONS: Record<ProgramType, React.ComponentType<{ className?: string }>> = {
  cashback: Percent,
  points:   Star,
  tiered:   ChevronRight,
  stamp:    Stamp,
  custom:   Wrench,
};

const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  double_points:    "Double Points",
  category_bonus:   "Category Bonus",
  product_bonus:    "Product Bonus",
  spend_threshold:  "Spend Threshold",
  birthday:         "Birthday Bonus",
};

/* ─── Promotions Card component ─────────────────────────────────────────── */

function PromotionsCard({
  promotions,
  onChange,
  categories,
  products,
}: {
  promotions: LoyaltyPromotion[];
  onChange: (p: LoyaltyPromotion[]) => void;
  categories: { id: number; name: string }[];
  products: { id: number; name: string }[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LoyaltyPromotion | null>(null);

  const blankPromotion = (): LoyaltyPromotion => ({
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    type: "double_points",
    active: true,
    multiplier: 2,
    bonusAmount: undefined,
    categoryId: null,
    productId: null,
    minSpend: null,
    startDate: null,
    endDate: null,
  });

  const openNew = () => { setEditing(blankPromotion()); setDialogOpen(true); };
  const openEdit = (p: LoyaltyPromotion) => { setEditing({ ...p }); setDialogOpen(true); };

  const save = () => {
    if (!editing || !editing.name.trim()) { toast.error("Promotion name is required"); return; }
    const exists = promotions.find((p) => p.id === editing.id);
    const next = exists
      ? promotions.map((p) => (p.id === editing.id ? editing : p))
      : [...promotions, editing];
    onChange(next);
    setDialogOpen(false);
    setEditing(null);
    toast.success("Promotion saved");
  };

  const remove = (id: string) => {
    onChange(promotions.filter((p) => p.id !== id));
    toast.success("Promotion removed");
  };

  const toggleActive = (id: string) => {
    onChange(promotions.map((p) => (p.id === id ? { ...p, active: !p.active } : p)));
  };

  return (
    <Card id="promotions">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Loyalty Promotions</CardTitle>
          </div>
          <Button size="sm" variant="outline" className="gap-1" onClick={openNew}>
            <Plus className="w-3.5 h-3.5" /> New Promotion
          </Button>
        </div>
        <CardDescription>
          Run special loyalty campaigns like Double Points, category bonuses, and spend threshold rewards.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {promotions.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center space-y-2">
            <Zap className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm font-medium">No promotions yet</p>
            <p className="text-xs text-muted-foreground">Create promotions to boost customer engagement during special events or for specific products.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {promotions.map((p) => {
              const active = p.active;
              const today = new Date().toISOString().slice(0, 10);
              const inRange = (!p.startDate || p.startDate <= today) && (!p.endDate || p.endDate >= today);
              const status = active && inRange ? "Active" : active ? "Paused" : "Disabled";
              const statusColor = active && inRange
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : active ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-muted text-muted-foreground";

              return (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                  <div className={cn("rounded-lg p-2 shrink-0", active ? "bg-primary/10" : "bg-muted")}>
                    <Zap className={cn("w-4 h-4", active ? "text-primary" : "text-muted-foreground")} />
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
                      {p.startDate || p.endDate ? (
                        ` · ${p.startDate ?? ""}${p.startDate && p.endDate ? " – " : ""}${p.endDate ?? ""}`
                      ) : ""}
                    </p>
                  </div>
                  <Switch
                    checked={p.active}
                    onCheckedChange={() => toggleActive(p.id)}
                  />
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROMOTION_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(editing.type === "double_points" || editing.type === "category_bonus" || editing.type === "product_bonus" || editing.type === "spend_threshold" || editing.type === "birthday") && (
                <div className="space-y-1.5">
                  <Label>Multiplier</Label>
                  <Input type="number" min="1" step="0.5" value={editing.multiplier ?? 1} onChange={(e) => setEditing({ ...editing, multiplier: parseFloat(e.target.value) || 1 })} />
                  <p className="text-xs text-muted-foreground">e.g. 2 = double points, 3 = triple points</p>
                </div>
              )}

              {(editing.type === "category_bonus") && (
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={editing.categoryId ? String(editing.categoryId) : ""} onValueChange={(v) => setEditing({ ...editing, categoryId: v ? parseInt(v) : null })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(editing.type === "product_bonus") && (
                <div className="space-y-1.5">
                  <Label>Product</Label>
                  <Select value={editing.productId ? String(editing.productId) : ""} onValueChange={(v) => setEditing({ ...editing, productId: v ? parseInt(v) : null })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select product…" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((pr) => (
                        <SelectItem key={pr.id} value={String(pr.id)}>{pr.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(editing.type === "spend_threshold") && (
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
                  <Button onClick={save}>Save Promotion</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function toForm(s: LoyaltySettings) {
  return {
    programType:            s.programType as ProgramType,
    isEnabled:              s.isEnabled ?? true,
    cashbackRate:           ((s.cashbackRate ?? 0.01) * 100).toString(),
    pointsPerDollar:        (s.pointsPerDollar ?? 1).toString(),
    dollarPerPoint:         (s.dollarPerPoint ?? 0.01).toString(),
    tiers:                  (s.tiers ?? [{ name: "Bronze", minSpend: 0, rate: 1 }, { name: "Silver", minSpend: 500, rate: 2 }, { name: "Gold", minSpend: 1000, rate: 3 }]) as Tier[],
    stampsRequired:         (s.stampsRequired ?? 10).toString(),
    stampRewardValue:       (s.stampRewardValue ?? 10).toString(),
    customDescription:      s.customDescription ?? "",
    customValue:            ((s.customValue ?? 0.01) * 100).toString(),
    excludedCustomerGroups: (s.excludedCustomerGroups ?? []) as string[],
    expiryMode:             (s.expiryMode ?? "none") as "none" | "daysSinceLastPurchase" | "fixedDays" | "endOfYear" | "fixedDate",
    expiryValue:            s.expiryValue ?? null,
    promotions:             (s.promotions ?? []) as LoyaltyPromotion[],
  };
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

/* Export so other pages can read the naming */
export { loadLoyaltyNaming, type LoyaltyNaming };

export default function ManagementLoyaltyPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetLoyaltySettings();
  const updateMutation = useUpdateLoyaltySettings();
  const { settings: customerConfig } = useCustomerSettings();
  const { data: categoriesData } = useListCategories();
  const { data: productsData } = useListProducts({ limit: 500 });
  const categories = categoriesData ?? [];
  const products = productsData?.items ?? [];

  const [naming, setNaming] = useState<LoyaltyNaming>(() => loadLoyaltyNaming());

  const setNamingField = <K extends keyof LoyaltyNaming>(key: K, value: string) =>
    setNaming((prev) => ({ ...prev, [key]: value }));

  const handleSaveNaming = () => {
    saveLoyaltyNaming(naming);
    toast.success("Loyalty program naming saved");
  };

  const [form, setForm] = useState({
    programType:            "cashback" as ProgramType,
    isEnabled:              true,
    cashbackRate:           "1",
    pointsPerDollar:        "1",
    dollarPerPoint:         "0.01",
    tiers:                  [
      { name: "Bronze", minSpend: 0,    rate: 1 },
      { name: "Silver", minSpend: 500,  rate: 2 },
      { name: "Gold",   minSpend: 1000, rate: 3 },
    ] as Tier[],
    stampsRequired:         "10",
    stampRewardValue:       "10",
    customDescription:      "",
    customValue:            "1",
    excludedCustomerGroups: [] as string[],
    expiryMode:             "none" as "none" | "daysSinceLastPurchase" | "fixedDays" | "endOfYear" | "fixedDate",
    expiryValue:            null as number | null,
    promotions:             [] as LoyaltyPromotion[],
  });

  useEffect(() => {
    if (settings) setForm(toForm(settings));
  }, [settings]);

  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleGroup = (id: string) =>
    set(
      "excludedCustomerGroups",
      form.excludedCustomerGroups.includes(id)
        ? form.excludedCustomerGroups.filter((g) => g !== id)
        : [...form.excludedCustomerGroups, id]
    );

  const addTier = () =>
    set("tiers", [...form.tiers, { name: "New Tier", minSpend: 0, rate: 1 }]);

  const removeTier = (i: number) =>
    set("tiers", form.tiers.filter((_, idx) => idx !== i));

  const updateTier = (i: number, key: keyof Tier, value: string | number | boolean) =>
    set("tiers", form.tiers.map((t, idx) => idx === i ? { ...t, [key]: value } : t));

  const handleSave = () => {
    updateMutation.mutate({
      data: {
        programType:            form.programType,
        isEnabled:              form.isEnabled,
        cashbackRate:           parseFloat(form.cashbackRate) / 100,
        pointsPerDollar:        parseFloat(form.pointsPerDollar),
        dollarPerPoint:         parseFloat(form.dollarPerPoint),
        tiers:                  form.tiers.map(t => ({ ...t, rate: (t.rate ?? 0) / 100 })),
        stampsRequired:         parseInt(form.stampsRequired),
        stampRewardValue:       parseFloat(form.stampRewardValue),
        customDescription:      form.customDescription,
        customValue:            parseFloat(form.customValue) / 100,
        excludedCustomerGroups: form.excludedCustomerGroups,
        expiryMode:             form.expiryMode,
        expiryValue:            form.expiryValue,
        promotions:             form.promotions,
      },
    }, {
      onSuccess: () => {
        toast.success("Loyalty settings saved");
        queryClient.invalidateQueries({ queryKey: ["/api/loyalty/settings"] });
      },
      onError: () => toast.error("Failed to save loyalty settings"),
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 md:p-8 text-center text-muted-foreground">Loading loyalty settings...</div>
      </AppLayout>
    );
  }

  const ProgramIcon = ICONS[form.programType];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Loyalty Program</h1>
            <p className="text-muted-foreground mt-1">Reward customers for repeat purchases.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isEnabled}
                onCheckedChange={(v) => set("isEnabled", v)}
              />
              <Label className="text-sm">{form.isEnabled ? "Enabled" : "Disabled"}</Label>
            </div>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* Program selector */}
        <Card id="program-type">
          <CardHeader>
            <CardTitle className="text-base">Program Type</CardTitle>
            <CardDescription>Choose how customers earn rewards.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PROGRAMS.map(({ type, label, description, icon: Icon, badge }) => {
                const active = form.programType === type;
                return (
                  <button
                    key={type}
                    onClick={() => set("programType", type)}
                    className={cn(
                      "relative text-left rounded-xl border-2 p-4 transition-all focus:outline-none focus:ring-2 focus:ring-primary/40",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 bg-card"
                    )}
                  >
                    {badge && (
                      <Badge className="absolute top-3 right-3 text-[10px] px-1.5 py-0 h-4">{badge}</Badge>
                    )}
                    {active && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                    <Icon className={cn("w-5 h-5 mb-2", active ? "text-primary" : "text-muted-foreground")} />
                    <p className={cn("font-semibold text-sm", active && "text-primary")}>{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Program config */}
        <Card id="program-settings">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ProgramIcon className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">
                {PROGRAMS.find(p => p.type === form.programType)?.label} Settings
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {form.programType === "cashback" && (
              <div className="space-y-4">
                <div>
                  <Label>Cashback Rate (%)</Label>
                  <p className="text-xs text-muted-foreground mb-2">Percentage of the sale total customers earn back.</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" step="0.1" min="0" max="100"
                      value={form.cashbackRate}
                      onChange={(e) => set("cashbackRate", e.target.value)}
                      className="max-w-[120px]"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 border px-4 py-3 text-sm flex items-start gap-2">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Example: A {form.cashbackRate}% cashback rate means a $100 sale earns ${(parseFloat(form.cashbackRate || "0") / 100 * 100).toFixed(2)} in store credit.
                  </span>
                </div>
              </div>
            )}

            {form.programType === "points" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Points Per Dollar Spent</Label>
                    <p className="text-xs text-muted-foreground mb-2">Points earned per $1 of sale value.</p>
                    <Input
                      type="number" step="1" min="1"
                      value={form.pointsPerDollar}
                      onChange={(e) => set("pointsPerDollar", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Redemption ($ per point)</Label>
                    <p className="text-xs text-muted-foreground mb-2">Dollar value of each point when redeemed.</p>
                    <Input
                      type="number" step="0.01" min="0.01"
                      value={form.dollarPerPoint}
                      onChange={(e) => set("dollarPerPoint", e.target.value)}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 border px-4 py-3 text-sm flex items-start gap-2">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Example: A $100 sale earns {Math.floor(parseFloat(form.pointsPerDollar || "1") * 100)} points,
                    worth ${(Math.floor(parseFloat(form.pointsPerDollar || "1") * 100) * parseFloat(form.dollarPerPoint || "0.01")).toFixed(2)} in discounts.
                  </span>
                </div>
              </div>
            )}

            {form.programType === "tiered" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Define tiers customers climb by lifetime spend or points. Each tier can offer its own cashback rate, automatic discount, bonus multiplier, and free shipping.
                </p>
                <div className="space-y-3">
                  {form.tiers.map((tier, i) => (
                    <div key={i} className="p-3 rounded-xl border bg-muted/20 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div>
                            <Label className="text-xs">Tier Name</Label>
                            <Input
                              value={tier.name}
                              onChange={(e) => updateTier(i, "name", e.target.value)}
                              className="h-8 mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Min Spend ($)</Label>
                            <Input
                              type="number" min="0"
                              value={tier.minSpend ?? 0}
                              onChange={(e) => updateTier(i, "minSpend", parseFloat(e.target.value) || 0)}
                              className="h-8 mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Points Required</Label>
                            <Input
                              type="number" min="0"
                              value={tier.pointsRequired ?? 0}
                              onChange={(e) => updateTier(i, "pointsRequired", parseFloat(e.target.value) || 0)}
                              className="h-8 mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Cashback Rate (%)</Label>
                            <Input
                              type="number" min="0" max="100" step="0.1"
                              value={tier.rate ?? 0}
                              onChange={(e) => updateTier(i, "rate", parseFloat(e.target.value) || 0)}
                              className="h-8 mt-1"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive mt-5"
                          onClick={() => removeTier(i)}
                          disabled={form.tiers.length <= 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <Label className="text-xs">Discount %</Label>
                          <Input
                            type="number" min="0" max="100" step="0.5"
                            value={tier.discountPct ?? 0}
                            onChange={(e) => updateTier(i, "discountPct", parseFloat(e.target.value) || 0)}
                            className="h-8 mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Bonus Multiplier</Label>
                          <Input
                            type="number" min="1" step="0.1"
                            value={tier.bonusMultiplier ?? 1}
                            onChange={(e) => updateTier(i, "bonusMultiplier", parseFloat(e.target.value) || 1)}
                            className="h-8 mt-1"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-5">
                          <Switch
                            checked={tier.freeShipping ?? false}
                            onCheckedChange={(v) => updateTier(i, "freeShipping", v)}
                          />
                          <Label className="text-xs">Free Shipping</Label>
                        </div>
                        <div>
                          <Label className="text-xs">Description</Label>
                          <Input
                            value={tier.description ?? ""}
                            onChange={(e) => updateTier(i, "description", e.target.value)}
                            placeholder="e.g. Priority support"
                            className="h-8 mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={addTier} className="gap-1.5">
                  <Plus className="w-4 h-4" /> Add Tier
                </Button>
              </div>
            )}

            {form.programType === "stamp" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Stamps Required</Label>
                    <p className="text-xs text-muted-foreground mb-2">Number of purchases to earn a reward.</p>
                    <Input
                      type="number" min="1"
                      value={form.stampsRequired}
                      onChange={(e) => set("stampsRequired", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Reward Value ($)</Label>
                    <p className="text-xs text-muted-foreground mb-2">Dollar value of the reward when earned.</p>
                    <Input
                      type="number" step="0.50" min="0.50"
                      value={form.stampRewardValue}
                      onChange={(e) => set("stampRewardValue", e.target.value)}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 border px-4 py-3 text-sm flex items-start gap-2">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Customers earn 1 stamp per visit. After {form.stampsRequired} visits they earn a ${form.stampRewardValue} reward.
                  </span>
                </div>
              </div>
            )}

            {form.programType === "custom" && (
              <div className="space-y-4">
                <div>
                  <Label>Custom Program Description</Label>
                  <p className="text-xs text-muted-foreground mb-2">Describe how your loyalty program works.</p>
                  <textarea
                    className="w-full border rounded-lg p-3 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                    rows={3}
                    value={form.customDescription}
                    onChange={(e) => set("customDescription", e.target.value)}
                    placeholder="e.g. Earn 5% back on all purchases over $50. Rewards are applied automatically on your next visit."
                  />
                </div>
                <div>
                  <Label>Effective Reward Rate (%)</Label>
                  <p className="text-xs text-muted-foreground mb-2">Used to calculate loyalty preview on the POS screen.</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" step="0.1" min="0" max="100"
                      value={form.customValue}
                      onChange={(e) => set("customValue", e.target.value)}
                      className="max-w-[120px]"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Program Identity / Naming */}
        <Card id="program-identity">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Pen className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Program Identity</CardTitle>
            </div>
            <CardDescription>Customise the name of your loyalty program and what your reward currency is called.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Program Name</Label>
              <Input
                value={naming.programName}
                onChange={(e) => setNamingField("programName", e.target.value)}
                placeholder="e.g. Koala Rewards, VIP Club, Star Points"
              />
              <p className="text-xs text-muted-foreground">Shown on receipts and customer screens. Leave blank to use the default program type label.</p>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">Reward Unit Names</p>
              <p className="text-xs text-muted-foreground mb-4">Rename what the earned currency is called for each program type. E.g. rename "Points" to "Stars" or "Credits" to "Coins".</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    { key: "cashbackUnit" as keyof LoyaltyNaming, label: "Cash Back",         placeholder: "Credits"  },
                    { key: "pointsUnit"   as keyof LoyaltyNaming, label: "Points",             placeholder: "Points"   },
                    { key: "tieredUnit"   as keyof LoyaltyNaming, label: "Tiered Cash Back",   placeholder: "Credits"  },
                    { key: "stampUnit"    as keyof LoyaltyNaming, label: "Stamp Card",         placeholder: "Stamps"   },
                    { key: "customUnit"   as keyof LoyaltyNaming, label: "Custom",             placeholder: "Rewards"  },
                  ]
                ).map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      value={naming[key]}
                      onChange={(e) => setNamingField(key, e.target.value)}
                      placeholder={placeholder}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveNaming}>Save Naming</Button>
            </div>
          </CardContent>
        </Card>

        {/* Promotions */}
        <PromotionsCard
          promotions={form.promotions}
          onChange={(promotions) => set("promotions", promotions)}
          categories={categories}
          products={products}
        />

        {/* Loyalty Expiry */}
        <Card id="expiry">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Loyalty Expiry</CardTitle>
            </div>
            <CardDescription>Choose when customer loyalty points expire.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                { mode: "none" as const,                  label: "Never",         desc: "Points never expire." },
                { mode: "daysSinceLastPurchase" as const, label: "Days since last purchase", desc: "Points expire if a customer hasn't made a purchase within a set number of days." },
                { mode: "fixedDays" as const,              label: "Fixed days",    desc: "Points expire a fixed number of days after they were earned." },
                { mode: "endOfYear" as const,              label: "End of year",   desc: "All points reset at the end of each calendar year." },
                { mode: "fixedDate" as const,             label: "Fixed date",    desc: "Points expire on a specific date each year." },
              ]).map(({ mode, label, desc }) => {
                const active = form.expiryMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => set("expiryMode", mode)}
                    className={cn(
                      "relative text-left rounded-xl border-2 p-4 transition-all focus:outline-none focus:ring-2 focus:ring-primary/40",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 bg-card"
                    )}
                  >
                    {active && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                    <p className={cn("font-semibold text-sm", active && "text-primary")}>{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{desc}</p>
                  </button>
                );
              })}
            </div>

            {form.expiryMode === "daysSinceLastPurchase" && (
              <div className="space-y-2">
                <Label>Days since last purchase</Label>
                <p className="text-xs text-muted-foreground">If a customer hasn't purchased within this many days, their loyalty points expire.</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min="1" max="3650"
                    value={form.expiryValue ?? ""}
                    onChange={(e) => set("expiryValue", e.target.value ? parseInt(e.target.value) : null)}
                    className="max-w-[160px]"
                    placeholder="e.g. 365"
                  />
                  <span className="text-muted-foreground text-sm">days</span>
                </div>
              </div>
            )}

            {form.expiryMode === "fixedDays" && (
              <div className="space-y-2">
                <Label>Fixed days after earning</Label>
                <p className="text-xs text-muted-foreground">Points expire this many days after they were first earned.</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min="1" max="3650"
                    value={form.expiryValue ?? ""}
                    onChange={(e) => set("expiryValue", e.target.value ? parseInt(e.target.value) : null)}
                    className="max-w-[160px]"
                    placeholder="e.g. 180"
                  />
                  <span className="text-muted-foreground text-sm">days</span>
                </div>
              </div>
            )}

            {form.expiryMode === "fixedDate" && (
              <div className="space-y-2">
                <Label>Day of year (1-366)</Label>
                <p className="text-xs text-muted-foreground">All points expire on this day of each year. Use 1-366 (leap-year safe).</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min="1" max="366"
                    value={form.expiryValue ?? ""}
                    onChange={(e) => set("expiryValue", e.target.value ? parseInt(e.target.value) : null)}
                    className="max-w-[160px]"
                    placeholder="e.g. 365"
                  />
                  <span className="text-muted-foreground text-sm">day of year</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer group exclusions */}
        <Card id="excluded-groups">
          <CardHeader>
            <CardTitle className="text-base">Excluded Customer Groups</CardTitle>
            <CardDescription>Customers in these groups will not earn loyalty rewards.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {customerConfig.groups.map((group) => {
                const excluded = form.excludedCustomerGroups.includes(group.id);
                return (
                  <button
                    key={group.id}
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-sm font-medium transition-all focus:outline-none",
                      excluded
                        ? "border-destructive/60 bg-destructive/5 text-destructive"
                        : "border-border bg-card hover:border-primary/40"
                    )}
                  >
                    <div
                      className="w-7 h-7 rounded-full"
                      style={{ backgroundColor: group.color + "33", border: `2px solid ${group.color}` }}
                    />
                    <span>{group.name}</span>
                    {excluded && <span className="text-[10px] text-destructive font-normal">Excluded</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Tip: Commonly excluded groups include "Staff" to avoid staff members earning rewards on their own purchases.
            </p>
          </CardContent>
        </Card>

        {/* Program summary */}
        <Card id="program-summary" className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" />
              <CardTitle className="text-base text-primary">Program Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            {!form.isEnabled && (
              <p className="text-destructive font-medium">Loyalty program is currently disabled.</p>
            )}
            {form.isEnabled && form.programType === "cashback" && (
              <p>Eligible customers earn <strong>{form.cashbackRate}%</strong> cashback on each sale.</p>
            )}
            {form.isEnabled && form.programType === "points" && (
              <p>Customers earn <strong>{form.pointsPerDollar} point{parseFloat(form.pointsPerDollar) !== 1 ? "s" : ""} per $1</strong> spent. Each point is worth <strong>${form.dollarPerPoint}</strong>.</p>
            )}
            {form.isEnabled && form.programType === "tiered" && (
              <p>Tiered cashback: {form.tiers.map(t => `${t.name} (${t.rate}% from $${t.minSpend})`).join(", ")}.</p>
            )}
            {form.isEnabled && form.programType === "stamp" && (
              <p>Customers earn 1 stamp per visit. Every <strong>{form.stampsRequired} stamps</strong> earns a <strong>${form.stampRewardValue}</strong> reward.</p>
            )}
            {form.isEnabled && form.programType === "custom" && form.customDescription && (
              <p>{form.customDescription}</p>
            )}
            {form.excludedCustomerGroups.length > 0 && (
              <p>Excluded groups: <strong>
                {form.excludedCustomerGroups
                  .map((id) => customerConfig.groups.find((g) => g.id === id)?.name ?? id)
                  .join(", ")}
              </strong>.</p>
            )}
            {form.isEnabled && form.expiryMode !== "none" && (
              <p>
                {form.expiryMode === "daysSinceLastPurchase" && <>Points expire after <strong>{form.expiryValue} days</strong> without a purchase.</>}
                {form.expiryMode === "fixedDays" && <>Points expire <strong>{form.expiryValue} days</strong> after being earned.</>}
                {form.expiryMode === "endOfYear" && <>All points expire at the <strong>end of each calendar year</strong>.</>}
                {form.expiryMode === "fixedDate" && <>All points expire on day <strong>{form.expiryValue}</strong> of each year.</>}
              </p>
            )}
            <p className="text-xs">Loyalty amounts are displayed on the POS screen and printed on receipts.</p>
          </CardContent>
        </Card>
        </div>{/* end 2-col grid */}
      </div>
    </AppLayout>
  );
}
