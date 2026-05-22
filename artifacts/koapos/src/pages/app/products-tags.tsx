import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Hash, Search, Pencil, Trash2, Merge, Tag,
  ChevronUp, ChevronDown, ChevronsUpDown, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type TagEntry = { name: string; productCount: number };
type SortKey  = "name" | "productCount";
type SortDir  = "asc" | "desc";

const API_BASE = "/api/products/tags";
const hdrs     = { "Content-Type": "application/json" };

/* ─── Sort icon ──────────────────────────────────────────────────────────── */

function SortIcon({ k, sortKey, sortDir }: { k: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (sortKey !== k) return <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground/40" />;
  return sortDir === "asc"
    ? <ChevronUp   className="w-3.5 h-3.5 text-foreground" />
    : <ChevronDown className="w-3.5 h-3.5 text-foreground" />;
}

/* ─── Deterministic tag colour ───────────────────────────────────────────── */

const TAG_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
];

function tagColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}

/* ─── Rename dialog ──────────────────────────────────────────────────────── */

function RenameDialog({
  tag, open, onClose, onRenamed,
}: { tag: TagEntry | null; open: boolean; onClose: () => void; onRenamed: () => void }) {
  const [newName, setNewName] = useState("");
  const [saving, setSaving]   = useState(false);

  useEffect(() => { if (open && tag) setNewName(tag.name); }, [open, tag]);

  const handleSave = async () => {
    if (!newName.trim() || !tag) return;
    if (newName.trim() === tag.name) { onClose(); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/rename`, {
        method: "POST", headers: hdrs, credentials: "include",
        body: JSON.stringify({ oldName: tag.name, newName: newName.trim() }),
      });
      if (!r.ok) { toast.error("Failed to rename tag"); return; }
      const { updated } = await r.json() as { updated: number };
      toast.success(`Tag renamed · ${updated} product${updated !== 1 ? "s" : ""} updated`);
      onRenamed();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" /> Rename Tag
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {tag && (
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              <span>Renaming</span>
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", tagColor(tag.name))}>
                <Hash className="w-3 h-3" />{tag.name}
              </span>
              <span>across {tag.productCount} product{tag.productCount !== 1 ? "s" : ""}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">New tag name</Label>
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
              placeholder="e.g. new-release"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving || !newName.trim()}>
              {saving ? "Saving…" : "Rename"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Merge dialog ───────────────────────────────────────────────────────── */

function MergeDialog({
  tags, open, onClose, onMerged, preSelected,
}: { tags: TagEntry[]; open: boolean; onClose: () => void; onMerged: () => void; preSelected: Set<string> }) {
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [targetName, setTargetName] = useState("");
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(preSelected));
      const arr = [...preSelected];
      setTargetName(arr.length === 1 ? arr[0] : "");
    }
  }, [open, preSelected]);

  const toggle = (name: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const affectedCount = tags
    .filter(t => selected.has(t.name))
    .reduce((s, t) => s + t.productCount, 0);

  const handleMerge = async () => {
    if (selected.size < 2 || !targetName.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/merge`, {
        method: "POST", headers: hdrs, credentials: "include",
        body: JSON.stringify({ sourceTags: [...selected], targetName: targetName.trim() }),
      });
      if (!r.ok) { toast.error("Failed to merge tags"); return; }
      const { updated } = await r.json() as { updated: number };
      toast.success(`Merged ${selected.size} tags → "${targetName.trim()}" · ${updated} product${updated !== 1 ? "s" : ""} updated`);
      onMerged();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="w-4 h-4" /> Merge Tags
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">
            Select 2+ tags to merge. All selected tags will be replaced by the target name on every affected product.
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tags to merge (select 2+)</Label>
            <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
              {tags.map(t => (
                <label key={t.name} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={selected.has(t.name)}
                    onChange={() => toggle(t.name)}
                    className="accent-primary"
                  />
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", tagColor(t.name))}>
                    <Hash className="w-2.5 h-2.5" />{t.name}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {t.productCount} product{t.productCount !== 1 ? "s" : ""}
                  </span>
                </label>
              ))}
            </div>
            {selected.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {selected.size} tag{selected.size !== 1 ? "s" : ""} selected
                {affectedCount > 0 && ` · ~${affectedCount} product${affectedCount !== 1 ? "s" : ""} will be updated`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Merge into this tag name</Label>
            <Input
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleMerge(); }}
              placeholder="Target tag name…"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => void handleMerge()}
              disabled={saving || selected.size < 2 || !targetName.trim()}
            >
              {saving ? "Merging…" : `Merge ${selected.size > 0 ? selected.size + " " : ""}Tags`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Delete confirmation ────────────────────────────────────────────────── */

function DeleteDialog({
  tag, open, onClose, onDeleted,
}: { tag: TagEntry | null; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [saving, setSaving] = useState(false);

  const handleDelete = async () => {
    if (!tag) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/delete`, {
        method: "POST", headers: hdrs, credentials: "include",
        body: JSON.stringify({ name: tag.name }),
      });
      if (!r.ok) { toast.error("Failed to delete tag"); return; }
      const { updated } = await r.json() as { updated: number };
      toast.success(`Tag "${tag.name}" removed from ${updated} product${updated !== 1 ? "s" : ""}`);
      onDeleted();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" /> Delete Tag
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {tag && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Remove{" "}
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", tagColor(tag.name))}>
                <Hash className="w-3 h-3" />{tag.name}
              </span>{" "}
              from all {tag.productCount} product{tag.productCount !== 1 ? "s" : ""}?
              This cannot be undone.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving}>
              {saving ? "Deleting…" : "Delete Tag"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function ProductsTagsPage() {
  const [tags, setTags]       = useState<TagEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("productCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* merge selection */
  const [mergeSelected, setMergeSelected]       = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen]               = useState(false);
  const [mergePreSelected, setMergePreSelected] = useState<Set<string>>(new Set());

  /* per-row dialogs */
  const [renameTag, setRenameTag] = useState<TagEntry | null>(null);
  const [deleteTag, setDeleteTag] = useState<TagEntry | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(API_BASE, { credentials: "include" });
      if (r.ok) setTags((await r.json() as { items: TagEntry[] }).items);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "productCount" ? "desc" : "asc"); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...tags]
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .sort((a, b) => {
        let r = 0;
        if (sortKey === "name")         r = a.name.localeCompare(b.name);
        if (sortKey === "productCount") r = a.productCount - b.productCount;
        return sortDir === "asc" ? r : -r;
      });
  }, [tags, search, sortKey, sortDir]);

  const toggleMergeSelect = (name: string) =>
    setMergeSelected(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const openMerge = (preSelected?: Set<string>) => {
    setMergePreSelected(preSelected ?? mergeSelected);
    setMergeOpen(true);
  };

  const allPageSelected = filtered.length > 0 && filtered.every(t => mergeSelected.has(t.name));

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Product Tags</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              All tags used across your product catalogue. Rename, merge, or remove them in bulk.
            </p>
          </div>
          {mergeSelected.size >= 2 && (
            <Button className="gap-1.5 shrink-0" onClick={() => openMerge()}>
              <Merge className="w-4 h-4" />
              Merge {mergeSelected.size} Tags
            </Button>
          )}
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tags…"
                className="pl-9 w-52"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {mergeSelected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-primary font-medium">{mergeSelected.size} selected</span>
                {mergeSelected.size === 1 && (
                  <span className="text-xs text-muted-foreground">— select 1 more to merge</span>
                )}
                <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => setMergeSelected(new Set())}>
                  <X className="w-3 h-3" /> Clear
                </Button>
              </div>
            )}
          </div>
          <span className="text-sm text-muted-foreground shrink-0">
            {filtered.length} tag{filtered.length !== 1 ? "s" : ""}
            {tags.length !== filtered.length && ` of ${tags.length}`}
          </span>
        </div>

        {/* ── Empty states ── */}
        {!loading && tags.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Tag className="w-14 h-14 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No product tags yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Add tags to products on the Products page — they'll appear here automatically.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading tags…</div>
        )}

        {!loading && filtered.length === 0 && tags.length > 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No tags match &ldquo;{search}&rdquo;
          </div>
        )}

        {/* ── Merge tip ── */}
        {!loading && tags.length > 1 && mergeSelected.size === 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Check className="w-3 h-3" />
            Tip: tick two or more tags in the table below to merge them.
          </p>
        )}

        {/* ── Table ── */}
        {!loading && filtered.length > 0 && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={() => {
                          setMergeSelected(prev => {
                            const n = new Set(prev);
                            if (allPageSelected) filtered.forEach(t => n.delete(t.name));
                            else                 filtered.forEach(t => n.add(t.name));
                            return n;
                          });
                        }}
                        className="accent-primary rounded"
                      />
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      <button className="flex items-center gap-1.5 hover:text-foreground transition-colors" onClick={() => toggleSort("name")}>
                        Tag <SortIcon k="name" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      <button className="flex items-center gap-1.5 hover:text-foreground transition-colors" onClick={() => toggleSort("productCount")}>
                        Products <SortIcon k="productCount" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-4 py-3 w-32" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tag, idx) => {
                    const isSelected = mergeSelected.has(tag.name);
                    return (
                      <tr
                        key={tag.name}
                        className={cn(
                          "border-b last:border-0 transition-colors",
                          isSelected ? "bg-primary/5" : idx % 2 === 0 ? "" : "bg-muted/5",
                        )}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleMergeSelect(tag.name)}
                            className="accent-primary rounded"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                            tagColor(tag.name),
                          )}>
                            <Hash className="w-3 h-3 shrink-0" />
                            {tag.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {tag.productCount} product{tag.productCount !== 1 ? "s" : ""}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-0.5 justify-end">
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              title="Rename tag"
                              onClick={() => setRenameTag(tag)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              title="Merge with other tags"
                              onClick={() => openMerge(new Set([tag.name]))}
                            >
                              <Merge className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title="Delete tag"
                              onClick={() => setDeleteTag(tag)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-muted/10">
                {tags.length} unique tag{tags.length !== 1 ? "s" : ""} across your product catalogue
              </div>
            </div>
          </Card>
        )}
      </div>

      <RenameDialog
        tag={renameTag}
        open={!!renameTag}
        onClose={() => setRenameTag(null)}
        onRenamed={load}
      />
      <MergeDialog
        tags={tags}
        open={mergeOpen}
        onClose={() => { setMergeOpen(false); setMergeSelected(new Set()); }}
        onMerged={() => { void load(); setMergeSelected(new Set()); }}
        preSelected={mergePreSelected}
      />
      <DeleteDialog
        tag={deleteTag}
        open={!!deleteTag}
        onClose={() => setDeleteTag(null)}
        onDeleted={load}
      />
    </AppLayout>
  );
}
