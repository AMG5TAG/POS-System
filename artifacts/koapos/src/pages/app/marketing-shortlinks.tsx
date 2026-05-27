import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link2, Copy, Trash2, ExternalLink, Clock, Plus, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useListShortlinks,
  useCreateShortlink,
  useDeleteShortlink,
  useGetShortlinkSettings,
} from "@workspace/api-client-react";

type ShortlinkFromApi = {
  id?: number;
  linkId?: string | number;
  label?: string;
  longUrl?: string;
  slug?: string;
  baseDomain?: string;
  tags?: string;
  clicks?: number;
  createdAt?: string;
};

function randomSlug(len = 6): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function buildShortUrl(entry: ShortlinkFromApi): string {
  return `https://${entry.baseDomain || "go.koapos.com"}/${entry.slug || entry.linkId}`;
}

export default function MarketingShortlinksPage() {
  const { data: linksRaw = [], refetch } = useListShortlinks({ query: { queryKey: ["shortlinks"] } });
  const { data: settingsRaw } = useGetShortlinkSettings({ query: { queryKey: ["shortlink-settings"] } });
  const createShortlink = useCreateShortlink();
  const deleteShortlink = useDeleteShortlink();

  const links = linksRaw as ShortlinkFromApi[];
  const settings = settingsRaw as Record<string, unknown> | undefined;
  const baseDomain = (settings?.baseDomain as string) || "go.koapos.com";
  const prefix = (settings?.prefix as string) || "s";

  const [longUrl, setLongUrl]   = useState("https://");
  const [label, setLabel]       = useState("");
  const [tags, setTags]         = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [search, setSearch]     = useState("");
  const [lastCreated, setLastCreated] = useState<ShortlinkFromApi | null>(null);

  const isValidUrl = longUrl.trim().startsWith("http") && longUrl.trim().length > 10;

  const create = useCallback(() => {
    if (!isValidUrl) { toast.error("Enter a valid URL starting with http:// or https://"); return; }
    const slug = customSlug.trim().replace(/\s+/g, "-").toLowerCase() || randomSlug();
    createShortlink.mutate({
      data: {
        linkId: `link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: label.trim() || longUrl.trim(),
        longUrl: longUrl.trim(),
        slug,
        baseDomain: `${baseDomain}/${prefix}`,
        tags: tags.trim() || undefined,
      },
    }, {
      onSuccess: (created) => {
        setLastCreated(created as ShortlinkFromApi);
        setLongUrl("https://");
        setLabel("");
        setCustomSlug("");
        setTags("");
        toast.success("Shortlink created");
        refetch();
      },
      onError: () => toast.error("Failed to create shortlink"),
    });
  }, [longUrl, label, customSlug, tags, baseDomain, prefix, isValidUrl, createShortlink, refetch]);

  const copyLink = (entry: ShortlinkFromApi) => {
    navigator.clipboard.writeText(buildShortUrl(entry))
      .then(() => toast.success("Shortlink copied"))
      .catch(() => toast.error("Copy failed"));
  };

  const deleteEntry = (id: number) => {
    deleteShortlink.mutate({ id }, {
      onSuccess: () => {
        if (lastCreated?.id === id) setLastCreated(null);
        toast.success("Deleted");
        refetch();
      },
      onError: () => toast.error("Failed to delete shortlink"),
    });
  };

  const filtered = search
    ? links.filter((e) =>
        (e.label || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.slug || "").includes(search.toLowerCase()) ||
        (e.longUrl || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.tags || "").toLowerCase().includes(search.toLowerCase())
      )
    : links;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link2 className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Shortlink Generator</h1>
              <p className="text-sm text-muted-foreground">Create memorable short URLs for your marketing campaigns and promotions.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── Left: Create form ── */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> New Shortlink</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Destination URL</Label>
                  <Input
                    placeholder="https://yourwebsite.com/very/long/promotion-url"
                    value={longUrl}
                    onChange={(e) => setLongUrl(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Label <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input placeholder="e.g. Winter Sale Landing Page" value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Custom slug <span className="text-muted-foreground font-normal">(optional — leave blank to auto-generate)</span></Label>
                  <div className="flex items-center gap-0 rounded-md border overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                    <span className="bg-muted px-3 py-2 text-sm text-muted-foreground whitespace-nowrap border-r shrink-0">
                      {baseDomain}/{prefix}/
                    </span>
                    <input
                      className="flex-1 px-3 py-2 text-sm font-mono bg-background outline-none min-w-0"
                      placeholder="my-promo"
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value.replace(/[^a-z0-9-_]/gi, "").toLowerCase())}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Tags <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    placeholder="sale, summer, facebook"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Comma-separated tags to help organise your links.</p>
                </div>

                <Button className="w-full gap-1.5" onClick={create} disabled={!isValidUrl || createShortlink.isPending}>
                  <Link2 className="w-4 h-4" /> Create Shortlink
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Created link display ── */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Your Shortlink</CardTitle>
              </CardHeader>
              <CardContent>
                {lastCreated ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Short URL</p>
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-bold text-primary break-all flex-1">{buildShortUrl(lastCreated)}</p>
                          <Button size="icon" variant="outline" onClick={() => copyLink(lastCreated!)} className="shrink-0">
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="border-t pt-3 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Destination</p>
                        <p className="text-sm break-all text-foreground/70">{lastCreated.longUrl}</p>
                      </div>
                      {lastCreated.tags && (
                        <div className="flex flex-wrap gap-1">
                          {String(lastCreated.tags).split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 gap-1.5" onClick={() => copyLink(lastCreated!)}>
                        <Copy className="w-4 h-4" /> Copy Link
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => window.open(lastCreated!.longUrl, "_blank")}>
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-900/10 dark:border-amber-700/30 p-3">
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        <strong>Note:</strong> To make shortlinks active and redirect visitors, your domain must be pointed to KoaPOS and shortlink routing must be enabled.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
                    <LinkIcon className="w-14 h-14 opacity-15" />
                    <p className="text-sm">Create a shortlink to see it displayed here.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── History ── */}
        {links.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">All Shortlinks</h2>
                <Badge variant="secondary" className="text-xs">{links.length}</Badge>
              </div>
              <Input
                placeholder="Search links, slugs, tags..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-60 text-sm"
              />
            </div>

            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="p-3 text-left font-medium">Label</th>
                    <th className="p-3 text-left font-medium">Short URL</th>
                    <th className="p-3 text-left font-medium hidden md:table-cell">Destination</th>
                    <th className="p-3 text-left font-medium hidden sm:table-cell">Tags</th>
                    <th className="p-3 text-left font-medium hidden lg:table-cell">Created</th>
                    <th className="p-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((entry) => (
                    <tr key={String(entry.linkId)} className={cn("hover:bg-muted/20 transition-colors", lastCreated?.linkId === entry.linkId && "bg-primary/5")}>
                      <td className="p-3">
                        <p className="font-medium truncate max-w-[140px]">{entry.label}</p>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-primary text-xs">{buildShortUrl(entry)}</span>
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <span className="text-muted-foreground text-xs truncate block max-w-[180px]">{entry.longUrl}</span>
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        {entry.tags ? (
                          <div className="flex flex-wrap gap-0.5">
                            {String(entry.tags).split(",").map((t) => t.trim()).filter(Boolean).slice(0, 3).map((t) => (
                              <Badge key={t} variant="outline" className="text-[10px] px-1 py-0">{t}</Badge>
                            ))}
                          </div>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        <span className="text-muted-foreground text-xs">
                          {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => copyLink(entry)} title="Copy" className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => window.open(entry.longUrl, "_blank")} title="Open" className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteEntry(Number(entry.id ?? 0))} title="Delete" className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">No shortlinks match your search.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
