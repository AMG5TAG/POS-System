/**
 * Online Store \u203a Features \u2014 what the storefront can do: the feature and
 * payment toggles, promo quick codes, and moderation of the reviews customers
 * leave through the store.
 */
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Layers, ShoppingBag, Gift, Users, QrCode, Star, Mail, CreditCard, Code2, Plus, Trash2,
} from "lucide-react";
import {
  useOnlineStore, StoreHeader, BuilderOnlyNotice, ReviewsModerationCard, type SiteSettings, type QuickCode,
} from "./shared";

export default function OnlineStoreFeaturesPage() {
  const { site, mutateSite, togglePublish } = useOnlineStore();

  const togglePayment = (k: keyof SiteSettings["payments"]) => mutateSite((s) => ({ ...s, payments: { ...s.payments, [k]: !s.payments[k] } }));
  const toggleFeature = (k: keyof SiteSettings["features"]) => mutateSite((s) => ({ ...s, features: { ...s.features, [k]: !s.features[k] } }));

  /* ─── Quick codes ────────────────────────────────────────────────── */
  const addQuickCode = () => {
    const id = `qc${Date.now()}`;
    mutateSite((s) => ({ ...s, quickCodes: [...s.quickCodes, { id, code: "NEWCODE", label: "New promo", url: "/" }] }));
  };
  const updateQuickCode = (id: string, patch: Partial<QuickCode>) =>
    mutateSite((s) => ({ ...s, quickCodes: s.quickCodes.map((q) => q.id === id ? { ...q, ...patch } : q) }));
  const deleteQuickCode = (id: string) =>
    mutateSite((s) => ({ ...s, quickCodes: s.quickCodes.filter((q) => q.id !== id) }));

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <StoreHeader
          icon={Layers} title="Features" site={site} onTogglePublish={togglePublish}
          description="Turn storefront features and payment methods on or off, and manage promo codes and reviews."
        />

        {site.mode === "thirdparty" ? (
          <BuilderOnlyNotice />
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4" /> Features</CardTitle><CardDescription>Toggle storefront features</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { key: "checkout"   as const, icon: ShoppingBag, label: "Online checkout",     desc: "Allow purchases from your website" },
                    { key: "loyalty"    as const, icon: Gift,         label: "Loyalty integration", desc: "Customers earn points on online purchases" },
                    { key: "customers"  as const, icon: Users,        label: "Customer accounts",   desc: "Sign-in, order history, saved details" },
                    { key: "quickCodes" as const, icon: QrCode,       label: "Quick codes & QR",    desc: "Promo codes redeemable in-store & online" },
                    { key: "reviews"    as const, icon: Star,         label: "Product reviews",     desc: "Let customers leave ratings" },
                    { key: "newsletter" as const, icon: Mail,         label: "Newsletter",          desc: "Collect email subscribers" },
                  ].map(({ key, icon: Icon, label, desc }) => (
                    <div key={key} className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium">{label}</p><p className="text-[11px] text-muted-foreground">{desc}</p></div>
                      <Switch checked={site.features[key]} onCheckedChange={() => toggleFeature(key)} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payments</CardTitle><CardDescription>Choose accepted payment methods</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { key: "stripe"   as const, label: "Stripe",                  desc: "Credit/debit cards via Stripe" },
                    { key: "paypal"   as const, label: "PayPal",                   desc: "PayPal balance and cards" },
                    { key: "afterpay" as const, label: "Afterpay",                 desc: "Buy now, pay later in 4" },
                    { key: "applePay" as const, label: "Apple Pay & Google Pay",   desc: "One-tap mobile checkout" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center gap-3">
                      <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium">{label}</p><p className="text-[11px] text-muted-foreground">{desc}</p></div>
                      <Switch checked={site.payments[key]} onCheckedChange={() => togglePayment(key)} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <ReviewsModerationCard />

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div><CardTitle className="text-base flex items-center gap-2"><Code2 className="w-4 h-4" /> Quick Codes</CardTitle><CardDescription>Promo codes and short URLs redeemable on your store</CardDescription></div>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={addQuickCode}><Plus className="w-3.5 h-3.5" /> Add code</Button>
                </div>
              </CardHeader>
              <CardContent>
                {site.quickCodes.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-6">No quick codes yet.</div>
                ) : (
                  <div className="space-y-2">
                    {site.quickCodes.map((q) => (
                      <div key={q.id} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_1fr_auto] gap-2 items-center rounded border bg-muted/20 p-2">
                        <Input value={q.code}  onChange={(e) => updateQuickCode(q.id, { code:  e.target.value })} className="h-8 font-mono text-xs" />
                        <Input value={q.label} onChange={(e) => updateQuickCode(q.id, { label: e.target.value })} className="h-8 text-xs" placeholder="Label" />
                        <Input value={q.url}   onChange={(e) => updateQuickCode(q.id, { url:   e.target.value })} className="h-8 text-xs" placeholder="/shop?promo=…" />
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteQuickCode(q.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
