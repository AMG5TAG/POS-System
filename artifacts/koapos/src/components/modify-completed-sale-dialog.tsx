import { useMemo, useState } from "react";
import {
  useModifyCompletedSale,
  useListProducts,
  useListCustomers,
  useListServiceJobs,
  useListAppointments,
  type Transaction,
  type Product,
  type Customer,
  type ServiceJob,
  type Appointment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { customerDisplayName } from "@/lib/customer-name";
import {
  Gift, Search, Plus, Minus, Trash2, UserPlus, User, X, Link as LinkIcon,
  Wrench, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** A free line the cashier has staged to add ($0). productId 0 = custom line. */
interface FreeItem { productId: number; name: string; quantity: number }

/** undefined → leave the sale's customer unchanged; null → detach; Customer → link. */
type CustomerChange = Customer | null | undefined;

interface Props {
  tx: Transaction | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ModifyCompletedSaleDialog({ tx, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const open = !!tx;

  const [freeItems, setFreeItems] = useState<FreeItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerChange, setCustomerChange] = useState<CustomerChange>(undefined);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [linkType, setLinkType] = useState<"none" | "service" | "appointment">("none");
  const [linkSearch, setLinkSearch] = useState("");
  const [service, setService] = useState<ServiceJob | null>(null);
  const [appointment, setAppointment] = useState<Appointment | null>(null);

  function resetAndClose() {
    setFreeItems([]);
    setProductSearch("");
    setCustomerSearch("");
    setCustomerChange(undefined);
    setPickingCustomer(false);
    setLinkType("none");
    setLinkSearch("");
    setService(null);
    setAppointment(null);
    onClose();
  }

  const mutation = useModifyCompletedSale({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        if (tx) queryClient.invalidateQueries({ queryKey: ["transaction", tx.id] });
        toast.success("Sale updated");
        onSuccess?.();
        resetAndClose();
      },
      onError: (e) => toast.error((e as Error)?.message || "Failed to update sale"),
    },
  });

  /* ── Data (only fetched while the dialog is open) ── */
  const { data: productData } = useListProducts(
    { search: productSearch || undefined, limit: 20 },
    { query: { enabled: open && productSearch.trim().length > 0, queryKey: ["products-modify", productSearch] } },
  );
  const { data: customerData } = useListCustomers(
    { search: customerSearch || undefined, limit: 20 },
    { query: { enabled: open && pickingCustomer, queryKey: ["customers-modify", customerSearch] } },
  );
  const { data: serviceJobs } = useListServiceJobs(
    { query: { enabled: open && linkType === "service", queryKey: ["service-jobs-modify"] } },
  );
  const { data: appointments } = useListAppointments(
    undefined,
    { query: { enabled: open && linkType === "appointment", queryKey: ["appointments-modify"] } },
  );

  const linkQuery = linkSearch.trim().toLowerCase();
  const filteredJobs = useMemo(
    () => (serviceJobs ?? []).filter((j) =>
      !linkQuery || [j.jobNumber, j.deviceType, j.deviceDescription, j.customerName].some((f) => f?.toLowerCase().includes(linkQuery)),
    ).slice(0, 25),
    [serviceJobs, linkQuery],
  );
  const filteredAppts = useMemo(
    () => (appointments ?? []).filter((a) =>
      !linkQuery || [a.title, a.customerName, String(a.id)].some((f) => f?.toLowerCase().includes(linkQuery)),
    ).slice(0, 25),
    [appointments, linkQuery],
  );

  if (!tx) return null;

  const currentCustomer = tx.customer ? customerDisplayName(tx.customer, "") : "";
  // What the customer field will show after saving.
  const effectiveCustomer =
    customerChange === undefined ? (currentCustomer || "Walk-in")
    : customerChange === null ? "Walk-in"
    : customerDisplayName(customerChange, "Customer");

  function addProduct(p: Product) {
    setFreeItems((prev) => {
      const existing = prev.find((f) => f.productId === p.id);
      if (existing) return prev.map((f) => f.productId === p.id ? { ...f, quantity: f.quantity + 1 } : f);
      return [...prev, { productId: p.id, name: p.name, quantity: 1 }];
    });
  }
  function setQty(productId: number, delta: number) {
    setFreeItems((prev) => prev
      .map((f) => f.productId === productId ? { ...f, quantity: Math.max(1, f.quantity + delta) } : f));
  }
  function removeItem(productId: number) {
    setFreeItems((prev) => prev.filter((f) => f.productId !== productId));
  }

  const hasChanges =
    freeItems.length > 0 ||
    customerChange !== undefined ||
    service != null ||
    appointment != null;

  function handleSave() {
    if (!tx) return;
    if (!hasChanges) { toast.info("No changes to save"); return; }
    const data: Parameters<typeof mutation.mutate>[0]["data"] = {};
    if (freeItems.length > 0) {
      data.addItems = freeItems.map((f) => ({
        productId: f.productId,
        ...(f.productId === 0 ? { productName: f.name } : {}),
        quantity: f.quantity,
      }));
    }
    if (customerChange !== undefined) data.customerId = customerChange === null ? null : customerChange.id;
    if (service) data.serviceJobNumber = service.jobNumber;
    if (appointment) data.appointmentId = appointment.id;
    mutation.mutate({ id: tx.id, data });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modify sale {tx.receiptNumber ?? `#${tx.id}`}</DialogTitle>
          <DialogDescription>
            Add complimentary items, attach a customer, or link an appointment or service.
            The amount charged ({formatCurrency(tx.total ?? 0)}) won't change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* ── Free products ── */}
          <section className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Gift className="w-4 h-4 text-primary" /> Add free items
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search products to add for free…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            {productSearch.trim() && (productData?.items?.length ?? 0) > 0 && (
              <div className="rounded-md border divide-y max-h-40 overflow-y-auto">
                {productData!.items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted text-left"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="flex items-center gap-2 shrink-0 text-muted-foreground">
                      <span className="text-xs line-through">{formatCurrency(p.price)}</span>
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {freeItems.length > 0 && (
              <div className="space-y-1.5">
                {freeItems.map((f) => (
                  <div key={f.productId} className="flex items-center gap-2 text-sm bg-muted/40 rounded-md px-2.5 py-1.5">
                    <span className="flex-1 truncate">{f.name}</span>
                    <Badge variant="secondary" className="text-emerald-700">FREE</Badge>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setQty(f.productId, -1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-6 text-center tabular-nums">{f.quantity}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setQty(f.productId, 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(f.productId)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* ── Customer ── */}
          <section className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <User className="w-4 h-4 text-primary" /> Customer
            </Label>
            <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span className={cn("truncate", effectiveCustomer === "Walk-in" && "text-muted-foreground italic")}>
                {effectiveCustomer}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {(customerChange !== undefined || currentCustomer) && (
                  <Button
                    variant="ghost" size="sm" className="h-7 text-muted-foreground"
                    onClick={() => {
                      // Reset to original, or detach if there's a current customer.
                      if (customerChange !== undefined) setCustomerChange(undefined);
                      else setCustomerChange(null);
                      setPickingCustomer(false);
                    }}
                  >
                    {customerChange !== undefined ? <>Reset</> : <><X className="w-3.5 h-3.5 mr-1" />Remove</>}
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-7" onClick={() => setPickingCustomer((v) => !v)}>
                  <UserPlus className="w-3.5 h-3.5 mr-1" /> {pickingCustomer ? "Close" : "Change"}
                </Button>
              </div>
            </div>
            {pickingCustomer && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search customers…"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                {(customerData?.items?.length ?? 0) > 0 && (
                  <div className="rounded-md border divide-y max-h-40 overflow-y-auto">
                    {customerData!.items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setCustomerChange(c); setPickingCustomer(false); }}
                        className="w-full px-3 py-2 text-sm hover:bg-muted text-left truncate"
                      >
                        {customerDisplayName(c, `Customer #${c.id}`)}
                        {c.phone && <span className="text-muted-foreground"> · {c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <Separator />

          {/* ── Link appointment / service ── */}
          <section className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <LinkIcon className="w-4 h-4 text-primary" /> Link to appointment or service
            </Label>
            <div className="flex gap-2">
              {(["service", "appointment"] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={linkType === t ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => { setLinkType((cur) => cur === t ? "none" : t); setLinkSearch(""); }}
                >
                  {t === "service" ? <Wrench className="w-3.5 h-3.5 mr-1" /> : <CalendarDays className="w-3.5 h-3.5 mr-1" />}
                  {t === "service" ? "Service job" : "Appointment"}
                </Button>
              ))}
            </div>

            {(service || appointment) && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5 truncate text-primary">
                  {service
                    ? <><Wrench className="w-3.5 h-3.5 shrink-0" />Service #{service.jobNumber}: {service.deviceType || service.deviceDescription || "service"}</>
                    : <><CalendarDays className="w-3.5 h-3.5 shrink-0" />Appt #{appointment!.id}: {appointment!.title}</>}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setService(null); setAppointment(null); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {linkType !== "none" && !service && !appointment && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder={linkType === "service" ? "Search service jobs…" : "Search appointments…"}
                    value={linkSearch}
                    onChange={(e) => setLinkSearch(e.target.value)}
                  />
                </div>
                <div className="rounded-md border divide-y max-h-44 overflow-y-auto">
                  {linkType === "service" ? (
                    filteredJobs.length > 0 ? filteredJobs.map((j) => (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => { setService(j); setAppointment(null); }}
                        className="w-full px-3 py-2 text-sm hover:bg-muted text-left"
                      >
                        <p className="font-medium truncate">#{j.jobNumber} · {j.deviceType || j.deviceDescription || "Service"}</p>
                        {j.customerName && <p className="text-xs text-muted-foreground truncate">{j.customerName}</p>}
                      </button>
                    )) : <p className="px-3 py-3 text-sm text-muted-foreground text-center">No service jobs found.</p>
                  ) : (
                    filteredAppts.length > 0 ? filteredAppts.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => { setAppointment(a); setService(null); }}
                        className="w-full px-3 py-2 text-sm hover:bg-muted text-left"
                      >
                        <p className="font-medium truncate">{a.title}</p>
                        {a.customerName && <p className="text-xs text-muted-foreground truncate">{a.customerName}</p>}
                      </button>
                    )) : <p className="px-3 py-3 text-sm text-muted-foreground text-center">No appointments found.</p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <Separator />
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={resetAndClose} disabled={mutation.isPending}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={mutation.isPending || !hasChanges}>
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
