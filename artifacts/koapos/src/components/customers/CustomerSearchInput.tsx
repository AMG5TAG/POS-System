import { useState, useEffect, useRef } from "react";
import { useListCustomers, useGetCustomer, Customer } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search, UserSearch, X, AlertTriangle, UserPlus, Loader2 } from "lucide-react";
import { QuickAddCustomerDialog } from "./QuickAddCustomerDialog";

interface CustomerSearchInputProps {
  value: string;
  onChange: (customerId: string, customer: Customer | null) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
  invalid?: boolean;
}

export function CustomerSearchInput({
  value,
  onChange,
  placeholder = "Search customer...",
  allowNone = false,
  noneLabel = "No customer (walk-in)",
  className,
  invalid,
}: CustomerSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Debounce the search query by 300 ms */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  /* Server-side search — only fires when the dropdown is open */
  const { data: searchData, isFetching } = useListCustomers(
    { search: debouncedQuery || undefined, limit: 50 },
    { query: { queryKey: ["customers-search", debouncedQuery], enabled: open } }
  );
  const customers = searchData?.items ?? [];

  /* Look up the selected customer by ID when value is pre-set from outside
     (e.g. editing an existing appointment) and we don't have the object yet */
  const needLookup = !!value && (!selectedCustomer || String(selectedCustomer.id) !== value);
  const { data: lookedUpCustomer } = useGetCustomer(
    parseInt(value, 10) || 0,
    { query: { queryKey: ["customer-by-id", value], enabled: needLookup && !!value } }
  );

  /* Resolved selected customer: prefer local state (just selected), fall back to server lookup */
  const selected: Customer | null =
    selectedCustomer && String(selectedCustomer.id) === value
      ? selectedCustomer
      : (lookedUpCustomer as Customer | undefined) ?? null;

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

  /* Reset local selectedCustomer when the value is cleared from outside */
  useEffect(() => {
    if (!value) setSelectedCustomer(null);
  }, [value]);

  const select = (c: Customer) => {
    setSelectedCustomer(c);
    onChange(String(c.id), c);
    setOpen(false);
    setQuery("");
  };

  const clear = () => {
    setSelectedCustomer(null);
    onChange("", null);
  };

  const initials = (c: Customer) =>
    ((c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "")).toUpperCase() || "?";

  const displayName = (c: Customer) =>
    `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Unknown";

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {selected ? (
        <div className="flex items-center gap-2 border rounded-lg px-2.5 py-2 bg-muted/40">
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
            selected.warningNote ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
          )}>
            {initials(selected)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{displayName(selected)}</p>
            {(selected.email || selected.phone) && (
              <p className="text-xs text-muted-foreground truncate">{selected.email || selected.phone}</p>
            )}
          </div>
          {selected.warningNote && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
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
            <UserSearch className="w-3.5 h-3.5 shrink-0" />
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
                placeholder="Search by name, email or phone..."
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
            <button
              type="button"
              onClick={() => { setOpen(false); setQuickAddOpen(true); }}
              className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-primary font-medium hover:bg-primary/5 border-b"
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              Create new customer
            </button>
            {allowNone && (
              <button
                type="button"
                onClick={() => { onChange("", null); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 border-b"
              >
                {noneLabel}
              </button>
            )}
            {customers.length === 0 && !isFetching ? (
              <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                {debouncedQuery ? (
                  <>
                    No customers match &ldquo;{debouncedQuery}&rdquo; —{" "}
                    <button
                      type="button"
                      className="text-primary font-medium hover:underline"
                      onClick={() => { setOpen(false); setQuickAddOpen(true); }}
                    >
                      create one
                    </button>
                  </>
                ) : "Start typing to search customers"}
              </div>
            ) : (
              customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => select(c)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 hover:bg-muted/40 flex items-center gap-2.5 transition-colors",
                    value === String(c.id) && "bg-primary/10"
                  )}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                    c.warningNote ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
                  )}>
                    {initials(c)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{displayName(c)}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email || c.phone || "—"}</p>
                  </div>
                  {c.warningNote && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <QuickAddCustomerDialog
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={(c) => { setSelectedCustomer(c as Customer); onChange(String(c.id), c as Customer); setQuickAddOpen(false); }}
        prefillName={query}
      />
    </div>
  );
}
