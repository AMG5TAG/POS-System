import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Package2, Truck, Search, MapPin, Clock, CheckCircle2, AlertCircle,
  Printer, Tag, Package, ShoppingBag, Eye, RefreshCw, FileText,
} from "lucide-react";

type OrderStatus = "new" | "picking" | "packed" | "ready" | "shipped" | "delivered";
type Channel = "website" | "shopify" | "woocommerce" | "ebay" | "amazon" | "uber" | "doordash";

interface OrderItem {
  sku:    string;
  name:   string;
  qty:    number;
  price:  number;
  picked: boolean;
}

interface Order {
  id:           string;
  number:       string;
  channel:      Channel;
  customer:     string;
  customerEmail:string;
  phone:        string;
  address:      string;
  city:         string;
  postcode:     string;
  state:        string;
  shippingMethod: string;
  status:       OrderStatus;
  placedAt:     string;
  total:        number;
  items:        OrderItem[];
  notes?:       string;
}

const CHANNELS: Record<Channel, { label: string; icon: string; color: string }> = {
  website:     { label: "Website",      icon: "🌐", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"            },
  shopify:     { label: "Shopify",      icon: "🛒", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"    },
  woocommerce: { label: "WooCommerce",  icon: "🟣", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"},
  ebay:        { label: "eBay",         icon: "🅴", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"},
  amazon:      { label: "Amazon",       icon: "🅰️", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"},
  uber:        { label: "Uber Eats",    icon: "🚗", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"},
  doordash:    { label: "DoorDash",     icon: "🍔", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"            },
};

const STATUS_META: Record<OrderStatus, { label: string; color: string; next?: OrderStatus }> = {
  new:       { label: "New",       color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",       next: "picking" },
  picking:   { label: "Picking",   color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",   next: "packed" },
  packed:    { label: "Packed",    color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", next: "ready" },
  ready:     { label: "Ready",     color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", next: "shipped" },
  shipped:   { label: "Shipped",   color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",           next: "delivered" },
  delivered: { label: "Delivered", color: "bg-muted text-muted-foreground" },
};

const MOCK_ORDERS: Order[] = [
  {
    id: "o1", number: "#KP-1042", channel: "website",
    customer: "Sarah Johnson", customerEmail: "sarah@example.com", phone: "0412 345 678",
    address: "12 Park Lane", city: "Sydney", postcode: "2000", state: "NSW",
    shippingMethod: "Standard (3–5 days)", status: "new",
    placedAt: "2026-05-24T08:14:00", total: 142.50,
    items: [
      { sku: "BEV-001", name: "Organic Coffee Beans 500g", qty: 2, price: 24.00, picked: false },
      { sku: "SNK-014", name: "Macadamia Cookies", qty: 3, price: 8.50,  picked: false },
      { sku: "BEV-007", name: "Loose Leaf Tea Sampler",  qty: 1, price: 69.00, picked: false },
    ],
  },
  {
    id: "o2", number: "#KP-1041", channel: "shopify",
    customer: "Mike Chen", customerEmail: "mike@example.com", phone: "0423 456 789",
    address: "44 Beach Rd", city: "Bondi", postcode: "2026", state: "NSW",
    shippingMethod: "Express (1–2 days)", status: "picking",
    placedAt: "2026-05-24T07:42:00", total: 89.99,
    items: [
      { sku: "ELC-021", name: "Bluetooth Earbuds", qty: 1, price: 89.99, picked: true },
    ],
    notes: "Leave at front door if no answer",
  },
  {
    id: "o3", number: "#KP-1040", channel: "woocommerce",
    customer: "Aisha Patel", customerEmail: "aisha@example.com", phone: "0434 567 890",
    address: "9 Riverside Dr", city: "Melbourne", postcode: "3000", state: "VIC",
    shippingMethod: "Standard (3–5 days)", status: "packed",
    placedAt: "2026-05-23T16:30:00", total: 56.20,
    items: [
      { sku: "SNK-001", name: "Mixed Nuts 200g", qty: 4, price: 12.00, picked: true },
      { sku: "BEV-002", name: "Cold Brew 1L",    qty: 1, price: 8.20,  picked: true },
    ],
  },
  {
    id: "o4", number: "#KP-1039", channel: "ebay",
    customer: "James O'Sullivan", customerEmail: "james@example.com", phone: "0445 678 901",
    address: "210 Hay St", city: "Perth", postcode: "6000", state: "WA",
    shippingMethod: "Standard (4–7 days)", status: "ready",
    placedAt: "2026-05-23T11:05:00", total: 215.00,
    items: [
      { sku: "ELC-005", name: "USB-C Hub 8-in-1", qty: 1, price: 65.00, picked: true },
      { sku: "ELC-009", name: "Mechanical Keyboard", qty: 1, price: 150.00, picked: true },
    ],
  },
  {
    id: "o5", number: "#KP-1038", channel: "amazon",
    customer: "Lucy Tran", customerEmail: "lucy@example.com", phone: "0456 789 012",
    address: "5 Queen St", city: "Brisbane", postcode: "4000", state: "QLD",
    shippingMethod: "Express (1–2 days)", status: "new",
    placedAt: "2026-05-24T06:15:00", total: 38.50,
    items: [
      { sku: "SNK-014", name: "Macadamia Cookies", qty: 2, price: 8.50,  picked: false },
      { sku: "BEV-001", name: "Organic Coffee Beans 500g", qty: 1, price: 24.00, picked: false },
    ],
  },
  {
    id: "o6", number: "#KP-1037", channel: "uber",
    customer: "Daniel Kowalski", customerEmail: "daniel@example.com", phone: "0467 890 123",
    address: "88 Smith St", city: "Adelaide", postcode: "5000", state: "SA",
    shippingMethod: "Same-day local", status: "shipped",
    placedAt: "2026-05-24T05:50:00", total: 24.00,
    items: [
      { sku: "BEV-001", name: "Organic Coffee Beans 500g", qty: 1, price: 24.00, picked: true },
    ],
  },
];

const STATUS_TABS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "new",      label: "New" },
  { value: "picking",  label: "Picking" },
  { value: "packed",   label: "Packed" },
  { value: "ready",    label: "Ready" },
  { value: "shipped",  label: "Shipped" },
];

export default function OnlineDeliveryOrdersPage() {
  const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const filtered = useMemo(() => orders.filter((o) =>
    (filter === "all" || o.status === filter) &&
    (channelFilter === "all" || o.channel === channelFilter) &&
    (!search.trim() || o.number.toLowerCase().includes(search.toLowerCase()) || o.customer.toLowerCase().includes(search.toLowerCase()))
  ), [orders, filter, channelFilter, search]);

  const counts = useMemo(() => ({
    new:     orders.filter((o) => o.status === "new").length,
    picking: orders.filter((o) => o.status === "picking").length,
    packed:  orders.filter((o) => o.status === "packed").length,
    ready:   orders.filter((o) => o.status === "ready").length,
    shipped: orders.filter((o) => o.status === "shipped").length,
    total:   orders.length,
  }), [orders]);

  const advance = (orderId: string) => {
    setOrders((prev) => prev.map((o) => {
      if (o.id !== orderId) return o;
      const next = STATUS_META[o.status].next;
      if (!next) return o;
      toast.success(`Order ${o.number} moved to ${STATUS_META[next].label}`);
      return { ...o, status: next };
    }));
    if (selectedOrder?.id === orderId) {
      const next = STATUS_META[selectedOrder.status].next;
      if (next) setSelectedOrder({ ...selectedOrder, status: next });
    }
  };

  const togglePicked = (orderId: string, sku: string) => {
    setOrders((prev) => prev.map((o) =>
      o.id === orderId ? { ...o, items: o.items.map((it) => it.sku === sku ? { ...it, picked: !it.picked } : it) } : o
    ));
    if (selectedOrder?.id === orderId) {
      setSelectedOrder({ ...selectedOrder, items: selectedOrder.items.map((it) => it.sku === sku ? { ...it, picked: !it.picked } : it) });
    }
  };

  const printLabel = (o: Order) => {
    toast.success(`Shipping label for ${o.number} sent to printer`);
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package2 className="w-6 h-6 text-primary" />
              Delivery Orders
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Online orders ready for picking, packing and dispatch.
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Total",    value: counts.total,   icon: ShoppingBag, color: "text-foreground" },
            { label: "New",      value: counts.new,     icon: AlertCircle, color: "text-blue-500" },
            { label: "Picking",  value: counts.picking, icon: Package,     color: "text-amber-500" },
            { label: "Packed",   value: counts.packed,  icon: Package2,    color: "text-violet-500" },
            { label: "Ready",    value: counts.ready,   icon: CheckCircle2,color: "text-emerald-500" },
            { label: "Shipped",  value: counts.shipped, icon: Truck,       color: "text-sky-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                  <Icon className={cn("w-3.5 h-3.5", color)} />
                </div>
                <p className="text-xl font-bold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-3 flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
              {STATUS_TABS.map((t) => {
                const count = t.value === "all" ? counts.total : counts[t.value as keyof typeof counts] ?? 0;
                return (
                  <button
                    key={t.value}
                    onClick={() => setFilter(t.value)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-all",
                      filter === t.value ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                    {typeof count === "number" && <Badge variant="secondary" className="h-4 px-1 text-[9px]">{count}</Badge>}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search order # or customer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
            <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as Channel | "all")}>
              <SelectTrigger className="h-8 w-36"><SelectValue placeholder="All channels" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                {Object.entries(CHANNELS).map(([id, c]) => <SelectItem key={id} value={id}>{c.icon} {c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Orders list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{filtered.length} orders</CardTitle>
            <CardDescription>Click an order to view items, pick & pack.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Package2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                No orders match your filters.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Order</th>
                    <th className="px-4 py-2 text-left font-medium">Channel</th>
                    <th className="px-4 py-2 text-left font-medium">Customer</th>
                    <th className="px-4 py-2 text-left font-medium hidden md:table-cell">Destination</th>
                    <th className="px-4 py-2 text-left font-medium hidden lg:table-cell">Shipping</th>
                    <th className="px-4 py-2 text-right font-medium">Items</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o, i) => {
                    const ch = CHANNELS[o.channel];
                    const st = STATUS_META[o.status];
                    return (
                      <tr key={o.id} className={cn("border-b last:border-0 hover:bg-muted/20 cursor-pointer", i % 2 !== 0 && "bg-muted/10")} onClick={() => setSelectedOrder(o)}>
                        <td className="px-4 py-2.5">
                          <p className="font-mono text-xs font-semibold">{o.number}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(o.placedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="secondary" className={cn("text-[10px] border-0 gap-1", ch.color)}>
                            <span>{ch.icon}</span>{ch.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="text-sm font-medium">{o.customer}</p>
                          <p className="text-[10px] text-muted-foreground">{o.phone}</p>
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <p className="text-xs">{o.city}, {o.state} {o.postcode}</p>
                        </td>
                        <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-muted-foreground">{o.shippingMethod}</td>
                        <td className="px-4 py-2.5 text-right text-xs">{o.items.length}</td>
                        <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">${o.total.toFixed(2)}</td>
                        <td className="px-4 py-2.5">
                          <Badge className={cn("text-[10px] border-0", st.color)}>{st.label}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          {st.next ? (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => advance(o.id)}>
                              {st.next === "picking" ? "Start" : st.next === "packed" ? "Mark packed" : st.next === "ready" ? "Mark ready" : st.next === "shipped" ? "Ship" : "Delivered"}
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Complete</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order detail dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(o) => { if (!o) setSelectedOrder(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedOrder && (() => {
            const ch = CHANNELS[selectedOrder.channel];
            const st = STATUS_META[selectedOrder.status];
            const allPicked = selectedOrder.items.every((it) => it.picked);
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="font-mono">{selectedOrder.number}</DialogTitle>
                    <Badge variant="secondary" className={cn("text-[10px] border-0 gap-1", ch.color)}>
                      <span>{ch.icon}</span>{ch.label}
                    </Badge>
                    <Badge className={cn("text-[10px] border-0 ml-auto", st.color)}>{st.label}</Badge>
                  </div>
                  <DialogDescription>
                    Placed {new Date(selectedOrder.placedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer</Label>
                    <p className="font-medium">{selectedOrder.customer}</p>
                    <p className="text-xs text-muted-foreground">{selectedOrder.customerEmail}</p>
                    <p className="text-xs text-muted-foreground">{selectedOrder.phone}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Ship to</Label>
                    <p className="text-xs">{selectedOrder.address}</p>
                    <p className="text-xs">{selectedOrder.city}, {selectedOrder.state} {selectedOrder.postcode}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3" /> {selectedOrder.shippingMethod}</p>
                  </div>
                </div>

                {selectedOrder.notes && (
                  <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 p-2 text-xs">
                    <span className="font-semibold">Delivery note: </span>{selectedOrder.notes}
                  </div>
                )}

                <Separator />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold">Items ({selectedOrder.items.length})</Label>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedOrder.items.filter((it) => it.picked).length} of {selectedOrder.items.length} picked
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {selectedOrder.items.map((it) => (
                      <div key={it.sku} className="flex items-center gap-3 rounded border bg-muted/20 px-3 py-2">
                        <Checkbox checked={it.picked} onCheckedChange={() => togglePicked(selectedOrder.id, it.sku)} />
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium truncate", it.picked && "line-through text-muted-foreground")}>{it.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{it.sku}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">×{it.qty}</Badge>
                        <span className="text-sm tabular-nums w-16 text-right">${(it.qty * it.price).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-3 text-sm">
                    <span className="text-muted-foreground mr-2">Total:</span>
                    <span className="font-bold tabular-nums">${selectedOrder.total.toFixed(2)}</span>
                  </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printLabel(selectedOrder)}><Printer className="w-3.5 h-3.5" /> Print label</Button>
                  <Button variant="outline" size="sm" className="gap-1.5"><Tag className="w-3.5 h-3.5" /> Print pick list</Button>
                  <Button variant="outline" size="sm" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Invoice</Button>
                  {st.next && (
                    <Button
                      size="sm"
                      className="gap-1.5 sm:ml-auto"
                      disabled={st.next === "packed" && !allPicked}
                      onClick={() => advance(selectedOrder.id)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark as {STATUS_META[st.next].label}
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
