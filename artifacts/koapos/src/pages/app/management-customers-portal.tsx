import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link2, Copy, Check, ExternalLink, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { publicOrigin, shopOrigin } from "@/lib/public-url";

/**
 * The customer portal now lives in the online shop's account area. Its link
 * (/c/<code>) signs the customer into their shop account, where they track
 * repairs, approve quotes, book appointments, see warranties and rewards, and
 * keep their wallet card. The old portal addresses on this domain (and a custom
 * portal domain, if one was set) forward there, so links already sent still work.
 */
function CustomerPortalCard({ merchant }: { merchant: { username?: string | null; portalDomain?: string | null } | null }) {
  const [copied, setCopied] = useState(false);
  const accountUrl = `${shopOrigin()}/c/[customer-code]`;

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card id="portal">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Customer accounts
        </CardTitle>
        <CardDescription>
          The customer portal is now each customer's account in the online shop. There they can track
          repairs, approve or decline quotes, request appointments, see warranties and rewards, and add
          their card to Apple or Google Wallet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account link</p>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-sm text-muted-foreground flex-1 font-mono truncate">{accountUrl}</span>
            <button onClick={() => handleCopy(accountUrl)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Repair status texts, completed-job QR codes, wallet passes and the Portal button on a service job
            all use this link. It signs the customer in to their account (subject to the password setting).
          </p>
        </div>

        <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Links already sent</p>
          <p className="text-xs text-muted-foreground">
            Old portal links on <span className="font-mono">{new URL(publicOrigin()).host}/c/…</span>
            {merchant?.portalDomain ? <> and <span className="font-mono">{merchant.portalDomain}</span></> : null}{" "}
            forward to the customer's account, so texts and stickers already out there keep working.
            {merchant?.portalDomain ? " Keep that domain pointed here for as long as those links are in circulation." : ""}
          </p>
        </div>

        <a href={`${shopOrigin()}/account`} target="_blank" rel="noopener noreferrer" className="inline-flex">
          <Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="h-4 w-4" /> Open the shop account</Button>
        </a>
      </CardContent>
    </Card>
  );
}

/**
 * The portal was originally reachable by link alone. That is fine for a link
 * texted to a customer, but the service sticker QR now points here too — and
 * that sticker lives on the customer's device, on a bench, in a shop. This is
 * the switch that makes the link an identifier rather than a key.
 */
function PortalPasswordCard({ merchant }: { merchant: { requirePortalPassword?: boolean } | null }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const enabled = merchant?.requirePortalPassword ?? false;

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    try {
      const r = await fetch("/api/merchants/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirePortalPassword: next }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(json.error ?? "Failed to save setting"); return; }
      toast.success(next ? "Customers will be asked to set a password" : "Password requirement turned off");
      qc.invalidateQueries({ queryKey: ["merchant"] });
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Password protection
        </CardTitle>
        <CardDescription>
          Require customers to sign in with a password before their account link opens their account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="require-portal-password">Require a customer password</Label>
            <p className="text-xs text-muted-foreground">
              Off by default, and turning it on locks nobody out: customers who haven't set a
              password yet keep their existing access and are invited to create one.
            </p>
          </div>
          <Switch
            id="require-portal-password"
            checked={enabled}
            disabled={saving}
            onCheckedChange={handleToggle}
          />
        </div>

        <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What changes once it's on</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Customers set a password from a one-time link emailed (or texted) to them — holding the account link isn't enough to set one.</li>
            <li>Once a customer has a password, every account link for them asks for it, including repair status texts you've already sent.</li>
            <li>Customers without a password are unaffected until they set one.</li>
          </ul>
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
          <p className="text-sm text-muted-foreground mt-0.5">Customers&apos; online accounts in the shop, and how their account link signs them in.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <CustomerPortalCard merchant={merchant ?? null} />
          <PortalPasswordCard merchant={merchant ?? null} />
        </div>
      </div>
    </AppLayout>
  );
}
