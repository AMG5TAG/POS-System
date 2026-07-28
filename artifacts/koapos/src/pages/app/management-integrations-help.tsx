import { useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import {
  Landmark, CreditCard, ShoppingBag, Megaphone, Cloud, HelpCircle, ArrowLeft, Zap, ExternalLink,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   Integrations connection guide / FAQ.

   One entry per integrations-page section (matching the ALL_SECTIONS ids in
   management-integrations.tsx: accounting | payments | ecommerce | marketing |
   cloud) so the section headers and connect dialogs can deep-link here with a
   #<section> hash.
   ──────────────────────────────────────────────────────────────────────────── */

interface ProviderLink { label: string; url: string }
interface Faq { q: string; steps: string[]; note?: string; links?: ProviderLink[] }
interface HelpSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  intro: string;
  faqs: Faq[];
}

const SECTIONS: HelpSection[] = [
  {
    id: "accounting",
    title: "Accounting & Finance — Xero",
    icon: Landmark,
    intro: "Xero connects in one click using KoaPOS's secure platform connection — no developer app needed.",
    faqs: [
      {
        q: "How do I connect Xero?",
        steps: [
          "Open the Xero integration and click Connect with Xero.",
          "You'll be sent to Xero to log in and approve access — KoaPOS only requests accounting data, never bank account details.",
          "After approving, choose which Xero organisation to sync.",
        ],
        note: "No developer app or keys required — KoaPOS handles the connection for you.",
        links: [
          { label: "About Xero OAuth2", url: "https://developer.xero.com/documentation/guides/oauth2/overview/" },
        ],
      },
      {
        q: "Where do sales go once connected?",
        steps: [
          "Enable “Sync on sale” in the integration's settings to push each completed sale automatically.",
          "GST is mapped to your chosen tax accounts; refunds and invoices sync too.",
        ],
      },
    ],
  },
  {
    id: "payments",
    title: "Payments & Terminals",
    icon: CreditCard,
    intro: "Each merchant connects their own payment account. BNPL providers (Zip, Afterpay, Klarna) use a scan-to-pay flow; card processors and terminals use API keys.",
    faqs: [
      {
        q: "How do I connect Stripe (card payments)?",
        steps: [
          "In your Stripe Dashboard go to Developers → API keys.",
          "Copy your Secret Key (sk_…) and Publishable Key (pk_…).",
          "Paste both into the Stripe dialog in KoaPOS and Save. (Optionally add a webhook signing secret for payment updates.)",
        ],
        links: [
          { label: "Stripe API keys", url: "https://dashboard.stripe.com/apikeys" },
          { label: "Stripe webhooks", url: "https://dashboard.stripe.com/webhooks" },
        ],
      },
      {
        q: "How do I connect Zip, Afterpay or Klarna (buy-now-pay-later)?",
        steps: [
          "For Afterpay and Klarna: from the provider's merchant dashboard, copy your Merchant ID and API Key.",
          "For Zip (In-store QR): copy your API Key, Location ID and Device Reference from your Zip onboarding details — Zip issues these with your sandbox/production credentials.",
          "Paste them into the integration dialog in KoaPOS.",
          "Copy the webhook URL shown in the dialog, add it in your provider dashboard, and paste back the signing secret it gives you.",
          "Save. At checkout, choose the provider — the customer scans the on-screen QR code in their app to approve, and the sale completes once approved.",
        ],
        note: "Funds are only captured after the customer approves, so a sale is never recorded for an unapproved payment. An unapproved or abandoned charge can be voided to release the customer's hold.",
        links: [
          { label: "Zip in-store developer guide", url: "https://developers.zip.co/v4/docs/getting-started" },
          { label: "Zip merchant portal", url: "https://merchant.zip.co/" },
          { label: "Afterpay merchant portal", url: "https://merchant.afterpay.com/" },
          { label: "Klarna merchant portal", url: "https://portal.klarna.com/" },
        ],
      },
      {
        q: "How do I connect a terminal (Tyro, Square, CommBank) or PayPal / digital wallets?",
        steps: [
          "Open the integration and enter the credentials from that provider (e.g. Merchant ID, Terminal ID, API Key, or Access Token).",
          "Save — the method then appears as a tender option at checkout.",
        ],
        links: [
          { label: "Tyro merchant portal", url: "https://merchant.tyro.com/" },
          { label: "Square developer", url: "https://developer.squareup.com/apps" },
          { label: "PayPal developer", url: "https://developer.paypal.com/dashboard/" },
        ],
      },
    ],
  },
  {
    id: "ecommerce",
    title: "E-Commerce & Marketplaces",
    icon: ShoppingBag,
    intro: "Sync inventory, orders and shipping with online storefronts, marketplaces and carriers.",
    faqs: [
      {
        q: "How do I connect Australia Post?",
        steps: [
          "Get your API Key and Account Number from your Australia Post developer account.",
          "Paste them into the integration dialog and Save to enable live rates and labels at checkout.",
        ],
        links: [
          { label: "Australia Post developer", url: "https://developers.auspost.com.au/" },
        ],
      },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    icon: Megaphone,
    intro: "Connect ad and email platforms to run campaigns and sync audiences.",
    faqs: [
      {
        q: "How do I connect Google Ads or Google Business Profile?",
        steps: [
          "Click Connect Account on the integration.",
          "You'll be redirected to the provider to sign in and approve the requested permissions.",
          "After approving, you're returned to KoaPOS and the integration shows as connected.",
        ],
        note: "If a card shows “OAuth credentials not configured”, the platform connection for that provider hasn't been set up yet — contact support.",
      },
      {
        q: "How do I connect Mailchimp?",
        steps: [
          "Generate an API key in Mailchimp (Account → Extras → API keys).",
          "Paste it into the Mailchimp dialog and Save.",
        ],
        links: [
          { label: "Mailchimp API keys", url: "https://admin.mailchimp.com/account/api/" },
        ],
      },
    ],
  },
  {
    id: "cloud",
    title: "Cloud Storage & Productivity",
    icon: Cloud,
    intro: "Back up reports and sync contacts/calendars. These are managed on the Sync page (Management → Settings & Integrations → Sync).",
    faqs: [
      {
        q: "How do I connect Google Workspace, OneDrive or Dropbox?",
        steps: [
          "Go to the Sync page and click Connect on the provider you want.",
          "Sign in to the provider and approve access — backups and contact sync then run automatically.",
        ],
      },
    ],
  },
];

export default function ManagementIntegrationsHelpPage() {
  const [location, navigate] = useLocation();

  // Deep-link support: scroll to the #<section> anchor on load / hash change.
  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (!id) { window.scrollTo({ top: 0 }); return; }
    const el = document.getElementById(id);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [location]);

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 -ml-2 mb-2 text-muted-foreground"
            onClick={() => navigate("/management/settings-integrations/integrations")}
          >
            <ArrowLeft className="w-4 h-4" /> Back to Integrations
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-primary" />
            Connecting third-party apps
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Step-by-step help for connecting each type of integration. Jump to a category below.
          </p>
        </div>

        {/* Quick category nav */}
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              <s.icon className="w-3.5 h-3.5" /> {s.title.split(" — ")[0]}
            </a>
          ))}
        </div>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24 space-y-3">
            <div className="flex items-center gap-2.5 pt-2">
              <div className="rounded-xl p-2 bg-primary/10 shrink-0">
                <s.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg leading-tight">{s.title}</h2>
                <p className="text-sm text-muted-foreground">{s.intro}</p>
              </div>
            </div>

            <div className="space-y-3">
              {s.faqs.map((f, i) => (
                <div key={i} className="rounded-xl border bg-card p-4">
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-primary shrink-0" /> {f.q}
                  </h3>
                  <ol className="mt-2.5 space-y-1.5 list-decimal pl-5 text-sm text-muted-foreground">
                    {f.steps.map((step, j) => <li key={j}>{step}</li>)}
                  </ol>
                  {f.note && (
                    <p className="mt-2.5 text-xs text-muted-foreground bg-muted/50 border rounded-lg px-3 py-2">
                      {f.note}
                    </p>
                  )}
                  {f.links && f.links.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {f.links.map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/5 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> {l.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppLayout>
  );
}
