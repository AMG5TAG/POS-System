import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Boxes } from "lucide-react";
import { toast } from "sonner";
import {
  useGetInventorySettings,
  useUpdateInventorySettings,
} from "@workspace/api-client-react";

const INVENTORY_TABS = [
  { href: "#display",       label: "Display",        icon: Boxes },
  { href: "#group-pricing", label: "Group Pricing" },
];


export default function ManagementInventoryPage() {
  const { data: settings, isLoading } = useGetInventorySettings();
  const update = useUpdateInventorySettings();

  const [showHideCostsBtn, setShowHideCostsBtnState] = useState(true);
  const [enableGroupPricing, setEnableGroupPricingState] = useState(true);

  useEffect(() => {
    if (settings) {
      setShowHideCostsBtnState(settings.showCosts !== "false");
      setEnableGroupPricingState(settings.groupPricing !== "false");
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

        </div>{/* end 2-col grid */}
      </div>
    </AppLayout>
  );
}
