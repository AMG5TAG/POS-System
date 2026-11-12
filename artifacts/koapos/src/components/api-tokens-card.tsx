import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Plug } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

function formatRelative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}

export interface ApiTokenItem { id: number; name: string; tokenPrefix: string; createdAt: string; lastUsedAt: string | null }

export function ApiTokensCard() {
  const [tokens, setTokens] = useState<ApiTokenItem[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/api-tokens", { credentials: "include" });
      if (!res.ok) { setTokens([]); return; }
      setTokens(await res.json() as ApiTokenItem[]);
    } catch { setTokens([]); }
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!name.trim()) { toast.error("Give the token a name first"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/api-tokens", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({})) as { token?: string; error?: string };
      if (!res.ok || !data.token) { toast.error(data.error ?? "Couldn't create the token"); return; }
      setNewToken(data.token);
      setName("");
      void load();
    } catch { toast.error("Couldn't create the token"); }
    finally { setCreating(false); }
  };

  const revoke = async (t: ApiTokenItem) => {
    const res = await fetch(`/api/api-tokens/${t.id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { toast.success(`Revoked "${t.name}"`); void load(); } else toast.error("Couldn't revoke the token");
  };

  return (
    <Card id="api-tokens">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Plug className="w-4 h-4" /> API Tokens</CardTitle>
        <CardDescription>
          Connect apps such as Koastal Tech Tools (KTT) to sync customers, service jobs and reports. Tokens don't expire -
          they work until you revoke them. Each token can only read and update customers and service jobs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {newToken && (
          <div className="rounded-md border border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3 space-y-2">
            <p className="text-sm font-medium">Copy this token now - it won't be shown again.</p>
            <div className="flex gap-2">
              <Input readOnly value={newToken} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(newToken); toast.success("Token copied"); }}>
                <Copy className="w-4 h-4 mr-1" /> Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">In Koastal Tech Tools (KTT): Settings &gt; POS link &gt; KoaPOS &gt; Use an API token.</p>
            <Button variant="ghost" size="sm" onClick={() => setNewToken(null)}>Done</Button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="api-token-name">New token name</Label>
            <Input id="api-token-name" placeholder="e.g. KTT - Sam's USB" value={name} maxLength={80}
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} />
          </div>
          <Button onClick={() => void create()} disabled={creating}>
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />} Create token
          </Button>
        </div>
        {tokens === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API tokens yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{t.tokenPrefix}…</span> · created {new Date(t.createdAt).toLocaleDateString()} ·{" "}
                    {t.lastUsedAt ? `last used ${formatRelative(t.lastUsedAt)}` : "never used"}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive">Revoke</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke "{t.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>Apps using this token stop syncing immediately. This can't be undone - create a new token to reconnect.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void revoke(t)}>Revoke</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

