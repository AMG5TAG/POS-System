import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link2, Copy, Check, Loader2 } from "lucide-react";

function CustomerPortalCard({ merchant }: { merchant: { username: string | null; portalDomain?: string | null } | null }) {
  const qc = useQueryClient();
  const [domainInput, setDomainInput] = useState(merchant?.portalDomain ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const platformDomain = window.location.hostname;
  const username = merchant?.username;
  const platformUrl = username
    ? `https://${platformDomain}/b/${username}/c/[customer-code]`
    : `https://${platformDomain}/b/[your-username]/c/[customer-code]`;

  const handleSaveDomain = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/merchants/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalDomain: domainInput.trim() || null }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(json.error ?? "Failed to save domain"); return; }
      toast.success("Custom portal domain saved");
      qc.invalidateQueries({ queryKey: ["merchant"] });
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card id="portal">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Customer Portal
        </CardTitle>
        <CardDescription>
          Customers can track their repairs, view loyalty points, and manage their profile at your portal URL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Platform URL */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default Platform URL</p>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-sm text-muted-foreground flex-1 font-mono truncate">{platformUrl}</span>
            <button onClick={() => handleCopy(platformUrl)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          {!username && (
            <p className="text-xs text-amber-600">Set a username in Business Info to activate your portal URL.</p>
          )}
        </div>

        {/* Custom domain */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom Domain (optional)</Label>
          <p className="text-xs text-muted-foreground">
            Point your own domain to your customer portal. Customers will visit{" "}
            <span className="font-mono">portal.yourbusiness.com/c/[code]</span> instead of the platform URL.
          </p>
          <div className="flex gap-2">
            <Input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="portal.yourbusiness.com.au"
              className="flex-1 font-mono text-sm"
            />
            <Button onClick={handleSaveDomain} disabled={saving} variant="outline" size="sm" className="shrink-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
          {(merchant?.portalDomain) && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Active: <span className="font-mono">{merchant.portalDomain}</span>
            </p>
          )}
        </div>

        {/* DNS instructions */}
        <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">DNS Setup Instructions</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Log in to your domain registrar (e.g. Crazy Domains, Namecheap, Cloudflare).</li>
            <li>Add a <span className="font-mono font-medium">CNAME</span> record for your chosen subdomain pointing to:</li>
          </ol>
          <div className="flex items-center gap-2 rounded border bg-background px-3 py-1.5 mt-1">
            <span className="text-xs font-mono flex-1 select-all">{platformDomain}</span>
            <button onClick={() => handleCopy(platformDomain)} className="text-muted-foreground hover:text-foreground transition-colors">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">DNS changes can take up to 24–48 hours to propagate.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ManagementCustomersPortalPage() {
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Customer Portal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure your customer-facing portal URL and custom domain.</p>
        </div>
        <CustomerPortalCard merchant={merchant ?? null} />
      </div>
    </AppLayout>
  );
}
