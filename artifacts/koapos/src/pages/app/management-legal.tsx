import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ExternalLink, Scale, Building2, Banknote, Shield,
  FileText, Globe, Percent, Calendar, Award, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Resource {
  name: string;
  url: string;
  description: string;
  badge?: string;
}

interface SuperRate {
  period: string;
  rate: string;
  current?: boolean;
}

/* ─── Australia ───────────────────────────────────────────────────────────── */

const AU_SUPER_RATES: SuperRate[] = [
  { period: "2021–22", rate: "10.0%" },
  { period: "2022–23", rate: "10.5%" },
  { period: "2023–24", rate: "11.0%" },
  { period: "2024–25", rate: "11.5%" },
  { period: "2025–26", rate: "12.0%", current: true },
];

const AU_GOV: Resource[] = [
  { name: "business.gov.au", url: "https://business.gov.au", description: "Official government portal for Australian businesses — registrations, support, and guidance" },
  { name: "Australian Taxation Office", url: "https://ato.gov.au", description: "Tax, BAS, GST, super, PAYG, and all ATO services" },
  { name: "ABN Lookup", url: "https://abr.business.gov.au", description: "Search and verify Australian Business Numbers" },
  { name: "ASIC", url: "https://asic.gov.au", description: "Company registration, compliance, and financial services regulation" },
  { name: "Fair Work Ombudsman", url: "https://fairwork.gov.au", description: "Employment laws, minimum wages, workplace rights, and entitlements" },
  { name: "Safe Work Australia", url: "https://safeworkaustralia.gov.au", description: "Work health and safety (WHS) laws, guides, and model codes of practice" },
  { name: "OAIC (Privacy)", url: "https://oaic.gov.au", description: "Privacy Act obligations, data handling, and notifiable data breaches" },
  { name: "Dept. of Employment & Workplace Relations", url: "https://dewr.gov.au", description: "Workforce policy, employment programs, and industrial relations" },
];

const AU_GRANTS: Resource[] = [
  { name: "Grants & Programs Finder", url: "https://business.gov.au/grants-and-programs", description: "Search all Australian Government grants and programs in one place", badge: "Start here" },
  { name: "R&D Tax Incentive", url: "https://business.gov.au/grants-and-programs/research-and-development-tax-incentive", description: "Tax offset for eligible research and development activities" },
  { name: "Export Market Development Grant", url: "https://austrade.gov.au/en/how-we-help/financial-assistance/emdg", description: "Reimbursements for eligible export promotion expenses via Austrade" },
  { name: "Small Business Support", url: "https://business.gov.au/finance", description: "Finance, loans, and support programs for small businesses" },
  { name: "Export Finance Australia", url: "https://efic.gov.au", description: "Finance solutions for Australian exporters" },
];

const AU_WAGES: Resource[] = [
  { name: "Fair Work Pay Calculator", url: "https://calculate.fairwork.gov.au", description: "Calculate correct minimum pay for any Modern Award or agreement", badge: "Recommended" },
  { name: "National Minimum Wage", url: "https://www.fairwork.gov.au/pay-and-wages/minimum-wages/national-minimum-wage", description: "Current national minimum wage — updated each July by Fair Work Commission" },
  { name: "Modern Awards List", url: "https://www.fairwork.gov.au/employment-conditions/awards", description: "Browse and download all Modern Awards covering your industry" },
  { name: "Pay and Wages Guide", url: "https://fairwork.gov.au/pay-and-wages", description: "Pay rates, allowances, overtime, penalty rates, and annualised salaries" },
  { name: "Super for Employers (ATO)", url: "https://ato.gov.au/business/super-for-employers", description: "Superannuation guarantee obligations, rates, payment deadlines, and reporting" },
];

