import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { takePendingCart } from "@/lib/pending-cart";
import { takePendingInvoicePayment, type PendingInvoicePayment } from "@/lib/pending-invoice-payment";
import { useSalesTemplate } from "@/lib/use-sales-template";
import { AppLayout } from "@/components/layout/app-layout";
import { CameraPosPiP } from "@/components/cameras/CameraPosPiP";
import { PosWebcamCapture } from "@/components/cameras/PosWebcamCapture";
import { useSidebar } from "@/components/ui/sidebar";
import {
  useListProducts, useListCategories, useCreateTransaction,
  useListCustomers, useGetLoyaltySettings, useListStaff,
  useListServiceJobs, useListAppointments,
  useListParkedSales, useCreateParkedSale, useDeleteParkedSale,
  useGetMerchant, useListPosRegisters,
  useCreateGiftCard, useValidateGiftCard, useUpdateGiftCard,
  Product, Customer, Staff, ServiceJob, Appointment,
  TransactionInputPaymentMethod, Transaction,
  GiftCardValidateResponse,
} from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import {
  ALL_PAYMENT_METHODS, getEnabledPaymentMethods, PaymentMethodId,
  getEnabledIntegrationPayments, INTEGRATION_PAYMENT_LABELS,
  ACTIVE_REGISTER_KEY,
  getStaffLoginMessage, setStaffAcknowledged, hasStaffAcknowledged,
  type StaffLoginMessage,
} from "@/pages/app/management-registers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Search, Plus, Minus, Trash2, Receipt, CreditCard,
  X, AlertTriangle, UserSearch, ShoppingCart,
  Gift, Eye, EyeOff, Link as LinkIcon, CalendarDays, UserRound, Percent,
  Footprints, NotebookPen,
  Lock, User, Monitor, DoorOpen, DoorClosed, UserPlus,
  CheckCircle2, Printer, Mail, MessageSquare,
  Banknote, Clock, FileText, TrendingUp, Star, PauseCircle, History, Trash,
  MessageSquareWarning, Package, ScanLine, BadgeCheck, BadgeX,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { QuickAddCustomerDialog } from "@/components/customers/QuickAddCustomerDialog";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type CartItem = {
  product: Product;
  quantity: number;
  itemDiscount: number;
  customPrice?: number;
  itemNote?: string;
  giftCardNumber?: string;
};

type WalkIn = { firstName: string; lastName: string };

type RegisterSession = {
  openedAt: string;
  openedBy: string | null;
  openingFloat: number;
  openingNotes: string;
  sales: Record<string, number>;
  txCount: number;
  refunds?: Record<string, number>;
  refundCount?: number;
};

const DISPLAY_KEY = "koapos_pos_display";


