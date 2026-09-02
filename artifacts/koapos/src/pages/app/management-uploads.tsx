import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search, Loader2, ImageIcon, Video, FileText, Trash2, Repeat, HardDrive,
  Upload, ExternalLink, AlertTriangle, Recycle, ArrowRight, Link2Off,
  CheckSquare, X, Check,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/upload";
import {
  useListMerchantAssets,
  useDeleteMerchantAsset,
  useBulkDeleteMerchantAssets,
  useReplaceMerchantAsset,
  useImportMerchantAssets,
  useSweepMerchantAssetOrphans,
  type MerchantAsset,
  type ListMerchantAssetsKind,
} from "@workspace/api-client-react";

/**
 * Uploads — the merchant's whole media library on one page.
 *
 * Everything else that touches storage does so through a picker nested in a
 * form, so until now there was no way to see what a file is actually attached
 * to, or to swap one out. This page is that view: browse by kind, see the rows
 * pointing at each file, and replace or delete from one place.
 *
 * Replacing rewrites references and cannot be undone, so it is always preceded
 * by a confirmation listing exactly which rows will change.
 */

const KINDS = [
  { value: "all",      label: "All files"  },
  { value: "image",    label: "Images"     },
  { value: "video",    label: "Videos"     },
  { value: "document", label: "Documents"  },
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** "product_return_auths" → "Product return auths". */
function humanizeEntity(entity: string): string {
  const words = entity.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** How a reference reads in the "Attached to" list. */
function describeReference(ref: { entity: string; column: string; id?: string | null; label?: string | null }): string {
  if (ref.label) return ref.label;
  if (ref.id) return `${humanizeEntity(ref.entity)} #${ref.id}`;
  return humanizeEntity(ref.entity);
}

function kindOf(asset: MerchantAsset): "image" | "video" | "document" {
  if (asset.kind) return asset.kind;
  if (asset.contentType.startsWith("image/")) return "image";
  if (asset.contentType.startsWith("video/")) return "video";
  return "document";
}

/** Square preview used in the grid and in the replace confirmation. */
function AssetPreview({ asset, className }: { asset: MerchantAsset; className?: string }) {
  const kind = kindOf(asset);

  if (kind === "image") {
    return (
      <img
        src={asset.url}
        alt={asset.filename ?? ""}
        loading="lazy"
        className={cn("w-full h-full object-cover", className)}
      />
    );
  }

  if (kind === "video") {
    return (
      <video
        src={asset.url}
        muted
        playsInline
        preload="metadata"
        className={cn("w-full h-full object-cover", className)}
      />
    );
  }

  return (
    <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1 bg-muted/30", className)}>
      <FileText className="w-7 h-7 text-muted-foreground/50" />
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">
        {asset.contentType.split("/").pop()?.slice(0, 8)}
      </span>
    </div>
  );
}

export default function ManagementUploadsPage() {
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ListMerchantAssetsKind>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  // Debounced so typing does not fire a reference scan per keystroke — the
  // scan is the expensive half of this request.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useListMerchantAssets({
    limit: 200,
    withReferences: true,
    kind,
    ...(search ? { search } : {}),
  });

  const assets = useMemo(() => data?.assets ?? [], [data]);
  const selected = assets.find((a) => a.id === selectedId) ?? null;

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["/api/storage/assets"] }),
    [queryClient],
  );

  // A file removed or filtered out from under the selection would otherwise
  // leave the detail panel showing a stale asset.
  useEffect(() => {
    if (selectedId !== null && !assets.some((a) => a.id === selectedId)) setSelectedId(null);
  }, [assets, selectedId]);

  // Anything that leaves the grid must leave the selection too, or the
  // confirmation would count files the merchant can no longer see.
  useEffect(() => {
    setCheckedIds((prev) => {
      const live = new Set(assets.map((a) => a.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [assets]);

  const checkedAssets = useMemo(
    () => assets.filter((a) => checkedIds.has(a.id)),
    [assets, checkedIds],
  );

  const toggleChecked = useCallback((id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const leaveSelectMode = useCallback(() => {
    setSelectMode(false);
    setCheckedIds(new Set());
  }, []);

  const deleteAsset = useDeleteMerchantAsset();
  const bulkDelete = useBulkDeleteMerchantAssets();
  const importAssets = useImportMerchantAssets();
  const sweepOrphans = useSweepMerchantAssetOrphans();

  const handleDelete = async (asset: MerchantAsset) => {
    if ((asset.usageCount ?? 0) > 0) {
      toast.error("Still in use", {
        description: "Detach it from everything below, or replace it, before deleting.",
      });
      return;
    }
    if (!confirm(`Delete “${asset.filename ?? "this file"}” permanently? The stored file is removed and cannot be recovered.`)) return;

    try {
      const body = await deleteAsset.mutateAsync({ id: asset.id });
      setSelectedId(null);
      await invalidate();
      toast.success(`Deleted — ${formatBytes(body.reclaimedBytes ?? 0)} reclaimed`);
    } catch {
      toast.error("Could not delete this file");
    }
  };

  const handleBulkDelete = async () => {
    const ids = checkedAssets.map((a) => a.id);
    if (ids.length === 0) return;

    try {
      const body = await bulkDelete.mutateAsync({ data: { assetIds: ids } });
      setBulkOpen(false);
      setSelectedId(null);
      leaveSelectMode();
      await invalidate();

      // The server decides what was actually removable, so report its answer
      // rather than what was selected.
      const parts: string[] = [];
      if (body.skipped.length) parts.push(`${body.skipped.length} still in use`);
      if (body.failed.length) parts.push(`${body.failed.length} could not be removed`);
      if (body.notFound.length) parts.push(`${body.notFound.length} no longer exist`);

      if (body.deleted === 0) {
        toast.error("Nothing was deleted", { description: parts.join(" · ") || undefined });
        return;
      }
      toast.success(
        `Deleted ${body.deleted} file${body.deleted === 1 ? "" : "s"} — ${formatBytes(body.reclaimedBytes)} reclaimed`,
        { description: parts.length ? `Left alone: ${parts.join(" · ")}` : undefined },
      );
    } catch {
      toast.error("Could not delete these files");
    }
  };

  const handleImport = async () => {
    try {
      const body = await importAssets.mutateAsync();
      await invalidate();
      toast.success(
        body.imported > 0
          ? `Added ${body.imported} existing upload${body.imported === 1 ? "" : "s"}`
          : "Your library is already up to date",
      );
    } catch {
      toast.error("Could not import existing uploads");
    }
  };

  // Dry run only — this page never passes apply=true, so nothing is deleted.
  const handleFindOrphans = async () => {
    try {
      const body = await sweepOrphans.mutateAsync({ params: { apply: false } });
      toast.info(
        body.orphans.length === 0
          ? "No unreferenced leftovers in storage"
          : `${body.orphans.length} unreferenced file${body.orphans.length === 1 ? "" : "s"} in storage`,
        {
          description: body.orphans.length
            ? `${formatBytes(body.reclaimableBytes ?? 0)} could be reclaimed. Use “Import existing” to bring them into the library first.`
            : undefined,
        },
      );
    } catch {
      toast.error("Could not scan storage");
    }
  };

  const totalBytes = data?.totalBytes ?? 0;
  const total = data?.total ?? 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Uploads</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Every image, video and document you have uploaded, and what each one is attached to.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={selectMode ? "secondary" : "outline"}
              onClick={() => (selectMode ? leaveSelectMode() : setSelectMode(true))}
            >
              {selectMode ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
              <span className="ml-1.5">{selectMode ? "Cancel selection" : "Select"}</span>
            </Button>
            <Button type="button" variant="outline" onClick={handleFindOrphans} disabled={sweepOrphans.isPending}>
              {sweepOrphans.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Recycle className="w-4 h-4" />}
              <span className="ml-1.5">Find leftovers</span>
            </Button>
            <Button type="button" variant="outline" onClick={handleImport} disabled={importAssets.isPending}>
              {importAssets.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
              <span className="ml-1.5">Import existing</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Library */}
          <div className="rounded-xl border">
            <div className="p-4 border-b space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by filename…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={kind} onValueChange={(v) => setKind(v as ListMerchantAssetsKind)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  {total} file{total === 1 ? "" : "s"}
                  {isFetching && !isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                </span>
                <span>{formatBytes(totalBytes)} stored</span>
              </div>

              {selectMode && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                  <span className="text-xs text-muted-foreground pt-2">
                    {checkedIds.size} selected
                  </span>
                  <div className="flex flex-wrap gap-1.5 pt-2 ml-auto">
                    {/* Unused files are the ones a bulk delete can actually
                        remove, so make that the one-click case. */}
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => setCheckedIds(new Set(
                        assets.filter((a) => (a.usageCount ?? 0) === 0).map((a) => a.id),
                      ))}
                    >
                      Select unused
                    </Button>
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => setCheckedIds(new Set(assets.map((a) => a.id)))}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button" size="sm" variant="ghost"
                      onClick={() => setCheckedIds(new Set())}
                      disabled={checkedIds.size === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 max-h-[calc(100vh-20rem)] overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {!isLoading && assets.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
                  <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {search || kind !== "all" ? "Nothing matches those filters." : "No uploads yet."}
                  </p>
                  {!search && kind === "all" && (
                    <p className="text-xs text-muted-foreground/70 max-w-sm">
                      Uploaded before this library existed? Use “Import existing” to pull those files in.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3">
                {assets.map((asset) => {
                  const used = asset.usageCount ?? 0;
                  const checked = checkedIds.has(asset.id);
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => (selectMode ? toggleChecked(asset.id) : setSelectedId(asset.id))}
                      aria-pressed={selectMode ? checked : undefined}
                      className={cn(
                        "text-left rounded-lg border overflow-hidden transition-all",
                        selectMode && checked
                          ? "border-primary ring-2 ring-primary/40"
                          : !selectMode && asset.id === selectedId
                            ? "border-primary ring-2 ring-primary/30"
                            : "hover:border-primary/50",
                      )}
                    >
                      <div className="aspect-square bg-muted/20 relative">
                        <AssetPreview asset={asset} />
                        {selectMode && (
                          <span
                            className={cn(
                              "absolute top-1 left-1 w-5 h-5 rounded border flex items-center justify-center shadow-sm",
                              checked ? "bg-primary border-primary text-primary-foreground" : "bg-background/85",
                            )}
                          >
                            {checked && <Check className="w-3.5 h-3.5" />}
                          </span>
                        )}
                        {used === 0 && (
                          <span
                            title="Nothing points at this file"
                            className="absolute top-1 right-1 rounded-full bg-background/85 p-1 shadow-sm"
                          >
                            <Link2Off className="w-3 h-3 text-muted-foreground" />
                          </span>
                        )}
                      </div>
                      <div className="p-1.5">
                        <p className="text-[10px] truncate" title={asset.filename ?? ""}>
                          {asset.filename ?? "Untitled"}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70">
                          {formatBytes(asset.sizeBytes)} · used {used}×
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Detail */}
          <div className="rounded-xl border">
            {!selected ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-center px-6">
                <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Select a file to see what it is attached to.</p>
              </div>
            ) : (
              <AssetDetail
                asset={selected}
                onReplace={() => setReplaceOpen(true)}
                onDelete={() => void handleDelete(selected)}
                deleting={deleteAsset.isPending}
              />
            )}
          </div>
        </div>
      </div>

      {selectMode && checkedIds.size > 0 && (
        <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur px-6 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm">
            <span className="font-semibold">{checkedIds.size}</span> selected
            <span className="text-muted-foreground">
              {" · "}{formatBytes(checkedAssets.reduce((sum, a) => sum + a.sizeBytes, 0))}
            </span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={leaveSelectMode}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => setBulkOpen(true)}>
              <Trash2 className="w-4 h-4" />
              <span className="ml-1.5">Delete selected…</span>
            </Button>
          </div>
        </div>
      )}

      {selected && (
        <ReplaceAssetDialog
          open={replaceOpen}
          onOpenChange={setReplaceOpen}
          original={selected}
          library={assets}
          onReplaced={async () => { setReplaceOpen(false); await invalidate(); }}
        />
      )}

      <BulkDeleteDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        assets={checkedAssets}
        onConfirm={handleBulkDelete}
        deleting={bulkDelete.isPending}
      />
    </AppLayout>
  );
}

/* ── Bulk delete ──────────────────────────────────────────────────────────── */

/**
 * The confirmation for the one irreversible action on this page that can hit
 * many files at once.
 *
 * Deleting removes the stored file itself, so the dialog names every file
 * rather than showing a count: "delete 34 files" gives the merchant nothing to
 * check against. In-use files are split out first, because the server will
 * refuse those and the merchant should know that before confirming, not from
 * the toast afterwards.
 */
function BulkDeleteDialog({
  open, onOpenChange, assets, onConfirm, deleting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: MerchantAsset[];
  onConfirm: () => void | Promise<void>;
  deleting: boolean;
}) {
  const [deletable, inUse] = useMemo(() => [
    assets.filter((a) => (a.usageCount ?? 0) === 0),
    assets.filter((a) => (a.usageCount ?? 0) > 0),
  ], [assets]);

  const freedBytes = deletable.reduce((sum, a) => sum + a.sizeBytes, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delete {deletable.length} file{deletable.length === 1 ? "" : "s"}?</DialogTitle>
          <DialogDescription>
            This permanently removes the stored files and frees {formatBytes(freedBytes)}.
            They cannot be recovered — you would have to upload them again.
          </DialogDescription>
        </DialogHeader>

        {inUse.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              {inUse.length} of your selection {inUse.length === 1 ? "is" : "are"} still in use and will be kept
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
              {inUse.map((a) => (
                <li key={a.id} className="truncate">
                  {a.filename ?? "Untitled"} — used {a.usageCount}×
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Replace or detach them first if you need them gone.
            </p>
          </div>
        )}

        {deletable.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing in this selection can be deleted yet.
          </p>
        ) : (
          <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
            {deletable.map((asset) => (
              <div key={asset.id} className="flex items-center gap-3 p-2">
                <div className="w-10 h-10 shrink-0 rounded border overflow-hidden bg-muted/20">
                  <AssetPreview asset={asset} />
                </div>
                <span className="text-sm truncate flex-1" title={asset.filename ?? ""}>
                  {asset.filename ?? "Untitled"}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatBytes(asset.sizeBytes)}
                </span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void onConfirm()}
            disabled={deleting || deletable.length === 0}
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span className="ml-1.5">
              Delete {deletable.length} file{deletable.length === 1 ? "" : "s"} permanently
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Detail panel ─────────────────────────────────────────────────────────── */

function AssetDetail({
  asset, onReplace, onDelete, deleting,
}: {
  asset: MerchantAsset;
  onReplace: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const refs = asset.references ?? [];
  const kind = kindOf(asset);
  const KindIcon = kind === "video" ? Video : kind === "image" ? ImageIcon : FileText;

  // One line per table, so "12 products" reads as a group rather than 12 rows.
  const grouped = useMemo(() => {
    const byEntity = new Map<string, typeof refs>();
    for (const r of refs) {
      if (!byEntity.has(r.entity)) byEntity.set(r.entity, []);
      byEntity.get(r.entity)!.push(r);
    }
    return Array.from(byEntity.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [refs]);

  return (
    <div className="divide-y">
      <div className="p-4 flex gap-4">
        <div className="w-28 h-28 shrink-0 rounded-lg border overflow-hidden bg-muted/20">
          <AssetPreview asset={asset} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium truncate" title={asset.filename ?? ""}>
            {asset.filename ?? "Untitled"}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="gap-1">
              <KindIcon className="w-3 h-3" />
              {kind}
            </Badge>
            <Badge variant="outline">{formatBytes(asset.sizeBytes)}</Badge>
            {asset.width && asset.height && (
              <Badge variant="outline">{asset.width}×{asset.height}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Uploaded {new Date(asset.createdAt).toLocaleDateString()}
          </p>
          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            Open original <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Attached to
          </p>
          <span className="text-xs text-muted-foreground">
            {refs.length} reference{refs.length === 1 ? "" : "s"}
          </span>
        </div>

        {refs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing points at this file. It is safe to delete.
          </p>
        ) : (
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {grouped.map(([entity, entries]) => (
              <div key={entity}>
                <p className="text-xs font-medium mb-1">
                  {humanizeEntity(entity)}
                  <span className="text-muted-foreground font-normal"> · {entries.length}</span>
                </p>
                <ul className="space-y-0.5">
                  {entries.map((r, i) => (
                    <li key={`${r.column}-${r.id ?? i}`} className="text-xs text-muted-foreground truncate">
                      {describeReference(r)}
                      <span className="text-muted-foreground/60"> — {r.column}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onReplace}>
          <Repeat className="w-4 h-4" />
          <span className="ml-1.5">Replace…</span>
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={onDelete}
          disabled={deleting || refs.length > 0}
          title={refs.length > 0 ? "Replace or detach it first — deleting would break these references" : undefined}
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          <span className="ml-1.5">Delete</span>
        </Button>
      </div>
    </div>
  );
}

/* ── Replace ──────────────────────────────────────────────────────────────── */

/**
 * Two steps on purpose. Picking the replacement is reversible; confirming is
 * not, so the second step spells out exactly which rows are about to change
 * before the rewrite is allowed to run.
 */
function ReplaceAssetDialog({
  open, onOpenChange, original, library, onReplaced,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  original: MerchantAsset;
  library: MerchantAsset[];
  onReplaced: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [replacement, setReplacement] = useState<MerchantAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const replaceAsset = useReplaceMerchantAsset();
  const refs = original.references ?? [];

  // Reset whenever the dialog opens, so a previous pick never carries over
  // onto a different file.
  useEffect(() => {
    if (open) { setStep("pick"); setReplacement(null); }
  }, [open, original.id]);

  const candidates = library.filter((a) => a.id !== original.id);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadFile(file);
      if (!result.assetId) throw new Error("Upload did not register a library entry");
      setReplacement({
        id: result.assetId,
        objectPath: result.objectPath,
        url: result.url,
        contentType: file.type,
        sizeBytes: file.size,
        filename: file.name,
        createdAt: new Date().toISOString(),
      });
      toast.success(result.deduped ? "Using a copy already in your library" : "Uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const handleConfirm = async () => {
    if (!replacement) return;
    try {
      const body = await replaceAsset.mutateAsync({
        id: original.id,
        data: { replacementAssetId: replacement.id },
      });
      toast.success(
        body.replaced === 0
          ? "Nothing was pointing at that file"
          : `Repointed ${body.replaced} row${body.replaced === 1 ? "" : "s"}`,
      );
      await onReplaced();
    } catch {
      toast.error("Could not replace this file — nothing was changed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {step === "pick" ? (
          <>
            <DialogHeader>
              <DialogTitle>Replace “{original.filename ?? "this file"}”</DialogTitle>
              <DialogDescription>
                Choose the file that should take its place. Everything currently pointing at
                the original will be repointed at your choice.
              </DialogDescription>
            </DialogHeader>

            <div>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="ml-1.5">Upload a new file</span>
              </Button>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              …or pick one already in your library
            </p>

            <div className="max-h-[40vh] overflow-y-auto -mx-1 px-1">
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nothing else in your library yet — upload a file above.
                </p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {candidates.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setReplacement(a)}
                      className={cn(
                        "rounded-lg border overflow-hidden aspect-square bg-muted/20 transition-all",
                        replacement?.id === a.id
                          ? "border-primary ring-2 ring-primary/30"
                          : "hover:border-primary/50",
                      )}
                      title={a.filename ?? ""}
                    >
                      <AssetPreview asset={a} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" disabled={!replacement} onClick={() => setStep("confirm")}>
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm replacement</DialogTitle>
              <DialogDescription>
                Review what is about to change. This rewrites stored references and cannot be undone.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-center gap-6 py-2">
              <div className="text-center">
                <div className="w-24 h-24 rounded-lg border overflow-hidden bg-muted/20">
                  <AssetPreview asset={original} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 max-w-24 truncate">
                  {original.filename ?? "Original"}
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="text-center">
                <div className="w-24 h-24 rounded-lg border-2 border-primary overflow-hidden bg-muted/20">
                  {replacement && <AssetPreview asset={replacement} />}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 max-w-24 truncate">
                  {replacement?.filename ?? "Replacement"}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1.5">
                <p className="font-medium text-foreground">
                  {refs.length === 0
                    ? "Nothing currently points at this file."
                    : `${refs.length} reference${refs.length === 1 ? "" : "s"} will be rewritten.`}
                </p>
                <p className="text-muted-foreground">
                  The previous value is overwritten in place and is not kept anywhere — the only
                  way back is to run a replacement in the opposite direction. Neither file is
                  deleted; the original stays in your library with nothing attached.
                </p>
              </div>
            </div>

            {refs.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                {refs.map((r, i) => (
                  <div key={`${r.entity}-${r.column}-${r.id ?? i}`} className="px-3 py-1.5 text-xs flex items-baseline gap-2">
                    <span className="text-muted-foreground shrink-0">{humanizeEntity(r.entity)}</span>
                    <span className="truncate">{describeReference(r)}</span>
                    <span className="text-muted-foreground/60 ml-auto shrink-0">{r.column}</span>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("pick")} disabled={replaceAsset.isPending}>
                Back
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={replaceAsset.isPending}>
                {replaceAsset.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                {refs.length === 0
                  ? "Replace anyway"
                  : `Replace ${refs.length} reference${refs.length === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