const AU_OTHER: Resource[] = [
  { name: "Workers Compensation (Safe Work)", url: "https://safeworkaustralia.gov.au/workers-compensation", description: "State and territory workers compensation schemes and employer obligations" },
  { name: "National Employment Standards", url: "https://www.fairwork.gov.au/employment-conditions/national-employment-standards", description: "Minimum entitlements all employees are entitled to (leave, notice, etc.)" },
  { name: "Single Touch Payroll (ATO)", url: "https://ato.gov.au/business/single-touch-payroll", description: "STP reporting — how to report salary, PAYG, and super each pay run" },
  { name: "Payroll Tax by State", url: "https://business.gov.au/finance/taxation/payroll-tax", description: "State and territory payroll tax rates, thresholds, and exemptions" },
  { name: "Workplace Discrimination Laws", url: "https://humanrights.gov.au/our-work/employers/workplace-discrimination-harassment-and-bullying", description: "Australian Human Rights Commission — anti-discrimination obligations" },
  { name: "JobKeeper / Pandemic Leave Info", url: "https://ato.gov.au/business/coronavirus-covid-19-updates-for-business", description: "Historical COVID-19 business support and ongoing updates from ATO" },
];

/* ─── New Zealand ─────────────────────────────────────────────────────────── */

function ResourceCard({ resources }: { resources: Resource[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {resources.map((r) => (
        <a
          key={r.url}
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
        >
          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium leading-snug">{r.name}</span>
              {r.badge && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">{r.badge}</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{r.description}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {description && <CardDescription className="mt-1">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ─── Super / Pension rate table ─────────────────────────────────────────── */

function SuperRateTable({ rates, label }: { rates: SuperRate[]; label: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">{label}</p>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Period</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((row) => (
              <tr
                key={row.period}
                className={cn(
                  "border-b last:border-0",
                  row.current && "bg-primary/5",
                )}
              >
                <td className="px-3 py-2 flex items-center gap-2">
                  {row.period}
                  {row.current && (
                    <Badge variant="default" className="text-xs px-1.5 py-0">Current</Badge>
                  )}
                </td>
                <td className={cn("px-3 py-2 text-right tabular-nums font-medium", row.current && "text-primary")}>
                  {row.rate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Source: Australian Taxation Office.{" "}
        <a
          href="https://ato.gov.au/business/super-for-employers/work-out-how-much-super-to-pay/super-guarantee-percentage"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          Verify on ATO
        </a>
      </p>
    </div>
  );
}

/* ─── Country content ─────────────────────────────────────────────────────── */

function AustraliaContent() {
  return (
    <div className="space-y-5">
      <SectionCard
        icon={Percent}
        title="Superannuation Guarantee Rate"
        description="The compulsory super rate employers must contribute as a percentage of Ordinary Time Earnings."
      >
        <SuperRateTable
          rates={AU_SUPER_RATES}
          label="Super Guarantee schedule under the Superannuation Guarantee (Administration) Act 1992:"
        />
      </SectionCard>

      <SectionCard
        icon={Award}
        title="Award Wages & Minimum Pay"
        description="Fair Work Commission tools and resources for pay compliance."
      >
        <ResourceCard resources={AU_WAGES} />
      </SectionCard>

      <SectionCard
        icon={Building2}
        title="Government Business Resources"
        description="Key government portals every Australian business should know."
      >
        <ResourceCard resources={AU_GOV} />
      </SectionCard>

      <SectionCard
        icon={Banknote}
        title="Business Grants & Funding"
        description="Government grant finders, tax incentives, and funding programs."
      >
        <ResourceCard resources={AU_GRANTS} />
      </SectionCard>

      <SectionCard
        icon={Shield}
        title="Employment, Safety & Compliance"
        description="Workers compensation, payroll obligations, and workplace laws."
      >
        <ResourceCard resources={AU_OTHER} />
      </SectionCard>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function ManagementLegalPage() {
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Scale className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Legal & Compliance</h1>
              <p className="text-sm text-muted-foreground">
                Government resources, super rates, award wages, and grants
              </p>
            </div>
          </div>
        </div>

        <AustraliaContent />

        <p className="text-xs text-muted-foreground border-t pt-4">
          Links open official government websites in a new tab. Rates and legislation may change — always verify
          directly with the relevant authority before making payroll or compliance decisions.
        </p>
      </div>
    </AppLayout>
  );
}
