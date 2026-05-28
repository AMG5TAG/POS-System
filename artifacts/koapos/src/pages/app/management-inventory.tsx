import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Boxes, Shuffle } from "lucide-react";
import { toast } from "sonner";
import {
  useGetInventorySettings,
  useUpdateInventorySettings,
} from "@workspace/api-client-react";

const INVENTORY_TABS = [
  { href: "#display",       label: "Display",        icon: Boxes },
  { href: "#group-pricing", label: "Group Pricing" },
  { href: "#sku-generator", label: "SKU Generator",  icon: Shuffle },
];

function previewSKU(prefix: string) {
  return `${prefix || "KP"}-${Math.floor(10000 + Math.random() * 90000)}`;
}

export default function ManagementInventoryPage() {
  const { data: settings, isLoading } = useGetInventorySettings();
  const update = useUpdateInventorySettings();

  const [showHideCostsBtn, setShowHideCostsBtnState] = useState(false);
  const [enableGroupPricing, setEnableGroupPricingState] = useState(false);
  const [skuPrefix, setSkuPrefix] = useState("KP");
  const [skuPreview, setSkuPreview] = useState(() => previewSKU("KP"));

  useEffect(() => {
    if (settings) {
      setShowHideCostsBtnState(settings.showCosts === "true");
      setEnableGroupPricingState(settings.groupPricing === "true");
      setSkuPrefix(settings.skuPrefix || "KP");
      setSkuPreview(previewSKU(settings.skuPrefix || "KP"));
    }
  }, [settings]);

  function persist(patch: { showCosts?: string; groupPricing?: string; skuPrefix?: string }) {
    update.mutate(
      { data: patch },
      {
        onSuccess: () => toast.success("Settings saved"),
        onError: () => toast.error("Failed to save settings"),
      }
    );
  }

  function toggleShowHideCosts(v: boolean) {
    setShowHideCostsBtnState(v);
    persist({ showCosts: v ? "true" : "false" });
    toast.success(v ? "Hide Costs button enabled in Products" : "Hide Costs button hidden");
  }

  function toggleGroupPricing(v: boolean) {
    setEnableGroupPricingState(v);
    persist({ groupPricing: v ? "true" : "false" });
    toast.success(v ? "Customer Group Pricing enabled" : "Customer Group Pricing disabled");
  }

  function handleSkuPrefixChange(v: string) {
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    setSkuPrefix(clean);
    setSkuPreview(previewSKU(clean));
    persist({ skuPrefix: clean });
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 md:p-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl lg:col-span-2" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Boxes className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Inventory Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure stock tracking rules, low-stock alerts, and automation settings.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        <div id="display" className="rounded-lg border">
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

        <div id="group-pricing" className="rounded-lg border">
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

        <div id="sku-generator" className="rounded-lg border lg:col-span-2">
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

        </div>{/* end 2-col grid */}
      </div>
    </AppLayout>
  );
}
