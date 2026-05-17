import { useState, useEffect, useRef } from "react";
import { useListCustomers, Customer } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search, UserSearch, X, AlertTriangle, UserPlus } from "lucide-react";
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
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useListCustomers({ limit: 500 });
  const customers = (data?.items ?? []) as Customer[];
  const selected = customers.find((c) => String(c.id) === value) ?? null;

  const filtered = !query.trim()
    ? customers
    : customers.filter((c) => {
        const q = query.toLowerCase();
        return (
          `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q)
        );
      });

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

  const select = (c: Customer) => {
    onChange(String(c.id), c);
    setOpen(false);
    setQuery("");
  };

  const clear = () => onChange("", null);

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
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-lg shadow-lg">
          <div className="p-2 border-b">
            <Input
              autoFocus
              placeholder="Search by name, email or phone..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
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
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                {query ? (
                  <>
                    No customers match &ldquo;{query}&rdquo; —{" "}
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
              filtered.map((c) => (
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
        onCreated={(c) => { onChange(String(c.id), c); setQuickAddOpen(false); }}
        prefillName={query}
      />
    </div>
  );
}
