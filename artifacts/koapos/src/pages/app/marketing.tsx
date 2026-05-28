import { useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Megaphone, Mail, QrCode, Link2, Globe, BarChart2,
  ArrowRight, Send, FileText, LayoutTemplate, TrendingUp,
  Users, Star, MousePointerClick, AlertCircle,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface Campaign { status: string; opens?: number; bounces?: number; sentAt?: string; subject?: string; audience?: string; }
interface ShortLink { clicks: number; label?: string; }
interface LandingPage { links: { clicks?: number }[]; title?: string; }
interface EmailTemplate { name: string; category?: string; }

function useMarketingStats() {
  return useMemo(() => {
    const campaigns: Campaign[] = [];
    const qrHistory: object[] = [];
    const shortlinks: ShortLink[] = [];
    const landingPages: LandingPage[] = [];
    const templates: EmailTemplate[] = [];

    const sent = campaigns.filter((c) => c.status === "sent");
    const scheduled = campaigns.filter((c) => c.status === "scheduled");
    const drafts = campaigns.filter((c) => c.status === "draft");
    const totalOpens = sent.reduce((s, c) => s + (c.opens ?? 0), 0);
    const totalBounces = sent.reduce((s, c) => s + (c.bounces ?? 0), 0);
    const openRate = sent.length > 0 ? Math.round((totalOpens / sent.length) * 100) : 0;
    const linkClicks = shortlinks.reduce((s, l) => s + (l.clicks ?? 0), 0);

    return {
      emailSent: sent.length,
      emailScheduled: scheduled.length,
      emailDrafts: drafts.length,
      openRate,
      totalBounces,
      qrCodes: qrHistory.length,
      shortlinks: shortlinks.length,
      linkClicks,
      landingPages: landingPages.length,
      templates: templates.length,
      recentCampaigns: sent.slice(-4).reverse(),
    };
  }, []);
}

/* ── Stat card ─────────────────────────────────────────────────────────── */

function StatCard({
  label, value, sub, icon: Icon, accent,
}: { label: string; value: string | number; sub?: string; icon: React.ComponentType<{ className?: string }>; accent?: boolean }) {
  return (
    <Card className={cn("rounded-2xl", accent && "border-primary/30 bg-primary/5")}>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={cn("mt-0.5 rounded-xl p-2.5", accent ? "bg-primary/15" : "bg-muted")}>
          <Icon className={cn("w-5 h-5", accent ? "text-primary" : "text-muted-foreground")} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-sm font-medium mt-1">{label}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Section card ──────────────────────────────────────────────────────── */

function SectionCard({
  title, description, href, icon: Icon, badge,
}: { title: string; description: string; href: string; icon: React.ComponentType<{ className?: string }>; badge?: string }) {
  return (
    <Link href={href}>
      <Card className="rounded-2xl hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group h-full">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="rounded-xl bg-muted p-3 shrink-0 group-hover:bg-primary/10 transition-colors">
            <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">{title}</p>
              {badge && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{badge}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 group-hover:translate-x-1 transition-transform" />
        </CardContent>
      </Card>
    </Link>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function MarketingOverviewPage() {
  const stats = useMarketingStats();

  const totalActivity =
    stats.emailSent + stats.qrCodes + stats.shortlinks + stats.landingPages;

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-primary" />
              Marketing
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Email campaigns, QR codes, short links and landing pages — all in one place.
            </p>
          </div>
          <Link href="/marketing/email/campaigns">
            <Button className="gap-2 shrink-0">
              <Send className="w-4 h-4" />
              New Campaign
            </Button>
          </Link>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Campaigns Sent"
            value={stats.emailSent}
            sub={stats.emailScheduled > 0 ? `${stats.emailScheduled} scheduled` : "across all time"}
            icon={Send}
            accent={stats.emailSent > 0}
          />
          <StatCard
            label="Email Open Rate"
            value={stats.emailSent > 0 ? `${stats.openRate}%` : "—"}
            sub={stats.emailSent > 0 ? `${stats.totalBounces} bounced` : "send a campaign to track"}
            icon={TrendingUp}
          />
          <StatCard
            label="Link Clicks"
            value={stats.linkClicks}
            sub={`from ${stats.shortlinks} short link${stats.shortlinks !== 1 ? "s" : ""}`}
            icon={MousePointerClick}
          />
          <StatCard
            label="Total Assets"
            value={totalActivity}
            sub={`${stats.landingPages} pages · ${stats.qrCodes} QR codes · ${stats.templates} templates`}
            icon={BarChart2}
          />
        </div>

        {/* Activity overview + drafts */}
        {(stats.emailDrafts > 0 || stats.emailScheduled > 0) && (
          <div className="flex flex-wrap gap-3">
            {stats.emailDrafts > 0 && (
              <Link href="/marketing/email/campaigns">
                <div className="flex items-center gap-2 rounded-xl border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 px-4 py-2.5 text-sm cursor-pointer hover:border-amber-400 transition-colors">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {stats.emailDrafts} unsent draft{stats.emailDrafts !== 1 ? "s" : ""} — click to finish
                  </span>
                </div>
              </Link>
            )}
            {stats.emailScheduled > 0 && (
              <Link href="/marketing/email/campaigns">
                <div className="flex items-center gap-2 rounded-xl border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 px-4 py-2.5 text-sm cursor-pointer hover:border-blue-400 transition-colors">
                  <Send className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-700 dark:text-blue-400">
                    {stats.emailScheduled} campaign{stats.emailScheduled !== 1 ? "s" : ""} scheduled
                  </span>
                </div>
              </Link>
            )}
          </div>
        )}

        {/* Section links */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Marketing Tools</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <SectionCard
              title="Campaigns"
              description="Compose and send emails to your customer base with personalisation codes, CTA buttons and scheduling."
              href="/marketing/email/campaigns"
              icon={Send}
              badge={stats.emailDrafts > 0 ? `${stats.emailDrafts} draft` : undefined}
            />
            <SectionCard
              title="Email Templates"
              description="Create reusable email templates with a rich text editor. Import your business info, QR codes and shortlinks."
              href="/marketing/email/templates"
              icon={FileText}
              badge={stats.templates > 0 ? `${stats.templates} saved` : undefined}
            />
            <SectionCard
              title="Landing Pages"
              description="Build mobile-ready link-in-bio style pages to promote your products, services and social channels."
              href="/marketing/landing-pages"
              icon={Globe}
              badge={stats.landingPages > 0 ? `${stats.landingPages} live` : undefined}
            />
            <SectionCard
              title="QR Codes"
              description="Generate QR codes for your products, pages and promotions. Customise colours and download in HD."
              href="/marketing/generators/qr-codes"
              icon={QrCode}
              badge={stats.qrCodes > 0 ? `${stats.qrCodes} generated` : undefined}
            />
            <SectionCard
              title="Short Links"
              description="Create short branded links for your campaigns, track click counts and manage your link library."
              href="/marketing/generators/shortlinks"
              icon={Link2}
              badge={stats.shortlinks > 0 ? `${stats.shortlinks} links` : undefined}
            />
          </div>
        </div>

        {/* Recent campaigns */}
        {stats.recentCampaigns.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Campaigns</h2>
              <Link href="/marketing/email/campaigns">
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                  View all <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
              {stats.recentCampaigns.map((c, i) => (
                <div key={i} className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{(c as Campaign & { subject?: string }).subject ?? "Campaign"}</p>
                      <p className="text-xs text-muted-foreground">To: {(c as Campaign & { audience?: string }).audience ?? "All Customers"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold">{c.opens ?? 0} <span className="font-normal text-muted-foreground text-xs">opens</span></p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">Sent</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {totalActivity === 0 && (
          <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Megaphone className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="font-semibold">Get started with Marketing</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Create your first email campaign, landing page, QR code or short link to start engaging your customers.
            </p>
            <div className="flex gap-2 justify-center pt-1">
              <Link href="/marketing/email/campaigns">
                <Button size="sm" className="gap-1.5"><Send className="w-4 h-4" />New Campaign</Button>
              </Link>
              <Link href="/marketing/landing-pages">
                <Button variant="outline" size="sm" className="gap-1.5"><Globe className="w-4 h-4" />Landing Page</Button>
              </Link>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
