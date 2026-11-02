import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn, formatCurrency, telHref } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/phone-format";
import {
  ORDER_STATUSES, OPEN_ORDER_STATUSES, orderStatusMeta, CARRIERS, carrierName, trackingUrl,
} from "@/lib/order-tracking";
import {
  ShoppingBag, Search, Loader2, MapPin, Phone, Mail, Truck, ExternalLink, Copy, Package, RefreshCw,
} from "lucide-react";
import {
  useListDeliveryOrders, useUpdateDeliveryOrder, getListDeliveryOrdersQueryKey, type DeliveryOrder,
} from "@workspace/api-client-react";

/* Online › Orders — every order placed on the online store (koastal.com.au/shop),
   with its status, where it is going and how it is being shipped. Orders are
   the delivery_orders rows; marking one paid books it as a sale (server side). */

type Line = { name?: string; qty?: number; price?: number; lineTotal?: number };

function parseLines(raw: string): Line[] {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

function StatusBadge({ status }: { status: string }) {
  const m = orderStatusMeta(status);
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize whitespace-nowrap", m.tone)}>{m.label}</span>;
}

function PaymentBadge({ status }: { status: string }) {
  const tone = status === "paid" ? "bg-emerald-100 text-emerald-800" : status === "refunded" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800";
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", tone)}>{status || "pending"}</span>;
}

function TrackingLink({ order }: { order: DeliveryOrder }) {
  const url = trackingUrl(order.trackingCarrier ?? "", order.trackingNumber ?? "");
  if (!order.trackingNumber) return <span className="text-muted-foreground">—</span>;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary hover:underline">
      {order.trackingNumber} <ExternalLink className="w-3 h-3" />
    </a>
  ) : <span>{order.trackingNumber}</span>;
}

const addressOf = (o: DeliveryOrder) => [o.address, [o.city, o.state, o.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");

export default function OnlineOrdersPage() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useListDeliveryOrders();
  const update = useUpdateDeliveryOrder();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"open" | "all" | string>("open");
  const [openId, setOpenId] = useState<number | null>(null);

  const orders = data?.items ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, all: orders.length };
    orders.forEach((o) => { c[o.status] = (c[o.status] ?? 0) + 1; if (OPEN_ORDER_STATUSES.has(o.status)) c.open++; });
    return c;
  }, [orders]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) =>
      (tab === "all" || (tab === "open" ? OPEN_ORDER_STATUSES.has(o.status) : o.status === tab)) &&
      (!q || [o.number, o.orderId, o.customer, o.customerEmail, o.phone, o.trackingNumber, o.postcode, o.city]
        .some((v) => (v ?? "").toLowerCase().includes(q))),
    );
  }, [orders, search, tab]);

  const current = orders.find((o) => o.id === openId) ?? null;

  const save = (id: number, patch: Record<string, string>, done?: string) =>
    update.mutateAsync({ id, data: patch as never })
      .then(() => { if (done) toast.success(done); return qc.invalidateQueries({ queryKey: getListDeliveryOrdersQueryKey() }); })
      .catch((e: Error) => { toast.error(e.message || "Couldn't update the order"); throw e; });

  const tabs: { key: string; label: string }[] = [
    { key: "open", label: "Open" },
    ...ORDER_STATUSES.map((s) => ({ key: s.value, label: s.label })),
    { key: "all", label: "All" },
  ];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Orders</h1>
              <p className="text-sm text-muted-foreground">Orders placed on the online store.</p>
            </div>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key} type="button" onClick={() => setTab(t.key)}
              className={cn("rounded-full border px-3 py-1 text-sm transition-colors",
                tab === t.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}
            >
              {t.label} <span className="opacity-70">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order number, customer, email, tracking number or postcode…" className="pl-9" />
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : shown.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Package className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{orders.length === 0 ? "No online orders yet." : "No orders match."}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Order</th>
                      <th className="px-2 py-2.5 font-medium">Customer</th>
                      <th className="px-2 py-2.5 font-medium hidden lg:table-cell">Deliver to</th>
                      <th className="px-2 py-2.5 font-medium">Status</th>
                      <th className="px-2 py-2.5 font-medium hidden md:table-cell">Payment</th>
                      <th className="px-2 py-2.5 font-medium hidden md:table-cell">Tracking</th>
                      <th className="px-4 py-2.5 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((o) => (
                      <tr key={o.id} onClick={() => setOpenId(o.id)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer align-top">
                        <td className="px-4 py-2.5">
                          <p className="font-medium">#{o.number}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(o.createdAt)}</p>
                        </td>
                        <td className="px-2 py-2.5">
                          <p>{o.customer || "—"}</p>
                          {o.customerEmail && <p className="text-xs text-muted-foreground">{o.customerEmail}</p>}
                        </td>
                        <td className="px-2 py-2.5 hidden lg:table-cell">
                          <p>{addressOf(o) || "—"}</p>
                          {o.shippingMethod && <p className="text-xs text-muted-foreground">{o.shippingMethod}</p>}
                        </td>
                        <td className="px-2 py-2.5"><StatusBadge status={o.status} /></td>
                        <td className="px-2 py-2.5 hidden md:table-cell"><PaymentBadge status={o.paymentStatus} /></td>
                        <td className="px-2 py-2.5 hidden md:table-cell">
                          {o.trackingCarrier && <p className="text-xs text-muted-foreground">{carrierName(o.trackingCarrier)}</p>}
                          <TrackingLink order={o} />
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {current && <OrderDialog order={current} onClose={() => setOpenId(null)} onSave={save} saving={update.isPending} />}
    </AppLayout>
  );
}

