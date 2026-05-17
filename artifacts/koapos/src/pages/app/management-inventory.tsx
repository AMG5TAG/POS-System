import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Boxes, Shuffle } from "lucide-react";
import { toast } from "sonner";

export const DISPLAY_SHOW_HIDE_COSTS_KEY = "koapos_display_show_hide_costs_btn";
export const GROUP_PRICING_KEY = "koapos_enable_group_pricing";

const SKU_PREFIX_KEY = "koapos_sku_prefix";

function getSavedSkuPrefix() {
  try { return localStorage.getItem(SKU_PREFIX_KEY) || "KP"; } catch { return "KP"; }
}
function saveSkuPrefix(v: string) {
  try { localStorage.setItem(SKU_PREFIX_KEY, v); } catch { /* ignore */ }
}
function previewSKU(prefix: string) {
  return `${prefix || "KP"}-${Math.floor(10000 + Math.random() * 90000)}`;
}
function getShowHideCosts() {
  try { return localStorage.getItem(DISPLAY_SHOW_HIDE_COSTS_KEY) === "true"; } catch { return false; }
}
function setShowHideCostsPref(v: boolean) {
  try { localStorage.setItem(DISPLAY_SHOW_HIDE_COSTS_KEY, v ? "true" : "false"); } catch { /* ignore */ }
}
function getGroupPricingEnabled() {
  try { return localStorage.getItem(GROUP_PRICING_KEY) === "true"; } catch { return false; }
}
function setGroupPricingPref(v: boolean) {
  try { localStorage.setItem(GROUP_PRICING_KEY, v ? "true" : "false"); } catch { /* ignore */ }
}

export default function ManagementInventoryPage() {
  const [showHideCostsBtn, setShowHideCostsBtnState] = useState(getShowHideCosts);
  const [enableGroupPricing, setEnableGroupPricingState] = useState(getGroupPricingEnabled);
  const [skuPrefix, setSkuPrefix] = useState(getSavedSkuPrefix);
  const [skuPreview, setSkuPreview] = useState(() => previewSKU(getSavedSkuPrefix()));

  function toggleShowHideCosts(v: boolean) {
    setShowHideCostsBtnState(v);
    setShowHideCostsPref(v);
    toast.success(v ? "Hide Costs button enabled in Products" : "Hide Costs button hidden");
  }

  function toggleGroupPricing(v: boolean) {
    setEnableGroupPricingState(v);
    setGroupPricingPref(v);
    toast.success(v ? "Customer Group Pricing enabled" : "Customer Group Pricing disabled");
  }

  function handleSkuPrefixChange(v: string) {
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    setSkuPrefix(clean);
    saveSkuPrefix(clean);
    setSkuPreview(previewSKU(clean));
  }

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Boxes className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Inventory Settings</h1>
        </div>

        <div className="rounded-lg border">
          <div className="px-5 py-4 border-b">
            <p className="font-semibold">Display</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Control what is visible in the Products page.
            </p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Show 'Hide Costs' button</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Display the toggle in the Products toolbar that hides or shows cost price columns.
                  When off, costs are always hidden.
                </p>
              </div>
              <Switch checked={showHideCostsBtn} onCheckedChange={toggleShowHideCosts} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="px-5 py-4 border-b">
            <p className="font-semibold">Customer Group Pricing</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Allow different sell prices to be set per customer group on each product.
            </p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Enable Customer Group Pricing</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Shows a pricing section on the Pricing tab when creating or editing a product,
                  allowing a custom sell price per customer group (VIP, Wholesale, Trade, etc.).
                </p>
              </div>
              <Switch checked={enableGroupPricing} onCheckedChange={toggleGroupPricing} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="px-5 py-4 border-b">
            <p className="font-semibold">SKU Generator</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Set the prefix used when auto-generating SKU codes for products.
            </p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-[200px]">
                <Label className="text-xs text-muted-foreground">SKU Prefix</Label>
                <Input
                  value={skuPrefix}
                  onChange={(e) => handleSkuPrefixChange(e.target.value)}
                  placeholder="KP"
                  maxLength={6}
                  className="mt-1.5 font-mono uppercase"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 mb-0.5"
                onClick={() => setSkuPreview(previewSKU(skuPrefix))}
              >
                <Shuffle className="w-3.5 h-3.5" /> Refresh Preview
              </Button>
              <span className="text-sm text-muted-foreground mb-1 font-mono">{skuPreview}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Generated format: <span className="font-mono">{skuPrefix || "KP"}-NNNNN</span>
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
