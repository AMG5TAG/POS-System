import { useEffect, useMemo, useState } from "react";
import {
  useListCategories,
  useListProducts,
  useUpdateProduct,
  Product,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCustomerSettings, DEFAULT_CUSTOMER_GROUPS } from "@/lib/customer-settings";
import {
  GroupPricingRule, GroupPriceFormula, CategoryRule, PriceBasis, PriceMode,
  GROUP_PRICE_PRESETS, BASIS_LABELS,
  makeDefaultRule, matchPresetId, formulaLabel, computeGroupPrice,
} from "@/lib/group-pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Tags, Plus, X, Save, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";

interface Cat { id: number; name: string }

/* ── Reusable formula editor: quick preset + always-visible custom controls ── */

function FormulaEditor({ formula, onChange }: { formula: GroupPriceFormula; onChange: (f: GroupPriceFormula) => void }) {
  const presetId = matchPresetId(formula) ?? "custom";
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={presetId}
          onValueChange={(v) => {
            const preset = GROUP_PRICE_PRESETS.find((p) => p.id === v);
            if (preset) onChange({ ...preset.formula });
          }}
        >
          <SelectTrigger className="h-8 w-[200px] text-sm"><SelectValue placeholder="Choose a preset…" /></SelectTrigger>
          <SelectContent>
            {GROUP_PRICE_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
            <SelectItem value="custom" disabled>Custom (set below)</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="font-mono text-xs">{formulaLabel(formula)}</Badge>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Based on</Label>
          <Select value={formula.basis} onValueChange={(v) => onChange({ ...formula, basis: v as PriceBasis })}>
            <SelectTrigger className="h-8 w-[130px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(BASIS_LABELS) as PriceBasis[]).map((b) => (
                <SelectItem key={b} value={b}>{BASIS_LABELS[b]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Adjust</Label>
          <Select value={formula.mode} onValueChange={(v) => onChange({ ...formula, mode: v as PriceMode })}>
            <SelectTrigger className="h-8 w-[110px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="markup">Markup +</SelectItem>
              <SelectItem value="discount">Discount −</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Percent</Label>
          <div className="relative">
            <Input
              type="number" min={0} step="0.5"
              value={formula.percent}
              onChange={(e) => onChange({ ...formula, percent: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="h-8 w-[90px] pr-6 text-sm"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs select-none">%</span>
          </div>
        </div>
        <label className="flex items-center gap-2 h-8 cursor-pointer">
          <Switch checked={formula.capAtRRP} onCheckedChange={(c) => onChange({ ...formula, capAtRRP: c })} />
          <span className="text-xs text-muted-foreground">Cap at RRP</span>
        </label>
      </div>
    </div>
  );
}

/* ── Per-group rule card ──────────────────────────────────────────────────── */

function GroupRuleCard({
  groupName, groupColor, rule, categories, onChange,
}: {
  groupName: string;
  groupColor: string;
  rule: GroupPricingRule;
  categories: Cat[];
  onChange: (r: GroupPricingRule) => void;
}) {
  const [addCatId, setAddCatId] = useState<string>("");
  const catName = (id: number) => categories.find((c) => c.id === id)?.name ?? `#${id}`;
  const usedCatIds = new Set(rule.categoryRules.map((c) => c.categoryId));
  const availableCats = categories.filter((c) => !usedCatIds.has(c.id));

  const setCatRule = (categoryId: number, patch: Partial<CategoryRule>) =>
    onChange({
      ...rule,
      categoryRules: rule.categoryRules.map((c) => (c.categoryId === categoryId ? { ...c, ...patch } : c)),
    });

  return (
    <Card className={cn(!rule.enabled && "opacity-70")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: groupColor }} />
            <span className="font-semibold truncate">{groupName}</span>
            {rule.enabled && (
              <Badge variant="outline" className="text-[10px] font-mono">{formulaLabel(rule.formula)}</Badge>
            )}
          </div>
          <label className="flex items-center gap-2 shrink-0 cursor-pointer">
            <span className="text-xs text-muted-foreground">{rule.enabled ? "On" : "Off"}</span>
            <Switch checked={rule.enabled} onCheckedChange={(c) => onChange({ ...rule, enabled: c })} />
          </label>
        </div>

        {rule.enabled && (
          <div className="space-y-4 pt-1">
            <FormulaEditor formula={rule.formula} onChange={(f) => onChange({ ...rule, formula: f })} />

            {/* Category-specific exclusions / overrides */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Tags className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category rules</span>
              </div>

              {rule.categoryRules.length === 0 && (
                <p className="text-xs text-muted-foreground">All categories use the rule above. Add a category to exclude it or give it a different price.</p>
              )}

              {rule.categoryRules.map((cr) => (
                <div key={cr.categoryId} className="rounded-lg border p-2.5 space-y-2 bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{catName(cr.categoryId)}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={cr.type}
                        onValueChange={(v) =>
                          setCatRule(cr.categoryId, {
                            type: v as CategoryRule["type"],
                            formula: v === "override" ? (cr.formula ?? { ...rule.formula }) : undefined,
                          })
                        }
                      >
                        <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="exclude">Exclude (no price)</SelectItem>
                          <SelectItem value="override">Custom price</SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => onChange({ ...rule, categoryRules: rule.categoryRules.filter((c) => c.categoryId !== cr.categoryId) })}
                        className="text-muted-foreground hover:text-destructive"
                        title="Remove category rule"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {cr.type === "override" && (
                    <div className="pt-1">
                      <FormulaEditor
                        formula={cr.formula ?? { ...rule.formula }}
                        onChange={(f) => setCatRule(cr.categoryId, { formula: f })}
                      />
                    </div>
                  )}
                </div>
              ))}

              {availableCats.length > 0 && (
                <div className="flex items-center gap-2 pt-0.5">
                  <Select value={addCatId} onValueChange={setAddCatId}>
                    <SelectTrigger className="h-8 w-[200px] text-sm"><SelectValue placeholder="Add a category…" /></SelectTrigger>
                    <SelectContent>
                      {availableCats.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button" variant="outline" size="sm" className="h-8 gap-1"
                    disabled={!addCatId}
                    onClick={() => {
                      const id = parseInt(addCatId);
                      if (!id) return;
                      onChange({ ...rule, categoryRules: [...rule.categoryRules, { categoryId: id, type: "exclude" }] });
                      setAddCatId("");
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Section ──────────────────────────────────────────────────────────────── */

export function GroupPricingSection() {
  const qc = useQueryClient();
  const { settings, save } = useCustomerSettings();
  const groups = settings.groups.length ? settings.groups : DEFAULT_CUSTOMER_GROUPS;

  const { data: categoriesData } = useListCategories({ query: { queryKey: ["categories"] } });
  const categories = ((categoriesData as unknown as Cat[]) ?? []).map((c) => ({ id: c.id, name: c.name }));

  const { data: productsData } = useListProducts(
    { limit: 1000 },
    { query: { queryKey: ["products", "group-pricing"] } },
  );
  const products = (productsData?.items ?? []) as Product[];
  const updateProduct = useUpdateProduct();

  // Local editable copy keyed by group id; seeded from saved settings.
  const seed = useMemo(() => {
    const map: Record<string, GroupPricingRule> = {};
    for (const g of groups) map[g.id] = makeDefaultRule(g.id);
    for (const r of settings.groupPricing ?? []) map[r.groupId] = { ...makeDefaultRule(r.groupId), ...r };
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(settings.groupPricing), groups.map((g) => g.id).join(",")]);

  const [rules, setRules] = useState<Record<string, GroupPricingRule>>(seed);
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);

  // Re-seed from settings only while the user has no unsaved edits.
  useEffect(() => { if (!dirty) setRules(seed); }, [seed, dirty]);

  const setRule = (groupId: string, r: GroupPricingRule) => {
    setRules((prev) => ({ ...prev, [groupId]: r }));
    setDirty(true);
  };

  const handleSave = () => {
    const list = groups.map((g) => rules[g.id] ?? makeDefaultRule(g.id));
    save({ groupPricing: list });
    setDirty(false);
    toast.success("Pricing rules saved. New products use these automatically.");
  };

  // Apply current (saved or edited) rules to every existing product. Every group
  // is filled so products are never left with a blank group price: an enabled
  // rule sets the computed price (or the sell price when it's excluded / has no
  // cost); groups without a rule keep their value or fall back to the sell price.
  const applyToExisting = async () => {
    if (!products.length) { toast.error("No products to update."); return; }
    setApplying(true);
    let changed = 0;
    try {
      // Update in small concurrent batches to keep it responsive.
      for (let i = 0; i < products.length; i += 8) {
        const batch = products.slice(i, i + 8);
        await Promise.all(batch.map(async (p) => {
          const ep = p as Product & { groupPrices?: Record<string, number> };
          const sell = p.price ?? 0;
          const next: Record<string, number> = { ...(ep.groupPrices ?? {}) };
          let touched = false;
          for (const g of groups) {
            const rule = rules[g.id] ?? makeDefaultRule(g.id);
            const val = rule.enabled ? (computeGroupPrice(p, rule) ?? sell) : (next[g.id] ?? sell);
            if (next[g.id] !== val) { next[g.id] = val; touched = true; }
          }
          if (!touched) return;
          await updateProduct.mutateAsync({ id: p.id, data: { groupPrices: next } });
          changed += 1;
        }));
      }
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Applied to ${changed} product${changed !== 1 ? "s" : ""}.`);
    } catch {
      toast.error("Some products could not be updated. Please try again.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-medium">Automatic group pricing</p>
          <p>Set a default price for each customer group from the product cost or RRP — e.g. <strong>Trade = Cost (Inc) + 10%</strong>, never above the RRP. Rules apply to new products automatically; use <strong>Apply to existing products</strong> to update your current catalogue. <em>RRP is the product's standard sell price.</em></p>
        </div>
      </div>

      <div className="grid gap-3">
        {groups.map((g) => (
          <GroupRuleCard
            key={g.id}
            groupName={g.name}
            groupColor={g.color}
            rule={rules[g.id] ?? makeDefaultRule(g.id)}
            categories={categories}
            onChange={(r) => setRule(g.id, r)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button onClick={handleSave} disabled={!dirty} className="gap-2">
          <Save className="w-4 h-4" /> Save pricing rules
        </Button>
        <Button
          variant="outline"
          onClick={applyToExisting}
          disabled={applying || products.length === 0}
          className="gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", applying && "animate-spin")} />
          {applying ? "Applying…" : `Apply to existing products (${products.length})`}
        </Button>
        {dirty && <span className="text-xs text-amber-600">Unsaved changes — save before applying to existing products.</span>}
      </div>
    </div>
  );
}
