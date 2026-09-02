import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ShieldCheck, Package, Wrench, User, Receipt, Search, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { customFetch, type Transaction } from "@workspace/api-client-react";
import { useDocumentTemplate } from "@/lib/use-document-template";
import { cn } from "@/lib/utils";

/* One active warranty (product sale or service repair) as computed by the API. */
type WarrantyItem = {
  type: "product" | "service";
  key: string;
  itemName: string;
  sku: string | null;
  serials: string[];
  quantity: number;
  warrantyLabel: string;
  soldAt: string;
  expiry: string;
  daysRemaining: number;
  referenceId: number;
  referenceNumber: string | null;
  customer: { id: number; name: string; email: string | null; phone: string | null } | null;
};

/* Collapsible categories keyed by how much warranty time remains. An item lands
   in the smallest bucket whose threshold (in days) is >= its remaining days.
   Ordered soonest-to-expire first so the longest remaining warranty sits at the bottom. */
const BUCKETS = [
  { id: "1m", label: "1 month",  maxDays: 31 },
  { id: "4m", label: "4 months", maxDays: 122 },
  { id: "8m", label: "8 months", maxDays: 244 },
  { id: "1y", label: "1 Year",   maxDays: 366 },
  { id: "2y", label: "2 Years",  maxDays: 731 },
  { id: "3y", label: "3 Years",  maxDays: Infinity },
] as const;

type BucketId = (typeof BUCKETS)[number]["id"];

function bucketFor(days: number): BucketId {
  if (days <= 31) return "1m";
  if (days <= 122) return "4m";
  if (days <= 244) return "8m";
  if (days <= 366) return "1y";
  if (days <= 731) return "2y";
  return "3y";
}

/* All buckets start collapsed; merchants expand the ones they want to act on. */
const DEFAULT_OPEN: Record<BucketId, boolean> = { "3y": false, "2y": false, "1y": false, "8m": false, "4m": false, "1m": false };

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProductsWarrantyPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>(DEFAULT_OPEN);
  const { printInvoice } = useDocumentTemplate();

  // Open the sale's invoice in a print popup without leaving the Warranty page.
  const openReceipt = async (txId: number) => {
    try {
      const full = await customFetch<Transaction>(`/api/transactions/${txId}`, { method: "GET" });
      printInvoice(full);
    } catch {
      toast.error("Couldn't open the invoice for this sale");
    }
  };

  // Server computes the full warranty history deterministically (single `now`),
  // so the list is complete and stable across renders.
  const { data, isLoading } = useQuery({
    queryKey: ["warranties"],
    queryFn: () => customFetch<{ items: WarrantyItem[] }>(`/api/warranties`, { method: "GET" }),
  });
  const items = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) =>
      r.itemName.toLowerCase().includes(q) ||
      (r.sku ?? "").toLowerCase().includes(q) ||
      (r.referenceNumber ?? "").toLowerCase().includes(q) ||
      r.serials.some((s) => s.toLowerCase().includes(q)) ||
      (r.customer?.name ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  // Group the (already sorted soonest-first) items into the named buckets.
  const grouped = useMemo(() => {
    const map = new Map<BucketId, WarrantyItem[]>();
    for (const it of filtered) {
      const b = bucketFor(it.daysRemaining);
      const arr = map.get(b) ?? [];
      arr.push(it);
      map.set(b, arr);
    }
    return map;
  }, [filtered]);

  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !(o[id] ?? false) }));

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Warranty</h1>
            <p className="text-sm text-muted-foreground">Products sold and repairs completed that are still under warranty, grouped by time remaining.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-72 max-w-full">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search product, SKU, reference, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Badge variant="secondary">{filtered.length} under warranty</Badge>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground text-sm">Loading warranties…</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
              <ShieldCheck className="w-14 h-14 opacity-15" />
              <p className="text-sm">No items are currently under warranty.</p>
              <p className="text-xs max-w-md">Set a warranty period on a product (Products → edit → Settings → Warranty) and it appears here once sold; completed repairs with a repair-warranty period appear here too.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {BUCKETS.map((bucket) => {
              const rows = grouped.get(bucket.id) ?? [];
              if (rows.length === 0) return null;
              const isOpen = open[bucket.id] ?? false;
              return (
                <div key={bucket.id} className="rounded-lg border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggle(bucket.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen ? "" : "-rotate-90")} />
                      {bucket.label} remaining
                    </span>
                    <Badge variant="secondary">{rows.length}</Badge>
                  </button>
                  {isOpen && (
                    <table className="w-full text-sm border-t">
                      <thead>
                        <tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                          <th className="p-3 text-left font-medium">Item</th>
                          <th className="p-3 text-left font-medium hidden sm:table-cell">Customer</th>
                          <th className="p-3 text-left font-medium hidden md:table-cell">Since</th>
                          <th className="p-3 text-left font-medium">Warranty until</th>
                          <th className="p-3 text-right font-medium">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rows.map((r) => {
                          const days = r.daysRemaining;
                          return (
                            <tr key={r.key} className="hover:bg-muted/20 transition-colors">
                              <td className="p-3">
                                <p className="font-medium truncate max-w-[220px] flex items-center gap-1.5">
                                  {r.type === "service"
                                    ? <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    : <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                                  {r.itemName}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {r.warrantyLabel}
                                  {r.sku ? ` · ${r.sku}` : ""}
                                </p>
                                {r.serials.length > 0 && (
                                  <p className="text-[11px] text-muted-foreground font-mono">S/N: {r.serials.join(", ")}</p>
                                )}
                              </td>
                              <td className="p-3 hidden sm:table-cell">
                                <span className="text-muted-foreground">{r.customer?.name || "Walk-in"}</span>
                              </td>
                              <td className="p-3 hidden md:table-cell">
                                <span className="text-muted-foreground text-xs">{fmtDate(r.soldAt)}</span>
                                {r.referenceNumber && <span className="block text-[11px] text-muted-foreground/70">{r.referenceNumber}</span>}
                              </td>
                              <td className="p-3">
                                <span className="font-medium">{fmtDate(r.expiry)}</span>
                                <Badge variant={days <= 30 ? "destructive" : "secondary"} className="ml-2 text-[10px]">
                                  {days} day{days === 1 ? "" : "s"} left
                                </Badge>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-1 justify-end">
                                  {/* Customer */}
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button title="Customer details" className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
                                        <User className="w-4 h-4" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 text-sm space-y-1">
                                      {r.customer ? (
                                        <>
                                          <p className="font-semibold">{r.customer.name}</p>
                                          {r.customer.email && <p className="text-xs text-muted-foreground">{r.customer.email}</p>}
                                          {r.customer.phone && <p className="text-xs text-muted-foreground">{r.customer.phone}</p>}
                                          <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setLocation("/customers")}>Open in Customers</Button>
                                        </>
                                      ) : (
                                        <p className="text-xs text-muted-foreground">No customer was attached to this {r.type === "service" ? "repair" : "sale"} (walk-in).</p>
                                      )}
                                    </PopoverContent>
                                  </Popover>
                                  {/* Reference — invoice for sales, job link for repairs */}
                                  {r.type === "product" ? (
                                    <button
                                      title="View invoice"
                                      onClick={() => openReceipt(r.referenceId)}
                                      className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                                    >
                                      <Receipt className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <button
                                      title="Open service job"
                                      onClick={() => setLocation("/services")}
                                      className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                                    >
                                      <Wrench className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
