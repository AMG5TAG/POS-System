import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ShieldCheck, Package, User, Receipt, Search } from "lucide-react";
import { toast } from "sonner";
import { customerDisplayName } from "@/lib/customer-name";
import { warrantyExpiry, warrantyLabel, isUnderWarranty } from "@/lib/warranty";
import { useDocumentTemplate } from "@/lib/use-document-template";
import {
  useListTransactions,
  useListProducts,
  useListCustomers,
  customFetch,
  type Transaction,
} from "@workspace/api-client-react";

type TxItem = { productId?: number | null; productName?: string | null; name?: string | null; quantity?: number | null; serials?: string[] | null };
type Tx = { id: number; receiptNumber?: string | null; customerId?: number | null; createdAt: string; total?: number | null; paymentMethod?: string | null; items?: unknown };
type Prod = { id: number; name: string; sku?: string | null; price?: number | null; warrantyDuration?: number | null; warrantyUnit?: string | null };
type Cust = { id: number; firstName?: string | null; lastName?: string | null; company?: string | null; email?: string | null; phone?: string | null };

type WarrantyRow = {
  key: string;
  tx: Tx;
  product: Prod;
  itemName: string;
  quantity: number;
  serials: string[];
  expiry: Date;
  customer: Cust | null;
};

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(d: Date): number {
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function ProductsWarrantyPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
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

  const { data: txData, isLoading } = useListTransactions(
    { limit: 200 },
    { query: { queryKey: ["transactions", "warranty"] } },
  );
  const { data: productsData } = useListProducts(undefined, { query: { queryKey: ["products"] } });
  const { data: customersData } = useListCustomers({ limit: 1000 }, { query: { queryKey: ["customers", "warranty"] } });

  const productsById = useMemo(() => {
    const m = new Map<number, Prod>();
    for (const p of (productsData?.items ?? []) as Prod[]) m.set(p.id, p);
    return m;
  }, [productsData]);

  const customersById = useMemo(() => {
    const m = new Map<number, Cust>();
    for (const c of (customersData?.items ?? []) as Cust[]) m.set(c.id, c);
    return m;
  }, [customersData]);

  // One row per sold line item whose product carries warranty that hasn't lapsed.
  const rows = useMemo<WarrantyRow[]>(() => {
    const out: WarrantyRow[] = [];
    for (const tx of (txData?.items ?? []) as Tx[]) {
      const items = Array.isArray(tx.items) ? (tx.items as TxItem[]) : [];
      items.forEach((it, idx) => {
        if (it.productId == null) return;
        const product = productsById.get(it.productId);
        if (!product || !product.warrantyDuration || product.warrantyDuration <= 0) return;
        if (!isUnderWarranty(tx.createdAt, product.warrantyDuration, product.warrantyUnit)) return;
        const expiry = warrantyExpiry(tx.createdAt, product.warrantyDuration, product.warrantyUnit);
        if (!expiry) return;
        out.push({
          key: `${tx.id}-${it.productId}-${idx}`,
          tx,
          product,
          itemName: it.productName || it.name || product.name,
          quantity: it.quantity ?? 1,
          serials: Array.isArray(it.serials) ? it.serials.filter(Boolean) as string[] : [],
          expiry,
          customer: tx.customerId != null ? customersById.get(tx.customerId) ?? null : null,
        });
      });
    }
    return out.sort((a, b) => a.expiry.getTime() - b.expiry.getTime());
  }, [txData, productsById, customersById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.itemName.toLowerCase().includes(q) ||
      (r.product.sku ?? "").toLowerCase().includes(q) ||
      (r.tx.receiptNumber ?? "").toLowerCase().includes(q) ||
      r.serials.some((s) => s.toLowerCase().includes(q)) ||
      (r.customer ? customerDisplayName(r.customer) : "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Warranty</h1>
            <p className="text-sm text-muted-foreground">Items sold that are currently under warranty, soonest to expire first.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-72 max-w-full">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search product, SKU, receipt, customer..."
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
              <p className="text-xs max-w-md">Set a warranty period on a product (Products → edit → Settings → Warranty), and it will appear here once that product is sold through the POS.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="p-3 text-left font-medium">Product</th>
                  <th className="p-3 text-left font-medium hidden sm:table-cell">Customer</th>
                  <th className="p-3 text-left font-medium hidden md:table-cell">Sold</th>
                  <th className="p-3 text-left font-medium">Warranty until</th>
                  <th className="p-3 text-right font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => {
                  const days = daysUntil(r.expiry);
                  const custName = r.customer ? customerDisplayName(r.customer) : null;
                  return (
                    <tr key={r.key} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        <p className="font-medium truncate max-w-[200px]">{r.itemName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {warrantyLabel(r.product.warrantyDuration, r.product.warrantyUnit)}
                          {r.product.sku ? ` · ${r.product.sku}` : ""}
                        </p>
                        {r.serials.length > 0 && (
                          <p className="text-[11px] text-muted-foreground font-mono">S/N: {r.serials.join(", ")}</p>
                        )}
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        <span className="text-muted-foreground">{custName || "Walk-in"}</span>
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <span className="text-muted-foreground text-xs">{fmtDate(r.tx.createdAt)}</span>
                        {r.tx.receiptNumber && <span className="block text-[11px] text-muted-foreground/70">{r.tx.receiptNumber}</span>}
                      </td>
                      <td className="p-3">
                        <span className="font-medium">{fmtDate(r.expiry)}</span>
                        <Badge variant={days <= 30 ? "destructive" : "secondary"} className="ml-2 text-[10px]">
                          {days} day{days === 1 ? "" : "s"} left
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 justify-end">
                          {/* Product */}
                          <Popover>
                            <PopoverTrigger asChild>
                              <button title="Product details" className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
                                <Package className="w-4 h-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 text-sm space-y-1">
                              <p className="font-semibold">{r.product.name}</p>
                              {r.product.sku && <p className="text-xs text-muted-foreground">SKU: {r.product.sku}</p>}
                              {r.product.price != null && <p className="text-xs text-muted-foreground">Price: ${Number(r.product.price).toFixed(2)}</p>}
                              <p className="text-xs text-muted-foreground">{warrantyLabel(r.product.warrantyDuration, r.product.warrantyUnit)}</p>
                              <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setLocation("/products")}>Open in Products</Button>
                            </PopoverContent>
                          </Popover>
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
                                  <p className="font-semibold">{custName}</p>
                                  {r.customer.email && <p className="text-xs text-muted-foreground">{r.customer.email}</p>}
                                  {r.customer.phone && <p className="text-xs text-muted-foreground">{r.customer.phone}</p>}
                                  <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setLocation("/customers")}>Open in Customers</Button>
                                </>
                              ) : (
                                <p className="text-xs text-muted-foreground">No customer was attached to this sale (walk-in).</p>
                              )}
                            </PopoverContent>
                          </Popover>
                          {/* Receipt — opens the invoice in a print popup */}
                          <button
                            title="View invoice"
                            onClick={() => openReceipt(r.tx.id)}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
