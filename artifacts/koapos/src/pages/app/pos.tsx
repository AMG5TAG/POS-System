import { useState, useMemo, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProducts, useListCategories, useCreateTransaction,
  useListCustomers, useGetLoyaltySettings, useListStaff,
  useListServiceJobs, useListAppointments,
  Product, Customer, Staff, ServiceJob, Appointment,
  TransactionInputPaymentMethod, Transaction,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { ALL_PAYMENT_METHODS, getEnabledPaymentMethods, PaymentMethodId } from "@/pages/app/management-registers";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Search, Plus, Minus, Trash2, Receipt,
  X, AlertTriangle, UserSearch, ShoppingCart,
  Gift, Eye, EyeOff, Link as LinkIcon, CalendarDays, UserRound, Percent,
  Footprints, NotebookPen,
  Lock, User, Monitor, DoorOpen, DoorClosed, UserPlus,
  CheckCircle2, Printer, Mail, MessageSquare,
} from "lucide-react";
import { QuickAddCustomerDialog } from "@/components/customers/QuickAddCustomerDialog";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type CartItem = {
  product: Product;
  quantity: number;
  itemDiscount: number;
  customPrice?: number;
  itemNote?: string;
};

type WalkIn = { firstName: string; lastName: string };

const DISPLAY_KEY = "koapos_pos_display";

