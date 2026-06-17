import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageUploader } from "@/components/ui/image-uploader";
import { Boxes, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  useGetInventorySettings,
  useUpdateInventorySettings,
} from "@workspace/api-client-react";

const INVENTORY_TABS = [
  { href: "#display",        label: "Display",        icon: Boxes },
  { href: "#default-image",  label: "Default Image" },
  { href: "#group-pricing",  label: "Group Pricing" },
];


export default function ManagementInventoryPage() {
  const { data: settings, isLoading } = useGetInventorySettings();
  const update = useUpdateInventorySettings();

  const [showHideCostsBtn, setShowHideCostsBtnState] = useState(true);
  const [enableGroupPricing, setEnableGroupPricingState] = useState(true);
  const [enableStockColors, setEnableStockColorsState] = useState(false);
  const [defaultImageUrl, setDefaultImageUrl] = useState("");

  useEffect(() => {
    if (settings) {
      setShowHideCostsBtnState(settings.showCosts !== "false");
      setEnableGroupPricingState(settings.groupPricing !== "false");
      setEnableStockColorsState(settings.stockColors === "true");
      setDefaultImageUrl(settings.defaultImageUrl ?? "");
    }
  }, [settings]);

  function persist(patch: { showCosts?: string; groupPricing?: string; stockColors?: string; skuPrefix?: string; defaultImageUrl?: string | null }) {
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

  function toggleStockColors(v: boolean) {
    setEnableStockColorsState(v);
    persist({ stockColors: v ? "true" : "false" });
    toast.success(v ? "Stock level colours enabled in Products" : "Stock level colours disabled");
  }

  function handleDefaultImageChange(url: string) {
    setDefaultImageUrl(url);
    persist({ defaultImageUrl: url || null });
    toast.success(url ? "Default product image saved" : "Default product image removed");
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
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Colour-code stock levels</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Colour the Stock column in the Products table by level — red when out of stock,
                  yellow when low (1–5), green when 5+.
                </p>
              </div>
              <Switch checked={enableStockColors} onCheckedChange={toggleStockColors} />
            </div>
          </div>
        </div>

        <div id="default-image" className="rounded-lg border">
          <div className="px-5 py-4 border-b">
            <p className="font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4 text-muted-foreground" /> Default Product Image</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Used automatically anywhere a product has no image of its own — on the POS, product lists and receipts.
            </p>
          </div>
          <div className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-28 shrink-0">
                <ImageUploader
                  value={defaultImageUrl}
                  onChange={handleDefaultImageChange}
                  aspectRatio="square"
                />
              </div>
              <div className="text-xs text-muted-foreground space-y-1.5 pt-1">
                <p>Upload a fallback picture (e.g. your logo or a “no image” placeholder).</p>
                <p>Products with their own image are unaffected. Remove it to fall back to the default letter / icon placeholder.</p>
              </div>
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
