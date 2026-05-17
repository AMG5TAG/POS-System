import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { 
  useListProducts, 
  useListCategories, 
  useCreateTransaction,
  useListCustomers,
  useGetLoyaltySettings,
  Product,
  Customer,
  TransactionInputPaymentMethod,
  TransactionItem
} from "@workspace/api-client-react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import {
  Search, Plus, Minus, Trash2, CreditCard, Banknote, Receipt,
  SplitSquareHorizontal, X, AlertTriangle, UserSearch,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ShoppingCart } from "lucide-react";

export default function POSPage() {
  const [search, setSearch] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [cart, setCart] = useState<{product: Product, quantity: number}[]>([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [warningCustomer, setWarningCustomer] = useState<Customer | null>(null);

  const { data: productsData } = useListProducts({
    search: search || undefined,
    categoryId: activeCategoryId || undefined,
    limit: 100
  }, {
    query: { queryKey: ["products", search, activeCategoryId] }
  });

  const { data: categoriesData } = useListCategories({
    query: { queryKey: ["categories"] }
  });

  const { data: customersData } = useListCustomers(
    { search: customerSearch || undefined, limit: 50 },
    { query: { queryKey: ["customers-pos", customerSearch], enabled: customerPickerOpen } }
  );

  const createTransactionMutation = useCreateTransaction();
  const { data: loyaltySettings } = useGetLoyaltySettings();

  const products = productsData?.items || [];
  const categories: import("@workspace/api-client-react").Category[] = categoriesData || [];
  const customers = customersData?.items || [];

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQuantity = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const taxRate = 0.10;
  const taxTotal = subtotal * taxRate;
  const total = subtotal + taxTotal;

  const { loyaltyAmount, loyaltyLabel, loyaltyUnit } = useMemo(() => {
    if (!loyaltySettings?.isEnabled || cart.length === 0) {
      return { loyaltyAmount: 0, loyaltyLabel: "", loyaltyUnit: "" };
    }
    const excluded = (loyaltySettings.excludedCustomerGroups ?? []).map((g: string) => g.toLowerCase());
    const group = (selectedCustomer?.customerGroup ?? "").toLowerCase();
    if (selectedCustomer && group && excluded.includes(group)) {
      return { loyaltyAmount: 0, loyaltyLabel: "No loyalty (excluded group)", loyaltyUnit: "" };
    }
    const eligibleSubtotal = cart.reduce((sum, item) => {
      if (item.product.excludeFromLoyalty) return sum;
      return sum + item.product.price * item.quantity;
    }, 0);
    if (eligibleSubtotal === 0) return { loyaltyAmount: 0, loyaltyLabel: "", loyaltyUnit: "" };

    switch (loyaltySettings.programType) {
      case "cashback": {
        const amt = eligibleSubtotal * (loyaltySettings.cashbackRate ?? 0.01);
        return { loyaltyAmount: amt, loyaltyLabel: `${((loyaltySettings.cashbackRate ?? 0.01) * 100).toFixed(1)}% cashback`, loyaltyUnit: "$" };
      }
      case "points": {
        const pts = Math.floor(eligibleSubtotal * (loyaltySettings.pointsPerDollar ?? 1));
        return { loyaltyAmount: pts, loyaltyLabel: `${pts} pts earned`, loyaltyUnit: "pts" };
      }
      case "tiered": {
        const spent = selectedCustomer?.totalSpent ?? 0;
        const tiers = [...(loyaltySettings.tiers ?? [])].sort((a, b) => b.minSpend - a.minSpend);
        const tier = tiers.find((t) => spent >= t.minSpend) ?? tiers[tiers.length - 1];
        const rate = tier?.rate ?? 0.01;
        const amt = eligibleSubtotal * rate;
        return { loyaltyAmount: amt, loyaltyLabel: `${(rate * 100).toFixed(1)}% cashback (${tier?.name ?? ""})`, loyaltyUnit: "$" };
      }
      case "stamp":
        return { loyaltyAmount: 1, loyaltyLabel: "1 stamp earned", loyaltyUnit: "stamp" };
      case "custom": {
        const amt = eligibleSubtotal * (loyaltySettings.customValue ?? 0.01);
        return { loyaltyAmount: amt, loyaltyLabel: "reward earned", loyaltyUnit: "$" };
      }
      default:
        return { loyaltyAmount: 0, loyaltyLabel: "", loyaltyUnit: "" };
    }
  }, [cart, loyaltySettings, selectedCustomer]);

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerPickerOpen(false);
    setCustomerSearch("");
    if (c.warningNote) {
      setWarningCustomer(c);
    }
  };

  const handleCheckout = (paymentMethod: TransactionInputPaymentMethod) => {
    const items: TransactionItem[] = cart.map(item => ({
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.product.price,
      totalPrice: item.product.price * item.quantity,
      taxAmount: (item.product.price * item.quantity) * (item.product.taxRate || taxRate)
    }));

    const storedLoyalty = loyaltyUnit === "pts" || loyaltyUnit === "stamp" ? loyaltyAmount : loyaltyAmount;

    createTransactionMutation.mutate({
      data: {
        items,
        paymentMethod,
        subtotal,
        taxTotal,
        total,
        amountTendered: total,
        customerId: selectedCustomer?.id,
        loyaltyEarned: loyaltyAmount > 0 ? storedLoyalty : undefined,
      }
    }, {
      onSuccess: () => {
        toast.success("Transaction completed successfully");
        setCart([]);
        setPaymentModalOpen(false);
        setSelectedCustomer(null);
      },
      onError: () => {
        toast.error("Failed to process transaction");
      }
    });
  };

  return (
    <AppLayout>
      <div className="flex h-full w-full overflow-hidden">
        {/* Main POS Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <div className="p-4 border-b space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                placeholder="Search products by name, SKU, or barcode..." 
                className="pl-10 h-12 text-lg"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex w-max space-x-2 pb-2">
                <Button 
                  variant={activeCategoryId === null ? "default" : "outline"} 
                  onClick={() => setActiveCategoryId(null)}
                  className="rounded-full"
                >
                  All Products
                </Button>
                {categories.map(cat => (
                  <Button 
                    key={cat.id}
                    variant={activeCategoryId === cat.id ? "default" : "outline"} 
                    onClick={() => setActiveCategoryId(cat.id)}
                    className="rounded-full"
                  >
                    {cat.name}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {products.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="group relative flex flex-col text-left border rounded-xl overflow-hidden hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all active:scale-95 bg-card hover:shadow-md"
                >
                  <div className="aspect-square w-full bg-muted flex items-center justify-center relative">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl font-bold text-muted-foreground/20">{product.name.charAt(0)}</span>
                    )}
                    {product.stockQuantity != null && product.stockQuantity <= (product.lowStockThreshold || 5) && (
                      <Badge variant="destructive" className="absolute top-2 right-2">Low Stock</Badge>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm line-clamp-2 h-10">{product.name}</p>
                    <p className="font-bold text-primary mt-1">{formatCurrency(product.price)}</p>
                  </div>
                </button>
              ))}
            </div>
            {products.length === 0 && (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No products found.
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Cart Sidebar */}
        <div className="w-96 border-l bg-card flex flex-col shrink-0">
          <div className="h-16 flex items-center justify-between px-4 border-b shrink-0">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Current Sale
            </h2>
            <Button variant="ghost" size="icon" onClick={clearCart} disabled={cart.length === 0}>
              <Trash2 className="w-5 h-5 text-destructive" />
            </Button>
          </div>

          {/* Customer section */}
          <div className="border-b px-4 py-3 shrink-0">
            {selectedCustomer ? (
              <div className={cn(
                "flex items-center gap-3 rounded-lg p-2.5",
                selectedCustomer.warningNote ? "bg-destructive/10 border border-destructive/20" : "bg-muted/40"
              )}>
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {((selectedCustomer.firstName?.[0] ?? "") + (selectedCustomer.lastName?.[0] ?? "")).toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {[selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(" ") || "Customer"}
                  </p>
                  {selectedCustomer.warningNote && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" /> Warning on file
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCustomerPickerOpen(true)}
                className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-dashed rounded-lg px-3 py-2.5 transition-colors hover:border-primary"
              >
                <UserSearch className="w-4 h-4 shrink-0" />
                Add customer to sale...
              </button>
            )}
          </div>

          <ScrollArea className="flex-1">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <Receipt className="w-16 h-16 mb-4 opacity-20" />
                <p>No items in cart</p>
                <p className="text-sm mt-2">Tap products to add them to the sale.</p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.product.name}</p>
                      <p className="text-muted-foreground text-sm">{formatCurrency(item.product.price)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.product.id, -1)}>
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="w-6 text-center font-medium">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.product.id, 1)}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="w-20 text-right font-bold text-sm shrink-0">
                      {formatCurrency(item.product.price * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="border-t bg-background p-4 shrink-0">
            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax (GST 10%)</span>
                <span>{formatCurrency(taxTotal)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t mt-2">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
              {loyaltyAmount > 0 && loyaltyUnit !== "" && (
                <div className="flex items-center justify-between pt-2 border-t mt-1 text-emerald-600">
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <Gift className="w-3.5 h-3.5" />
                    {loyaltyLabel}
                  </span>
                  <span className="text-xs font-semibold">
                    {loyaltyUnit === "$"
                      ? `+${formatCurrency(loyaltyAmount)}`
                      : loyaltyUnit === "pts"
                      ? `+${loyaltyAmount} pts`
                      : "+1 stamp"}
                  </span>
                </div>
              )}
            </div>
            <Button 
              className="w-full h-16 text-xl font-bold" 
              disabled={cart.length === 0}
              onClick={() => setPaymentModalOpen(true)}
            >
              Charge {formatCurrency(total)}
            </Button>
          </div>
        </div>
      </div>

      {/* Payment modal */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-bold pt-4">Amount Due: {formatCurrency(total)}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-6">
            <Button 
              variant="outline" 
              className="h-32 flex flex-col gap-4 text-lg border-2 hover:border-primary hover:bg-primary/5"
              onClick={() => handleCheckout("card")}
              disabled={createTransactionMutation.isPending}
            >
              <CreditCard className="w-8 h-8" />
              Credit Card
            </Button>
            <Button 
              variant="outline" 
              className="h-32 flex flex-col gap-4 text-lg border-2 hover:border-primary hover:bg-primary/5"
              onClick={() => handleCheckout("cash")}
              disabled={createTransactionMutation.isPending}
            >
              <Banknote className="w-8 h-8" />
              Cash
            </Button>
            <Button 
              variant="outline" 
              className="h-32 flex flex-col gap-4 text-lg border-2 hover:border-primary hover:bg-primary/5"
              onClick={() => handleCheckout("split")}
              disabled={createTransactionMutation.isPending}
            >
              <SplitSquareHorizontal className="w-8 h-8" />
              Split Payment
            </Button>
            <Button 
              variant="outline" 
              className="h-32 flex flex-col gap-4 text-lg border-2 hover:border-primary hover:bg-primary/5"
              onClick={() => handleCheckout("other")}
              disabled={createTransactionMutation.isPending}
            >
              <Receipt className="w-8 h-8" />
              Other
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer picker modal */}
      <Dialog open={customerPickerOpen} onOpenChange={(o) => { setCustomerPickerOpen(o); if (!o) setCustomerSearch(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Customer</DialogTitle>
          </DialogHeader>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, email, or phone..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              autoFocus
            />
          </div>
          <ScrollArea className="max-h-80">
            {customers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {customerSearch ? "No customers found." : "Start typing to search customers."}
              </div>
            ) : (
              <div className="space-y-1">
                {customers.map((c) => {
                  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";
                  const initials = ((c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "")).toUpperCase() || "?";
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectCustomer(c)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        c.warningNote ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
                      )}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.email || c.phone || "—"}</p>
                      </div>
                      {c.warningNote && (
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Customer warning popup */}
      <Dialog open={!!warningCustomer} onOpenChange={(o) => { if (!o) setWarningCustomer(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Customer Warning
            </DialogTitle>
          </DialogHeader>
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
            <p className="font-semibold text-sm">
              {warningCustomer ? [warningCustomer.firstName, warningCustomer.lastName].filter(Boolean).join(" ") : ""}
            </p>
            <p className="text-sm text-destructive">{warningCustomer?.warningNote}</p>
          </div>
          <p className="text-sm text-muted-foreground">Please review this warning before proceeding with the sale.</p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => { setWarningCustomer(null); setSelectedCustomer(null); }}
            >
              Remove Customer
            </Button>
            <Button
              variant="destructive"
              onClick={() => setWarningCustomer(null)}
            >
              Acknowledge & Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