function formatKode(profit: number): string {
  const n = Math.abs(Math.floor(profit));
  const sign = profit < 0 ? "-" : "";
  return `KK${sign}${String(n).padStart(3, "0")}`;
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function POSPage() {
  /* product browse */
  const [search, setSearch] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  /* cart */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [overallDiscount, setOverallDiscount] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const [expandedDiscounts, setExpandedDiscounts] = useState<Set<number>>(new Set());

  /* payment */
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethodId>(getEnabledPaymentMethods()[0]);
  const [numpadInput, setNumpadInput] = useState("");

  /* receipt */
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [completedTx, setCompletedTx] = useState<Pick<Transaction, "id" | "receiptNumber"> | null>(null);
  const [receiptEmail, setReceiptEmail] = useState("");
  const [receiptPhone, setReceiptPhone] = useState("");
  const [receiptMode, setReceiptMode] = useState<"idle" | "email" | "sms">("idle");

  /* customer */
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [walkIn, setWalkIn] = useState<WalkIn | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [walkInDialogOpen, setWalkInDialogOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const [walkInForm, setWalkInForm] = useState({ firstName: "", lastName: "" });
  const [notesOpen, setNotesOpen] = useState(false);
  const [pendingPaymentAfterPin, setPendingPaymentAfterPin] = useState(false);
  const forceStaffLogin = localStorage.getItem("koapos_force_staff_login") === "true";
  const [warningCustomer, setWarningCustomer] = useState<Customer | null>(null);

  /* kode */
  const [kodeVisible, setKodeVisible] = useState(false);

  /* $0 price product */
  const [zeroPricePending, setZeroPricePending] = useState<Product | null>(null);
  const [zeroPriceForm, setZeroPriceForm] = useState({ price: "", note: "" });

  /* service / appointment link */
  const [linkedService, setLinkedService] = useState<ServiceJob | null>(null);
  const [linkedAppointment, setLinkedAppointment] = useState<Appointment | null>(null);
  const [serviceLinkOpen, setServiceLinkOpen] = useState(false);

  /* staff PIN */
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(() => {
    try { return JSON.parse(localStorage.getItem("koapos_pos_staff") || "null"); } catch { return null; }
  });
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(() => localStorage.getItem("koapos_register_open") === "true");
  const toggleRegister = () => setRegisterOpen(v => { const next = !v; localStorage.setItem("koapos_register_open", String(next)); return next; });
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  /* ── Data fetches ── */
  const { data: productsData } = useListProducts(
    { search: search || undefined, categoryId: activeCategoryId || undefined, limit: 100 },
    { query: { queryKey: ["products", search, activeCategoryId] } }
  );
  const { data: categoriesData } = useListCategories({ query: { queryKey: ["categories"] } });
  const { data: customersData } = useListCustomers(
    { search: customerSearch || undefined, limit: 100 },
    { query: { queryKey: ["customers-pos", customerSearch], enabled: customerOpen } }
  );
  const { data: loyaltySettings } = useGetLoyaltySettings();
  const { data: staffList } = useListStaff({ query: { queryKey: ["staff-pos"] } });
  const { data: serviceJobs } = useListServiceJobs({ query: { queryKey: ["service-jobs-pos"], enabled: serviceLinkOpen } });
  const { data: appointments } = useListAppointments(undefined, { query: { queryKey: ["appointments-pos"], enabled: serviceLinkOpen } });
  const createTransactionMutation = useCreateTransaction();

  const products = productsData?.items || [];
  const categories = categoriesData || [];
  const customers = customersData?.items || [];

  /* ── Computed totals ── */
  const cartSubtotal = cart.reduce((s, i) => s + (i.customPrice ?? i.product.price) * i.quantity, 0);
  const itemDiscountTotal = cart.reduce((s, i) => s + i.itemDiscount, 0);
  const overallDiscountAmt = Math.min(Math.max(parseFloat(overallDiscount) || 0, 0), Math.max(cartSubtotal - itemDiscountTotal, 0));
  const discountTotal = itemDiscountTotal + overallDiscountAmt;
  const subtotal = cartSubtotal - discountTotal;
  const taxRate = 0.10;
  const taxTotal = subtotal * taxRate;
  const total = subtotal + taxTotal;

  /* Kode (profit) */
  const kodeProfit = Math.floor(
    cart.reduce((s, i) => {
      const price = i.customPrice ?? i.product.price;
      const cost = (i.product as Product & { costPrice?: number }).costPrice ?? 0;
      return s + (price - cost) * i.quantity - i.itemDiscount;
    }, 0) - overallDiscountAmt
  );

  /* Loyalty */
  const { loyaltyAmount, loyaltyLabel, loyaltyUnit } = useMemo(() => {
    if (walkIn || !loyaltySettings?.isEnabled || cart.length === 0)
      return { loyaltyAmount: 0, loyaltyLabel: "", loyaltyUnit: "" };
    const excluded = (loyaltySettings.excludedCustomerGroups ?? []).map((g: string) => g.toLowerCase());
    const group = (selectedCustomer?.customerGroup ?? "").toLowerCase();
    if (selectedCustomer && group && excluded.includes(group))
      return { loyaltyAmount: 0, loyaltyLabel: "No loyalty (excluded group)", loyaltyUnit: "" };
    const eligible = cart.reduce((s, i) => {
      if (i.product.excludeFromLoyalty) return s;
      return s + (i.customPrice ?? i.product.price) * i.quantity - i.itemDiscount;
    }, 0) - overallDiscountAmt;
    if (eligible <= 0) return { loyaltyAmount: 0, loyaltyLabel: "", loyaltyUnit: "" };
    switch (loyaltySettings.programType) {
      case "cashback": {
        const r = loyaltySettings.cashbackRate ?? 0.01;
        return { loyaltyAmount: eligible * r, loyaltyLabel: `${(r * 100).toFixed(1)}% cashback`, loyaltyUnit: "$" };
      }
      case "points": {
        const pts = Math.floor(eligible * (loyaltySettings.pointsPerDollar ?? 1));
        return { loyaltyAmount: pts, loyaltyLabel: `${pts} pts earned`, loyaltyUnit: "pts" };
      }
      case "tiered": {
        const spent = selectedCustomer?.totalSpent ?? 0;
        const tiers = [...(loyaltySettings.tiers ?? [])].sort((a, b) => b.minSpend - a.minSpend);
        const tier = tiers.find(t => spent >= t.minSpend) ?? tiers[tiers.length - 1];
        const r = tier?.rate ?? 0.01;
        return { loyaltyAmount: eligible * r, loyaltyLabel: `${(r * 100).toFixed(1)}% cashback (${tier?.name ?? ""})`, loyaltyUnit: "$" };
      }
      case "stamp": return { loyaltyAmount: 1, loyaltyLabel: "1 stamp earned", loyaltyUnit: "stamp" };
      case "custom": {
        const r = loyaltySettings.customValue ?? 0.01;
        return { loyaltyAmount: eligible * r, loyaltyLabel: "reward earned", loyaltyUnit: "$" };
      }
      default: return { loyaltyAmount: 0, loyaltyLabel: "", loyaltyUnit: "" };
    }
  }, [cart, loyaltySettings, selectedCustomer, walkIn, overallDiscountAmt]);

  /* Quick cash amounts */
  const quickAmounts = useMemo(() => {
    if (total <= 0) return [] as number[];
    const result: number[] = [];
    const bases = [5, 10, 20, 50, 100, 200, 500];
    for (const b of bases) {
      const v = Math.ceil(total / b) * b;
      if (!result.includes(v) && v !== total && result.length < 4) result.push(v);
    }
    return result;
  }, [total]);

  /* Numpad derived */
  const enteredAmount = numpadInput ? (parseFloat(numpadInput) || 0) : total;
  const changeDue = Math.max(0, enteredAmount - total);
  const amountRemaining = Math.max(0, total - enteredAmount);

  /* Reset payment modal when it opens */
  useEffect(() => {
    if (paymentModalOpen) {
      const enabled = getEnabledPaymentMethods();
      const first = ALL_PAYMENT_METHODS.find(m => enabled.includes(m.id));
      if (first) setPayMethod(first.id);
      setNumpadInput("");
      setReceiptMode("idle");
    }
  }, [paymentModalOpen]);

  const handleNumpad = (key: string) => {
    setNumpadInput(prev => {
      if (key === "C") return "";
      if (key === ".") {
        if (prev.includes(".")) return prev;
        return (prev || "0") + ".";
      }
      if (prev.includes(".") && prev.split(".")[1].length >= 2) return prev;
      if (!prev && key === "0") return "0";
      return prev + key;
    });
  };

  /* Broadcast to customer display */
  useEffect(() => {
    const customerName = walkIn
      ? `${walkIn.firstName} ${walkIn.lastName}`.trim()
      : selectedCustomer
      ? [selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(" ")
      : null;
    const payload = {
      items: cart.map(i => ({
        name: i.product.name,
        qty: i.quantity,
        unitPrice: i.customPrice ?? i.product.price,
        itemDiscount: i.itemDiscount,
        lineTotal: (i.customPrice ?? i.product.price) * i.quantity - i.itemDiscount,
      })),
      cartSubtotal, discountTotal, subtotal, taxTotal, total,
      loyaltyAmount, loyaltyLabel, loyaltyUnit,
      customerName,
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(DISPLAY_KEY, JSON.stringify(payload));
      window.dispatchEvent(new StorageEvent("storage", { key: DISPLAY_KEY, newValue: JSON.stringify(payload) }));
    } catch { /* ignore */ }
  }, [cart, total, subtotal, taxTotal, discountTotal, cartSubtotal, loyaltyAmount, loyaltyLabel, loyaltyUnit, selectedCustomer, walkIn]);

  /* Click-outside closes customer dropdown */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node))
        setCustomerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Filtered customers for inline dropdown */
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase();
    return (customers).filter(c => {
      const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase();
      return !q || name.includes(q) || (c.email ?? "").toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
    });
  }, [customers, customerSearch]);

  /* ── Cart operations ── */
  const addToCart = (product: Product) => {
    if ((product.price ?? 0) === 0) {
      setZeroPricePending(product);
      setZeroPriceForm({ price: "", note: "" });
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1, itemDiscount: 0 }];
    });
  };

  const addZeroPriceProduct = () => {
    if (!zeroPricePending) return;
    const price = parseFloat(zeroPriceForm.price);
    if (isNaN(price) || price < 0) { toast.error("Please enter a valid price"); return; }
    setCart(prev => {
      const existing = prev.find(i => i.product.id === zeroPricePending!.id);
      if (existing) return prev.map(i => i.product.id === zeroPricePending!.id ? { ...i, quantity: i.quantity + 1, customPrice: price, itemNote: zeroPriceForm.note || i.itemNote } : i);
      return [...prev, { product: zeroPricePending!, quantity: 1, itemDiscount: 0, customPrice: price, itemNote: zeroPriceForm.note || undefined }];
    });
    setZeroPricePending(null);
  };

  const updateQuantity = (productId: number, delta: number) =>
    setCart(prev => prev.map(i => i.product.id === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i).filter(i => i.quantity > 0));

  const setItemDiscount = (productId: number, value: string) => {
    const amt = parseFloat(value) || 0;
    setCart(prev => prev.map(i => {
      if (i.product.id !== productId) return i;
      const max = (i.customPrice ?? i.product.price) * i.quantity;
      return { ...i, itemDiscount: Math.min(Math.max(0, amt), max) };
    }));
  };

  const clearCart = () => {
    setCart([]); setOverallDiscount(""); setSaleNotes("");
    setLinkedService(null); setLinkedAppointment(null); setExpandedDiscounts(new Set());
  };

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c); setWalkIn(null);
    setCustomerOpen(false); setCustomerSearch("");
    if (c.warningNote) setWarningCustomer(c);
  };

  const confirmWalkIn = () => {
    if (!walkInForm.firstName.trim()) { toast.error("Please enter a first name"); return; }
    setWalkIn({ firstName: walkInForm.firstName.trim(), lastName: walkInForm.lastName.trim() });
    setSelectedCustomer(null); setWalkInDialogOpen(false); setWalkInForm({ firstName: "", lastName: "" });
  };

  const handlePinSubmit = () => {
    const staff = (staffList as Staff[] ?? []).find(s => s.pin && s.pin === pinInput && s.isActive);
    if (!staff) { setPinError("Incorrect PIN. Try again."); setPinInput(""); return; }
    setCurrentStaff(staff);
    try { localStorage.setItem("koapos_pos_staff", JSON.stringify(staff)); } catch { /* ignore */ }
    setPinDialogOpen(false); setPinInput(""); setPinError("");
    toast.success(`Signed in as ${staff.name}`);
    if (pendingPaymentAfterPin) { setPendingPaymentAfterPin(false); setPaymentModalOpen(true); }
  };

  const handleCheckout = (paymentMethod: TransactionInputPaymentMethod, amountTendered: number) => {
    const txItems = cart.map(i => ({
      productId: i.product.id,
      productName: i.product.name,
      quantity: i.quantity,
      unitPrice: i.customPrice ?? i.product.price,
      totalPrice: (i.customPrice ?? i.product.price) * i.quantity - i.itemDiscount,
      taxAmount: ((i.customPrice ?? i.product.price) * i.quantity - i.itemDiscount) * (i.product.taxRate || taxRate),
      discount: i.itemDiscount || undefined,
    }));
    const notesParts = [
      linkedService ? `[Service #${linkedService.jobNumber}: ${linkedService.deviceType || linkedService.deviceDescription || "service"}]` : null,
      linkedAppointment ? `[Appt #${linkedAppointment.id}: ${linkedAppointment.title}]` : null,
      saleNotes || null,
    ].filter(Boolean);
    createTransactionMutation.mutate({
      data: {
        items: txItems, paymentMethod, subtotal, taxTotal,
        discountTotal: discountTotal > 0 ? discountTotal : undefined,
        total, amountTendered,
        customerId: selectedCustomer?.id,
        staffId: currentStaff?.id,
        loyaltyEarned: !walkIn && loyaltyAmount > 0 ? loyaltyAmount : undefined,
        notes: notesParts.length > 0 ? notesParts.join(" | ") : undefined,
      }
    }, {
      onSuccess: (data) => {
        clearCart(); setPaymentModalOpen(false);
        setCompletedTx({ id: data.id, receiptNumber: data.receiptNumber });
        setReceiptEmail(selectedCustomer?.email ?? "");
        setReceiptPhone(selectedCustomer?.phone ?? "");
        setReceiptMode("idle");
        setReceiptOpen(true);
        setSelectedCustomer(null); setWalkIn(null);
      },
      onError: () => toast.error("Failed to process transaction"),
    });
  };

  const activeCustomerName = walkIn
    ? `${walkIn.firstName} ${walkIn.lastName}`.trim()
    : selectedCustomer
    ? [selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(" ") || "Customer"
    : null;

  /* ── Render ── */
  return (
    <AppLayout hideSidebar>
      <div className="flex h-full w-full overflow-hidden">

        {/* ─── Product browser ─── */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <div className="p-3 border-b space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products by name, SKU or barcode..."
                  className="pl-9 h-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex w-max space-x-2 pb-1">
                <Button variant={activeCategoryId === null ? "default" : "outline"} onClick={() => setActiveCategoryId(null)} size="sm" className="rounded-full h-7 text-xs">All</Button>
                {categories.map(cat => (
                  <Button key={cat.id} variant={activeCategoryId === cat.id ? "default" : "outline"} onClick={() => setActiveCategoryId(cat.id)} size="sm" className="rounded-full h-7 text-xs">{cat.name}</Button>
                ))}
              </div>
            </ScrollArea>
          </div>

          <ScrollArea className="flex-1 p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {products.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="group flex flex-col text-left border rounded-xl overflow-hidden hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all active:scale-[0.97] bg-card hover:shadow-md"
                >
                  <div className="w-full h-[150px] bg-muted flex items-center justify-center relative overflow-hidden">
                    {product.imageUrl
                      ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      : <span className="text-3xl font-bold text-muted-foreground/20">{product.name.charAt(0)}</span>
                    }
                    {product.stockQuantity != null && product.stockQuantity <= (product.lowStockThreshold || 5) && (
                      <Badge variant="destructive" className="absolute top-1.5 right-1.5 text-[10px] px-1 py-0">Low</Badge>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="font-semibold text-xs line-clamp-2 leading-snug min-h-[2rem]">{product.name}</p>
                    <p className="font-bold text-primary text-sm mt-1">
                      {(product.price ?? 0) === 0
                        ? <span className="text-muted-foreground text-[11px] font-normal">Enter price</span>
                        : formatCurrency(product.price)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {products.length === 0 && (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No products found.</div>
            )}
          </ScrollArea>
        </div>

        {/* ─── Cart sidebar ─── */}
        <div className="w-[22rem] border-l bg-card flex flex-col shrink-0">

          {/* Header */}
          <div className="h-12 flex items-center justify-between px-3 border-b shrink-0 gap-2">
            <div className="flex flex-col shrink-0">
              <h2 className="font-bold flex items-center gap-2 text-sm">
                <ShoppingCart className="w-4 h-4" /> Current Sale
              </h2>
              {currentStaff && (
                <span className="text-[10px] text-primary ml-6 leading-none mt-0.5">{currentStaff.name}</span>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0 ml-auto">
              <button
                onClick={toggleRegister}
                title={registerOpen ? "Close Register" : "Open Register"}
                className={cn("p-1.5 rounded-lg transition-colors", registerOpen ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30" : "text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30")}
              >
                {registerOpen ? <DoorOpen className="w-4 h-4" /> : <DoorClosed className="w-4 h-4" />}
              </button>
              <button
                onClick={() => window.open("/customer-display", "_blank")}
                title="Open customer-facing display"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setPinInput(""); setPinError(""); setPinDialogOpen(true); }}
                title={currentStaff ? `Staff: ${currentStaff.name}` : "Staff PIN"}
                className={cn("p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors", currentStaff && "text-primary")}
              >
                <User className="w-4 h-4" />
              </button>
              <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0" onClick={clearCart} disabled={cart.length === 0} title="Clear cart">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>

          {/* Customer row */}
          <div className="border-b px-3 py-2 shrink-0 relative" ref={customerDropdownRef}>
            {activeCustomerName ? (
              <div className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2", !walkIn && selectedCustomer?.warningNote ? "bg-destructive/10 border border-destructive/20" : "bg-muted/40")}>
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", walkIn ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-primary/15 text-primary")}>
                  {walkIn ? "?" : ((selectedCustomer?.firstName?.[0] ?? "") + (selectedCustomer?.lastName?.[0] ?? "")).toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{activeCustomerName}</p>
                  {walkIn && <p className="text-[10px] text-amber-600 dark:text-amber-400">Walk-in · No loyalty</p>}
                  {!walkIn && selectedCustomer?.warningNote && <p className="text-[10px] text-destructive flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" /> Warning on file</p>}
                </div>
                <button onClick={() => { setSelectedCustomer(null); setWalkIn(null); }} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <button
                  onClick={() => setCustomerOpen(o => !o)}
                  className={cn(
                    "flex-1 flex items-center justify-between text-[11px] border rounded-lg px-2.5 py-1.5 transition-colors bg-background hover:bg-muted/30",
                    customerOpen ? "border-primary text-foreground" : "border-dashed text-muted-foreground hover:border-primary hover:text-foreground"
                  )}
                >
                  <span className="flex items-center gap-1.5"><UserSearch className="w-3.5 h-3.5 shrink-0" /> Add Customer</span>
                  <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                </button>
                <button
                  onClick={() => { setWalkInForm({ firstName: "", lastName: "" }); setWalkInDialogOpen(true); }}
                  className="p-1.5 text-muted-foreground hover:text-amber-500 border border-dashed rounded-lg transition-colors hover:border-amber-400"
                  title="Walk-in customer"
                >
                  <Footprints className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setServiceLinkOpen(true)}
                  title="Link to service or appointment"
                  className={cn("p-1.5 border border-dashed rounded-lg transition-colors", (linkedService || linkedAppointment) ? "text-primary border-primary" : "text-muted-foreground hover:text-foreground hover:border-foreground")}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setNotesOpen(true)}
                  className={cn("p-1.5 border border-dashed rounded-lg transition-colors", notesOpen || saleNotes ? "text-primary border-primary" : "text-muted-foreground hover:text-foreground hover:border-foreground")}
                  title="Sale notes"
                >
                  <NotebookPen className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* Inline customer dropdown */}
            {customerOpen && !activeCustomerName && (
              <div className="absolute z-50 left-3 right-3 top-full mt-0.5 bg-popover border rounded-lg shadow-lg">
                <div className="p-2 border-b">
                  <Input
                    autoFocus
                    placeholder="Search by name, email or phone..."
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {/* Create new customer — always pinned to top */}
                  <button
                    type="button"
                    onClick={() => { setCustomerOpen(false); setQuickAddOpen(true); }}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-primary font-medium hover:bg-primary/5 border-b"
                  >
                    <UserPlus className="w-3.5 h-3.5 shrink-0" />
                    Create new customer
                  </button>
                  {filteredCustomers.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                      {customerSearch ? `No customers match "${customerSearch}"` : "Start typing to search customers"}
                    </div>
                  ) : (
                    filteredCustomers.map(c => {
                      const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";
                      const initials = ((c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "")).toUpperCase() || "?";
                      return (
                        <button
                          key={c.id}
                          onClick={() => selectCustomer(c)}
                          className="w-full text-left px-3 py-2.5 hover:bg-muted/40 flex items-center gap-2.5 transition-colors"
                        >
                          <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", c.warningNote ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary")}>
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{name}</p>
                            <p className="text-xs text-muted-foreground truncate">{c.email || c.phone || "—"}</p>
                          </div>
                          {c.warningNote && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Service/appointment link indicator */}
          {(linkedService || linkedAppointment) && (
            <div className="border-b px-3 py-1.5 bg-primary/5 shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] text-primary">
                {linkedService && <><LinkIcon className="w-3 h-3 shrink-0" /><span className="truncate">Service {linkedService.jobNumber}: {linkedService.deviceType || linkedService.deviceDescription || "service"}</span></>}
                {linkedAppointment && <><CalendarDays className="w-3 h-3 shrink-0" /><span className="truncate">Appt #{linkedAppointment.id}: {linkedAppointment.title}</span></>}
                <button onClick={() => { setLinkedService(null); setLinkedAppointment(null); }} className="ml-auto shrink-0 hover:text-destructive"><X className="w-3 h-3" /></button>
              </div>
            </div>
          )}

          {/* Cart items */}
          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Receipt className="w-14 h-14 mb-3 opacity-20" />
              <p className="font-medium text-sm">No items in cart</p>
              <p className="text-xs mt-1">Tap products to add them to the sale.</p>
            </div>
          ) : (
          <ScrollArea className="flex-1">
              <div className="p-2.5 space-y-1.5">
                {cart.map((item) => {
                  const linePrice = (item.customPrice ?? item.product.price) * item.quantity;
                  const lineTotal = linePrice - item.itemDiscount;
                  const discExpanded = expandedDiscounts.has(item.product.id);
                  return (
                    <div key={item.product.id} className="border rounded-xl overflow-hidden bg-background">
                      <div className="flex items-center gap-2 px-2.5 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs leading-snug truncate">{item.product.name}</p>
                          <p className="text-muted-foreground text-[11px]">
                            {formatCurrency(item.customPrice ?? item.product.price)}
                            {item.itemNote && <span className="ml-1 italic text-muted-foreground/60">· {item.itemNote}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.product.id, -1)}><Minus className="w-2.5 h-2.5" /></Button>
                          <span className="w-5 text-center text-xs font-medium">{item.quantity}</span>
                          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.product.id, 1)}><Plus className="w-2.5 h-2.5" /></Button>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <div className="w-14 text-right">
                            <p className="font-bold text-xs">{formatCurrency(lineTotal)}</p>
                            {item.itemDiscount > 0 && <p className="text-[10px] text-destructive line-through leading-none">{formatCurrency(linePrice)}</p>}
                          </div>
                          <button
                            onClick={() => setExpandedDiscounts(prev => { const n = new Set(prev); if (n.has(item.product.id)) n.delete(item.product.id); else n.add(item.product.id); return n; })}
                            className={cn("p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors", discExpanded && "text-primary")}
                            title="Item discount"
                          >
                            <Percent className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      {discExpanded && (
                        <div className="px-2.5 pb-2 pt-1.5 flex items-center gap-2 border-t bg-muted/20">
                          <Label className="text-[10px] shrink-0 text-muted-foreground">Discount ($)</Label>
                          <Input
                            type="number" min="0" step="0.50"
                            value={item.itemDiscount || ""}
                            onChange={(e) => setItemDiscount(item.product.id, e.target.value)}
                            placeholder="0.00"
                            className="h-6 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
          </ScrollArea>
          )}


          {/* Totals */}
          <div className="border-t bg-background px-3 py-2.5 shrink-0 space-y-1.5">
            {cartSubtotal !== subtotal && (
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Before discounts</span><span>{formatCurrency(cartSubtotal)}</span>
              </div>
            )}
            {discountTotal > 0 && (
              <div className="flex justify-between text-xs text-destructive font-medium">
                <span>Discount</span><span>−{formatCurrency(discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>GST (10%)</span><span>{formatCurrency(taxTotal)}</span>
            </div>
            {/* Overall discount */}
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-muted-foreground shrink-0">Sale discount ($)</label>
              <Input
                type="number" min="0" step="0.50"
                value={overallDiscount}
                onChange={(e) => setOverallDiscount(e.target.value)}
                placeholder="0.00"
                className="h-6 text-xs flex-1"
                disabled={cart.length === 0}
              />
            </div>

            <div className="flex justify-between text-base font-bold pt-1 border-t">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>

            {/* Loyalty + Kode row */}
            <div className="flex items-center justify-between">
              {loyaltyAmount > 0 && loyaltyUnit !== "" ? (
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                  <Gift className="w-3 h-3" /> {loyaltyLabel}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground/50">No loyalty</span>
              )}
              <div className="flex items-center gap-2">
                {loyaltyAmount > 0 && loyaltyUnit !== "" && (
                  <span className="text-[11px] font-semibold text-emerald-600">
                    {loyaltyUnit === "$" ? `+${formatCurrency(loyaltyAmount)}` : loyaltyUnit === "pts" ? `+${loyaltyAmount} pts` : "+1 stamp"}
                  </span>
                )}
                {/* Kode */}
                <div className="flex items-center gap-1 border-l pl-2">
                  <span className="text-[10px] font-mono text-muted-foreground/50 select-none">Kode</span>
                  <button
                    onClick={() => setKodeVisible(v => !v)}
                    className="text-muted-foreground hover:text-foreground p-0.5 transition-colors"
                    title={kodeVisible ? "Hide" : "Show"}
                    disabled={cart.length === 0}
                  >
                    {kodeVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  {kodeVisible && cart.length > 0 && (
                    <span className="text-[11px] font-mono font-bold text-muted-foreground">{formatKode(kodeProfit)}</span>
                  )}
                </div>
              </div>
            </div>

            <Button
              className="w-full h-12 text-base font-bold mt-1"
              disabled={cart.length === 0}
              onClick={() => {
                if (forceStaffLogin && !currentStaff) {
                  setPendingPaymentAfterPin(true);
                  setPinInput(""); setPinError(""); setPinDialogOpen(true);
                  return;
                }
                setPaymentModalOpen(true);
              }}
            >
              Charge {formatCurrency(total)}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Payment modal ─── */}
      <Dialog open={paymentModalOpen} onOpenChange={(o) => { setPaymentModalOpen(o); if (!o) setNumpadInput(""); }}>
        <DialogContent className="max-w-[740px] p-0 overflow-hidden gap-0">
          <div className="flex flex-col sm:flex-row" style={{ minHeight: 520 }}>

            {/* ── Left panel ── */}
            <div className="flex flex-col w-full sm:w-[320px] shrink-0 border-b sm:border-b-0 sm:border-r p-5 gap-4">
              <DialogTitle className="text-base font-semibold">Process Payment</DialogTitle>

              {/* Amount card */}
              <div className="rounded-xl bg-muted/40 border px-5 py-4 text-center">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1">Amount Due</p>
                <p className="text-4xl font-bold tabular-nums">{formatCurrency(total)}</p>
                {numpadInput && parseFloat(numpadInput) > 0 && (
                  <p className="text-sm text-muted-foreground mt-1.5 tabular-nums">
                    {changeDue > 0
                      ? <span className="text-green-600 font-medium">Change: {formatCurrency(changeDue)}</span>
                      : amountRemaining > 0
                      ? <span className="text-amber-600 font-medium">Remaining: {formatCurrency(amountRemaining)}</span>
                      : <span className="text-green-600 font-medium">Exact amount</span>}
                  </p>
                )}
              </div>

              {/* Method selector */}
              {(() => {
                const enabledIds = getEnabledPaymentMethods();
                const methods = ALL_PAYMENT_METHODS.filter(m => enabledIds.includes(m.id));
                return (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Payment Method</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {methods.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          onClick={() => setPayMethod(id)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left
                            ${payMethod === id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/40 hover:bg-muted/60 text-foreground"}`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate text-xs">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Quick amounts — cash only */}
              {payMethod === "cash" && quickAmounts.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Quick Amount</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickAmounts.map(amt => (
                      <button
                        key={amt}
                        onClick={() => setNumpadInput(amt.toFixed(2))}
                        className="px-3 py-1.5 rounded-lg border text-sm font-medium hover:border-primary hover:bg-primary/5 transition-all tabular-nums"
                      >
                        {formatCurrency(amt)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1" />
              <Button variant="outline" className="w-full" onClick={() => setPaymentModalOpen(false)}>
                Cancel
              </Button>
            </div>

            {/* ── Right panel ── */}
            <div className="flex-1 flex flex-col p-5 gap-3">
              {/* Display */}
              <div className="border rounded-xl px-4 py-3 text-right bg-muted/20">
                <span className="text-3xl font-bold tabular-nums">
                  {numpadInput || "0.00"}
                </span>
              </div>

              {/* Numpad grid */}
              <div className="grid grid-cols-3 gap-2 flex-1">
                {(["7","8","9","4","5","6","1","2","3"] as const).map(k => (
                  <button
                    key={k}
                    onClick={() => handleNumpad(k)}
                    className="rounded-xl border bg-background text-xl font-semibold hover:bg-muted active:scale-95 transition-all flex items-center justify-center"
                  >
                    {k}
                  </button>
                ))}
                {/* C */}
                <button
                  onClick={() => handleNumpad("C")}
                  className="rounded-xl border bg-destructive/8 text-destructive border-destructive/20 text-lg font-bold hover:bg-destructive/15 active:scale-95 transition-all flex items-center justify-center"
                >
                  C
                </button>
                {/* 0 */}
                <button
                  onClick={() => handleNumpad("0")}
                  className="rounded-xl border bg-background text-xl font-semibold hover:bg-muted active:scale-95 transition-all flex items-center justify-center"
                >
                  0
                </button>
                {/* . */}
                <button
                  onClick={() => handleNumpad(".")}
                  className="rounded-xl border bg-background text-xl font-semibold hover:bg-muted active:scale-95 transition-all flex items-center justify-center"
                >
                  .
                </button>
                {/* Backspace */}
                <button
                  onClick={() => setNumpadInput(p => p.slice(0, -1))}
                  className="rounded-xl border bg-background text-base font-semibold hover:bg-muted active:scale-95 transition-all flex items-center justify-center"
                >
                  ⌫
                </button>
                {/* Exact */}
                <button
                  onClick={() => setNumpadInput(total.toFixed(2))}
                  className="col-span-2 rounded-xl border bg-muted text-sm font-semibold hover:bg-muted/60 active:scale-95 transition-all flex items-center justify-center"
                >
                  Exact {formatCurrency(total)}
                </button>
              </div>

              {/* Complete Sale */}
              <Button
                className="w-full h-12 text-base font-semibold"
                disabled={
                  createTransactionMutation.isPending ||
                  (payMethod === "cash" && !!numpadInput && amountRemaining > 0.009)
                }
                onClick={() => handleCheckout(payMethod as TransactionInputPaymentMethod, enteredAmount)}
              >
                {createTransactionMutation.isPending ? "Processing…" : "Complete Sale"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Receipt dialog ─── */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 mx-auto mb-2 mt-1">
              <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <DialogTitle className="text-center text-xl">Sale Complete!</DialogTitle>
            {completedTx && (
              <p className="text-center text-sm text-muted-foreground">
                {completedTx.receiptNumber ? `Receipt #${completedTx.receiptNumber}` : `Transaction #${completedTx.id}`}
                {" · "}{formatCurrency(total)}
              </p>
            )}
          </DialogHeader>

          {receiptMode === "idle" && (
            <div className="space-y-2 py-1">
              <p className="text-xs font-medium text-center text-muted-foreground mb-3">How would you like to send the receipt?</p>
              <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => window.print()}>
                <Printer className="w-4 h-4" /> Print Receipt
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-11"
                onClick={() => { setReceiptMode("email"); }}
              >
                <Mail className="w-4 h-4" /> Email Receipt
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-11"
                onClick={() => { setReceiptMode("sms"); }}
              >
                <MessageSquare className="w-4 h-4" /> SMS Receipt
              </Button>
            </div>
          )}

          {receiptMode === "email" && (
            <div className="space-y-3 py-1">
              <div>
                <Label className="text-xs">Email address</Label>
                <Input
                  value={receiptEmail}
                  onChange={e => setReceiptEmail(e.target.value)}
                  placeholder="customer@email.com"
                  type="email"
                  autoFocus
                  className="mt-1"
                  onKeyDown={e => {
                    if (e.key === "Enter" && receiptEmail) {
                      toast.success(`Receipt sent to ${receiptEmail}`);
                      setReceiptMode("idle");
                    }
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setReceiptMode("idle")}>Back</Button>
                <Button
                  className="flex-1"
                  disabled={!receiptEmail}
                  onClick={() => { toast.success(`Receipt emailed to ${receiptEmail}`); setReceiptMode("idle"); }}
                >
                  Send Email
                </Button>
              </div>
            </div>
          )}

          {receiptMode === "sms" && (
            <div className="space-y-3 py-1">
              <div>
                <Label className="text-xs">Mobile number</Label>
                <Input
                  value={receiptPhone}
                  onChange={e => setReceiptPhone(e.target.value)}
                  placeholder="04xx xxx xxx"
                  type="tel"
                  autoFocus
                  className="mt-1"
                  onKeyDown={e => {
                    if (e.key === "Enter" && receiptPhone) {
                      toast.success(`Receipt sent to ${receiptPhone}`);
                      setReceiptMode("idle");
                    }
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setReceiptMode("idle")}>Back</Button>
                <Button
                  className="flex-1"
                  disabled={!receiptPhone}
                  onClick={() => { toast.success(`Receipt sent to ${receiptPhone}`); setReceiptMode("idle"); }}
                >
                  Send SMS
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button className="w-full" onClick={() => setReceiptOpen(false)}>
              New Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Walk-in dialog ─── */}
      <Dialog open={walkInDialogOpen} onOpenChange={setWalkInDialogOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserRound className="w-4 h-4" /> Walk-in Customer</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Enter the customer's name. They won't be added to the system and won't earn loyalty rewards.</p>
          <div className="space-y-3">
            <div><Label className="text-xs">First Name *</Label><Input value={walkInForm.firstName} onChange={e => setWalkInForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Jane" className="mt-1" autoFocus onKeyDown={e => e.key === "Enter" && confirmWalkIn()} /></div>
            <div><Label className="text-xs">Last Name</Label><Input value={walkInForm.lastName} onChange={e => setWalkInForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Smith" className="mt-1" onKeyDown={e => e.key === "Enter" && confirmWalkIn()} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWalkInDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmWalkIn}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Customer warning ─── */}
      <Dialog open={!!warningCustomer} onOpenChange={o => { if (!o) setWarningCustomer(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Customer Warning</DialogTitle></DialogHeader>
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
            <p className="font-semibold text-sm">{warningCustomer ? [warningCustomer.firstName, warningCustomer.lastName].filter(Boolean).join(" ") : ""}</p>
            <p className="text-sm text-destructive">{warningCustomer?.warningNote}</p>
          </div>
          <p className="text-sm text-muted-foreground">Please review this warning before proceeding with the sale.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setWarningCustomer(null); setSelectedCustomer(null); }}>Remove Customer</Button>
            <Button variant="destructive" onClick={() => setWarningCustomer(null)}>Acknowledge & Continue</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── $0 price dialog ─── */}
      <Dialog open={!!zeroPricePending} onOpenChange={o => { if (!o) setZeroPricePending(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Set Sale Price</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground"><span className="font-semibold">{zeroPricePending?.name}</span> has a $0.00 price. Please enter a price and a reason before adding it to the sale.</p>
          <div className="space-y-3">
            <div><Label className="text-xs">Sale Price ($) *</Label><Input type="number" min="0" step="0.01" value={zeroPriceForm.price} onChange={e => setZeroPriceForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" className="mt-1" autoFocus /></div>
            <div><Label className="text-xs">Reason / Note</Label><Input value={zeroPriceForm.note} onChange={e => setZeroPriceForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Staff discount, warranty replacement..." className="mt-1" onKeyDown={e => e.key === "Enter" && addZeroPriceProduct()} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZeroPricePending(null)}>Cancel</Button>
            <Button onClick={addZeroPriceProduct}>Add to Cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Service / Appointment link ─── */}
      <Dialog open={serviceLinkOpen} onOpenChange={setServiceLinkOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Link to Service or Appointment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Service Jobs</p>
              <ScrollArea className="max-h-44 border rounded-lg">
                {(serviceJobs as ServiceJob[] ?? []).length === 0
                  ? <div className="text-center py-6 text-muted-foreground text-sm">No service jobs found.</div>
                  : <div className="divide-y">{(serviceJobs as ServiceJob[] ?? []).slice(0, 15).map(sj => (
                      <button key={sj.id} onClick={() => { setLinkedService(sj); setLinkedAppointment(null); setServiceLinkOpen(false); }}
                        className={cn("w-full text-left px-3 py-2.5 hover:bg-muted text-sm flex items-center gap-2 transition-colors", linkedService?.id === sj.id && "bg-primary/10 text-primary")}>
                        <LinkIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">#{sj.jobNumber} · {sj.deviceType || sj.deviceDescription || "Service"}</p>
                          <p className="text-xs text-muted-foreground">{sj.status} · {sj.customerName || "No customer"}</p>
                        </div>
                      </button>
                    ))}</div>
                }
              </ScrollArea>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Appointments</p>
              <ScrollArea className="max-h-44 border rounded-lg">
                {(appointments as Appointment[] ?? []).length === 0
                  ? <div className="text-center py-6 text-muted-foreground text-sm">No appointments found.</div>
                  : <div className="divide-y">{(appointments as Appointment[] ?? []).slice(0, 15).map(apt => (
                      <button key={apt.id} onClick={() => { setLinkedAppointment(apt); setLinkedService(null); setServiceLinkOpen(false); }}
                        className={cn("w-full text-left px-3 py-2.5 hover:bg-muted text-sm flex items-center gap-2 transition-colors", linkedAppointment?.id === apt.id && "bg-primary/10 text-primary")}>
                        <CalendarDays className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">#{apt.id} · {apt.title}</p>
                          <p className="text-xs text-muted-foreground">{apt.scheduledAt ? new Date(apt.scheduledAt).toLocaleString() : "—"} · {apt.customerName || "No customer"}</p>
                        </div>
                      </button>
                    ))}</div>
                }
              </ScrollArea>
            </div>
            {(linkedService || linkedAppointment) && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => { setLinkedService(null); setLinkedAppointment(null); }}>
                <X className="w-4 h-4 mr-1.5" /> Remove Link
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Sale Note dialog ─── */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NotebookPen className="w-4 h-4" /> Sale Note
            </DialogTitle>
          </DialogHeader>
          <Textarea
            autoFocus
            placeholder="Add a note to this sale... (prints on receipt)"
            value={saleNotes}
            onChange={(e) => setSaleNotes(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSaleNotes(""); setNotesOpen(false); }}>Clear</Button>
            <Button onClick={() => setNotesOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Quick add customer dialog ─── */}
      <QuickAddCustomerDialog
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={(c) => { selectCustomer(c); setQuickAddOpen(false); }}
        prefillName={customerSearch}
      />

      {/* ─── Staff PIN dialog ─── */}
      <Dialog open={pinDialogOpen} onOpenChange={o => { if (!o) { setPinInput(""); setPinError(""); setPinDialogOpen(false); } }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="w-4 h-4" /> Staff Login</DialogTitle></DialogHeader>
          {currentStaff && <p className="text-sm text-muted-foreground text-center">Currently: <span className="font-semibold text-foreground">{currentStaff.name}</span></p>}
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Enter PIN</Label>
              <Input type="password" value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError(""); }} placeholder="••••" className="mt-1 text-center tracking-widest text-lg" autoFocus onKeyDown={e => e.key === "Enter" && handlePinSubmit()} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, ki) => (
                <button
                  key={ki} disabled={!k}
                  onClick={() => { if (k === "⌫") setPinInput(p => p.slice(0, -1)); else if (k) { setPinInput(p => p + k); setPinError(""); } }}
                  className={cn("h-11 rounded-xl border font-semibold text-base transition-colors", k ? "hover:bg-muted active:bg-muted/80" : "opacity-0 pointer-events-none", k === "⌫" && "text-destructive text-sm")}
                >{k}</button>
              ))}
            </div>
            {pinError && <p className="text-xs text-destructive text-center">{pinError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPinInput(""); setPinError(""); setPinDialogOpen(false); }}>Cancel</Button>
            <Button onClick={handlePinSubmit} disabled={!pinInput}>Sign In</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
