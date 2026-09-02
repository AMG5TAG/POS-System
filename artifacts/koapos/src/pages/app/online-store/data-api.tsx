/**
 * Online Store › Data API — keys that let a merchant's own website read their
 * KoaPOS data, and the connection brief they hand to whoever builds it.
 *
 * The brief is generated on the server (`lib/storefront-api.ts`) rather than
 * here, so what the merchant downloads is written from the same description the
 * API is implemented against and cannot drift from it.
 *
 * A created key is shown exactly once. The dialog that reveals it is therefore
 * the only chance to copy or download it, and says so plainly — KoaPOS stores
 * only a hash and genuinely cannot show it again.
 */
import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  KeyRound, Plus, Copy, Check, Download, Trash2, ShieldAlert, Sparkles,
  FileText, Eye, Loader2,
} from "lucide-react";
import {
  useListStorefrontApiKeys, useCreateStorefrontApiKey, useRevokeStorefrontApiKey,
  getStorefrontApiManifest,
  type StorefrontApiKey, type StorefrontApiKeyCreated, type StorefrontApiScope,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOnlineStore, StoreHeader } from "./shared";

const KEYS_QUERY_KEY = ["storefront-api-keys"];

/** Hand the merchant a file without a round trip through a download endpoint. */
function downloadText(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function keyStatus(k: StorefrontApiKey): { label: string; tone: string } {
  if (k.revokedAt) return { label: "Revoked", tone: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
  if (k.expiresAt && new Date(k.expiresAt).getTime() <= Date.now()) {
    return { label: "Expired", tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" };
  }
  return { label: "Active", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" };
}

const fmt = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function OnlineStoreDataApiPage() {
  const { site, togglePublish } = useOnlineStore();
  const queryClient = useQueryClient();

  const { data, isLoading } = useListStorefrontApiKeys({ query: { queryKey: KEYS_QUERY_KEY } });
  const createKey = useCreateStorefrontApiKey();
  const revokeKey = useRevokeStorefrontApiKey();

  const keys: StorefrontApiKey[] = data?.items ?? [];
  const scopeCatalogue: StorefrontApiScope[] = data?.scopes ?? [];
  const baseUrl = data?.baseUrl ?? "";

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; scopes: string[]; expiresInDays: string }>({
    name: "", scopes: ["products:read", "inventory:read"], expiresInDays: "0",
  });
  /** The one-and-only sighting of a new key. */
  const [issued, setIssued] = useState<StorefrontApiKeyCreated | null>(null);
  const [copied, setCopied] = useState<"key" | "url" | null>(null);
  const [revoking, setRevoking] = useState<StorefrontApiKey | null>(null);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const copy = async (text: string, what: "key" | "url") => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleScope = (id: string) =>
    setForm((f) => ({ ...f, scopes: f.scopes.includes(id) ? f.scopes.filter((s) => s !== id) : [...f.scopes, id] }));

  const submitCreate = () => {
    if (!form.scopes.length) { toast.error("Pick at least one thing the key can read"); return; }
    const days = Number(form.expiresInDays);
    createKey.mutate(
      { data: { name: form.name.trim(), scopes: form.scopes, expiresInDays: days > 0 ? days : null } },
      {
        onSuccess: (created) => {
          setCreateOpen(false);
          setIssued(created);
          setForm({ name: "", scopes: ["products:read", "inventory:read"], expiresInDays: "0" });
          void queryClient.invalidateQueries({ queryKey: KEYS_QUERY_KEY });
        },
        onError: () => toast.error("Couldn't create the key — please try again"),
      },
    );
  };

  const doRevoke = () => {
    if (!revoking) return;
    revokeKey.mutate({ id: revoking.id }, {
      onSuccess: () => {
        toast.success("Key revoked — it stops working immediately");
        setRevoking(null);
        void queryClient.invalidateQueries({ queryKey: KEYS_QUERY_KEY });
      },
      onError: () => toast.error("Couldn't revoke the key — please try again"),
    });
  };

  const withManifest = async (k: StorefrontApiKey, action: "download" | "preview") => {
    setBusyId(k.id);
    try {
      const m = await getStorefrontApiManifest(k.id);
      if (action === "download") {
        downloadText(m.filename, m.content);
        toast.success("Connection file downloaded");
      } else {
        setPreview({ title: k.name || `Key ${k.keyPrefix}…`, content: m.content });
      }
    } catch {
      toast.error("Couldn't build the connection file — please try again");
    } finally {
      setBusyId(null);
    }
  };

  const sensitiveChosen = scopeCatalogue.filter((s) => s.sensitive && form.scopes.includes(s.id));

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <StoreHeader
          icon={KeyRound} title="Data API" site={site} onTogglePublish={togglePublish}
          description="Let a website you build elsewhere — or an AI agent building it for you — read your KoaPOS data."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4" /> How this works</CardTitle>
              <CardDescription>Three steps, and your site can read your catalogue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ol className="space-y-2 list-decimal pl-5 text-muted-foreground">
                <li><strong className="text-foreground">Create a key</strong> and tick only what the site needs to read.</li>
                <li><strong className="text-foreground">Download the connection file</strong> — a single document that tells an
                  AI agent (or a developer) the address, the authentication, every endpoint, and the rules for handling your data safely.</li>
                <li><strong className="text-foreground">Give it to whoever is building the site.</strong> Paste it into your AI
                  coding tool and ask it to build against this API.</li>
              </ol>
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">API address</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono break-all flex-1">{baseUrl || "—"}</code>
                  <button onClick={() => copy(baseUrl, "url")} className="shrink-0 text-muted-foreground hover:text-foreground" title="Copy">
                    {copied === "url" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The API is <strong>read-only</strong>: a key can look at your data and can never change it, take a payment,
                or place an order.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Before you share a key</CardTitle>
              <CardDescription>A key is a password to your data. Treat it like one.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• It belongs on a <strong className="text-foreground">server</strong>, never in a web page's code — anything
                shipped to a browser is readable by every visitor.</p>
              <p>• Use <strong className="text-foreground">one key per site</strong>, so a leak can be revoked on its own.</p>
              <p>• Ticking <strong className="text-foreground">Customers</strong> or <strong className="text-foreground">Sales</strong> shares
                real people's personal information. Only do it when the site genuinely needs it, and never publish it.</p>
              <p>• Revoking is immediate. If a key is exposed, revoke it and issue a new one.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><KeyRound className="w-4 h-4" /> API keys</CardTitle>
                <CardDescription>Each key can read only what you ticked when you created it.</CardDescription>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> Create key
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin opacity-60" />Loading keys…
              </div>
            ) : keys.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <KeyRound className="w-10 h-10 mx-auto mb-2 opacity-30" />
                No keys yet. Create one to let your website read your data.
              </div>
            ) : (
              <div className="space-y-2">
                {keys.map((k) => {
                  const status = keyStatus(k);
                  const live = status.label === "Active";
                  return (
                    <div key={k.id} className={cn("rounded-lg border p-3 space-y-2", !live && "opacity-70")}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{k.name || "Unnamed key"}</p>
                            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", status.tone)}>{status.label}</span>
                          </div>
                          <p className="text-xs font-mono text-muted-foreground mt-0.5">{k.keyPrefix}…</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="gap-1.5" disabled={busyId === k.id}
                            onClick={() => withManifest(k, "preview")} title="Read the connection file">
                            <Eye className="w-3.5 h-3.5" /> Preview
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1.5" disabled={busyId === k.id}
                            onClick={() => withManifest(k, "download")} title="Download the connection file for your AI">
                            {busyId === k.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Connection file
                          </Button>
                          {live && (
                            <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive"
                              onClick={() => setRevoking(k)}>
                              <Trash2 className="w-3.5 h-3.5" /> Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {k.scopes.map((s) => {
                          const meta = scopeCatalogue.find((c) => c.id === s);
                          return (
                            <Badge key={s} variant="secondary" className={cn("text-[10px] font-mono", meta?.sensitive && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300")}>
                              {s}
                            </Badge>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Created {fmt(k.createdAt)} · Last used {k.lastUsedAt ? fmt(k.lastUsedAt) : "never"} · {k.requestCount} request{k.requestCount === 1 ? "" : "s"}
                        {k.expiresAt ? ` · Expires ${fmt(k.expiresAt)}` : ""}
                        {k.revokedAt ? ` · Revoked ${fmt(k.revokedAt)}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Create ─────────────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create an API key</DialogTitle>
            <DialogDescription>The key is shown once, right after it is created.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Where will this key be used?</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Our Next.js storefront" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">What can it read?</Label>
              {/* The scope list is the server's, so the tick boxes cannot drift from
                  what a key can actually be granted. If it hasn't loaded, say so
                  rather than offering a form that would fail on submit. */}
              {scopeCatalogue.length === 0 && (
                <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
                  Couldn't load the list of what a key can read. Refresh the page and try again.
                </p>
              )}
              {scopeCatalogue.map((s) => (
                <label key={s.id} className="flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={form.scopes.includes(s.id)} onCheckedChange={() => toggleScope(s.id)} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      {s.label}
                      {s.sensitive && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Personal info</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{s.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {sensitiveChosen.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-semibold flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> This key will read personal information</p>
                <p>
                  {sensitiveChosen.map((s) => s.label.toLowerCase()).join(" and ")} belong to real people. Never publish them on a
                  public page, and don't paste exports into third-party tools. You remain responsible for this data under the
                  Privacy Act.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Expiry</Label>
              <Select value={form.expiresInDays} onValueChange={(v) => setForm((f) => ({ ...f, expiresInDays: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No expiry</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={createKey.isPending || scopeCatalogue.length === 0}>
              {createKey.isPending ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── The one sighting of the new key ────────────────────────────────── */}
      <Dialog open={!!issued} onOpenChange={(o) => { if (!o) setIssued(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" /> Your new API key</DialogTitle>
            <DialogDescription>
              Copy it now, or download the connection file below — it contains the key. This is the only time it can be shown.
            </DialogDescription>
          </DialogHeader>
          {issued && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="flex items-start gap-2">
                  <code className="text-xs font-mono break-all flex-1">{issued.key}</code>
                  <button onClick={() => copy(issued.key, "key")} className="shrink-0 text-muted-foreground hover:text-foreground" title="Copy key">
                    {copied === "key" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                KoaPOS stores only a fingerprint of this key, so it cannot be shown again. If you lose it, revoke it and create another.
              </div>
              <Button className="w-full gap-2" onClick={() => { downloadText(issued.manifest.filename, issued.manifest.content); toast.success("Connection file downloaded"); }}>
                <Download className="w-4 h-4" /> Download the connection file (includes this key)
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Hand that file to your AI or developer. It explains the address, the authentication, every endpoint and the
                safety rules — no other setup notes needed.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssued(null)}>I've saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Brief preview ──────────────────────────────────────────────────── */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="w-4 h-4" /> Connection file — {preview?.title}</DialogTitle>
            <DialogDescription>What your AI will read. The key itself is not included in a re-download.</DialogDescription>
          </DialogHeader>
          <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap overflow-y-auto rounded-md border bg-muted/30 p-3 flex-1">
            {preview?.content}
          </pre>
          <DialogFooter>
            <Button variant="outline" className="gap-1.5"
              onClick={async () => { await navigator.clipboard.writeText(preview?.content ?? "").catch(() => {}); toast.success("Copied — paste it into your AI tool"); }}>
              <Copy className="w-3.5 h-3.5" /> Copy all
            </Button>
            <Button onClick={() => setPreview(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revoke ─────────────────────────────────────────────────────────── */}
      <Dialog open={!!revoking} onOpenChange={(o) => { if (!o) setRevoking(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke this key?</DialogTitle>
            <DialogDescription>
              {revoking?.name || "This key"} stops working immediately, and any website using it loses access until you
              issue a new one. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doRevoke} disabled={revokeKey.isPending}>
              {revokeKey.isPending ? "Revoking…" : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
