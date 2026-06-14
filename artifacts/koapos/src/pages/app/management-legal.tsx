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

type CountryCode = "AU" | "NZ" | "UK" | "US" | "CA";

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

const NZ_GOV: Resource[] = [
  { name: "business.govt.nz", url: "https://business.govt.nz", description: "NZ Government business portal — permits, regulations, and support" },
  { name: "Inland Revenue (IRD)", url: "https://ird.govt.nz", description: "Tax, GST, KiwiSaver, PAYE, and employer obligations" },
  { name: "Companies Office (NZCO)", url: "https://companiesoffice.govt.nz", description: "Company registration, annual returns, and compliance" },
  { name: "Employment New Zealand", url: "https://employment.govt.nz", description: "Employment laws, minimum wage, leave entitlements, and employer guides" },
  { name: "WorkSafe New Zealand", url: "https://worksafe.govt.nz", description: "Health and safety laws, duties, and enforcement" },
  { name: "NZ Business Funding", url: "https://business.govt.nz/funding-and-investment/", description: "Grants, loans, and investment options for NZ businesses" },
];

const NZ_KIWISAVER: SuperRate[] = [
  { period: "Employee minimum", rate: "3%" },
  { period: "Employer minimum", rate: "3%" },
  { period: "Employee optional tiers", rate: "4%, 6%, 8%, 10%" },
];

/* ─── United Kingdom ──────────────────────────────────────────────────────── */

const UK_GOV: Resource[] = [
  { name: "GOV.UK Business", url: "https://gov.uk/browse/business", description: "HMRC, Companies House, employer duties, and business guidance" },
  { name: "HMRC", url: "https://hmrc.gov.uk", description: "Corporation tax, VAT, PAYE, and business tax registration" },
  { name: "Companies House", url: "https://companieshouse.gov.uk", description: "Company registration, annual filings, and director information" },
  { name: "Acas", url: "https://acas.org.uk", description: "Employment law, contracts, disciplinaries, and workplace advice" },
  { name: "Health & Safety Executive (HSE)", url: "https://hse.gov.uk", description: "Health and safety regulations and employer responsibilities" },
  { name: "UK Business Finance Guide", url: "https://businessfinanceguide.co.uk", description: "Grants, loans, and government-backed finance for UK businesses" },
  { name: "British Business Bank", url: "https://british-business-bank.co.uk", description: "Government-backed loans and investment programs for SMEs" },
];

/* ─── United States ───────────────────────────────────────────────────────── */

const US_GOV: Resource[] = [
  { name: "SBA (Small Business Administration)", url: "https://sba.gov", description: "Loans, grants, counselling, and resources for US small businesses", badge: "Start here" },
  { name: "IRS Business Tax Center", url: "https://irs.gov/businesses", description: "Federal tax filings, EIN application, and employer tax obligations" },
  { name: "Dept. of Labor", url: "https://dol.gov", description: "Federal minimum wage, employee rights, and labor regulations" },
  { name: "Grants.gov", url: "https://grants.gov", description: "Federal grants database — search by agency, category, and eligibility" },
  { name: "OSHA", url: "https://osha.gov", description: "Occupational health and safety regulations and employer obligations" },
  { name: "USA Business Portal", url: "https://business.usa.gov", description: "Licenses, permits, registration, and federal resources in one place" },
];

/* ─── Canada ──────────────────────────────────────────────────────────────── */

const CA_GOV: Resource[] = [
  { name: "Canada Business Network", url: "https://canadabusiness.ca", description: "Government programs, permits, financing, and hiring guides" },
  { name: "CRA Business", url: "https://canada.ca/en/revenue-agency/services/tax/businesses.html", description: "GST/HST, payroll deductions, corporate tax, and CRA accounts" },
  { name: "ESDC (Employment)", url: "https://canada.ca/en/employment-social-development.html", description: "Labour standards, EI, and employment programs" },
  { name: "Innovation Canada Funding Finder", url: "https://innovation.canada.ca/en/funding-finder", description: "Federal and provincial business funding, grants, and tax credits" },
  { name: "BDC", url: "https://bdc.ca", description: "Business Development Bank — loans, capital, and advisory services" },
  { name: "WSIB (Ontario Workers Comp.)", url: "https://wsib.ca", description: "Workers compensation and workplace insurance (Ontario; other provinces vary)" },
];

/* ─── Shared helpers ──────────────────────────────────────────────────────── */

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

function NewZealandContent() {
  return (
    <div className="space-y-5">
      <SectionCard
        icon={Percent}
        title="KiwiSaver Contribution Rates"
        description="Minimum contribution rates for employees and employers under KiwiSaver."
      >
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Contributor</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rate</th>
              </tr>
            </thead>
            <tbody>
              {NZ_KIWISAVER.map((row) => (
                <tr key={row.period} className="border-b last:border-0">
                  <td className="px-3 py-2">{row.period}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{row.rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Source: Inland Revenue NZ.{" "}
          <a
            href="https://ird.govt.nz/kiwisaver/employer-contributions-for-kiwisaver/what-you-contribute-as-an-employer"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Verify on IRD
          </a>
        </p>
      </SectionCard>

      <SectionCard
        icon={Building2}
        title="Government Business Resources"
        description="Key New Zealand government portals for business compliance and support."
      >
        <ResourceCard resources={NZ_GOV} />
      </SectionCard>
    </div>
  );
}

function UKContent() {
  return (
    <div className="space-y-5">
      <SectionCard
        icon={Building2}
        title="Government Business Resources"
        description="Key UK government portals for employer compliance, tax, and support."
      >
        <ResourceCard resources={UK_GOV} />
      </SectionCard>
    </div>
  );
}

function USContent() {
  return (
    <div className="space-y-5">
      <SectionCard
        icon={Building2}
        title="Government Business Resources"
        description="Key US federal government portals for business compliance and support."
      >
        <ResourceCard resources={US_GOV} />
      </SectionCard>
    </div>
  );
}

function CanadaContent() {
  return (
    <div className="space-y-5">
      <SectionCard
        icon={Building2}
        title="Government Business Resources"
        description="Key Canadian government portals for business compliance and support."
      >
        <ResourceCard resources={CA_GOV} />
      </SectionCard>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

const COUNTRIES: { code: CountryCode; label: string }[] = [
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
  { code: "UK", label: "United Kingdom" },
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
];

export default function ManagementLegalPage() {
  const [country, setCountry] = useState<CountryCode>("AU");

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
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <Select value={country} onValueChange={(v) => setCountry(v as CountryCode)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Country-specific content */}
        {country === "AU" && <AustraliaContent />}
        {country === "NZ" && <NewZealandContent />}
        {country === "UK" && <UKContent />}
        {country === "US" && <USContent />}
        {country === "CA" && <CanadaContent />}

        <p className="text-xs text-muted-foreground border-t pt-4">
          Links open official government websites in a new tab. Rates and legislation may change — always verify
          directly with the relevant authority before making payroll or compliance decisions.
        </p>
      </div>
    </AppLayout>
  );
}
