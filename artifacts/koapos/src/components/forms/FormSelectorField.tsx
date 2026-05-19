import { useState, useRef, useEffect } from "react";
import { useListForms } from "@/lib/forms-api";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ChevronDown, X, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormSelectorFieldProps {
  value: number[];
  onChange: (ids: number[]) => void;
  label?: string;
  className?: string;
}

export function FormSelectorField({ value, onChange, label = "Attach Forms", className }: FormSelectorFieldProps) {
  const { data: forms = [], isLoading } = useListForms();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = forms.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  function remove(id: number) {
    onChange(value.filter((v) => v !== id));
  }

  const selectedForms = forms.filter((f) => value.includes(f.id));

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="flex items-center gap-1.5">
        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
        {label}
        <span className="text-muted-foreground font-normal text-xs">(optional)</span>
      </Label>

      {/* Selected form badges */}
      {selectedForms.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedForms.map((f) => (
            <Badge
              key={f.id}
              variant="secondary"
              className="flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-normal"
            >
              <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="max-w-[160px] truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => remove(f.id)}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
                aria-label={`Remove ${f.name}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Dropdown trigger + popover */}
      <div ref={ref} className="relative">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-between text-sm font-normal h-9"
          onClick={() => { setOpen((o) => !o); setSearch(""); }}
          disabled={isLoading}
        >
          <span className="text-muted-foreground">
            {isLoading
              ? "Loading forms..."
              : forms.length === 0
              ? "No forms available"
              : value.length === 0
              ? "Select forms to attach..."
              : `${value.length} form${value.length !== 1 ? "s" : ""} selected`}
          </span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0", open && "rotate-180")} />
        </Button>

        {open && forms.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-xl shadow-xl z-50 overflow-hidden">
            {/* Search */}
            {forms.length > 5 && (
              <div className="flex items-center gap-2 px-3 py-2 border-b">
                <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search forms..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground/60"
                />
              </div>
            )}

            <div className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No forms match your search</p>
              ) : (
                filtered.map((form) => {
                  const selected = value.includes(form.id);
                  return (
                    <button
                      key={form.id}
                      type="button"
                      onClick={() => toggle(form.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/60 transition-colors",
                        selected && "bg-primary/5"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        selected ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}>
                        {selected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-medium truncate leading-snug", selected && "text-primary")}>{form.name}</p>
                        {form.description && (
                          <p className="text-xs text-muted-foreground truncate">{form.description}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{form.fields.length} fields</span>
                    </button>
                  );
                })
              )}
            </div>

            {value.length > 0 && (
              <div className="border-t px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{value.length} selected</span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
