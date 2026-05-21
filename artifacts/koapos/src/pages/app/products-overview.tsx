import { AppLayout } from "@/components/layout/app-layout";
import { useListProducts, useListCategories } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Package, Layers, ClipboardList, ShoppingCart, Clock, RotateCcw, Truck, Bookmark, Tag, Hash, AlertTriangle, LayoutGrid } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function ProductsOverviewPage() {
  const { data: productsData } = useListProducts({ limit: 500 });
  const { data: categoriesData } = useListCategories();

  const products = productsData?.items ?? [];
  const categories = categoriesData ?? [];

  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.isActive !== false).length;
  const stockableProducts = products.filter((p) => (p as unknown as { productType?: string }).productType !== "service");
  const lowStock = stockableProducts.filter((p) => p.trackInventory && (p.stockQuantity ?? 0) <= (p.lowStockThreshold ?? 5)).length;
  const totalValue = stockableProducts.reduce((sum, p) => sum + (p.price ?? 0) * (p.stockQuantity ?? 0), 0);

  const stats = [
    { label: "Total Products", value: totalProducts, color: "text-blue-600" },
    { label: "Active Products", value: activeProducts, color: "text-green-600" },
    { label: "Categories", value: categories.length, color: "text-purple-600" },
    { label: "Low Stock Alerts", value: lowStock, color: "text-amber-600" },
    { label: "Inventory Value", value: formatCurrency(totalValue), color: "text-foreground" },
  ];

  const sections = [
    { label: "Products", href: "/products", icon: Package, desc: "Manage your product catalogue" },
    { label: "Bundles", href: "/products/bundles", icon: Layers, desc: "Group products into bundles" },
    { label: "Stocktake", href: "/products/stocktake", icon: ClipboardList, desc: "Count and adjust stock levels" },
    { label: "Purchase Orders", href: "/products/purchase-orders", icon: ShoppingCart, desc: "Order stock from suppliers" },
    { label: "Pre-Orders", href: "/products/pre-orders", icon: Clock, desc: "Manage customer pre-orders" },
    { label: "Return Auth.", href: "/products/return-auth", icon: RotateCcw, desc: "Authorise product returns" },
    { label: "Suppliers", href: "/products/suppliers", icon: Truck, desc: "Manage your suppliers" },
    { label: "Brands", href: "/products/brands", icon: Bookmark, desc: "Organise products by brand" },
    { label: "Categories", href: "/products/categories", icon: Tag, desc: "Organise product categories" },
    { label: "Tags", href: "/products/tags", icon: Hash, desc: "Label products with tags" },
    { label: "Recalls", href: "/products/recalls", icon: AlertTriangle, desc: "Track product recalls" },
  ];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">
        <div className="flex items-center gap-3">
          <LayoutGrid className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground">A summary view of your product catalogue and inventory management options.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="text-base font-semibold mb-4">Product Management</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sections.map((s) => (
              <Link key={s.href} href={s.href}>
                <Card className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer h-full">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <s.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{s.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {lowStock > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="font-medium text-sm text-amber-900">{lowStock} product{lowStock !== 1 ? "s" : ""} running low on stock</p>
                  <p className="text-xs text-amber-700">Review and reorder to avoid stockouts</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100" asChild>
                <Link href="/products/stocktake">View Stocktake</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
