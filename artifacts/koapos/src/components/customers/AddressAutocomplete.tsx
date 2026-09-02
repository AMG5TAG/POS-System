import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

export interface PickedAddress { street: string; city: string; state: string; postcode: string }

/**
 * Street-address input with server-backed autocomplete (Addressr / G-NAF).
 *
 * Progressive enhancement: it checks `/api/address/status` and only shows the
 * suggestion dropdown when a provider is configured server-side. Otherwise it
 * behaves as a plain text input, so nothing breaks when Addressr isn't set up.
 * On selecting a suggestion it calls `onPick` with the structured parts.
 *
 * Dropdown pattern (absolute list + outside-click) mirrors CustomerSearchInput;
 * debounce uses the shared useDebounce hook.
 */
export function AddressAutocomplete({
  value, onChange, onPick, onBlur, placeholder, className,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (a: PickedAddress) => void;
  onBlur?: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounce(search, 250);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/address/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => { if (!cancelled) setEnabled(!!d.enabled); })
      .catch(() => { /* leave disabled */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Fire the search once typing settles; cancellation guards against a late
  // response (or a response after unmount) overwriting fresher state.
  useEffect(() => {
    if (!enabled || debounced.trim().length < 3) { setResults([]); setOpen(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/address/search?q=${encodeURIComponent(debounced)}`, { credentials: "include" });
        const d = await r.json();
        if (cancelled) return;
        const items = (d.results ?? []) as { id: string; label: string }[];
        setResults(items);
        setOpen(items.length > 0);
      } catch { if (!cancelled) setResults([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [debounced, enabled]);

  const pick = async (id: string) => {
    setOpen(false);
    setSearch(""); // stop further searching for the picked value
    try {
      const r = await fetch(`/api/address/detail?id=${encodeURIComponent(id)}`, { credentials: "include" });
      if (!r.ok) return;
      onPick(await r.json() as PickedAddress);
    } catch { /* ignore */ }
  };

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setSearch(e.target.value); }}
        onFocus={() => { if (results.length) setOpen(true); }}
        onBlur={(e) => onBlur?.(e.target.value)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && enabled && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-56 overflow-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Searching…
            </div>
          )}
          {results.map((r) => (
            <button key={r.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r.id)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent">
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
