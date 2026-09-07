/**
 * Online Store \u203a Domain \u2014 the address the store answers on: its platform URL
 * (whose slug is editable) and an optional custom domain.
 *
 * The backend owns whether a custom domain is live: it verifies DNS, registers
 * the hostname and provisions TLS, then reports `domainStatus` on the settings
 * record. Until it says otherwise a saved domain reads as "pending".
 */
import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Link2, Copy, Check, Clock, Loader2, AlertCircle } from "lucide-react";
import { useGetMerchant } from "@workspace/api-client-react";
import { useStoreSlug, slugifyStorePath } from "@/lib/online-store-slug";
import { useOnlineStore, StoreHeader, BuilderOnlyNotice } from "./shared";

export default function OnlineStoreDomainPage() {
  const { site, updateSite, togglePublish, rawSettings } = useOnlineStore();

  /* Store URL: default platform URL is https://koapos.com.au/b/USERNAME/o/CUSTOM
   * where CUSTOM (the slug) is editable; `site.domain` is the optional custom
   * DNS domain pointed at the store. */
  const PLATFORM_BASE = "https://koapos.com.au";
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const merchantUsername = (merchant?.username ?? "").toLowerCase();
  const [storeSlug, setStoreSlug] = useStoreSlug();
  const defaultStoreUrl = `${PLATFORM_BASE}/b/${merchantUsername || "your-username"}/o/${storeSlug}`;
  const liveStoreUrl = site.domain.trim() ? `https://${site.domain.trim().replace(/^https?:\/\//, "")}` : defaultStoreUrl;
  const [urlCopied, setUrlCopied] = useState(false);
  const copyStoreUrl = async () => {
    await navigator.clipboard.writeText(liveStoreUrl).catch(() => {});
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const queryClient = useQueryClient();
  const backendDomainStatus = (rawSettings as { domainStatus?: string } | undefined)?.domainStatus;
  const domainStatus: "none" | "pending" | "verifying" | "active" | "failed" =
    !site.domain.trim() ? "none"
    : (backendDomainStatus === "active" || backendDomainStatus === "verifying" || backendDomainStatus === "failed")
      ? backendDomainStatus
      : "pending";
  const [verifying, setVerifying] = useState(false);

  const verifyDomain = async () => {
    const domain = site.domain.trim();
    if (!domain) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/online-store/domain/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json().catch(() => ({} as { status?: string; error?: string }));
      if (!res.ok) throw new Error(data.error || "Verification could not be started");
      // Backend persists the new domainStatus; refresh settings so the badge updates.
      await queryClient.invalidateQueries({ queryKey: ["online-store-settings"] });
      if (data.status === "active") toast.success(`${domain} is live!`);
      else toast.success("Verification started \u2014 we\u2019ll activate your domain once DNS & certificate checks pass.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn\u2019t verify the domain \u2014 please try again later.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <StoreHeader
          icon={Link2} title="Domain" site={site} onTogglePublish={togglePublish}
          description="The web address your store answers on \u2014 the KoaPOS URL, or your own domain."
        />

        {site.mode === "thirdparty" ? (
          <BuilderOnlyNotice />
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Link2 className="w-4 h-4" /> Store URL &amp; Domain</CardTitle>
                <CardDescription>Your store is published at the address below. Share it or point your own domain to it.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Default platform URL with editable CUSTOM segment */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default store URL</Label>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 flex-wrap">
                    <span className="text-sm text-muted-foreground font-mono whitespace-nowrap">
                      {PLATFORM_BASE}/b/{merchantUsername || "your-username"}/o/
                    </span>
                    <Input
                      value={storeSlug}
                      onChange={(e) => setStoreSlug(e.target.value)}
                      onBlur={(e) => setStoreSlug(slugifyStorePath(e.target.value) || "store")}
                      className="h-7 w-40 font-mono text-sm"
                      placeholder="store"
                    />
                    <button onClick={copyStoreUrl} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground transition-colors" title="Copy store URL">
                      {urlCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  {!merchantUsername && (
                    <p className="text-xs text-amber-600">Set a username in Business Details to activate your store URL.</p>
                  )}
                </div>

                {/* Custom domain (DNS) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom domain (optional)</Label>
                    {domainStatus === "active" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        <Check className="h-3 w-3" /> Active
                      </span>
                    )}
                    {domainStatus === "verifying" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        <Loader2 className="h-3 w-3 animate-spin" /> Verifying…
                      </span>
                    )}
                    {domainStatus === "pending" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        <Clock className="h-3 w-3" /> Pending verification
                      </span>
                    )}
                    {domainStatus === "failed" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        <AlertCircle className="h-3 w-3" /> Verification failed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use your own domain for your store. Enter it below, add the DNS record, then click Verify —
                    we check the record and issue the security certificate. Until it’s Active, your store stays on
                    the platform URL above.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input value={site.domain} onChange={(e) => updateSite({ domain: e.target.value })} placeholder="shop.yourbusiness.com.au" className="font-mono text-sm flex-1" />
                    {site.domain.trim() && domainStatus !== "active" && (
                      <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={verifyDomain} disabled={verifying}>
                        {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {verifying ? "Verifying…" : "Verify"}
                      </Button>
                    )}
                  </div>
                  {domainStatus === "active" && (
                    <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Live at <span className="font-mono">https://{site.domain.trim()}</span>
                    </p>
                  )}
                  {domainStatus === "failed" && (
                    <p className="text-[11px] text-red-600">
                      We couldn’t verify <span className="font-mono">{site.domain.trim()}</span>. Check the CNAME record is correct and has propagated, then Verify again.
                    </p>
                  )}
                  {(domainStatus === "pending" || domainStatus === "verifying") && (
                    <p className="text-[11px] text-muted-foreground">
                      Saved. After the DNS record is added, Verify activates <span className="font-mono">{site.domain.trim()}</span> once the certificate is issued (can take a few minutes).
                    </p>
                  )}
                </div>

                {/* DNS setup instructions */}
                <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">DNS setup</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Log in to your domain registrar (e.g. Crazy Domains, Namecheap, Cloudflare).</li>
                    <li>Add a <span className="font-mono font-medium">CNAME</span> record for a <strong>subdomain</strong> (e.g. <span className="font-mono">shop</span>) pointing to:</li>
                  </ol>
                  <div className="flex items-center gap-2 rounded border bg-background px-3 py-1.5 mt-1">
                    <span className="text-xs font-mono flex-1 select-all">koapos.com.au</span>
                    <button onClick={() => { navigator.clipboard.writeText("koapos.com.au").catch(() => {}); toast.success("Copied"); }} className="text-muted-foreground hover:text-foreground transition-colors">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Using a root/apex domain (e.g. <span className="font-mono">yourbusiness.com</span> with no subdomain)? A CNAME
                    won’t work there — use an <span className="font-mono">ALIAS</span>/<span className="font-mono">ANAME</span> record if your
                    registrar supports it, or contact us. DNS changes can take up to 24–48 hours to propagate.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
