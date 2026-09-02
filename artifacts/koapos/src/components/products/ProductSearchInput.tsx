import { useState, useEffect, useRef } from "react";
import { useListProducts, useGetProduct, getListProductsQueryKey, Product } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import { Search, PackageSearch, X, Loader2 } from "lucide-react";

interface ProductSearchInputProps {
  value: string;
  onChange: (productId: string, product: Product | null) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}

export function ProductSearchInput({
  value,
  onChange,
  placeholder = "Search product...",
  className,
  invalid,
}: ProductSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Debounce the search query by 300 ms */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  /* Server-side search — only fires when the dropdown is open and at least 2 chars typed */
  const searchParams = { search: debouncedQuery || undefined, limit: 20 };
  const { data: searchData, isFetching } = useListProducts(
    searchParams,
    { query: { queryKey: getListProductsQueryKey(searchParams), enabled: open && debouncedQuery.length >= 2 } }
  );
  const products = searchData?.items ?? [];

  /* Look up the selected product by ID when value is pre-set from outside
     (e.g. editing an existing pre-order) and we don't have the object yet */
  const needLookup = !!value && (!selectedProduct || String(selectedProduct.id) !== value);
  const { data: lookedUpProduct } = useGetProduct(
    parseInt(value, 10) || 0,
    { query: { queryKey: ["product-by-id", value], enabled: needLookup && !!value } }
  );

  /* Resolved selected product: prefer local state (just selected), fall back to server lookup */
  const selected: Product | null =
    selectedProduct && String(selectedProduct.id) === value
      ? selectedProduct
      : (lookedUpProduct as Product | undefined) ?? null;

  /* Surface the looked-up product to the parent so it can use the price (e.g. deposit calc) */
  useEffect(() => {
    if (lookedUpProduct && String((lookedUpProduct as Product).id) === value) {
      onChange(value, lookedUpProduct as Product);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookedUpProduct]);

  /* Close dropdown on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* Reset local selectedProduct when the value is cleared from outside */
  useEffect(() => {
    if (!value) setSelectedProduct(null);
  }, [value]);

  const select = (p: Product) => {
    setSelectedProduct(p);
    onChange(String(p.id), p);
    setOpen(false);
    setQuery("");
  };

  const clear = () => {
    setSelectedProduct(null);
    onChange("", null);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {selected ? (
        <div className="flex items-center gap-2 border border-primary rounded-lg px-2.5 py-2 bg-primary/5">
          <div className="w-6 h-6 rounded-md flex items-center justify-center bg-primary/15 text-primary shrink-0">
            <PackageSearch className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selected.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {selected.sku ? `${selected.sku} · ` : ""}{formatCurrency(selected.price)}
            </p>
          </div>
          <button type="button" onClick={clear} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "w-full flex items-center justify-between border rounded-lg px-3 py-2.5 text-sm bg-background hover:bg-muted/30 transition-colors",
            open ? "border-primary" : invalid ? "border-destructive/40" : ""
          )}
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <PackageSearch className="w-3.5 h-3.5 shrink-0" />
            {placeholder}
          </span>
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      )}

      {open && !selected && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-lg shadow-lg flex flex-col max-h-[min(320px,60dvh)]">
          <div className="p-2 border-b shrink-0">
            <div className="relative">
              <Input
                autoFocus
                placeholder="Search by name or SKU..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 text-sm pr-7"
              />
              {isFetching && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="overflow-y-auto min-h-0">
            {debouncedQuery.length < 2 ? (
              <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                Type at least 2 characters to search products
              </div>
            ) : products.length === 0 && !isFetching ? (
              <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                No products match &ldquo;{debouncedQuery}&rdquo;
              </div>
            ) : (
              products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => select(p)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 hover:bg-muted/40 flex items-center gap-2.5 transition-colors",
                    value === String(p.id) && "bg-primary/10"
                  )}
                >
                  <div className="w-7 h-7 rounded-md flex items-center justify-center bg-primary/15 text-primary shrink-0">
                    <PackageSearch className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.sku || "—"}</p>
                  </div>
                  <span className="text-sm font-medium shrink-0">{formatCurrency(p.price)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