function formatKode(profit: number): string {
  const n = Math.abs(Math.floor(profit));
  const sign = profit < 0 ? "-" : "";
  return `KK${sign}${String(n).padStart(3, "0")}`;
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function POSPage() {
  const [, setLocation] = useLocation();
  /* product browse */
  const [search, setSearch] = useState("");
  const [posTab, setPosTab]             = useState<"favourites" | "browse">("favourites");
  const [categoryPath, setCategoryPath] = useState<number[]>([]);
  const [activeRegisterId] = useState<string>("default");

  const [favouriteIds, setFavouriteIds] = useState<Set<number>>(new Set());

  const toggleFavourite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavouriteIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /* cart */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [overallDiscount, setOverallDiscount] = useState("");
  const [tempItemOpen, setTempItemOpen] = useState(false);
  const [tempItemForm, setTempItemForm] = useState({ name: "", price: "", cost: "" });
  const [saleNotes, setSaleNotes] = useState("");
  const [expandedDiscounts, setExpandedDiscounts] = useState<Set<number>>(new Set());

  /* merchant / business data for receipts */
  const { data: merchantData } = useGetMerchant();
  const { profile: businessProfile } = useBusinessProfile();

  /* active print template */
  const { opts: thermalOpts, fontCss: thermalFontCss } = useSalesTemplate("Thermal_Receipt");

  /* parked sales — API-backed */
  const queryClient = useQueryClient();
  const { data: parkedSalesData = [] } = useListParkedSales();
  const createParkedSaleMutation = useCreateParkedSale();
  const deleteParkedSaleMutation = useDeleteParkedSale();
  const [parkedSalesOpen, setParkedSalesOpen] = useState(false);

  /* payment */
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethodId>(
    () => getEnabledPaymentMethods()[0] ?? "cash"
  );
  const [numpadInput, setNumpadInput] = useState("");
  const [splitLegs, setSplitLegs] = useState<{ method: PaymentMethodId; amount: string }[]>([
    { method: "cash", amount: "" },
    { method: "eftpos", amount: "" },
  ]);

  /* gift card — issuance */
  const [gcIssueOpen, setGcIssueOpen]   = useState(false);
  const [gcIssueForm, setGcIssueForm]   = useState({ cardNumber: "", amount: "" });
  /* gift card — payment */
  const [gcPayCardNumber, setGcPayCardNumber] = useState("");
  const [gcValidation, setGcValidation]       = useState<GiftCardValidateResponse | null>(null);
  const [gcRemainingMethod, setGcRemainingMethod] = useState<"cash" | "eftpos">("cash");

  /* receipt */
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [completedTx, setCompletedTx] = useState<Pick<Transaction, "id" | "receiptNumber"> | null>(null);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [completedCart, setCompletedCart] = useState<CartItem[]>([]);
  const [completedPaymentMethod, setCompletedPaymentMethod] = useState<string>("card");
  const [completedSubtotal, setCompletedSubtotal] = useState(0);
  const [completedTaxTotal, setCompletedTaxTotal] = useState(0);
  const [completedCustomer, setCompletedCustomer] = useState<Customer | null>(null);
  const [completedLoyaltyAmount, setCompletedLoyaltyAmount] = useState(0);
  const [completedLoyaltyUnit, setCompletedLoyaltyUnit] = useState("");
  const [receiptEmail, setReceiptEmail] = useState("");
  const [receiptPhone, setReceiptPhone] = useState("");
  const [receiptMode, setReceiptMode] = useState<"idle" | "email" | "sms">("idle");

  /* customer */
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [walkIn, setWalkIn] = useState<WalkIn | null>(null);
  /* Invoice Payment Mode — when set, the terminal is locked to settling an
     existing invoice's remaining balance rather than ringing up a cart sale. */
  const [invoicePay, setInvoicePay] = useState<PendingInvoicePayment | null>(null);
  const [invoicePayPending, setInvoicePayPending] = useState(false);
  const [pendingRestoreCustomerId, setPendingRestoreCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [walkInDialogOpen, setWalkInDialogOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const [walkInForm, setWalkInForm] = useState({ firstName: "", lastName: "" });
  const [notesOpen, setNotesOpen] = useState(false);
  const [pendingPaymentAfterPin, setPendingPaymentAfterPin] = useState(false);
  const forceStaffLogin = false;
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
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [openRegisterDialogOpen, setOpenRegisterDialogOpen] = useState(false);
  const [closeRegisterDialogOpen, setCloseRegisterDialogOpen] = useState(false);
  const [cashMovementPrintOpen, setCashMovementPrintOpen] = useState(false);
  const [eodPrintOpen, setEodPrintOpen] = useState(false);
  const [tillClosedDialogOpen, setTillClosedDialogOpen] = useState(false);
  const [lastZReport, setLastZReport] = useState<RegisterSession & { closedAt: string; cashCounted: number; eftposDeclared: number; closingNotes: string } | null>(null);
  const [openFloat, setOpenFloat] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [closeFormData, setCloseFormData] = useState({ cashCounted: "", eftposDeclared: "", notes: "" });
  const [sessionSnap, setSessionSnap] = useState<RegisterSession | null>(null);

  const getSession = (): RegisterSession | null => sessionSnap;

  const handleOpenRegister = () => {
    const float = parseFloat(openFloat) || 0;
    const session: RegisterSession = {
      openedAt: new Date().toISOString(),
      openedBy: currentStaff?.name ?? null,
      openingFloat: float,
      openingNotes: openNotes,
      sales: {},
      txCount: 0,
    };
    setSessionSnap(session);
    setRegisterOpen(true);
    setOpenRegisterDialogOpen(false);
    setCashMovementPrintOpen(true);
    toast.success("Register opened");
  };

  const printCashMovement = () => {
    const bizName = businessProfile.abn
      ? `${merchantData?.businessName ?? "Your Business"} · ABN ${businessProfile.abn}`
      : (merchantData?.businessName ?? "Your Business");
    const s = getSession();
    const openedAt = s?.openedAt ? new Date(s.openedAt) : new Date();
    const dateStr = openedAt.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = openedAt.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
    const staff = s?.openedBy ?? currentStaff?.name ?? "—";
    const float = s?.openingFloat ?? 0;
    const note = s?.openingNotes ?? "";

    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head>
      <title>Cash Movement</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:'Courier New',monospace;padding:16px;color:#222;max-width:320px;margin:0 auto;font-size:12px}
        .center{text-align:center}
        .bold{font-weight:bold}
        .upper{text-transform:uppercase}
        .bdr-b{border-bottom:1px dashed #999;padding-bottom:6px;margin-bottom:6px}
        .bdr-t{border-top:1px dashed #999;padding-top:6px;margin-top:6px}
        .row{display:flex;justify-content:space-between;margin-bottom:2px}
        .mt{margin-top:8px}
        .mb{margin-bottom:8px}
        .small{font-size:10px}
        .gray{color:#666}
        @media print{body{padding:8px}}
      </style>
    </head><body>
      <p class="center bold upper">${bizName}</p>
      <p class="center small gray">${dateStr} · ${timeStr}</p>
      <p class="center bdr-b mb">CASH MOVEMENT</p>
      <div class="row"><span class="gray">Type</span><span class="bold">OPENING FLOAT</span></div>
      <div class="row"><span class="gray">Staff</span><span>${staff}</span></div>
      <div class="row bdr-t mt"><span class="gray">Amount</span><span class="bold">$${float.toFixed(2)}</span></div>
      ${note ? `<p class="small gray mt">Note: ${note}</p>` : ""}
      <p class="center small gray mt bdr-t">Keep this receipt for your records.</p>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const handleCloseRegister = () => {
    const session = getSession();
    const zReport = {
      ...(session ?? {}),
      closedAt: new Date().toISOString(),
      cashCounted: parseFloat(closeFormData.cashCounted) || 0,
      eftposDeclared: parseFloat(closeFormData.eftposDeclared) || 0,
      closingNotes: closeFormData.notes,
    };
    setRegisterOpen(false);
    setCloseRegisterDialogOpen(false);
    setCloseFormData({ cashCounted: "", eftposDeclared: "", notes: "" });
    setLastZReport(zReport as RegisterSession & { closedAt: string; cashCounted: number; eftposDeclared: number; closingNotes: string });
    setEodPrintOpen(true);
    toast.success("Register closed — Z-report saved");
  };

  const printEodReport = () => {
    const z = lastZReport;
    if (!z) return;
    const bizName = businessProfile.abn
      ? `${merchantData?.businessName ?? "Your Business"} · ABN ${businessProfile.abn}`
      : (merchantData?.businessName ?? "Your Business");
    const openedAt = z.openedAt ? new Date(z.openedAt) : null;
    const closedAt = z.closedAt ? new Date(z.closedAt) : null;
    const dateStr = closedAt?.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) ?? "—";
    const timeStr = closedAt?.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) ?? "—";
    const openTime = openedAt?.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) ?? "—";
    const cashSales = z.sales?.["cash"] ?? 0;
    const cardSales = (z.sales?.["card"] ?? 0) + (z.sales?.["eftpos"] ?? 0);
    const splitSales = z.sales?.["split"] ?? 0;
    const otherSales = Object.entries(z.sales ?? {})
      .filter(([k]) => !["cash", "card", "eftpos", "split"].includes(k))
      .reduce((sum, [, v]) => sum + v, 0);
    const totalSales = Object.values(z.sales ?? {}).reduce((a, b) => a + b, 0);
    const cashRefunds = z.refunds?.["cash"] ?? 0;
    const totalRefunds = Object.values(z.refunds ?? {}).reduce((a, b) => a + b, 0);
    const netSales = totalSales - totalRefunds;
    const openingFloat = z.openingFloat ?? 0;
    const expectedCash = openingFloat + cashSales - cashRefunds;
    const cashCounted = z.cashCounted ?? 0;
    const cashVariance = cashCounted - expectedCash;
    const eftposDeclared = z.eftposDeclared ?? 0;
    const eftposVariance = eftposDeclared - (cardSales + splitSales);
    const staff = z.openedBy ?? currentStaff?.name ?? "—";
    const note = z.closingNotes ?? "";

    const w = window.open("", "_blank", "width=420,height=800");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head>
      <title>End-of-Day Reconciliation</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:'Courier New',monospace;padding:16px;color:#222;max-width:360px;margin:0 auto;font-size:12px}
        .center{text-align:center}
        .bold{font-weight:bold}
        .upper{text-transform:uppercase}
        .bdr-b{border-bottom:1px dashed #999;padding-bottom:6px;margin-bottom:6px}
        .bdr-t{border-top:1px dashed #999;padding-top:6px;margin-top:6px}
        .row{display:flex;justify-content:space-between;margin-bottom:2px}
        .mt{margin-top:8px}
        .mb{margin-bottom:8px}
        .small{font-size:10px}
        .gray{color:#666}
        .head{background:#f3f3f3;padding:4px 6px;margin:8px -6px 4px;font-weight:bold;letter-spacing:0.5px}
        @media print{body{padding:8px}}
      </style>
    </head><body>
      <p class="center bold upper">${bizName}</p>
      <p class="center small gray">${dateStr} · ${timeStr}</p>
      <p class="center bdr-b mb">END-OF-DAY RECONCILIATION</p>
      <div class="row"><span class="gray">Session</span><span>${openTime} — ${timeStr}</span></div>
      <div class="row"><span class="gray">Staff</span><span>${staff}</span></div>
      <div class="row"><span class="gray">Transactions</span><span>${z.txCount ?? 0}</span></div>

      <div class="head bdr-t">SALES</div>
      ${cashSales > 0 ? `<div class="row"><span class="gray">Cash</span><span>$${cashSales.toFixed(2)}</span></div>` : ""}
      ${cardSales > 0 ? `<div class="row"><span class="gray">Card / EFTPOS</span><span>$${cardSales.toFixed(2)}</span></div>` : ""}
      ${splitSales > 0 ? `<div class="row"><span class="gray">Split</span><span>$${splitSales.toFixed(2)}</span></div>` : ""}
      ${otherSales > 0 ? `<div class="row"><span class="gray">Other</span><span>$${otherSales.toFixed(2)}</span></div>` : ""}
      ${totalRefunds > 0 ? `<div class="row"><span class="gray">Refunds</span><span>−$${totalRefunds.toFixed(2)}</span></div>` : ""}
      <div class="row bold bdr-t"><span>Net Sales</span><span>$${netSales.toFixed(2)}</span></div>

      <div class="head bdr-t">CASH DRAWER</div>
      <div class="row"><span class="gray">Opening float</span><span>$${openingFloat.toFixed(2)}</span></div>
      <div class="row"><span class="gray">Cash sales</span><span>$${cashSales.toFixed(2)}</span></div>
      ${cashRefunds > 0 ? `<div class="row"><span class="gray">Cash refunds</span><span>−$${cashRefunds.toFixed(2)}</span></div>` : ""}
      <div class="row bold"><span>Expected</span><span>$${expectedCash.toFixed(2)}</span></div>
      <div class="row bdr-t"><span class="gray">Counted</span><span>$${cashCounted.toFixed(2)}</span></div>
      <div class="row bold ${cashVariance === 0 ? "" : cashVariance > 0 ? "gray" : "gray"}"><span>Variance</span><span>${cashVariance >= 0 ? "+" : ""}$${cashVariance.toFixed(2)}</span></div>

      <div class="head bdr-t">EFTPOS / CARD</div>
      <div class="row"><span class="gray">Card sales (POS)</span><span>$${cardSales.toFixed(2)}</span></div>
      ${splitSales > 0 ? `<div class="row"><span class="gray">Split (POS)</span><span>$${splitSales.toFixed(2)}</span></div>` : ""}
      <div class="row"><span class="gray">Terminal total</span><span>$${eftposDeclared.toFixed(2)}</span></div>
      <div class="row bold"><span>Variance</span><span>${eftposVariance >= 0 ? "+" : ""}$${eftposVariance.toFixed(2)}</span></div>

      ${note ? `<p class="small gray mt">Note: ${note}</p>` : ""}
      <p class="center small gray mt bdr-t">Keep this receipt for your records.</p>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  /* staff login message */
  const [loginMsg, setLoginMsg] = useState<StaffLoginMessage | null>(null);
  const [loginMsgOpen, setLoginMsgOpen] = useState(false);
  const [msgAckChecked, setMsgAckChecked] = useState(false);

  /* ── Data fetches ── */
  /* Effective category for API filtering — last element of drill-down path.
     When a search is active, ignore the drill-down so all categories are searched. */
  const effectiveCategoryId = posTab === "browse" && categoryPath.length > 0 && !search
    ? categoryPath[categoryPath.length - 1]
    : null;

  const { data: registersData } = useListPosRegisters();
  const activeRegister = (registersData?.items ?? []).find((r) => r.registerId === activeRegisterId);

  const { data: productsData } = useListProducts(
    { search: search || undefined, categoryId: effectiveCategoryId || undefined, limit: 200 },
    { query: { queryKey: ["products", search, effectiveCategoryId] } }
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
  const createTransactionMutation  = useCreateTransaction();
  const createGiftCardMutation     = useCreateGiftCard();
  const validateGiftCardMutation   = useValidateGiftCard();
  const updateGiftCardMutation     = useUpdateGiftCard();

  const allProducts = productsData?.items || [];
  const categories  = categoriesData || [];
  const customers   = customersData?.items || [];

  /* Build category tree */
  const topLevelCats  = categories.filter(c => !c.parentId);
  const getChildren   = (id: number) => categories.filter(c => c.parentId === id);
  const activeCatId   = categoryPath.length > 0 ? categoryPath[categoryPath.length - 1] : null;
  const subCats       = activeCatId ? getChildren(activeCatId) : [];

  /* Filter products: favourites mode → client-side filter by pinned IDs.
     When a search is active, always show all products regardless of tab
     so the cashier can find items without switching tabs first. */
  const products = (posTab === "favourites" && !search)
    ? allProducts.filter(p => favouriteIds.has(p.id))
    : allProducts;

  /* All products for barcode lookup (loaded once, unfiltered) */
  const { data: allProductsBarcodeData } = useListProducts(
    { limit: 1000 },
    { query: { queryKey: ["products-barcode-lookup"] } }
  );
  const barcodeProducts = allProductsBarcodeData?.items || [];

  /* ── Customer tier (used for discount & loyalty) ── */
  const customerTier = useMemo(() => {
    if (!selectedCustomer || loyaltySettings?.programType !== "tiered") return null;
    const spent = selectedCustomer.totalSpent ?? 0;
    const pts = selectedCustomer.loyaltyPoints ?? 0;
    const tiers = [...(loyaltySettings?.tiers ?? [])].sort((a, b) =>
      (b.pointsRequired ?? b.minSpend ?? 0) - (a.pointsRequired ?? a.minSpend ?? 0)
    );
    return tiers.find((t) => {
      if (t.pointsRequired != null) return pts >= t.pointsRequired;
      return spent >= (t.minSpend ?? 0);
    }) ?? tiers[tiers.length - 1] ?? null;
  }, [loyaltySettings, selectedCustomer]);

  /* ── Computed totals (memoised — only recalculate when cart or discount changes) ── */
  const {
    cartSubtotal, itemDiscountTotal, overallDiscountAmt,
    discountTotal, subtotal, taxTotal, total, kodeProfit,
    tierDiscountAmt,
  } = useMemo(() => {
    const cartSubtotal       = cart.reduce((s, i) => s + (i.customPrice ?? i.product.price) * i.quantity, 0);
    const itemDiscountTotal  = cart.reduce((s, i) => s + i.itemDiscount, 0);
    const overallDiscountAmt = Math.min(Math.max(parseFloat(overallDiscount) || 0, 0), Math.max(cartSubtotal - itemDiscountTotal, 0));
    const discountTotal      = itemDiscountTotal + overallDiscountAmt;
    const afterDiscounts     = cartSubtotal - discountTotal;
    const tierDiscountPct    = customerTier?.discountPct ?? 0;
    const tierDiscountAmt    = Math.min(Math.max(afterDiscounts * (tierDiscountPct / 100), 0), afterDiscounts);
    const subtotal           = afterDiscounts - tierDiscountAmt;
    const taxTotal           = subtotal * (10 / 110);   // GST-inclusive: extract tax component
    const total              = subtotal;                 // Prices already include GST
    const kodeProfit         = Math.floor(
      cart.reduce((s, i) => {
        const price = i.customPrice ?? i.product.price;
        const cost  = (i.product as Product & { costPrice?: number }).costPrice ?? 0;
        return s + (price - cost) * i.quantity - i.itemDiscount;
      }, 0) - overallDiscountAmt - tierDiscountAmt,
    );
    return { cartSubtotal, itemDiscountTotal, overallDiscountAmt, discountTotal, subtotal, taxTotal, total, kodeProfit, tierDiscountAmt };
  }, [cart, overallDiscount, customerTier]);

  /* The amount the terminal actually charges. In Invoice Payment Mode this is
     the locked remaining balance; otherwise it's the cart total. */
  const effectiveTotal = invoicePay ? invoicePay.balance : total;

  /* Loyalty — base earn + active promotion bonuses */
  const { loyaltyAmount, loyaltyLabel, loyaltyUnit } = useMemo(() => {
    if (walkIn || !loyaltySettings?.isEnabled || cart.length === 0)
      return { loyaltyAmount: 0, loyaltyLabel: "", loyaltyUnit: "" };
    const excluded = (loyaltySettings.excludedCustomerGroups ?? []).map((g: string) => g.toLowerCase());
    const group = (selectedCustomer?.customerGroup ?? "").toLowerCase();
    if (selectedCustomer && group && excluded.includes(group))
      return { loyaltyAmount: 0, loyaltyLabel: "No loyalty (excluded group)", loyaltyUnit: "" };

    /* eligible total after exclusions + discounts */
    const eligible = cart.reduce((s, i) => {
      if (i.product.excludeFromLoyalty) return s;
      return s + (i.customPrice ?? i.product.price) * i.quantity - i.itemDiscount;
    }, 0) - overallDiscountAmt;
    if (eligible <= 0) return { loyaltyAmount: 0, loyaltyLabel: "", loyaltyUnit: "" };

    /* promotions */
    const promotions = (loyaltySettings.promotions ?? []) as Array<{
      id: string; name: string; type: string; active: boolean;
      multiplier?: number; bonusAmount?: number;
      categoryId?: number | null; productId?: number | null;
      minSpend?: number | null; startDate?: string | null; endDate?: string | null;
    }>;
    const today = new Date().toISOString().slice(0, 10);
    const activePromos = promotions.filter((p) => {
      if (!p.active) return false;
      const inRange = (!p.startDate || p.startDate <= today) && (!p.endDate || p.endDate >= today);
      if (!inRange) return false;
      if (p.type === "spend_threshold" && (p.minSpend == null || eligible < p.minSpend)) return false;
      if (p.type === "category_bonus" && p.categoryId != null) {
        const hasCat = cart.some((i) => !i.product.excludeFromLoyalty && i.product.categoryId === p.categoryId);
        if (!hasCat) return false;
      }
      if (p.type === "product_bonus" && p.productId != null) {
        const hasProduct = cart.some((i) => !i.product.excludeFromLoyalty && i.product.id === p.productId);
        if (!hasProduct) return false;
      }
      if (p.type === "birthday" && selectedCustomer) {
        const dob = selectedCustomer.dateOfBirth;
        if (!dob) return false;
        const todayM = new Date().getMonth() + 1;
        const todayD = new Date().getDate();
        const d = new Date(dob);
        if (d.getMonth() + 1 !== todayM || d.getDate() !== todayD) return false;
      }
      return true;
    });
    const bestMultiplier = activePromos.length > 0
      ? Math.max(...activePromos.map((p) => p.multiplier ?? 1))
      : 1;
    const bestBonus = activePromos.length > 0
      ? Math.max(...activePromos.map((p) => p.bonusAmount ?? 0))
      : 0;
    const promoNames = activePromos.map((p) => p.name);

    let baseAmount = 0;
    let label = "";
    let unit = "";
    switch (loyaltySettings.programType) {
      case "cashback": {
        const r = loyaltySettings.cashbackRate ?? 0.01;
        baseAmount = eligible * r;
        label = `${(r * 100).toFixed(1)}% cashback`;
        unit = "$";
        break;
      }
      case "points": {
        const pts = Math.floor(eligible * (loyaltySettings.pointsPerDollar ?? 1));
        baseAmount = pts;
        label = `${pts} pts earned`;
        unit = "pts";
        break;
      }
      case "tiered": {
        const tier = customerTier;
        const r = (tier?.rate ?? 0.01);
        const bonusMult = tier?.bonusMultiplier ?? 1;
        baseAmount = eligible * r * bonusMult;
        const bonusLabel = bonusMult > 1 ? ` · ${bonusMult}x bonus` : "";
        label = `${(r * 100).toFixed(1)}% cashback (${tier?.name ?? ""})${bonusLabel}`;
        unit = "$";
        break;
      }
      case "stamp": baseAmount = 1; label = "1 stamp earned"; unit = "stamp"; break;
      case "custom": {
        const r = loyaltySettings.customValue ?? 0.01;
        baseAmount = eligible * r;
        label = "reward earned";
        unit = "$";
        break;
      }
      default: return { loyaltyAmount: 0, loyaltyLabel: "", loyaltyUnit: "" };
    }

    /* apply best promotion bonus */
    const finalAmount = baseAmount * bestMultiplier + bestBonus;
    const promoLabel = promoNames.length > 0
      ? `${promoNames.join(", ")} · ${bestMultiplier}x`
      : "";
    return {
      loyaltyAmount: finalAmount,
      loyaltyLabel: promoLabel ? `${label} — ${promoLabel}` : label,
      loyaltyUnit: unit,
    };
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

  /* Split derived values */
  const splitTotal = splitLegs.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const splitRemaining = Math.max(0, effectiveTotal - splitTotal);
  const splitComplete = Math.abs(splitTotal - effectiveTotal) < 0.005;

  /* Numpad derived — only cash and loyalty use the numpad for amount entry.
     For all other methods (EFTPOS, card, voucher, etc.) the tendered amount
     always equals the total since the terminal/processor charges exact. */
  const numpadIsRelevant = payMethod === "cash" || payMethod === "loyalty";
  const enteredAmount = numpadIsRelevant
    ? (numpadInput ? (parseFloat(numpadInput) || 0) : effectiveTotal)
    : effectiveTotal;
  const changeDue = payMethod === "cash" ? Math.max(0, enteredAmount - effectiveTotal) : 0;
  const amountRemaining = payMethod === "cash" ? Math.max(0, effectiveTotal - enteredAmount) : 0;

  /* Restore a parked sale that was triggered from the /pos/parked page.
     pos-parked writes the full sale payload to a module store and then
     navigates here; we take it on mount and hydrate the cart. */
  /* Invoice Payment Mode — the invoices page parks the remaining balance +
     linked customer in a module store and navigates here. Take it on mount and
     lock the terminal to settling that invoice. Runs before the parked-cart
     restore so the two flows never collide. */
  useEffect(() => {
    const pending = takePendingInvoicePayment();
    if (!pending) return;
    setInvoicePay(pending);
    setCart([]);
    setOverallDiscount("");
    setSaleNotes("");
    setSelectedCustomer(null);
    setWalkIn(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const raw = takePendingCart();
    if (!raw) return;
    try {
      const sale = JSON.parse(raw) as {
        id: number;
        reference: string;
        note: string | null;
        customerId: number | null;
        items: Array<{
          productId: number; name: string; quantity: number; price: number;
          itemDiscount?: number; customPrice?: number | null; itemNote?: string | null;
        }>;
        total: number;
        createdAt: string;
      };

      /* Build CartItem[] — fall back to a minimal Product stub if the full
         product hasn't loaded yet (allProducts may be empty on first render). */
      const restoredCart: CartItem[] = sale.items.map((item) => {
        const product = allProducts.find((p) => p.id === item.productId) ?? ({
          id: item.productId, name: item.name, price: item.price,
        } as Product);
        return {
          product,
          quantity: item.quantity ?? 1,
          itemDiscount: item.itemDiscount ?? 0,
          customPrice: item.customPrice ?? undefined,
          itemNote: item.itemNote ?? undefined,
        };
      });

      setCart(restoredCart);
      setOverallDiscount("");
      setSaleNotes("");
      setSelectedCustomer(null);
      setWalkIn(null);

      /* Re-parse encoded note → sale notes + overall discount */
      if (sale.note) {
        const parts = sale.note.split(" | ");
        const discountPart = parts.find((p) => p.startsWith("Discount:"));
        if (discountPart) setOverallDiscount(discountPart.replace("Discount:", ""));
        const noteParts = parts.filter(
          (p) =>
            !p.startsWith("Discount:") &&
            p !== "No customer" &&
            (sale.customerId == null || !p.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/)),
        );
        if (noteParts.length > 0) setSaleNotes(noteParts.join(" | "));
      }

      /* Customer restore — attempt immediately if data is ready,
         otherwise store the ID and let the effect below pick it up. */
      if (sale.customerId) {
        const found = customersData?.items?.find((c) => c.id === sale.customerId);
        if (found) {
          setSelectedCustomer(found);
        } else {
          setPendingRestoreCustomerId(sale.customerId);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/parked-sales"] });
      toast.success(`${sale.reference} loaded into cart`);
    } catch {
      /* ignore malformed data */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); /* run once on mount — allProducts/customersData handled by the effect below */

  /* Once customers finish loading, resolve any pending customer from a restore. */
  useEffect(() => {
    if (!pendingRestoreCustomerId || !customersData?.items) return;
    const found = customersData.items.find((c) => c.id === pendingRestoreCustomerId);
    if (found) {
      setSelectedCustomer(found);
      setPendingRestoreCustomerId(null);
    }
  }, [pendingRestoreCustomerId, customersData]);

  /* Reset payment modal when it opens */
  useEffect(() => {
    if (paymentModalOpen) {
      const enabled = getEnabledPaymentMethods();
      const first = ALL_PAYMENT_METHODS.find(m => enabled.includes(m.id));
      setPayMethod(first?.id ?? "cash");
      setNumpadInput("");
      setReceiptMode("idle");
      setSplitLegs([{ method: "cash", amount: "" }, { method: "eftpos", amount: "" }]);
      setGcPayCardNumber("");
      setGcValidation(null);
      setGcRemainingMethod("cash");
    }
  }, [paymentModalOpen]);

  /* Clear numpad when switching to a method that doesn't use it;
     clear gift-card state when switching away from gift_card. */
  useEffect(() => {
    if (payMethod !== "cash" && payMethod !== "loyalty") {
      setNumpadInput("");
    }
    if (payMethod !== "gift_card") {
      setGcPayCardNumber("");
      setGcValidation(null);
    }
  }, [payMethod]);

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
      tierDiscountAmt: tierDiscountAmt > 0 ? tierDiscountAmt : undefined,
      customerTierName: customerTier?.name,
      loyaltyAmount, loyaltyLabel, loyaltyUnit,
      customerName,
      updatedAt: Date.now(),
    };
    try {
      window.dispatchEvent(new StorageEvent("storage", { key: DISPLAY_KEY, newValue: JSON.stringify(payload) }));
    } catch { /* ignore */ }
  }, [cart, total, subtotal, taxTotal, discountTotal, cartSubtotal, loyaltyAmount, loyaltyLabel, loyaltyUnit, selectedCustomer, walkIn, tierDiscountAmt, customerTier]);

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
  const addTempToCart = () => {
    const name = tempItemForm.name.trim();
    const price = parseFloat(tempItemForm.price);
    if (!name) { toast.error("Enter an item name"); return; }
    if (!price || price <= 0) { toast.error("Enter a valid price"); return; }
    const tempProduct = {
      id: 0,
      name,
      price,
      sku: null,
      merchantId: 0,
      stockQuantity: null,
      lowStockThreshold: null,
      taxRate: "10",
      trackInventory: "false",
      isActive: "true",
      categoryId: null,
      imageUrl: null,
      description: null,
      costPrice: tempItemForm.cost ? String(parseFloat(tempItemForm.cost)) : null,
      productType: "product",
      barcode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      excludeFromLoyalty: "false",
    } as unknown as Product;
    setCart(prev => [...prev, { product: tempProduct, quantity: 1, itemDiscount: 0 }]);
    setTempItemOpen(false);
    setTempItemForm({ name: "", price: "", cost: "" });
  };

  const addToCart = (product: Product) => {
    if (invoicePay) {
      toast.error("Finish or cancel the invoice payment before adding items");
      return;
    }
    if (!registerOpen) {
      setTillClosedDialogOpen(true);
      return;
    }
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

  /* ── Barcode scanner (USB scanners type fast then press Enter) ── */
  const barcodeBufferRef = useRef("");
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addToCartRef = useRef(addToCart);
  addToCartRef.current = addToCart;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Ignore when user is typing in inputs / textareas
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "Enter") {
        const barcode = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = "";
        if (barcodeTimerRef.current) { clearTimeout(barcodeTimerRef.current); barcodeTimerRef.current = null; }
        if (barcode.length >= 4) {
          const match = barcodeProducts.find((p) => p.barcode === barcode);
          if (match) {
            addToCartRef.current(match as unknown as Product);
            toast.success(`Scanned: ${match.name}`);
          } else {
            toast.error(`Barcode not found: ${barcode}`);
          }
        }
        return;
      }
      if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
        if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
        barcodeTimerRef.current = setTimeout(() => {
          barcodeBufferRef.current = "";
          barcodeTimerRef.current = null;
        }, 100);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [barcodeProducts]);

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

  const parkSale = async () => {
    if (cart.length === 0) return;
    const customerLabel = walkIn
      ? `${walkIn.firstName} ${walkIn.lastName}`.trim() || "Walk-in"
      : selectedCustomer
        ? `${selectedCustomer.firstName ?? ""} ${selectedCustomer.lastName ?? ""}`.trim() || "Customer"
        : undefined;
    const items = cart.map(i => ({
      productId: i.product.id,
      name: i.product.name ?? "",
      quantity: i.quantity,
      price: i.customPrice ?? (i.product.price ?? 0),
      itemDiscount: i.itemDiscount,
      customPrice: i.customPrice ?? null,
      itemNote: i.itemNote ?? null,
    }));
    const noteParts = [customerLabel, saleNotes, overallDiscount ? `Discount:${overallDiscount}` : ""].filter(Boolean);
    try {
      await createParkedSaleMutation.mutateAsync({
        data: {
          customerId: selectedCustomer?.id ?? undefined,
          items,
          total,
          note: noteParts.join(" | ") || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/parked-sales"] });
      setCart([]); setOverallDiscount(""); setSaleNotes("");
      setSelectedCustomer(null); setWalkIn(null);
      toast.success("Sale parked");
    } catch {
      toast.error("Failed to park sale");
    }
  };

  const retrieveParkedSale = async (sale: (typeof parkedSalesData)[number]) => {
    /* Snapshot everything from the sale before any async work */
    const saleId = sale.id;
    const saleItems = (sale.items ?? []) as Array<{
      productId: number; name: string; quantity: number; price: number;
      itemDiscount?: number; customPrice?: number | null; itemNote?: string | null;
    }>;
    const saleNote = sale.note ?? null;
    const saleCustomerId = sale.customerId ?? null;

    try {
      if (cart.length > 0) {
        /* Auto-park the current active cart so nothing is lost */
        const currentLabel = walkIn
          ? `${walkIn.firstName} ${walkIn.lastName}`.trim() || "Walk-in"
          : selectedCustomer
            ? `${selectedCustomer.firstName ?? ""} ${selectedCustomer.lastName ?? ""}`.trim() || "Customer"
            : undefined;
        const currentItems = cart.map(i => ({
          productId: i.product.id,
          name: i.product.name ?? "",
          quantity: i.quantity,
          price: i.customPrice ?? (i.product.price ?? 0),
          itemDiscount: i.itemDiscount,
          customPrice: i.customPrice ?? null,
          itemNote: i.itemNote ?? null,
        }));
        await createParkedSaleMutation.mutateAsync({
          data: {
            customerId: selectedCustomer?.id ?? undefined,
            items: currentItems,
            total,
            note: currentLabel,
          },
        });
      }

      /* Delete the retrieved sale from DB */
      await deleteParkedSaleMutation.mutateAsync({ id: saleId });

      /* Restore the cart from the snapshotted sale data */
      const restoredCart: CartItem[] = saleItems.map(item => {
        const product = allProducts.find(p => p.id === item.productId) ?? {
          id: item.productId, name: item.name, price: item.price,
        } as Product;
        return {
          product,
          quantity: item.quantity ?? 1,
          itemDiscount: item.itemDiscount ?? 0,
          customPrice: item.customPrice ?? undefined,
          itemNote: item.itemNote ?? undefined,
        };
      });

      /* Batch all state updates together */
      setCart(restoredCart);
      setOverallDiscount("");
      setSaleNotes("");
      setSelectedCustomer(null);
      setWalkIn(null);

      /* Restore sale note / discount if encoded */
      if (saleNote) {
        const parts = saleNote.split(" | ");
        const discountPart = parts.find(p => p.startsWith("Discount:"));
        if (discountPart) setOverallDiscount(discountPart.replace("Discount:", ""));
        const noteParts = parts.filter(p =>
          !p.startsWith("Discount:") &&
          p !== "No customer" &&
          (saleCustomerId == null || !p.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/))
        );
        if (noteParts.length > 0) setSaleNotes(noteParts.join(" | "));
      }

      /* Restore customer — fetch from already-loaded list if possible */
      if (saleCustomerId) {
        const found = customersData?.items?.find(c => c.id === saleCustomerId);
        if (found) setSelectedCustomer(found);
      }

      setParkedSalesOpen(false);
      toast.success("Sale retrieved");

      /* Invalidate AFTER state updates to avoid flicker */
      queryClient.invalidateQueries({ queryKey: ["/api/parked-sales"] });
    } catch (err) {
      console.error("retrieveParkedSale failed:", err);
      toast.error("Failed to retrieve parked sale");
    }
  };

  const deleteParkedSale = (id: number) => {
    deleteParkedSaleMutation.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/parked-sales"] }),
    });
  };

  const clearCart = () => {
    setCart([]); setOverallDiscount(""); setSaleNotes("");
    setLinkedService(null); setLinkedAppointment(null); setExpandedDiscounts(new Set());
  };

  const printPosReceipt = () => {
    const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => (
      c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
    ));
    const rawBusinessName = merchantData?.businessName ?? "Your Store";
    const rawAbn          = businessProfile.abn ?? "";
    const rawWebsite      = businessProfile.website ?? "";
    const rawEmail        = businessProfile.contactEmail ?? "";
    const rawBrandColor   = businessProfile.brandColors?.[0] ?? "#374151";
    const businessName = esc(rawBusinessName);
    const abn          = esc(rawAbn);
    const website      = esc(rawWebsite);
    const email        = esc(rawEmail);
    /* Restrict brandColor to a safe hex literal to prevent CSS injection via the inline style attribute */
    const brandColor   = /^#[0-9a-fA-F]{3,8}$/.test(rawBrandColor) ? rawBrandColor : "#374151";

    const opts = thermalOpts;

    const receiptNum = completedTx?.receiptNumber ? `#${completedTx.receiptNumber}` : (completedTx ? `#${completedTx.id}` : "");
    const now = new Date();
    const date = now.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + now.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });

    /* Resolve merge tags against RAW values, then escape the final string for HTML insertion */
    const resolveStr = (text: string) => esc(
      String(text ?? "")
        .replace(/{{business\.name}}/g, rawBusinessName)
        .replace(/{{business\.abn}}/g, rawAbn)
        .replace(/{{business\.email}}/g, rawEmail)
        .replace(/{{business\.website}}/g, rawWebsite)
        .replace(/{{transaction\.total}}/g, formatCurrency(completedTotal))
        .replace(/{{transaction\.date}}/g, date)
        .replace(/{{transaction\.number}}/g, receiptNum)
        .replace(/{{[^}]+}}/g, "")
    );

    const thankYou  = resolveStr(opts.thankYouMsg || "");
    const footer    = opts.footerText ? resolveStr(opts.footerText) : "";
    const header    = opts.headerText ? resolveStr(opts.headerText) : "";
    const escReceiptNum = esc(receiptNum);
    const subtotal  = completedSubtotal;
    const gst       = completedTaxTotal;
    const total     = completedTotal;
    const pmLabel   = completedPaymentMethod.toUpperCase();

    const itemRows = completedCart.map((i) => {
      const price     = i.customPrice ?? i.product.price;
      const lineTotal = price * i.quantity;
      const rawName   = i.itemNote ? `${i.product.name} (${i.itemNote})` : i.product.name;
      const name      = esc(rawName);
      return { name, qty: i.quantity, lineTotal };
    });

    let body = "";

    body = `
      <div class="receipt">
        <div class="center bdr-b pb mb">
          ${opts.showLogo ? `<div class="logo-square" style="background:${brandColor}"></div>` : ""}
          <p class="bold upper tracking">${businessName}</p>
          ${opts.showAbn && abn ? `<p class="gray small">ABN ${abn}</p>` : ""}
          ${opts.showWebsite && website ? `<p class="gray small">${website}</p>` : ""}
          <p class="gray small">${date}</p>
          ${receiptNum ? `<p class="gray small">Receipt: ${escReceiptNum}</p>` : ""}
        </div>
        ${header ? `<p class="center small mb">${header}</p>` : ""}
        <table>
          <thead><tr><th class="left">Item</th><th class="tcenter">Qty</th><th class="right">Amt</th></tr></thead>
          <tbody>
            ${itemRows.map((i) => `<tr><td>${i.name}</td><td class="tcenter">${i.qty}</td><td class="right">$${i.lineTotal.toFixed(2)}</td></tr>`).join("")}
          </tbody>
        </table>
        <div class="bdr-t pt small">
          <div class="row"><span class="gray">Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>
          ${opts.showGstBreakdown ? `<div class="row"><span class="gray">GST (10% incl.)</span><span>$${gst.toFixed(2)}</span></div>` : ""}
          <div class="row bold"><span>TOTAL AUD</span><span>$${total.toFixed(2)}</span></div>
          ${opts.showPaymentMethods ? `<div class="row gray"><span>${pmLabel}</span><span>Approved</span></div>` : ""}
        </div>
        <div class="center gray small bdr-t pt mt">
          ${thankYou ? `<p>${thankYou}</p>` : ""}
          ${footer ? `<p>${footer}</p>` : ""}
        </div>
        <!--EXTRAS-->
      </div>`;

    const css = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ${thermalFontCss}; font-size: 12px; color: #1f2937; background: #fff; padding: 16px; }
      .receipt { max-width: 300px; margin: 0 auto; }
      .mono * { font-family: 'Courier New', monospace !important; }
      .mono { font-family: 'Courier New', monospace; font-size: 11px; }
      .center { text-align: center; }
      .left { text-align: left; }
      .right { text-align: right; }
      .tcenter { text-align: center; }
      .bold { font-weight: bold; }
      .upper { text-transform: uppercase; }
      .tracking { letter-spacing: 0.05em; }
      .gray { color: #9ca3af; }
      .blue { color: #3b82f6; }
      .small { font-size: 10px; }
      .big { font-size: 14px; }
      .mb { margin-bottom: 8px; }
      .mt { margin-top: 8px; }
      .pb { padding-bottom: 8px; }
      .pt { padding-top: 8px; }
      .bdr-b { border-bottom: 1px solid #e5e7eb; }
      .bdr-t { border-top: 1px solid #e5e7eb; }
      .divider { color: #9ca3af; margin: 2px 0; letter-spacing: 0; }
      .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
      .bdr-t.bold { padding-top: 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 4px 0; }
      thead tr { border-bottom: 1px solid #e5e7eb; }
      th { font-weight: 500; padding-bottom: 2px; font-size: 10px; color: #6b7280; }
      td { padding: 2px 0; }
      .items-box { background: #f9fafb; padding: 8px; border-radius: 4px; margin: 4px 0; }
      .logo-circle { width: 32px; height: 32px; border-radius: 50%; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; }
      .logo-square { width: 20px; height: 20px; border-radius: 2px; margin: 0 auto 4px; }
      @media print {
        body { padding: 0; }
        @page { margin: 8mm; size: 80mm auto; }
      }
    `;

    /* Extra blocks: loyalty / customer QR / barcode / custom message — appended to selected body.
       Use the snapshot captured at sale time (customer + loyalty are nulled
       after the mutation succeeds, so referencing live state would be empty). */
    const customerForReceipt = completedCustomer;
    const earnedAmt   = completedLoyaltyAmount;
    const earnedUnit  = completedLoyaltyUnit;
    const earnedDisplay =
      earnedUnit === "$"     ? `+${formatCurrency(earnedAmt)}` :
      earnedUnit === "pts"   ? `+${Math.round(earnedAmt)} pts` :
      earnedUnit === "stamp" ? `+${Math.round(earnedAmt)} stamp${earnedAmt === 1 ? "" : "s"}` :
      `+${earnedAmt}`;
    const loyaltyHtml = (opts.showLoyaltyEarned && customerForReceipt && earnedAmt > 0)
      ? `<div class="row" style="background:#ecfdf5;color:#065f46;border-radius:4px;padding:4px 8px;margin:4px 0;font-weight:600"><span>★ Loyalty Earned</span><span>${earnedDisplay}</span></div>`
      : "";
    const qrHtml = (opts.showCustomerQr && customerForReceipt)
      ? `<div class="center mt"><div style="display:inline-block;border:1px solid #e5e7eb;padding:6px;border-radius:4px"><div style="font-family:monospace;font-size:9px;letter-spacing:1px;color:#888">CUS-${esc(String(customerForReceipt.id))}</div></div>${opts.loyaltyQrText ? `<p class="center gray small" style="margin-top:2px">${esc(opts.loyaltyQrText)}</p>` : ""}</div>`
      : "";
    const customMsgHtml = opts.customMessage
      ? `<p class="center small gray mt" style="line-height:1.5">${resolveStr(opts.customMessage).replace(/\n/g, "<br>")}</p>`
      : "";
    /* Inject extras at the dedicated sentinel (one per template). Falls back to append if missing. */
    const extras = `${loyaltyHtml}${customMsgHtml}${qrHtml}`;
    body = body.includes("<!--EXTRAS-->")
      ? body.replace("<!--EXTRAS-->", extras)
      : `${body}${extras}`;

    const bcValue = esc(receiptNum.replace(/^#/, "") || "0");
    const barcodeScript = opts.showBarcode
      ? `<div class="center mt"><svg id="sale-barcode"></svg></div>
         <script>
           (function(){
             var s=document.createElement('script');
             s.src='https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
             s.onload=function(){
               JsBarcode('#sale-barcode','${bcValue}',{format:'CODE128',width:1,height:24,fontSize:8,displayValue:true,margin:0});
             };
             document.head.appendChild(s);
           })();
         </script>`
      : "";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${escReceiptNum}</title><style>${css}</style></head><body>${body}${barcodeScript}</body></html>`;
    const printOnce = (label: string) => {
      const tagged = label
        ? html.replace("<body>", `<body><p style="text-align:center;font-weight:bold;font-size:11px;color:#9ca3af;letter-spacing:2px;margin-bottom:6px">${label}</p>`)
        : html;
      const win = window.open("", "_blank", "width=400,height=600,scrollbars=yes");
      if (win) {
        win.document.write(tagged);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 800);
      }
    };
    printOnce("");
    if (opts.printCustomerCopy) {
      setTimeout(() => printOnce("CUSTOMER COPY"), 1400);
    }
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
    /* staff no longer persisted to localStorage */
    setPinDialogOpen(false); setPinInput(""); setPinError("");
    toast.success(`Signed in as ${staff.name}`);

    /* staff login message */
    const msg = getStaffLoginMessage();
    if (msg?.enabled && msg.text.trim()) {
      const merchantId = merchantData?.id ?? 0;
      const alreadyAcked = msg.requireAck ? hasStaffAcknowledged(merchantId, staff.id, msg) : false;
      if (!alreadyAcked) {
        setLoginMsg(msg);
        setMsgAckChecked(false);
        setLoginMsgOpen(true);
      }
    }

    if (pendingPaymentAfterPin) { setPendingPaymentAfterPin(false); setPaymentModalOpen(true); }
  };

  const handleCheckout = (
    paymentMethod: TransactionInputPaymentMethod,
    amountTendered: number,
    extraNote?: string,
  ) => {
    // ── Invoice Payment Mode ──
    // Settle an existing invoice's remaining balance instead of ringing up a
    // cart sale. Reuses the purpose-built POST /invoices/:id/payment endpoint
    // which appends the payment, updates the ledger, flips the badge to
    // partial/paid, and credits loyalty on full settlement.
    if (invoicePay) {
      if (invoicePayPending) return;
      const inv = invoicePay;
      const amount = inv.balance;
      setInvoicePayPending(true);
      void (async () => {
        try {
          const res = await fetch(`/api/invoices/${inv.invoiceId}/payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ amount }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Failed to record payment" }));
            toast.error(err.error ?? "Failed to record payment");
            return;
          }
          const methodLabel = ALL_PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label ?? paymentMethod;
          // Synthesize a receipt for the invoice payment (no cart sale exists).
          const lineProduct = {
            id: inv.invoiceId,
            name: `Invoice ${inv.invoiceNumber} Payment`,
            price: amount,
          } as Product;
          setCompletedCart([{ product: lineProduct, quantity: 1, itemDiscount: 0 }]);
          setCompletedPaymentMethod(paymentMethod);
          setCompletedSubtotal(amount);
          setCompletedTaxTotal(0);
          setCompletedCustomer(
            inv.customerId != null
              ? ({ id: inv.customerId, firstName: inv.customerName ?? "Customer", lastName: "" } as Customer)
              : null,
          );
          setCompletedLoyaltyAmount(0);
          setCompletedTx({ id: inv.invoiceId, receiptNumber: inv.invoiceNumber });
          setCompletedTotal(amount);
          setReceiptEmail("");
          setReceiptPhone("");
          setReceiptMode("idle");
          setInvoicePay(null);
          setNumpadInput("");
          setPaymentModalOpen(false);
          toast.success(`Payment recorded for invoice ${inv.invoiceNumber} via ${methodLabel}`);
          setTimeout(() => setReceiptOpen(true), 250);
        } catch {
          toast.error("Failed to record payment");
        } finally {
          setInvoicePayPending(false);
        }
      })();
      return;
    }
    // Distribute cart-level (overall) and tier discounts proportionally across
    // all items so the server's recomputed total matches the client total.
    // Without this, the server ignores the overall discount and rejects with 409.
    const _totalOverallDiscount = overallDiscountAmt + tierDiscountAmt;
    const _afterItemDiscounts = cartSubtotal - itemDiscountTotal;
    let _allocated = 0;
    const txItems = cart.map((i, idx) => {
      const lineGross = (i.customPrice ?? i.product.price) * i.quantity;
      const lineAfterItemDisc = Math.max(0, lineGross - i.itemDiscount);
      let proportional: number;
      if (idx === cart.length - 1) {
        // Last item absorbs any rounding remainder so the sum is exact
        proportional = Math.max(0, Math.round((_totalOverallDiscount - _allocated) * 100) / 100);
      } else {
        proportional = _totalOverallDiscount > 0 && _afterItemDiscounts > 0
          ? Math.round(_totalOverallDiscount * (lineAfterItemDisc / _afterItemDiscounts) * 100) / 100
          : 0;
        _allocated += proportional;
      }
      const totalDiscount = Math.round((i.itemDiscount + proportional) * 100) / 100;
      const lineTotal = Math.round((lineGross - totalDiscount) * 100) / 100;
      const taxRate = i.product.taxRate ?? 10;
      return {
        productId: i.product.id,
        productName: i.product.name,
        quantity: i.quantity,
        unitPrice: i.customPrice ?? i.product.price,
        totalPrice: lineTotal,
        taxAmount: Math.round(lineTotal * (taxRate / (100 + taxRate)) * 100) / 100,
        discount: totalDiscount > 0 ? totalDiscount : undefined,
      };
    });
    const notesParts = [
      linkedService ? `[Service #${linkedService.jobNumber}: ${linkedService.deviceType || linkedService.deviceDescription || "service"}]` : null,
      linkedAppointment ? `[Appt #${linkedAppointment.id}: ${linkedAppointment.title}]` : null,
      extraNote || null,
      saleNotes || null,
    ].filter(Boolean);

    const receiptPrefix = "KR", receiptDigits = 5;
    const n = Math.floor(Math.random() * Math.pow(10, receiptDigits));
    const receiptNumber = `${receiptPrefix}${String(n).padStart(receiptDigits, "0")}`;

    /* Send loyaltyEarned for every program type — the server is authoritative
       and will recompute the credited amount itself, but persisting our
       calculated value keeps the transaction record in sync with the UI
       preview. Suppress only when the customer is paying WITH loyalty. */
    const sendLoyaltyEarned =
      !walkIn &&
      loyaltyAmount > 0 &&
      paymentMethod !== "loyalty";

    createTransactionMutation.mutate({
      data: {
        items: txItems, paymentMethod, subtotal, taxTotal,
        discountTotal: (discountTotal + tierDiscountAmt) > 0 ? discountTotal + tierDiscountAmt : undefined,
        total, amountTendered,
        customerId: selectedCustomer?.id,
        staffId: currentStaff?.id,
        loyaltyEarned: sendLoyaltyEarned ? loyaltyAmount : undefined,
        notes: notesParts.length > 0 ? notesParts.join(" | ") : undefined,
        receiptNumber,
      }
    }, {
      onSuccess: (data) => {
        // Track session sales by payment method (in-memory only)
        try {
          if (sessionSnap) {
            const s = { ...sessionSnap };
            const pm = paymentMethod as string;
            s.sales = s.sales ?? {};
            s.sales[pm] = (s.sales[pm] ?? 0) + total;
            s.txCount = (s.txCount ?? 0) + 1;
            setSessionSnap(s);
          }
        } catch { /* ignore */ }
        // Capture total + cart before clearing
        const saleTotal = total;
        setCompletedCart([...cart]);
        // Issue any gift cards purchased in this sale
        cart.filter(i => i.giftCardNumber).forEach(item => {
          createGiftCardMutation.mutate({
            data: { cardNumber: item.giftCardNumber!, initialValue: item.customPrice ?? item.product.price },
          }, {
            onError: () => toast.error(`Failed to activate gift card ${item.giftCardNumber} — check Management > Gift Cards`),
          });
        });
        setCompletedPaymentMethod(paymentMethod);
        setCompletedSubtotal(subtotal);
        setCompletedTaxTotal(taxTotal);
        setCompletedCustomer(selectedCustomer);
        setCompletedLoyaltyAmount(sendLoyaltyEarned ? loyaltyAmount : 0);
        setCompletedLoyaltyUnit(loyaltyUnit);
        clearCart();
        setCompletedTx({ id: data.id, receiptNumber: data.receiptNumber });
        setCompletedTotal(saleTotal);
        setReceiptEmail(selectedCustomer?.email ?? "");
        setReceiptPhone(selectedCustomer?.phone ?? "");
        setReceiptMode("idle");
        setSelectedCustomer(null);
        setWalkIn(null);
        // Close payment modal first, then open receipt after animation completes
        setPaymentModalOpen(false);
        setTimeout(() => setReceiptOpen(true), 250);
      },
      onError: (err: unknown) => {
        console.error("createTransaction failed:", err);
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "error" in err
              ? String((err as { error: unknown }).error)
              : "Failed to process transaction";
        toast.error(message);
      },
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
      <POSPageExpander>
      <div className="flex w-full overflow-hidden" style={{ height: "calc(100dvh - 3.5rem)" }}>

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
              <Button
                variant="outline"
                size="sm"
                className="h-10 shrink-0 gap-1.5"
                onClick={() => { setTempItemOpen(true); setTempItemForm({ name: "", price: "", cost: "" }); }}
                title="Add a one-off custom item to the cart"
              >
                <Package className="w-4 h-4" />
                <span className="hidden sm:inline">Custom</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 shrink-0 gap-1.5 text-violet-700 border-violet-300 hover:bg-violet-50 hover:border-violet-400 dark:text-violet-400 dark:border-violet-700 dark:hover:bg-violet-900/20"
                onClick={() => { setGcIssueForm({ cardNumber: "", amount: "" }); setGcIssueOpen(true); }}
                title="Sell a new gift card"
              >
                <Gift className="w-4 h-4" />
                <span className="hidden sm:inline">Gift Card</span>
              </Button>
            </div>
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex w-max space-x-1.5 pb-1">
                {/* ─ Favourites tab ─ */}
                <Button
                  variant={posTab === "favourites" ? "default" : "outline"}
                  onClick={() => { setPosTab("favourites"); setCategoryPath([]); }}
                  size="sm" className="rounded-full h-7 text-xs gap-1 shrink-0"
                >
                  <Star className="w-3 h-3" />
                  Favourites {favouriteIds.size > 0 && `(${favouriteIds.size})`}
                </Button>

                {/* ─ Browse: All or drill-down ─ */}
                {categoryPath.length === 0 ? (
                  <>
                    <Button
                      variant={posTab === "browse" ? "default" : "outline"}
                      onClick={() => { setPosTab("browse"); setCategoryPath([]); }}
                      size="sm" className="rounded-full h-7 text-xs shrink-0"
                    >All</Button>
                    {topLevelCats.map(cat => (
                      <Button key={cat.id} variant="outline"
                        onClick={() => { setPosTab("browse"); setCategoryPath([cat.id]); }}
                        size="sm" className="rounded-full h-7 text-xs shrink-0"
                      >{cat.name}</Button>
                    ))}
                  </>
                ) : (
                  <>
                    {/* Back to top level */}
                    <Button variant="outline" size="sm" className="rounded-full h-7 text-xs gap-0.5 shrink-0"
                      onClick={() => setCategoryPath([])}
                    >
                      ← All
                    </Button>
                    {/* Breadcrumb ancestors (all but last) */}
                    {categoryPath.slice(0, -1).map((catId, idx) => {
                      const cat = categories.find(c => c.id === catId);
                      return cat ? (
                        <Button key={catId} variant="outline" size="sm" className="rounded-full h-7 text-xs shrink-0"
                          onClick={() => setCategoryPath(prev => prev.slice(0, idx + 1))}
                        >{cat.name}</Button>
                      ) : null;
                    })}
                    {/* Current category (selected) */}
                    {(() => {
                      const cur = categories.find(c => c.id === categoryPath[categoryPath.length - 1]);
                      return cur ? <Button variant="default" size="sm" className="rounded-full h-7 text-xs shrink-0">{cur.name}</Button> : null;
                    })()}
                    {/* Children of current category */}
                    {subCats.map(child => (
                      <Button key={child.id} variant="outline" size="sm" className="rounded-full h-7 text-xs shrink-0"
                        onClick={() => setCategoryPath(prev => [...prev, child.id])}
                      >{child.name}</Button>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>

          <ScrollArea className="flex-1 p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {products.map(product => (
                <div
                  key={product.id}
                  onClick={() => addToCart(product)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && addToCart(product)}
                  className="group flex flex-col text-left border rounded-xl overflow-hidden hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all active:scale-[0.97] bg-card hover:shadow-md cursor-pointer"
                >
                  <div className="w-full h-[150px] bg-muted flex items-center justify-center relative overflow-hidden">
                    {product.imageUrl
                      ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain" />
                      : <span className="text-3xl font-bold text-muted-foreground/20">{product.name.charAt(0)}</span>
                    }
                    {(product as typeof product & { productType?: string }).productType !== "service" && product.stockQuantity != null && product.stockQuantity <= (product.lowStockThreshold || 5) && (
                      <Badge variant="destructive" className="absolute top-1.5 right-1.5 text-[10px] px-1 py-0">Low</Badge>
                    )}
                    {/* Pin to Favourites */}
                    <button
                      onClick={(e) => toggleFavourite(product.id, e)}
                      title={favouriteIds.has(product.id) ? "Remove from Favourites" : "Pin to Favourites"}
                      className={cn(
                        "absolute top-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-all",
                        "opacity-0 group-hover:opacity-100",
                        favouriteIds.has(product.id)
                          ? "opacity-100 bg-amber-400 text-white shadow"
                          : "bg-black/30 text-white hover:bg-amber-400"
                      )}
                    >
                      <Star className={cn("w-3 h-3", favouriteIds.has(product.id) && "fill-current")} />
                    </button>
                  </div>
                  <div className="p-2.5">
                    <p className="font-semibold text-xs line-clamp-2 leading-snug min-h-[2rem]">{product.name}</p>
                    <p className="font-bold text-primary text-sm mt-1">
                      {(product.price ?? 0) === 0
                        ? <span className="text-muted-foreground text-[11px] font-normal">Enter price</span>
                        : formatCurrency(product.price)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {products.length === 0 && (
              posTab === "favourites" && !search ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm text-center">
                  <Star className="w-10 h-10 text-muted-foreground/20" />
                  <div>
                    <p className="font-medium">No favourites yet</p>
                    <p className="text-xs mt-1">Hover over any product and click the star to pin it here.</p>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No products found.</div>
              )
            )}
          </ScrollArea>
        </div>

        {/* ─── Cart sidebar ─── */}
        <div className="w-[22rem] border-l bg-card flex flex-col shrink-0 overflow-x-hidden">

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
                onClick={() => {
                  if (registerOpen) {
                    setSessionSnap(getSession());
                    setCloseFormData({ cashCounted: "", eftposDeclared: "", notes: "" });
                    setCloseRegisterDialogOpen(true);
                  } else {
                    setOpenRegisterDialogOpen(true);
                  }
                }}
                title={registerOpen ? "Close Register" : "Open Register"}
                className={cn("p-1.5 rounded-lg transition-colors", registerOpen ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30" : "text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30")}
              >
                {registerOpen ? <DoorOpen className="w-4 h-4" /> : <DoorClosed className="w-4 h-4" />}
              </button>
              <PosWebcamCapture
                enabled={activeRegister?.posCameraEnabled === "true"}
                deviceId={activeRegister?.posCameraDeviceId}
              />
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
              {/* Parked sales badge */}
              {parkedSalesData.length > 0 && (
                <button
                  onClick={() => setParkedSalesOpen(o => !o)}
                  title="Parked sales"
                  className={cn(
                    "relative p-1.5 rounded-lg transition-colors",
                    parkedSalesOpen
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                  )}
                >
                  <History className="w-4 h-4" />
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-bold leading-none">
                    {parkedSalesData.length}
                  </span>
                </button>
              )}
              <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0" onClick={clearCart} disabled={cart.length === 0} title="Clear cart">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>

          {/* ── Parked sales panel ── */}
          {parkedSalesOpen && (
            <div className="border-b bg-amber-50/60 dark:bg-amber-900/10 shrink-0">
              <div className="flex items-center justify-between px-3 py-2 border-b border-amber-200/60 dark:border-amber-700/30">
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <History className="w-3 h-3" /> Parked Sales ({parkedSalesData.length})
                </span>
                <button onClick={() => setParkedSalesOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-amber-100 dark:divide-amber-800/20">
                {parkedSalesData.map((sale) => {
                  const time = new Date(sale.createdAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
                  const saleItems = (sale.items ?? []) as Array<{ quantity: number }>;
                  const itemCount = saleItems.reduce((s, i) => s + i.quantity, 0);
                  const label = sale.note
                    ? sale.note.split(" | ").filter(p => !p.startsWith("Discount:"))[0] ?? "Parked sale"
                    : "Parked sale";
                  return (
                    <div key={sale.id} className="flex items-center gap-2 px-3 py-2 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{label}</p>
                        <p className="text-[10px] text-muted-foreground">{time} · {itemCount} item{itemCount !== 1 ? "s" : ""} · {formatCurrency(sale.total ?? 0)}</p>
                      </div>
                      <button
                        onClick={() => void retrieveParkedSale(sale)}
                        title="Retrieve sale"
                        className="text-xs font-medium text-primary hover:underline shrink-0 px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors"
                      >
                        Retrieve
                      </button>
                      <button
                        onClick={() => deleteParkedSale(sale.id)}
                        title="Discard parked sale"
                        className="text-muted-foreground hover:text-destructive shrink-0 p-0.5 transition-colors"
                      >
                        <Trash className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customer row */}
          <div className="border-b px-3 py-2 shrink-0 relative" ref={customerDropdownRef}>
            <div className="flex items-center gap-1.5">
              {/* Customer chip or search button — takes remaining space */}
              {activeCustomerName ? (
                <div className={cn("flex-1 flex items-center gap-2 rounded-lg px-2.5 py-1.5 min-w-0", !walkIn && selectedCustomer?.warningNote ? "bg-destructive/10 border border-destructive/20" : "bg-muted/40")}>
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", walkIn ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-primary/15 text-primary")}>
                    {walkIn ? "?" : ((selectedCustomer?.firstName?.[0] ?? "") + (selectedCustomer?.lastName?.[0] ?? "")).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{activeCustomerName}</p>
                    {walkIn && <p className="text-[10px] text-amber-600 dark:text-amber-400">Walk-in · No loyalty</p>}
                    {!walkIn && customerTier && <p className="text-[10px] font-medium text-primary">{customerTier.name} tier · {(customerTier.discountPct ?? 0) > 0 ? `${customerTier.discountPct}% off` : ""}{(customerTier.bonusMultiplier ?? 1) > 1 ? ` · ${customerTier.bonusMultiplier}x earn` : ""}</p>}
                    {!walkIn && !customerTier && selectedCustomer?.warningNote && <p className="text-[10px] text-destructive flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" /> Warning on file</p>}
                  </div>
                  <button onClick={() => { setSelectedCustomer(null); setWalkIn(null); }} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <>
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
                    className="p-1.5 text-muted-foreground hover:text-amber-500 border border-dashed rounded-lg transition-colors hover:border-amber-400 shrink-0"
                    title="Walk-in customer"
                  >
                    <Footprints className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {/* Link and Notes — always visible */}
              <button
                onClick={() => setServiceLinkOpen(true)}
                title="Link to service or appointment"
                className={cn("p-1.5 border rounded-lg transition-colors shrink-0", (linkedService || linkedAppointment) ? "text-primary border-primary" : "border-dashed text-muted-foreground hover:text-foreground hover:border-foreground")}
              >
                <LinkIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setNotesOpen(true)}
                className={cn("p-1.5 border rounded-lg transition-colors shrink-0", notesOpen || saleNotes ? "text-primary border-primary" : "border-dashed text-muted-foreground hover:text-foreground hover:border-foreground")}
                title="Sale notes"
              >
                <NotebookPen className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Inline customer dropdown */}
            {customerOpen && !activeCustomerName && (
              <div className="absolute z-50 left-3 right-3 top-full mt-0.5 bg-popover border rounded-lg shadow-lg flex flex-col max-h-[min(320px,60dvh)]">
                <div className="p-2 border-b shrink-0">
                  <Input
                    autoFocus
                    placeholder="Search by name, email or phone..."
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="overflow-y-auto min-h-0">
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

          {/* Invoice Payment Mode banner */}
          {invoicePay && (
            <div className="border-b px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                <Banknote className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Invoice Payment Mode · {invoicePay.invoiceNumber}</span>
                <button
                  onClick={() => { setInvoicePay(null); setNumpadInput(""); }}
                  className="ml-auto shrink-0 hover:text-destructive"
                  title="Cancel invoice payment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Cart items */}
          {invoicePay ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
              <div className="w-full max-w-sm border rounded-xl bg-background p-4 text-left space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <Banknote className="w-5 h-5" />
                  <p className="font-semibold text-sm">Settling Invoice {invoicePay.invoiceNumber}</p>
                </div>
                {invoicePay.customerName && (
                  <p className="text-xs text-muted-foreground">Customer: {invoicePay.customerName}</p>
                )}
                <div className="flex justify-between items-baseline border-t pt-2">
                  <span className="text-sm text-muted-foreground">Balance due</span>
                  <span className="text-lg font-bold text-primary">{formatCurrency(invoicePay.balance)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground max-w-xs">
                The terminal is locked to this invoice balance. Choose any payment method and tap Charge to record the payment.
              </p>
            </div>
          ) : cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Receipt className="w-14 h-14 mb-3 opacity-20" />
              <p className="font-medium text-sm">No items in cart</p>
              <p className="text-xs mt-1">Tap products to add them to the sale.</p>
            </div>
          ) : (
          <ScrollArea className="flex-1 w-full">
              <div className="p-2.5 space-y-1.5 w-full overflow-x-hidden">
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
            {tierDiscountAmt > 0 && (
              <div className="flex justify-between text-xs text-primary font-medium">
                <span>Tier discount ({customerTier?.name})</span><span>−{formatCurrency(tierDiscountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Subtotal (incl. GST)</span><span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Includes GST (10%)</span><span>{formatCurrency(taxTotal)}</span>
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

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-none gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 hover:border-amber-400 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/20"
                disabled={cart.length === 0}
                onClick={parkSale}
                title="Park this sale and start a new one"
              >
                <PauseCircle className="w-4 h-4" />
                Park
              </Button>
              <Button
                className="flex-1 h-12 text-base font-bold"
                disabled={!invoicePay && cart.length === 0}
                onClick={() => {
                  if (!registerOpen) {
                    setTillClosedDialogOpen(true);
                    return;
                  }
                  if (forceStaffLogin && !currentStaff) {
                    setPendingPaymentAfterPin(true);
                    setPinInput(""); setPinError(""); setPinDialogOpen(true);
                    return;
                  }
                  setPaymentModalOpen(true);
                }}
              >
                Charge {formatCurrency(effectiveTotal)}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Payment modal ─── */}
      <Dialog open={paymentModalOpen} onOpenChange={(o) => { setPaymentModalOpen(o); if (!o) setNumpadInput(""); }}>
        <DialogContent className="max-w-[740px] p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="flex flex-col sm:flex-row" style={{ minHeight: 520 }}>

            {/* ── Left panel ── */}
            <div className="flex flex-col w-full sm:w-[320px] shrink-0 border-b sm:border-b-0 sm:border-r p-5 gap-4">
              <DialogTitle className="text-base font-semibold">Process Payment</DialogTitle>

              {/* Amount card */}
              <div className="rounded-xl bg-muted/40 border px-5 py-4 text-center">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1">Amount Due</p>
                <p className="text-4xl font-bold tabular-nums">{formatCurrency(effectiveTotal)}</p>
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

              {/* Method selector / Split legs */}
              {(() => {
                const enabledIds = getEnabledPaymentMethods();
                const builtIn = ALL_PAYMENT_METHODS.filter(m => enabledIds.includes(m.id));
                const integrationKeys = getEnabledIntegrationPayments();
                const integrationMethods = integrationKeys.map(key => ({
                  id: `__intg__${key}` as PaymentMethodId,
                  label: INTEGRATION_PAYMENT_LABELS[key] ?? key,
                  isIntegration: true,
                }));
                const allMethods = [
                  ...builtIn.map(m => ({ id: m.id as PaymentMethodId, label: m.label, Icon: m.icon, isIntegration: false })),
                  ...integrationMethods.map(m => ({ ...m, Icon: CreditCard })),
                  { id: "gift_card" as PaymentMethodId, label: "Gift Card", Icon: Gift, isIntegration: false },
                ];
                const splitEligible = ALL_PAYMENT_METHODS.filter(m => enabledIds.includes(m.id) && m.id !== "split" && m.id !== "laybuy");
                if (payMethod === "split") {
                  return (
                    <div className="space-y-3">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Split Payment Legs</p>
                      {splitLegs.map((leg, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-4 shrink-0 text-center">{i + 1}</span>
                          <Select
                            value={leg.method}
                            onValueChange={(v) => setSplitLegs(prev => prev.map((l, j) => j === i ? { ...l, method: v as PaymentMethodId } : l))}
                          >
                            <SelectTrigger className="flex-1 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {splitEligible.map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="relative w-24">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">$</span>
                            <Input
                              type="number" min="0" step="0.01"
                              className="h-8 text-xs pl-5"
                              placeholder="0.00"
                              value={leg.amount}
                              onChange={(e) => setSplitLegs(prev => prev.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
                            />
                          </div>
                          {splitLegs.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setSplitLegs(prev => prev.filter((_, j) => j !== i))}
                              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      {splitLegs.length < 4 && (
                        <Button
                          type="button" variant="outline" size="sm"
                          className="w-full h-7 gap-1 text-xs"
                          onClick={() => setSplitLegs(prev => [...prev, { method: splitEligible[0]?.id ?? "cash", amount: "" }])}
                        >
                          <Plus className="w-3 h-3" /> Add leg
                        </Button>
                      )}
                      <div className={cn(
                        "rounded-lg px-3 py-2 flex items-center justify-between text-xs font-medium",
                        splitComplete ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300" :
                        splitTotal > effectiveTotal + 0.005 ? "bg-destructive/10 text-destructive" :
                        "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                      )}>
                        <span>{splitComplete ? "Fully covered" : splitTotal > effectiveTotal + 0.005 ? "Over by" : "Remaining"}</span>
                        <span className="tabular-nums">
                          {splitComplete ? "✓" : splitTotal > effectiveTotal + 0.005 ? formatCurrency(splitTotal - effectiveTotal) : formatCurrency(splitRemaining)}
                        </span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Payment Method</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {allMethods.map(({ id, label, Icon, isIntegration }) => (
                        <button
                          key={id}
                          onClick={() => setPayMethod(id)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left
                            ${payMethod === id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:border-primary/40 hover:bg-muted/60 text-foreground"}`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate text-xs">{label}{isIntegration && <span className="ml-1 text-[9px] opacity-60 font-normal">↗</span>}</span>
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

              {/* Loyalty balance — loyalty method only */}
              {payMethod === "loyalty" && (() => {
                if (!selectedCustomer && !walkIn) {
                  return (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 space-y-1">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Customer required</p>
                      <p className="text-xs text-amber-600 dark:text-amber-500">Select a customer to see their available loyalty balance.</p>
                    </div>
                  );
                }
                if (walkIn) {
                  return (
                    <div className="rounded-xl border border-muted bg-muted/30 px-4 py-3">
                      <p className="text-xs text-muted-foreground">Walk-in customers cannot redeem loyalty rewards.</p>
                    </div>
                  );
                }
                const programType = loyaltySettings?.programType;
                if (programType === "stamp") {
                  return (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 space-y-1">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Stamp programs can't be redeemed at checkout</p>
                      <p className="text-xs text-amber-600 dark:text-amber-500">Stamp rewards are issued out-of-band once the card is full.</p>
                    </div>
                  );
                }
                const availablePts = selectedCustomer?.loyaltyPoints ?? 0;
                const isCashType = programType === "cashback" || programType === "tiered" || programType === "custom";
                const dpp = (loyaltySettings?.dollarPerPoint ?? 0.01) || 0.01;
                /* For points programs, balance is in points and 1 pt = dpp dollars.
                   For cash types, balance is dollars (1 unit = $1). */
                const requiredUnits = isCashType ? Math.ceil(effectiveTotal) : Math.ceil(effectiveTotal / dpp);
                const availableDisplay = isCashType ? formatCurrency(availablePts) : `${availablePts} pts`;
                const requiredDisplay  = isCashType ? formatCurrency(requiredUnits) : `${requiredUnits} pts`;
                const enteredLoyalty = parseFloat(numpadInput) || 0;
                const isInsufficient = enteredLoyalty > availablePts;
                return (
                  <div className="rounded-xl border bg-primary/5 border-primary/20 px-4 py-3 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Loyalty Balance</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold tabular-nums">{availableDisplay}</span>
                      <span className="text-xs text-muted-foreground">available · need {requiredDisplay}</span>
                    </div>
                    {enteredLoyalty > 0 && (
                      <p className={`text-xs font-medium tabular-nums ${isInsufficient ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                        {isInsufficient
                          ? `Insufficient — only ${availableDisplay} available`
                          : `Redeeming ${isCashType ? formatCurrency(enteredLoyalty) : `${enteredLoyalty} pts`}`}
                      </p>
                    )}
                    {enteredLoyalty === 0 && (
                      <p className="text-xs text-muted-foreground">Use numpad to enter {isCashType ? "amount" : "points"} to redeem</p>
                    )}
                    {availablePts >= requiredUnits && requiredUnits > 0 && (
                      <button
                        onClick={() => setNumpadInput(isCashType ? requiredUnits.toFixed(2) : String(requiredUnits))}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Cover sale ({requiredDisplay})
                      </button>
                    )}
                  </div>
                );
              })()}

              <div className="flex-1" />
              <Button variant="outline" className="w-full" onClick={() => setPaymentModalOpen(false)}>
                Cancel
              </Button>
            </div>

            {/* ── Right panel ── */}
            <div className="flex-1 flex flex-col p-5 gap-3">
              {payMethod === "split" ? (
                <div className="flex-1 flex flex-col gap-3">
                  <div className="border rounded-xl px-4 py-4 bg-muted/20 space-y-3">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Payment Summary</p>
                    {splitLegs.map((leg, i) => {
                      const amt = parseFloat(leg.amount) || 0;
                      const methodLabel = ALL_PAYMENT_METHODS.find(m => m.id === leg.method)?.label ?? leg.method;
                      return (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{methodLabel}</span>
                          <span className={cn("font-semibold tabular-nums", amt > 0 ? "" : "text-muted-foreground/30")}>
                            {amt > 0 ? formatCurrency(amt) : "—"}
                          </span>
                        </div>
                      );
                    })}
                    <div className="border-t pt-2.5 flex items-center justify-between">
                      <span className="text-sm font-semibold">Total collected</span>
                      <span className={cn(
                        "text-lg font-bold tabular-nums",
                        splitComplete ? "text-green-600 dark:text-green-400" :
                        splitTotal > effectiveTotal + 0.005 ? "text-destructive" :
                        "text-amber-600 dark:text-amber-500"
                      )}>
                        {formatCurrency(splitTotal)}
                        {!splitComplete && <span className="text-xs font-normal text-muted-foreground ml-1">/ {formatCurrency(effectiveTotal)}</span>}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1" />
                </div>
              ) : payMethod === "gift_card" ? (
                /* ── Gift card entry ── */
                <div className="flex-1 flex flex-col gap-4">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Card Number</p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          className="pl-9 uppercase font-mono tracking-widest"
                          placeholder="GC-XXXXXXXX"
                          value={gcPayCardNumber}
                          onChange={e => { setGcPayCardNumber(e.target.value.toUpperCase()); setGcValidation(null); }}
                          onKeyDown={e => {
                            if (e.key === "Enter" && gcPayCardNumber.trim()) {
                              validateGiftCardMutation.mutate(
                                { data: { cardNumber: gcPayCardNumber.trim(), saleTotal: effectiveTotal } },
                                { onSuccess: d => setGcValidation(d), onError: () => toast.error("Could not validate card") }
                              );
                            }
                          }}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={!gcPayCardNumber.trim() || validateGiftCardMutation.isPending}
                        onClick={() => validateGiftCardMutation.mutate(
                          { data: { cardNumber: gcPayCardNumber.trim(), saleTotal: effectiveTotal } },
                          { onSuccess: d => setGcValidation(d), onError: () => toast.error("Could not validate card") }
                        )}
                      >
                        {validateGiftCardMutation.isPending ? "…" : "Validate"}
                      </Button>
                    </div>
                  </div>

                  {/* Validation result */}
                  {gcValidation && (
                    <div className={cn(
                      "rounded-xl border px-4 py-3 space-y-2 text-sm",
                      gcValidation.valid
                        ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                        : "border-destructive/30 bg-destructive/5"
                    )}>
                      {gcValidation.valid ? (
                        <>
                          <div className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-400">
                            <BadgeCheck className="w-4 h-4 shrink-0" />
                            <span className="font-mono">{gcValidation.cardNumber}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-green-700 dark:text-green-300">
                            <span className="text-muted-foreground">Balance</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(gcValidation.currentBalance)}</span>
                            <span className="text-muted-foreground">Applied</span>
                            <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">{formatCurrency(gcValidation.applicableAmount)}</span>
                            {gcValidation.applicableAmount < effectiveTotal - 0.005 && (
                              <>
                                <span className="text-muted-foreground">Still needed</span>
                                <span className="font-semibold tabular-nums text-amber-600">{formatCurrency(effectiveTotal - gcValidation.applicableAmount)}</span>
                              </>
                            )}
                          </div>
                          {gcValidation.applicableAmount < effectiveTotal - 0.005 && (
                            <div className="pt-1 border-t border-green-200 dark:border-green-800">
                              <p className="text-[11px] text-muted-foreground mb-1.5">Collect remaining via</p>
                              <div className="flex gap-2">
                                {(["cash", "eftpos"] as const).map(m => (
                                  <button
                                    key={m}
                                    onClick={() => setGcRemainingMethod(m)}
                                    className={cn(
                                      "flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all",
                                      gcRemainingMethod === m
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border bg-background hover:border-primary/40"
                                    )}
                                  >
                                    {m === "cash" ? "Cash" : "EFTPOS"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-start gap-2 text-destructive">
                          <BadgeX className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-xs">Card invalid</p>
                            <p className="text-xs mt-0.5 text-muted-foreground">{gcValidation.errorMessage}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex-1" />
                </div>
              ) : (
                <>
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
                      onClick={() => setNumpadInput(effectiveTotal.toFixed(2))}
                      className="col-span-2 rounded-xl border bg-muted text-sm font-semibold hover:bg-muted/60 active:scale-95 transition-all flex items-center justify-center"
                    >
                      Exact {formatCurrency(effectiveTotal)}
                    </button>
                  </div>
                </>
              )}

              {/* Complete Sale */}
              <Button
                className="w-full h-12 text-base font-semibold"
                disabled={
                  createTransactionMutation.isPending ||
                  invoicePayPending ||
                  updateGiftCardMutation.isPending ||
                  (payMethod === "gift_card" && (!gcValidation?.valid)) ||
                  (payMethod === "split" && !splitComplete) ||
                  (payMethod === "cash" && !!numpadInput && amountRemaining > 0.009) ||
                  (payMethod === "loyalty" && (!selectedCustomer || walkIn !== null)) ||
                  (payMethod === "loyalty" && loyaltySettings?.programType === "stamp") ||
                  (payMethod === "loyalty" && selectedCustomer != null && (() => {
                    // Loyalty payment: must cover the full sale total. Required
                    // balance units depend on program type:
                    //   - cashback/tiered/custom: ceil(total) dollars
                    //   - points: ceil(total / dollarPerPoint) points
                    const programType = loyaltySettings?.programType;
                    const isCashType = programType === "cashback" || programType === "tiered" || programType === "custom";
                    const dpp = (loyaltySettings?.dollarPerPoint ?? 0.01) || 0.01;
                    const enteredLoyalty = parseFloat(numpadInput) || 0;
                    const balance = selectedCustomer?.loyaltyPoints ?? 0;
                    const required = isCashType ? Math.ceil(effectiveTotal) : Math.ceil(effectiveTotal / dpp);
                    return (
                      enteredLoyalty < required ||
                      enteredLoyalty > balance ||
                      required > balance
                    );
                  })())
                }
                onClick={() => {
                  // Gate flows that need a dedicated lifecycle.
                  if (payMethod === "gift_card" && gcValidation?.valid) {
                    const gc = gcValidation;
                    const applied = gc.applicableAmount;
                    const remaining = effectiveTotal - applied;
                    const deductNewBalance = gc.currentBalance - applied;
                    updateGiftCardMutation.mutate(
                      { id: gc.cardId, data: { currentBalance: deductNewBalance } },
                      {
                        onSuccess: () => {
                          if (remaining > 0.004) {
                            handleCheckout("other", effectiveTotal, `[Gift Card ${gc.cardNumber} ${formatCurrency(applied)} + ${gcRemainingMethod === "cash" ? "Cash" : "EFTPOS"} ${formatCurrency(remaining)}]`);
                          } else {
                            handleCheckout("other", effectiveTotal, `[Gift Card ${gc.cardNumber}]`);
                          }
                        },
                        onError: () => toast.error("Failed to deduct gift card balance — sale cancelled"),
                      }
                    );
                    return;
                  }
                  if (payMethod === "laybuy") {
                    toast.info("Laybuy uses its own ledger — opening the Laybuys module.");
                    setPaymentModalOpen(false);
                    setLocation("/pos/laybuys");
                    return;
                  }
                  if (payMethod === "split") {
                    if (!splitComplete) {
                      toast.error(`Remaining ${formatCurrency(splitRemaining)} must be covered`);
                      return;
                    }
                    const legDetails = splitLegs
                      .filter(l => parseFloat(l.amount) > 0)
                      .map(l => {
                        const label = ALL_PAYMENT_METHODS.find(m => m.id === l.method)?.label ?? l.method;
                        return `${label} ${formatCurrency(parseFloat(l.amount) || 0)}`;
                      })
                      .join(" + ");
                    handleCheckout("split", effectiveTotal, `[Split: ${legDetails}]`);
                    return;
                  }
                  // For integration methods, preserve the integration key in
                  // notes so the transaction stays auditable per integration.
                  // Compute the tag locally and pass it through handleCheckout
                  // so we don't depend on async setState reaching the payload.
                  const isIntegration = String(payMethod).startsWith("__intg__");
                  const apiMethod: TransactionInputPaymentMethod =
                    isIntegration ? "other" : payMethod as TransactionInputPaymentMethod;
                  let extraNote: string | undefined;
                  if (isIntegration) {
                    const key = String(payMethod).slice("__intg__".length);
                    const label = INTEGRATION_PAYMENT_LABELS[key] ?? key;
                    extraNote = `[Payment via ${label} (${key})]`;
                  }
                  // For loyalty payments, tender the entered loyalty amount
                  // (not the auto-defaulted total) so the server deducts
                  // exactly what the cashier chose to redeem.
                  const tendered = payMethod === "loyalty"
                    ? (parseFloat(numpadInput) || 0)
                    : enteredAmount;
                  handleCheckout(apiMethod, tendered, extraNote);
                }}
              >
                {(createTransactionMutation.isPending || updateGiftCardMutation.isPending || invoicePayPending) ? "Processing…" : "Complete Sale"}
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
                {" · "}{formatCurrency(completedTotal)}
              </p>
            )}
          </DialogHeader>

          {receiptMode === "idle" && (
            <div className="space-y-2 py-1">
              <p className="text-xs font-medium text-center text-muted-foreground mb-3">How would you like to send the receipt?</p>
              <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={printPosReceipt}>
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

      {/* ─── Staff Login Message Dialog ─── */}
      <Dialog open={loginMsgOpen} onOpenChange={(o) => { if (!o) { setLoginMsgOpen(false); setMsgAckChecked(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareWarning className="w-5 h-5 text-amber-500" /> Important Notice
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {loginMsg?.text}
            </div>
            {loginMsg?.requireAck && (
              <div className="flex items-start gap-3">
                <Checkbox
                  id="msg-ack"
                  checked={msgAckChecked}
                  onCheckedChange={(c) => setMsgAckChecked(c === true)}
                />
                <Label htmlFor="msg-ack" className="text-xs leading-relaxed cursor-pointer">
                  I acknowledge I have read this message and understand its contents. I must tick this box before continuing.
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (loginMsg?.requireAck && !msgAckChecked) {
                  toast.error("Please tick the acknowledgment box to continue.");
                  return;
                }
                if (loginMsg && currentStaff && merchantData) {
                  setStaffAcknowledged(merchantData.id, currentStaff.id, loginMsg);
                }
                setLoginMsgOpen(false);
                setMsgAckChecked(false);
              }}
            >
              {loginMsg?.requireAck ? "Acknowledge & Continue" : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Open Register Dialog ─── */}
      <Dialog open={openRegisterDialogOpen} onOpenChange={(o) => { if (!o) setOpenRegisterDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DoorOpen className="w-5 h-5 text-green-600" /> Open Register
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Date / Staff */}
            <div className="rounded-xl bg-muted/40 border px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Date &amp; Time</span>
                <span className="font-medium text-foreground">{new Date().toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Staff</span>
                <span className="font-medium text-foreground">{currentStaff?.name ?? "— not signed in —"}</span>
              </div>
            </div>

            {/* Opening float */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Banknote className="w-4 h-4 text-muted-foreground" /> Opening Float (Cash in Drawer)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                <Input
                  type="number" step="0.01" min="0" placeholder="0.00"
                  value={openFloat}
                  onChange={(e) => setOpenFloat(e.target.value)}
                  className="pl-7"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">Count the starting cash in your till drawer before opening.</p>
            </div>

            {/* Denomination helper */}
            <div className="grid grid-cols-4 gap-1.5">
              {[50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setOpenFloat((v) => String((parseFloat(v) || 0) + d))}
                  className="text-xs border rounded-lg py-1.5 hover:bg-muted transition-colors font-mono"
                >${d < 1 ? d.toFixed(2) : d}</button>
              ))}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Opening Notes (optional)</Label>
              <textarea
                className="w-full min-h-[56px] rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Any notes for start of shift…"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRegisterDialogOpen(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleOpenRegister}>
              <DoorOpen className="w-4 h-4 mr-1.5" /> Open Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Cash Movement Print Prompt ─── */}
      <Dialog open={cashMovementPrintOpen} onOpenChange={(o) => { if (!o) setCashMovementPrintOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-primary" /> Print Cash Movement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>The till has been opened. Would you like to print the opening float receipt for your records?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashMovementPrintOpen(false)}>No Thanks</Button>
            <Button onClick={() => { printCashMovement(); setCashMovementPrintOpen(false); }}>
              <Printer className="w-4 h-4 mr-1.5" /> Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Close Register Dialog ─── */}
      <Dialog open={closeRegisterDialogOpen} onOpenChange={(o) => { if (!o) setCloseRegisterDialogOpen(false); }}>
        <DialogContent className="max-w-lg flex flex-col p-0 gap-0 max-h-[90vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <DoorClosed className="w-5 h-5 text-red-500" /> Close Register
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Session summary */}
            {(() => {
              const s = sessionSnap;
              const openedAt = s?.openedAt ? new Date(s.openedAt) : null;
              const elapsed = openedAt ? Math.round((Date.now() - openedAt.getTime()) / 60000) : null;
              const cashSales = s?.sales?.["cash"] ?? 0;
              const cardSales = (s?.sales?.["card"] ?? 0) + (s?.sales?.["eftpos"] ?? 0);
              const splitSales = s?.sales?.["split"] ?? 0;
              const otherSales = Object.entries(s?.sales ?? {})
                .filter(([k]) => !["cash", "card", "eftpos", "split"].includes(k))
                .reduce((sum, [, v]) => sum + v, 0);
              const totalSales = Object.values(s?.sales ?? {}).reduce((a, b) => a + b, 0);
              const cashRefunds = s?.refunds?.["cash"] ?? 0;
              const totalRefunds = Object.values(s?.refunds ?? {}).reduce((a, b) => a + b, 0);
              const openingFloat = s?.openingFloat ?? 0;
              const expectedCash = openingFloat + cashSales - cashRefunds;
              const cashCounted = parseFloat(closeFormData.cashCounted) || 0;
              const cashVariance = cashCounted - expectedCash;
              const eftposDeclared = parseFloat(closeFormData.eftposDeclared) || 0;
              const eftposVariance = eftposDeclared - (cardSales + splitSales);

              return (
                <>
                  {/* Session info */}
                  <div className="rounded-xl bg-muted/40 border px-4 py-3 space-y-1.5 text-sm">
                    <div className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">
                      <Clock className="w-3.5 h-3.5" /> Session Info
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Opened</span>
                      <span className="font-medium text-foreground">
                        {openedAt ? openedAt.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                        {elapsed !== null && <span className="text-xs text-muted-foreground ml-1.5">({elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed/60)}h ${elapsed%60}m`})</span>}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Opened by</span>
                      <span className="font-medium text-foreground">{s?.openedBy ?? "—"}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Transactions</span>
                      <span className="font-medium text-foreground">{s?.txCount ?? 0}</span>
                    </div>
                    {totalRefunds > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>Refunds ({s?.refundCount ?? 0})</span>
                        <span className="font-medium">−{formatCurrency(totalRefunds)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground border-t pt-1.5 mt-1">
                      <span className="font-semibold text-foreground">Net Sales</span>
                      <span className="font-bold text-foreground">{formatCurrency(totalSales - totalRefunds)}</span>
                    </div>
                  </div>

                  {/* Cash Drawer */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                      <Banknote className="w-3.5 h-3.5" /> Cash Drawer
                    </div>
                    <div className="rounded-xl border p-3 space-y-2 text-sm">
                      <div className="flex justify-between text-muted-foreground"><span>Opening float</span><span>{formatCurrency(openingFloat)}</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>Cash sales (POS)</span><span>{formatCurrency(cashSales)}</span></div>
                      {cashRefunds > 0 && (
                        <div className="flex justify-between text-destructive"><span>Cash refunds</span><span>−{formatCurrency(cashRefunds)}</span></div>
                      )}
                      <div className="flex justify-between font-medium border-t pt-2 mt-1"><span>Expected in drawer</span><span>{formatCurrency(expectedCash)}</span></div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Counted Cash in Drawer</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                        <Input type="number" step="0.01" min="0" placeholder="0.00" value={closeFormData.cashCounted}
                          onChange={(e) => setCloseFormData((p) => ({ ...p, cashCounted: e.target.value }))}
                          className="pl-7" />
                      </div>
                    </div>
                    {closeFormData.cashCounted !== "" && (
                      <div className={cn("flex justify-between text-sm font-semibold px-3 py-2 rounded-lg", cashVariance === 0 ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : cashVariance > 0 ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400")}>
                        <span>Cash variance</span>
                        <span>{cashVariance >= 0 ? "+" : ""}{formatCurrency(cashVariance)}</span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* EFTPOS / Card */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                      <CreditCard className="w-3.5 h-3.5" /> EFTPOS / Card
                    </div>
                    <div className="rounded-xl border p-3 space-y-2 text-sm">
                      <div className="flex justify-between text-muted-foreground"><span>Card sales (POS)</span><span>{formatCurrency(cardSales)}</span></div>
                      {splitSales > 0 && <div className="flex justify-between text-muted-foreground"><span>Split payments (POS)</span><span>{formatCurrency(splitSales)}</span></div>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">EFTPOS Terminal Total</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                        <Input type="number" step="0.01" min="0" placeholder="0.00" value={closeFormData.eftposDeclared}
                          onChange={(e) => setCloseFormData((p) => ({ ...p, eftposDeclared: e.target.value }))}
                          className="pl-7" />
                      </div>
                      <p className="text-xs text-muted-foreground">Enter the total from your EFTPOS terminal settlement report.</p>
                    </div>
                    {closeFormData.eftposDeclared !== "" && (
                      <div className={cn("flex justify-between text-sm font-semibold px-3 py-2 rounded-lg", eftposVariance === 0 ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : eftposVariance > 0 ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400")}>
                        <span>EFTPOS variance</span>
                        <span>{eftposVariance >= 0 ? "+" : ""}{formatCurrency(eftposVariance)}</span>
                      </div>
                    )}
                  </div>

                  {/* Other payments */}
                  {(otherSales > 0) && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                          <TrendingUp className="w-3.5 h-3.5" /> Other Payments
                        </div>
                        <div className="rounded-xl border p-3 space-y-2 text-sm">
                          {Object.entries(s?.sales ?? {}).filter(([k]) => !["cash","card","eftpos","split"].includes(k)).map(([k, v]) => (
                            <div key={k} className="flex justify-between text-muted-foreground capitalize"><span>{k}</span><span>{formatCurrency(v)}</span></div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />

                  {/* Closing notes */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><FileText className="w-4 h-4 text-muted-foreground" /> Closing Notes (optional)</Label>
                    <textarea
                      className="w-full min-h-[64px] rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Any notes for end of shift, discrepancies, handover…"
                      value={closeFormData.notes}
                      onChange={(e) => setCloseFormData((p) => ({ ...p, notes: e.target.value }))}
                    />
                  </div>
                </>
              );
            })()}
          </div>

          <div className="px-6 py-4 border-t shrink-0 flex justify-between items-center bg-background gap-3">
            <p className="text-xs text-muted-foreground">A Z-report will be saved automatically.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCloseRegisterDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCloseRegister}>
                <DoorClosed className="w-4 h-4 mr-1.5" /> Close Register
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── End-of-Day Print Prompt ─── */}
      <Dialog open={eodPrintOpen} onOpenChange={(o) => { if (!o) setEodPrintOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-primary" /> End-of-Day Reconciliation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>The till has been closed for the day. Would you like to print the End-of-Day Reconciliation report?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEodPrintOpen(false)}>No Thanks</Button>
            <Button onClick={() => { printEodReport(); setEodPrintOpen(false); }}>
              <Printer className="w-4 h-4 mr-1.5" /> Print Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Custom / Temp Item Dialog ── */}
      <Dialog open={tempItemOpen} onOpenChange={setTempItemOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Custom Item
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Add a one-off item that doesn't exist in your product catalogue.
            </p>
            <div className="space-y-2">
              <Label htmlFor="temp-name">Item name <span className="text-destructive">*</span></Label>
              <Input
                id="temp-name"
                placeholder="e.g. Delivery fee"
                value={tempItemForm.name}
                onChange={(e) => setTempItemForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addTempToCart()}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="temp-price">Price (inc. GST) <span className="text-destructive">*</span></Label>
              <Input
                id="temp-price"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={tempItemForm.price}
                onChange={(e) => setTempItemForm(f => ({ ...f, price: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addTempToCart()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="temp-cost">Cost price (optional)</Label>
              <Input
                id="temp-cost"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={tempItemForm.cost}
                onChange={(e) => setTempItemForm(f => ({ ...f, cost: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addTempToCart()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTempItemOpen(false)}>Cancel</Button>
            <Button onClick={addTempToCart}>
              <Plus className="w-4 h-4 mr-1" />
              Add to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Sell Gift Card modal ─── */}
      <Dialog open={gcIssueOpen} onOpenChange={setGcIssueOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-violet-600" />
              Sell Gift Card
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Card Number</label>
              <div className="relative">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9 uppercase font-mono tracking-widest"
                  placeholder="GC-XXXXXXXX"
                  value={gcIssueForm.cardNumber}
                  onChange={e => setGcIssueForm(f => ({ ...f, cardNumber: e.target.value.toUpperCase() }))}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Leave blank to auto-generate a card number after sale</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Load Amount (AUD)</label>
              <Input
                type="number"
                min="1"
                step="0.01"
                placeholder="50.00"
                value={gcIssueForm.amount}
                onChange={e => setGcIssueForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGcIssueOpen(false)}>Cancel</Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              disabled={!gcIssueForm.amount || parseFloat(gcIssueForm.amount) <= 0}
              onClick={() => {
                const amount = parseFloat(gcIssueForm.amount);
                if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }
                const cardNumber = gcIssueForm.cardNumber.trim() ||
                  `GC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
                // Create a synthetic product so it appears in the cart
                const syntheticProduct: Product = {
                  id: Date.now(),
                  merchantId: 0,
                  name: `Gift Card ${cardNumber}`,
                  price: amount,
                  category: { id: 0, merchantId: 0, name: "Gift Cards", createdAt: new Date().toISOString() },
                  description: `Gift card loaded with ${formatCurrency(amount)}`,
                  sku: cardNumber,
                  isActive: true,
                  trackInventory: false,
                  productType: "gift_card",
                  createdAt: new Date().toISOString(),
                };
                setCart(prev => {
                  const existing = prev.findIndex(i => i.giftCardNumber === cardNumber);
                  if (existing >= 0) {
                    toast.info("That card number is already in the cart");
                    return prev;
                  }
                  return [...prev, { product: syntheticProduct, quantity: 1, itemDiscount: 0, customPrice: amount, giftCardNumber: cardNumber }];
                });
                toast.success(`Gift card ${cardNumber} added to cart`);
                setGcIssueOpen(false);
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Till Closed Guard Dialog ─── */}
      <Dialog open={tillClosedDialogOpen} onOpenChange={(o) => { if (!o) setTillClosedDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" /> Till Closed
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>The POS register is not open. You need to open the till before you can add items or process a sale.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTillClosedDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => { setTillClosedDialogOpen(false); setOpenRegisterDialogOpen(true); }}>
              <DoorOpen className="w-4 h-4 mr-1.5" /> Open Till
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </POSPageExpander>

      <CameraPosPiP />
    </AppLayout>
  );
}

/* ── Click anywhere on POS page to reveal collapsed sidebar ─────────────── */
function POSPageExpander({ children }: { children: React.ReactNode }) {
  const { state, setOpen } = useSidebar();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        state === "collapsed" &&
        e.button === 0 &&
        !target.closest("button") &&
        !target.closest("a") &&
        !target.closest("input") &&
        !target.closest("textarea") &&
        !target.closest("[data-slot=sidebar]")
      ) {
        setOpen(true);
      }
    };
    el.addEventListener("mousedown", handler);
    return () => el.removeEventListener("mousedown", handler);
  }, [state, setOpen]);
  return <div ref={ref} className="contents">{children}</div>;
}