function OrderDialog({ order, onClose, onSave, saving }: {
  order: DeliveryOrder;
  onClose: () => void;
  onSave: (id: number, patch: Record<string, string>, done?: string) => Promise<unknown>;
  saving: boolean;
}) {
  const [carrier, setCarrier] = useState(order.trackingCarrier || "auspost");
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  useEffect(() => { setCarrier(order.trackingCarrier || "auspost"); setTracking(order.trackingNumber ?? ""); }, [order.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = parseLines(order.items);
  const address = addressOf(order);
  const url = trackingUrl(order.trackingCarrier ?? "", order.trackingNumber ?? "");
  const trackingChanged = tracking.trim() !== (order.trackingNumber ?? "") || (tracking.trim() && carrier !== order.trackingCarrier);

  const saveTracking = (markShipped: boolean) => {
    const patch: Record<string, string> = { trackingCarrier: carrier, trackingNumber: tracking.trim() };
    if (markShipped) patch.status = "shipped";
    void onSave(order.id, patch, markShipped ? `Order #${order.number} marked shipped` : "Tracking saved").catch(() => {});
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">Order #{order.number} <StatusBadge status={order.status} /> <PaymentBadge status={order.paymentStatus} /></DialogTitle>
          <p className="text-xs text-muted-foreground">Placed {fmtDate(order.placedAt || order.createdAt)}{order.channel ? ` · ${order.channel}` : ""}</p>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Customer</p>
            <p className="font-medium">{order.customer || "—"}</p>
            {order.customerEmail && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-muted-foreground" /><a className="hover:underline" href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a></p>}
            {order.phone && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-muted-foreground" /><a className="hover:underline" href={telHref(order.phone)}>{formatPhoneForDisplay(order.phone)}</a></p>}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Delivery</p>
            {address ? (
              <p className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <span>{address}
                  <button type="button" className="ml-1.5 align-middle text-muted-foreground hover:text-foreground" title="Copy address"
                    onClick={() => { void navigator.clipboard?.writeText(address).then(() => toast.success("Address copied")); }}>
                    <Copy className="inline w-3.5 h-3.5" />
                  </button>
                </span>
              </p>
            ) : <p className="text-muted-foreground">No address</p>}
            {order.shippingMethod && <p className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-muted-foreground" />{order.shippingMethod}</p>}
            {order.shippedAt && <p className="text-xs text-muted-foreground">Shipped {fmtDate(order.shippedAt)}</p>}
            {order.deliveredAt && <p className="text-xs text-muted-foreground">Delivered {fmtDate(order.deliveredAt)}</p>}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Items</p>
          {lines.length === 0 ? <p className="text-sm text-muted-foreground">No items recorded.</p> : (
            <div className="space-y-1 text-sm">
              {lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <span>{l.qty ?? 1} × {l.name ?? "Item"}</span>
                  <span className="tabular-nums">{formatCurrency(l.lineTotal ?? (l.price ?? 0) * (l.qty ?? 1))}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t pt-2 space-y-0.5 text-sm">
            {!!order.subtotal && <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(order.subtotal)}</span></div>}
            {!!order.discountTotal && <div className="flex justify-between text-muted-foreground"><span>Discount</span><span className="tabular-nums">−{formatCurrency(order.discountTotal)}</span></div>}
            {!!order.shippingTotal && <div className="flex justify-between text-muted-foreground"><span>Shipping</span><span className="tabular-nums">{formatCurrency(order.shippingTotal)}</span></div>}
            <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatCurrency(order.total)}</span></div>
          </div>
          {order.notes && <p className="text-sm rounded-md bg-muted/50 p-2.5">{order.notes}</p>}
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Tracking</p>
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label>Carrier</Label>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CARRIERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tracking number</Label>
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Consignment / tracking number" noPhoneFormat />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {url && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /> Track with {carrierName(order.trackingCarrier ?? "")}</a>
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={saving || !trackingChanged} onClick={() => saveTracking(false)}>Save tracking</Button>
            {order.status !== "shipped" && order.status !== "delivered" && (
              <Button size="sm" disabled={saving || !tracking.trim()} onClick={() => saveTracking(true)} className="gap-1.5"><Truck className="w-4 h-4" /> Save & mark shipped</Button>
            )}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Order status</Label>
            <Select value={order.status} onValueChange={(v) => void onSave(order.id, { status: v }, `Status set to ${orderStatusMeta(v).label}`).catch(() => {})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {!ORDER_STATUSES.some((s) => s.value === order.status) && <SelectItem value={order.status}>{orderStatusMeta(order.status).label}</SelectItem>}
                {ORDER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment</Label>
            <Select value={order.paymentStatus || "pending"} onValueChange={(v) => void onSave(order.id, { paymentStatus: v }, v === "paid" ? "Marked paid — recorded as a sale" : "Payment status updated").catch(() => {})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Marking an order paid records it as a sale (once).</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
