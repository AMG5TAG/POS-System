import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronRight, ChevronDown, Search, X as XIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Category tree selector ─────────────────────────────────────────────── */

export type CatNode = { id: number; name: string; parentId: number | null; children: CatNode[] };

export function buildCatTree(cats: { id: number; name: string; parentId?: number | null }[]): CatNode[] {
  const map = new Map<number, CatNode>();
  cats.forEach((c) => map.set(c.id, { id: c.id, name: c.name, parentId: c.parentId ?? null, children: [] }));
  const roots: CatNode[] = [];
  map.forEach((node) => {
    if (node.parentId != null && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export function TreeCategorySelect({
  categories, value, onChange, placeholder = "No Category", triggerClass, onCreateCategory,
  disabledIds, showClearOption = true,
}: {
  categories: { id: number; name: string; parentId?: number | null }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  triggerClass?: string;
  onCreateCategory?: (name: string, onCreated: (id: number) => void) => void;
  /** Categories rendered greyed-out and non-selectable (e.g. already used). */
  disabledIds?: Set<number>;
  /** Show the top "clear / no category" row. Defaults to true. */
  showClearOption?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [creatingInline, setCreatingInline] = useState(false);
  const [newCatNameInline, setNewCatNameInline] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const tree = buildCatTree(categories);
  const selected = categories.find((c) => c.id.toString() === value);
  const isDisabled = (id: number) => disabledIds?.has(id) ?? false;

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
    else setSearch("");
  }, [open]);

  const toggleExpand = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const searchLower = search.toLowerCase().trim();
  const filteredFlat = searchLower
    ? categories.filter((c) => c.name.toLowerCase().includes(searchLower))
    : null;

  const renderNodes = (nodes: CatNode[], depth = 0): React.ReactNode =>
    nodes.map((node) => {
      const isExpanded = expanded.has(node.id);
      const hasChildren = node.children.length > 0;
      const disabled = isDisabled(node.id);
      return (
        <div key={node.id}>
          <div
            className={cn(
              "flex items-center rounded transition-colors",
              !disabled && "hover:bg-muted",
              value === node.id.toString() && "bg-primary/10",
            )}
            style={{ paddingLeft: `${(depth > 0 ? 4 : 0) + depth * 12}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.id, e)}
                className="shrink-0 p-1 text-muted-foreground/50 hover:text-foreground"
              >
                <ChevronRight className={cn("w-3 h-3 transition-transform duration-150", isExpanded && "rotate-90")} />
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => { onChange(node.id.toString()); setOpen(false); }}
              className={cn(
                "flex-1 text-left py-1.5 pr-2 text-sm",
                disabled
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : value === node.id.toString() ? "text-primary font-medium" : "text-foreground",
              )}
            >
              {node.name}
            </button>
          </div>
          {isExpanded && hasChildren && renderNodes(node.children, depth + 1)}
        </div>
      );
    });

  const commitNewCat = () => {
    if (!newCatNameInline.trim() || !onCreateCategory) return;
    onCreateCategory(newCatNameInline.trim(), (id) => {
      onChange(id.toString());
      setOpen(false);
    });
    setCreatingInline(false);
    setNewCatNameInline("");
  };

  return (
    <Popover open={open} onOpenChange={(o) => { if (!o) { setCreatingInline(false); setNewCatNameInline(""); } setOpen(o); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            triggerClass,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.name ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-56" align="start">
        {/* Search bar */}
        <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories…"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="text-muted-foreground/50 hover:text-foreground">
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </div>
        {/* Scrollable list */}
        <div className="overflow-y-auto max-h-[240px] p-1.5">
          {showClearOption && (
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className={cn(
                "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors",
                !value && "bg-primary/10 text-primary font-medium",
              )}
            >
              {placeholder}
            </button>
          )}
          {filteredFlat
            ? filteredFlat.length > 0
              ? filteredFlat.map((c) => {
                  const disabled = isDisabled(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => { onChange(c.id.toString()); setOpen(false); }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 text-sm rounded transition-colors",
                        disabled
                          ? "text-muted-foreground/40 cursor-not-allowed"
                          : cn("hover:bg-muted", value === c.id.toString() && "bg-primary/10 text-primary font-medium"),
                      )}
                    >
                      {c.name}
                      {c.parentId && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          · {categories.find((p) => p.id === c.parentId)?.name}
                        </span>
                      )}
                    </button>
                  );
                })
              : <p className="px-2 py-3 text-xs text-muted-foreground text-center">No categories found</p>
            : renderNodes(tree)}
        </div>
        {/* Add new category */}
        {onCreateCategory && (
          creatingInline ? (
            <div className="border-t p-1.5 flex items-center gap-1.5">
              <input
                autoFocus
                value={newCatNameInline}
                onChange={(e) => setNewCatNameInline(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitNewCat(); }
                  if (e.key === "Escape") { setCreatingInline(false); setNewCatNameInline(""); }
                }}
                placeholder="Category name…"
                className="flex-1 text-sm border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-ring bg-background"
              />
              <button type="button" onClick={commitNewCat} className="text-xs text-primary font-medium hover:underline whitespace-nowrap">Add</button>
              <button type="button" onClick={() => { setCreatingInline(false); setNewCatNameInline(""); }} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingInline(true)}
              className="w-full text-left px-2 py-1.5 text-xs text-primary font-medium border-t flex items-center gap-1.5 hover:bg-muted/50 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add New Category
            </button>
          )
        )}
      </PopoverContent>
    </Popover>
  );
}
