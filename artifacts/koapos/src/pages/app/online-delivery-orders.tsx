import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Truck, Package, Clock, CheckCircle2, XCircle, ChefHat, Bike,
  Plus, Eye, RefreshCw, Phone, MapPin, StickyNote, ChevronRight,
  Receipt,
} from "lucide-react";
import {
  useListDeliveryOrders,
  useCreateDeliveryOrder,
  useUpdateDeliveryOrder,
} from "@workspace/api-client-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

type DeliveryStatus = "pending" | "accepted" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";

interface OrderItem {
  name: string;
  qty: number;
  price: number;
  note?: string;
}

interface DeliveryOrder {
  id: string | number;
  orderId: string;
  platform: string;
  customerName: string;
  address: string;
  phone: string;
  items: OrderItem[];
  status: DeliveryStatus;
  createdAt: string;
  estimatedAt?: string;
  total: number;
  note?: string;
}

type ApiOrder = Record<string, unknown>;

function parseItems(raw: unknown): OrderItem[] {
  if (Array.isArray(raw)) return raw as OrderItem[];
  if (typeof raw === "string") { try { return JSON.parse(raw) as OrderItem[]; } catch { return []; } }
  return [];
}

function apiToLocal(o: ApiOrder): DeliveryOrder {
  return {
    id: (o.id as string | number | undefined) ?? "",
    orderId: String(o.orderId ?? ""),
    platform: String(o.channel ?? "app"),
    customerName: String(o.customer ?? ""),
    address: String(o.address ?? ""),
    phone: String(o.phone ?? ""),
    items: parseItems(o.items),
    status: (o.status as DeliveryStatus) ?? "pending",
    createdAt: String(o.createdAt ?? new Date().toISOString()),
    estimatedAt: o.placedAt ? String(o.placedAt) : undefined,
    total: parseFloat(String(o.total ?? 0)),
    note: o.notes ? String(o.notes) : undefined,
  };
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const PLATFORMS = ["Uber Eats", "DoorDash", "Deliveroo", "KoaPOS", "Phone", "Walk-in"];

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:          { label: "Pending",          color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock        },
  accepted:         { label: "Accepted",         color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",         icon: CheckCircle2 },
  preparing:        { label: "Preparing",        color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400", icon: ChefHat      },
  ready:            { label: "Ready",            color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", icon: Package      },
  out_for_delivery: { label: "Out for Delivery", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400", icon: Bike         },
  delivered:        { label: "Delivered",        color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
  cancelled:        { label: "Cancelled",        color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",             icon: XCircle      },
};

const STATUS_FLOW: Record<DeliveryStatus, DeliveryStatus | null> = {
  pending:          "accepted",
  accepted:         "preparing",
  preparing:        "ready",
  ready:            "out_for_delivery",
  out_for_delivery: "delivered",
  delivered:        null,
  cancelled:        null,
};

const STATUS_GROUPS: DeliveryStatus[][] = [
  ["pending", "accepted", "preparing"],
  ["ready", "out_for_delivery"],
  ["delivered", "cancelled"],
];

const EMPTY_FORM = {
  platform: "KoaPOS",
  customerName: "",
  address: "",
  phone: "",
  note: "",
  estimatedAt: "",
  itemsRaw: '[{ "name": "Item 1", "qty": 1, "price": 10.00 }]',
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

function newOrderId(): string {
  return "ORD-" + Math.floor(10000 + Math.random() * 90000);
}

/* ── Order card ─────────────────────────────────────────────────────────── */

function OrderCard({ order, onAdvance, onCancel, onView }: {
  order: DeliveryOrder;
  onAdvance: () => void;
  onCancel: () => void;
  onView: () => void;
}) {
  const cfg = STATUS_CONFIG[order.status];
  const Icon = cfg.icon;
  const next = STATUS_FLOW[order.status];

  return (
    <div className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow">
      <div className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">{order.orderId}</span>
              <Badge variant="outline" className="text-[10px] py-0">{order.platform}</Badge>
            </div>
            <p className="font-semibold text-sm mt-0.5 truncate">{order.customerName}</p>
            {order.address && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{order.address}</span>
              </p>
            )}
          </div>
          <Badge className={cn("text-[10px] border-0 shrink-0", cfg.color)}>
            <Icon className="w-3 h-3 mr-1" />{cfg.label}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {formatTime(order.createdAt)}</span>
          <span className="font-semibold text-foreground">${order.total.toFixed(2)}</span>
          <span>{order.items.length} item{order.items.length !== 1 ? "s" : ""}</span>
          {order.phone && <span className="flex items-center gap-0.5"><Phone className="w-3 h-3" /> {order.phone}</span>}
        </div>
        {order.note && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1.5 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1">
            <StickyNote className="w-3 h-3 shrink-0" />{order.note}
          </p>
        )}
      </div>
      <Separator />
      <div className="flex gap-1 p-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs flex-1 gap-1" onClick={onView}>
          <Eye className="w-3 h-3" /> View
        </Button>
        {next && (
          <Button size="sm" className="h-7 text-xs flex-1 gap-1" onClick={onAdvance}>
            <ChevronRight className="w-3 h-3" /> {STATUS_CONFIG[next].label}
          </Button>
        )}
        {order.status !== "cancelled" && order.status !== "delivered" && (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={onCancel}>
            <XCircle className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function OnlineDeliveryOrdersPage() {
  const { data: response, refetch, isFetching } = useListDeliveryOrders({ query: { queryKey: ["delivery-orders"] } });
  const createOrder = useCreateDeliveryOrder();
  const updateOrder = useUpdateDeliveryOrder();

  const rawOrders = (response?.items ?? []) as unknown as ApiOrder[];
  const orders: DeliveryOrder[] = rawOrders.map(apiToLocal);
  const activeOrders = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  const completedOrders = orders.filter((o) => o.status === "delivered" || o.status === "cancelled");

  const [viewOrder, setViewOrder] = useState<DeliveryOrder | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const advanceStatus = (order: DeliveryOrder) => {
    const next = STATUS_FLOW[order.status];
    if (!next) return;
    updateOrder.mutate({ id: Number(order.id), data: { orderId: order.orderId, number: order.orderId, channel: order.platform, customer: order.customerName, status: next } }, {
      onSuccess: () => { refetch(); toast.success(`Order → ${STATUS_CONFIG[next].label}`); },
      onError: () => toast.error("Failed to update order"),
    });
  };

  const cancelOrder = (order: DeliveryOrder) => {
    updateOrder.mutate({ id: Number(order.id), data: { orderId: order.orderId, number: order.orderId, channel: order.platform, customer: order.customerName, status: "cancelled" } }, {
      onSuccess: () => { refetch(); toast.success("Order cancelled"); },
      onError: () => toast.error("Failed to cancel order"),
    });
  };

  const handleCreate = () => {
    let items: OrderItem[];
    try { items = JSON.parse(form.itemsRaw); }
    catch { toast.error("Invalid items JSON"); return; }
    if (!form.customerName.trim()) { toast.error("Customer name required"); return; }
    const total = items.reduce((s, i) => s + (i.price ?? 0) * (i.qty ?? 1), 0);
    const orderId = newOrderId();
    createOrder.mutate({
      data: {
        orderId,
        number: orderId,
        channel: form.platform,
        customer: form.customerName.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        items: JSON.stringify(items),
        status: "pending",
        total,
        notes: form.note.trim() || undefined,
        placedAt: new Date().toISOString(),
      },
    }, {
      onSuccess: () => { refetch(); setCreateOpen(false); setForm(EMPTY_FORM); toast.success("Order created"); },
      onError: () => toast.error("Failed to create order"),
    });
  };

  const todayRevenue = completedOrders
    .filter((o) => o.status === "delivered" && new Date(o.createdAt).toDateString() === new Date().toDateString())
    .reduce((s, o) => s + o.total, 0);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5"><Truck className="w-5 h-5 text-primary" /></div>
            <div>
              <h1 className="text-xl font-bold">Delivery Orders</h1>
              <p className="text-sm text-muted-foreground">Manage and track active delivery orders in real time</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
              <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> New Order
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Active",       value: activeOrders.length,                                                      color: "text-blue-500"    },
            { label: "Pending",      value: orders.filter((o) => o.status === "pending").length,                      color: "text-yellow-500"  },
            { label: "Preparing",    value: orders.filter((o) => o.status === "preparing" || o.status === "accepted").length, color: "text-orange-500" },
            { label: "Revenue today",value: `$${todayRevenue.toFixed(2)}`,                                            color: "text-emerald-500" },
          ].map(({ label, value, color }) => (
            <Card key={label}><CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
              <p className={cn("text-2xl font-bold mt-1", color)}>{value}</p>
            </CardContent></Card>
          ))}
        </div>

        {activeOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-12 text-center space-y-3">
            <Truck className="w-12 h-12 text-muted-foreground/40 mx-auto" />
            <p className="font-medium">No active delivery orders</p>
            <p className="text-sm text-muted-foreground">Create a new order or connect a delivery platform to start receiving orders.</p>
            <Button size="sm" className="mt-2" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Create Order
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STATUS_GROUPS.map((group, gi) => {
              const groupOrders = activeOrders.filter((o) => group.includes(o.status));
              const colLabel = ["New & Accepted", "Ready & Dispatched", "Done"][gi];
              return (
                <div key={gi} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{colLabel}</p>
                    {groupOrders.length > 0 && <Badge variant="secondary" className="text-xs">{groupOrders.length}</Badge>}
                  </div>
                  {groupOrders.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-xs text-muted-foreground">No orders</div>
                  ) : groupOrders.map((o) => (
                    <OrderCard key={String(o.id)} order={o}
                      onAdvance={() => advanceStatus(o)}
                      onCancel={() => cancelOrder(o)}
                      onView={() => setViewOrder(o)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {completedOrders.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="w-4 h-4 text-muted-foreground" /> Recent Completed
                <Badge variant="secondary" className="ml-1">{completedOrders.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {completedOrders.slice(0, 10).map((o) => {
                  const cfg = STATUS_CONFIG[o.status];
                  const Icon = cfg.icon;
                  return (
                    <div key={String(o.id)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer" onClick={() => setViewOrder(o)}>
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{o.customerName}</p>
                        <p className="text-xs text-muted-foreground">{o.orderId} · {o.platform}</p>
                      </div>
                      <p className="text-sm font-semibold shrink-0">${o.total.toFixed(2)}</p>
                      <Badge variant="outline" className={cn("text-[10px] border-0 shrink-0", cfg.color)}>{cfg.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!viewOrder} onOpenChange={(o) => { if (!o) setViewOrder(null); }}>
        <DialogContent className="max-w-md">
          {viewOrder && (() => {
            const cfg = STATUS_CONFIG[viewOrder.status];
            const Icon = cfg.icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    <span>{viewOrder.orderId}</span>
                    <Badge className={cn("text-[10px] border-0", cfg.color)}><Icon className="w-3 h-3 mr-1" />{cfg.label}</Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{viewOrder.customerName}</p></div>
                    <div><p className="text-xs text-muted-foreground">Platform</p><p className="font-medium">{viewOrder.platform}</p></div>
                    {viewOrder.phone && <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{viewOrder.phone}</p></div>}
                    <div><p className="text-xs text-muted-foreground">Placed at</p><p className="font-medium">{formatTime(viewOrder.createdAt)}</p></div>
                  </div>
                  {viewOrder.address && (
                    <div className="rounded-lg bg-muted/30 p-3 text-sm">
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Address</p>
                      <p>{viewOrder.address}</p>
                    </div>
                  )}
                  {viewOrder.note && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 text-sm text-amber-700 dark:text-amber-300">
                      <p className="text-xs font-semibold mb-1 flex items-center gap-1"><StickyNote className="w-3 h-3" /> Note</p>
                      <p>{viewOrder.note}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wide">Items</p>
                    <div className="space-y-1.5">
                      {viewOrder.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm gap-2">
                          <span className="flex-1 truncate">{item.qty}× {item.name}</span>
                          {item.note && <span className="text-xs text-muted-foreground italic">{item.note}</span>}
                          <span className="font-semibold shrink-0">${(item.price * item.qty).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between text-sm font-bold">
                      <span>Total</span>
                      <span>${viewOrder.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  {STATUS_FLOW[viewOrder.status] && (
                    <Button className="flex-1" onClick={() => { advanceStatus(viewOrder); setViewOrder(null); }}>
                      <ChevronRight className="w-4 h-4 mr-1" /> {STATUS_CONFIG[STATUS_FLOW[viewOrder.status]!].label}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setViewOrder(null)}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Delivery Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Platform</Label>
                <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Customer name <span className="text-destructive">*</span></Label>
                <Input className="h-8" value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Delivery address</Label>
              <Input className="h-8" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input className="h-8" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Estimated delivery</Label>
                <Input type="datetime-local" className="h-8 text-xs" value={form.estimatedAt} onChange={(e) => setForm((f) => ({ ...f, estimatedAt: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Items (JSON)</Label>
              <Textarea rows={3} className="text-xs font-mono" value={form.itemsRaw} onChange={(e) => setForm((f) => ({ ...f, itemsRaw: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">Format: {`[{ "name": "...", "qty": 1, "price": 9.50 }]`}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note</Label>
              <Input className="h-8" placeholder="Special instructions…" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createOrder.isPending}>
              {createOrder.isPending ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
