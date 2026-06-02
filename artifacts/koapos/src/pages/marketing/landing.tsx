import { MarketingLayout } from "@/components/layout/marketing-layout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  POSVisual,
  DashboardVisual,
  ProductsVisual,
  CustomersVisual,
  ServiceJobsVisual,
  ReportsVisual,
} from "@/components/marketing/feature-visuals";
import { useEffect, useRef, useState } from "react";

interface FeatureSection {
  title: string;
  emoji: string;
  features: string[];
  visual?: React.ReactNode;
}

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: "Point of Sale",
    emoji: "🖥️",
    visual: <POSVisual />,
    features: [
      "Product browsing with category tabs and favourites grid",
      "Search by product name, SKU, or barcode",
      "Cash payments with automatic change calculation",
      "Integrated EFTPOS — Tyro, CommBank, Square",
      "Split payments across any combination of methods",
      "Gift card payments at checkout",
      "Layby / pay-by-instalment checkout",
      "Store credit payments",
      "Afterpay, Zip, and Klarna buy-now-pay-later",
      "Item-level discounts (percentage or fixed dollar)",
      "Sale-wide discounts (percentage or fixed dollar)",
      "Time-of-day and day-of-week pricing rules applied automatically",
      "Category and product-specific pricing rules",
      "Modifier groups and product add-ons at point of sale",
      "Zero-price products with on-the-fly price entry",
      "Temporary / one-off line items without a product record",
      "Park a sale and resume it later from the parked sales queue",
      "Quick-add a new customer from the checkout screen",
      "Walk-in customer mode (no profile required)",
      "Customer loyalty points balance shown at checkout",
      "Loyalty points earned calculated and displayed in real time",
      "Staff PIN login at the register",
      "Manager PIN approval for discounts above a configured threshold",
      "Configurable discount caps per staff role",
      "AI-powered Upsell Coach for product recommendations",
      "Hidden cost / profit \"Kode\" mode for staff visibility",
      "Issue a new gift card directly from the POS",
      "Link a sale to an existing service job",
      "Link a sale to an existing appointment",
      "Switch to invoicing mode to create an invoice instead of a cash sale",
      "3D print job linking and status monitoring in POS",
      "PC builder component sales integration",
      "Webcam capture for ID or face logging per transaction",
      "Idempotent checkout — safe to retry without double-charging",
      "Caps Lock detection on staff PIN pads",
      "Customer warning notes shown to staff at checkout",
    ],
  },
  {
    title: "Register & End-of-Day",
    emoji: "🏧",
    features: [
      "Open a register session with an opening float amount and notes",
      "Multiple named registers supported simultaneously",
      "Cash-in and cash-out movements (petty cash) with reason notes",
      "Print a cash movement report at any time during the shift",
      "Close the register with a counted cash total",
      "EFTPOS declared total entry at close",
      "Variance display: expected vs. counted cash",
      "Closing notes field for the shift summary",
      "Z-Report generation: full sales breakdown for the session",
      "Print Z-Report and cash movement receipts to receipt printer",
      "Register session history with all open/close records",
      "Transaction count and total displayed per session",
      "End-of-day reports hub for multi-register operations",
    ],
  },
  {
    title: "Invoices",
    emoji: "📄",
    features: [
      "Create invoices with unlimited line items",
      "Line item fields: description, quantity, unit price, tax rate",
      "Invoice statuses: Draft, Sent, Paid, Partial, Overdue, Cancelled",
      "Due date field with overdue detection",
      "Customer linking on every invoice",
      "Send invoice by email direct from the app",
      "Professional PDF invoice generation with business logo",
      "QR code embedded in the PDF for easy payment",
      "Download invoice as PDF from the invoice list",
      "Invoice activity / event log with timestamps",
      "Record partial payments with running balance",
      "Gift card payment accepted on invoices",
      "Idempotent invoice payments — safe to retry",
      "Mark invoice as paid from the POS payment modal",
      "Duplicate and edit existing invoices",
      "Delete draft invoices",
      "Custom invoice number prefix and digit count",
    ],
  },
  {
    title: "Transaction History",
    emoji: "📋",
    features: [
      "Searchable full transaction history",
      "Filter by date range, payment method, and status",
      "Full receipt detail: line items, GST breakdown, discounts, loyalty points",
      "Process a full refund from the transaction detail",
      "Process a partial / item-level refund",
      "Refund reason tracking (mandatory or optional)",
      "Email or print any past receipt",
      "Void audit log — track all voided and refunded transactions",
      "Staff attribution on every transaction",
      "Export transactions to CSV",
    ],
  },
  {
    title: "Dashboard",
    emoji: "📊",
    visual: <DashboardVisual />,
    features: [
      "Fully configurable dashboard layout",
      "Drag-and-drop widget reordering and resizing",
      "Reset layout to default button",
      "Today's sales KPI tile",
      "This week's sales KPI tile",
      "This month's sales KPI tile",
      "Financial year-to-date sales KPI tile",
      "Total service jobs KPI tile",
      "Average transaction value tile",
      "Sales chart — daily, weekly, monthly views",
      "Top products by revenue widget (aggregated in database)",
      "Low-stock alert widget",
      "Overdue service jobs banner",
      "Upcoming appointments widget",
      "Service job status breakdown tiles",
      "Referral revenue widget",
      "Staff sales leaderboard widget",
      "Internal sticky notes and team notifications",
      "Security alert banner for flagged sign-in events",
      "Loading skeleton placeholders while data fetches",
      "All data calculated in the merchant's configured timezone",
    ],
  },
  {
    title: "Products",
    emoji: "📦",
    visual: <ProductsVisual />,
    features: [
      "Standard products with full attribute set",
      "Variant products (size, colour, or any custom option)",
      "Composite / bundle products (combine multiple SKUs)",
      "Service products (labour, time-based billing)",
      "Digital download products",
      "Digital code / key products (serial-number delivery)",
      "Up to 4 product images per product",
      "Product video URL",
      "SKU, barcode, and bin location fields",
      "Display and overflow bin location types",
      "Sell price and cost price",
      "Group pricing per customer segment",
      "Low-stock threshold and reorder point",
      "Real-time stock quantity tracking",
      "Assign products to categories",
      "Assign products to brands",
      "Assign products to suppliers",
      "Tag-based product organisation and filtering",
      "Custom product type schemas (e.g. serialised electronics vs bulk items)",
      "Modifier groups for add-ons and customisation options",
      "Pricing rules: time-of-day, day-of-week, product-specific, category-specific",
      "Serial number and IMEI tracking",
      "PC part compatibility rules with slot-based logic",
      "3D print job settings per product",
      "Print a product sticker/label (Dymo or thermal printer templates)",
      "Return Authorisation (RMA) creation per product",
      "Pre-order management per product",
      "Product recall management",
      "Bulk CSV import and export",
      "Filter products by tag, category, type, or stock level",
    ],
  },
  {
    title: "Inventory",
    emoji: "🗃️",
    features: [
      "Real-time stock level monitor across all products",
      "Low-stock and out-of-stock highlighting",
      "Search and filter in the inventory view",
      "Stocktake: start or resume a count by category",
      "Blind stocktake mode — system quantities hidden to prevent bias",
      "Variance review screen before applying any stock adjustments",
      "Adjust stock with a reason (receipt, write-off, correction, wastage)",
      "Wastage / write-off logging",
      "Create a purchase order directly from the inventory view",
      "Multi-location stock support (configurable)",
      "Inventory management hub with overview stats",
    ],
  },
  {
    title: "Purchase Orders",
    emoji: "🛒",
    features: [
      "Create purchase orders to any configured supplier",
      "Line items linking to existing product records",
      "PO status tracking (draft, sent, received)",
      "Custom PO number prefix and digit count",
      "Link received stock directly to inventory adjustment",
    ],
  },
  {
    title: "Customers & CRM",
    emoji: "👥",
    visual: <CustomersVisual />,
    features: [
      "Full customer profile: name, email, phone, address",
      "ABN field for business customers",
      "Separate billing and shipping addresses",
      "Warning notes that appear to staff at checkout",
      "Full transaction history per customer",
      "Service job history per customer",
      "Appointment history per customer",
      "Internal notes with timestamps",
      "File attachments per customer",
      "Loyalty points balance view and manual adjustment",
      "Marketing consent flag (opt-in / opt-out)",
      "Referral source tracking (Google, Social, Friend, Walk-in, etc.)",
      "\"Heard From\" analytics hub — correlate referral sources with revenue",
      "Automatic duplicate detection by phone number and name",
      "Merge Wizard: consolidate duplicate profiles into one",
      "Merged profile inherits all history, loyalty points, and files from both",
      "Merge audit log with staff attribution",
      "Merge 3+ customers at once in a single operation",
      "Customer segments for group pricing and marketing",
      "ABN look-up integration",
      "Customer self-service portal (accessible via unique link)",
      "Customer forms and intake questionnaires",
    ],
  },
  {
    title: "Loyalty Program",
    emoji: "⭐",
    features: [
      "Cashback (store credit) rewards model",
      "Points-per-dollar earned model",
      "Tiered loyalty rates for high-value customers",
      "Stamp card model",
      "Loyalty point multipliers and bonus events",
      "Loyalty promotions (e.g. double-points days)",
      "Loyalty leaderboard for top customers",
      "Configurable minimum spend for point earning",
      "Configurable point redemption value",
      "Loyalty balance shown at every checkout",
      "Apple Wallet loyalty pass integration",
      "Google Wallet loyalty pass integration",
      "Wallet pass auto-update on every transaction",
    ],
  },
  {
    title: "Gift Cards",
    emoji: "🎁",
    features: [
      "Issue gift cards at the POS",
      "Custom gift card values",
      "Gift card master ledger — all issued, redeemed, and expired cards",
      "Atomic balance deduction: card debited only when sale succeeds",
      "Gift card payment at the POS checkout",
      "Gift card payment on invoices",
      "Check remaining balance at any time",
      "Gift card expiry management",
    ],
  },
  {
    title: "Staff Management",
    emoji: "👤",
    features: [
      "Employee profile with photo, name, email, phone",
      "Emergency contact information",
      "Role-based permissions: Owner, Manager, Cashier",
      "Custom 4-digit staff PIN",
      "Default register assignment per staff member",
      "Pay rate, casual loading, and superannuation tracking",
      "Sales performance report per staff member with date range filter",
      "Staff KPIs: targets and actuals",
      "Staff sales leaderboard",
      "Rostering: shift scheduling and weekly view",
      "Leave request management and approval",
      "Clock-in / clock-out timesheets",
      "Staff internal social feed",
      "Internal staff notes",
      "Staff quick-links hub",
      "Staff overview dashboard",
    ],
  },
  {
    title: "Service Jobs",
    emoji: "🔧",
    visual: <ServiceJobsVisual />,
    features: [
      "Create service and repair tickets",
      "Ticket statuses: Pending, In Progress, Awaiting Customer, Awaiting Stock, Completed",
      "Critical priority flagging on any job",
      "Per-job notes with automatic timestamp and staff attribution",
      "Service job templates for common repairs",
      "Link inventory parts to a service job",
      "Labour and parts cost tracking",
      "Print a professional A4 service job sheet",
      "Print a Device ID sticker",
      "Attach custom forms or checklists to jobs",
      "Customer status updates (email/SMS) when job status changes",
      "Custom service job number prefix and digit count",
      "Overdue job banners on the dashboard",
      "Link a completed job to a POS sale",
    ],
  },
  {
    title: "Appointments",
    emoji: "📅",
    features: [
      "Monthly and weekly calendar view",
      "Create appointments linked to a customer and staff member",
      "Appointment duration tracking",
      "Attach custom forms or checklists",
      "One-click Google Maps link to customer address",
      "Custom appointment number prefix and digit count",
      "Birthday calendar overlay on the appointment view",
      "Sync appointments to the dashboard upcoming-events widget",
    ],
  },
  {
    title: "Reports",
    emoji: "📈",
    visual: <ReportsVisual />,
    features: [
      "Z-Report: full POS close report for any session",
      "Daily reports hub with close-of-day summaries",
      "BAS / GST report: G1 total sales, 1A GST on sales",
      "Margin report: sell price, cost, margin per product",
      "Product performance report: units sold, revenue by product",
      "Staff sales leaderboard report with date range",
      "Void and refund audit report",
      "Referral source revenue attribution report",
      "Management sales overview",
    ],
  },
  {
    title: "Marketing & Campaigns",
    emoji: "📣",
    features: [
      "Email campaign builder",
      "Drag-and-drop or code-based email template editor",
      "Send campaigns to customer segments",
      "Schedule campaigns for future delivery",
      "Trigger-based marketing automations",
      "Birthday bonus automation",
      "First-visit welcome automation",
      "Re-engagement automation for lapsed customers",
      "QR code generator for products and pages",
      "Short link generator and click tracker",
      "Landing page / bio-link builder (Linktree-style)",
      "Customisable landing page: background, fonts, button styles, profile image",
      "Referral program management",
      "Referral reward configuration",
      "AI marketing content generator",
      "Product description generator (AI)",
      "Headline and ad copy generator (AI)",
      "Social media post generator (AI)",
      "Marketing social feed",
    ],
  },
  {
    title: "Online & Delivery",
    emoji: "🚚",
    features: [
      "Delivery order management board (Kanban-style)",
      "Order statuses: Pending, Accepted, Preparing, Ready, Out for Delivery, Delivered, Cancelled",
      "Multi-platform order intake with platform label per order",
      "Customer name, address, phone per delivery order",
      "Estimated delivery time field",
      "Order notes",
      "Shipping label management (Australia Post, Sendle)",
      "Online marketplace listing management",
      "Online store configuration",
    ],
  },
  {
    title: "Integrations",
    emoji: "🔌",
    features: [
      "Xero: sync sales, COGS, and GST to your Xero account",
      "QuickBooks Online: accounting sync",
      "Tyro EFTPOS: fully integrated countertop payments",
      "CommBank Smart Terminal: integrated EFTPOS",
      "Square: payment terminal integration",
      "Stripe Connect: online and in-person payments",
      "Afterpay: buy-now-pay-later checkout",
      "Zip: buy-now-pay-later checkout",
      "Klarna: buy-now-pay-later checkout",
      "Google: Ads, Calendar, and Contacts sync",
      "Microsoft 365 / Outlook: Contacts sync",
      "Dropbox: file storage and sync",
      "OneDrive: file storage and sync",
      "Meta (Facebook & Instagram): marketing integrations",
      "Twitter / X: social posting",
      "LinkedIn: social posting",
      "TikTok Business: marketing integration",
      "Shopify: inventory and order sync",
      "eBay: inventory and order sync",
      "Amazon: inventory and order sync",
      "WooCommerce: inventory and order sync",
      "Australia Post: shipping labels and tracking",
      "Sendle: courier booking and tracking",
      "Apple Wallet: loyalty passes",
      "Google Wallet: loyalty passes",
      "Apple Sign In: merchant account login",
      "OpenAI: AI-powered features throughout the app",
      "OAuth token vault with AES-256-GCM encryption",
      "Key rotation support without merchant reconnection",
      "Integration enable/disable per merchant without losing config",
    ],
  },
  {
    title: "Settings — Business",
    emoji: "🏢",
    features: [
      "Business name, ABN, and trading name",
      "Business logo upload",
      "Contact email, phone, and website",
      "Physical address",
      "Operating hours per day of week",
    ],
  },
  {
    title: "Settings — Tax & Regional",
    emoji: "🌏",
    features: [
      "GST / tax rate configuration",
      "Tax-inclusive or tax-exclusive pricing toggle",
      "Multiple tax classes",
      "Currency selection",
      "Timezone selection (full global timezone list)",
      "Date format selection",
      "Time format (12h / 24h)",
      "Phone number format / region",
      "Extended regional settings (public holiday region, etc.)",
    ],
  },
  {
    title: "Settings — Email",
    emoji: "✉️",
    features: [
      "SMTP provider: host, port, user, password, TLS toggle",
      "Resend API key provider",
      "SendGrid API key provider",
      "From name and from email address",
      "Receipt email template with business branding",
      "Service job update email template",
      "Invoice email template",
      "Test email send from the settings page",
    ],
  },
  {
    title: "Settings — POS & Misc",
    emoji: "⚙️",
    features: [
      "Product type management: rename, reorder, add custom types",
      "Modifier group configuration",
      "Pricing rule management (time/day/product/category)",
      "Tyro EFTPOS terminal pairing and configuration",
      "Customer settings (loyalty opt-in default, ABN prompt, etc.)",
      "Map provider preference: Google Maps, Apple Maps, OpenStreetMap, Waze",
      "Document code prefixes: receipt, invoice, service, appointment, purchase order",
      "Document number digit length per type",
      "Receipt and invoice print template customisation",
    ],
  },
  {
    title: "Security & Account",
    emoji: "🔒",
    features: [
      "Email and password authentication",
      "Forgot password flow — receive a reset link by email",
      "Password reset with 1-hour expiry token",
      "Invalid or expired token handled with a clear error message",
      "Email change with current password confirmation",
      "Password change from the account settings page",
      "Account lock after configurable number of failed login attempts",
      "Account lock lifted automatically after cooldown with email notification",
      "Anomaly hold on suspicious multi-IP failed login activity",
      "Clear anomaly hold via single-use email link (no active session needed)",
      "Failed login attempt email notifications (opt-in per merchant)",
      "Successful login email notifications (opt-in per merchant)",
      "New IP / new location sign-in alert (always sent, not opt-in)",
      "Security event log: last 50 sign-in events with IP and browser",
      "Flag or dismiss individual sign-in events",
      "Suspicious sign-in alert email when an event is manually flagged",
      "OAuth key rotation UI for vault key rollover",
    ],
  },
  {
    title: "Speciality Modules",
    emoji: "🧩",
    features: [
      "3D Printing — job tracking from submission to completion",
      "3D Printing — material and filament cost calculator",
      "3D Printing — print time estimator",
      "3D Printing — link print jobs to POS sales",
      "PC Builder — component compatibility checker with slot-based rules",
      "PC Builder — full build cost calculator",
      "PC Builder — link builds to POS sales",
      "Floor Plan — visual store layout designer with drag-and-drop zones",
      "Floor Plan — map stock to physical store shelf locations",
      "Cameras — IP camera management and configuration",
      "Cameras — picture-in-picture camera view embedded in POS",
      "Sticker Labels — customisable Dymo and thermal label templates",
      "Sticker Labels — print from product detail or bulk from inventory",
      "Forms — custom form builder for any purpose",
      "Forms — attach forms to appointments or service jobs",
      "Forms — customer intake forms at check-in",
      "Feedback — customer feedback collection and management",
      "Layby — create and track layby payment instalments",
      "Layby — deposit and instalment schedule management",
      "KPIs — business KPI tracking and target management",
      "AI Business Assistant — ask questions about your business",
    ],
  },
  {
    title: "Customer Display & Portal",
    emoji: "🖥️",
    features: [
      "Customer-facing second screen display at the POS counter",
      "Shows cart contents, totals, and loyalty balance in real time",
      "Customer self-service portal via a unique shareable link",
      "Portal shows loyalty balance, transaction history, and profile",
    ],
  },
  {
    title: "Import & Export",
    emoji: "📤",
    features: [
      "CSV import for products with column mapping",
      "CSV import for customers",
      "CSV export for products",
      "CSV export for customers",
      "CSV export for transactions",
      "Excel (XLSX) export for reports with styled formatting",
      "Data migration tooling",
    ],
  },
];

function toSectionId(title: string): string {
  return "feature-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const offset = 80;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: "smooth" });
}

function FeatureNav({ sections, activeId }: { sections: FeatureSection[]; activeId: string }) {
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileRef.current) return;
    const activeBtn = mobileRef.current.querySelector<HTMLElement>("[data-active='true']");
    if (activeBtn) {
      activeBtn.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [activeId]);

  return (
    <>
      {/* Mobile: sticky horizontal scrollable tabs */}
      <div className="lg:hidden sticky top-14 z-30 bg-background/95 backdrop-blur border-b border-border -mx-4 px-4 py-2">
        <div ref={mobileRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {sections.map((s) => {
            const id = toSectionId(s.title);
            const isActive = activeId === id;
            return (
              <button
                key={id}
                data-active={isActive ? "true" : "false"}
                onClick={() => scrollToSection(id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                <span>{s.emoji}</span>
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: sticky sidebar */}
      <nav className="hidden lg:block sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto no-scrollbar">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 px-2">
          Jump to section
        </p>
        <ul className="space-y-0.5">
          {sections.map((s) => {
            const id = toSectionId(s.title);
            const isActive = activeId === id;
            return (
              <li key={id}>
                <button
                  onClick={() => scrollToSection(id)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="text-base leading-none">{s.emoji}</span>
                  <span className="leading-snug">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function FeatureOutline({ sections }: { sections: FeatureSection[] }) {
  const [activeId, setActiveId] = useState(() => toSectionId(sections[0]?.title ?? ""));
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const ids = sections.map((s) => toSectionId(s.title));
    const ratioMap = new Map<string, number>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratioMap.set(entry.target.id, entry.intersectionRatio);
        }
        let bestId = "";
        let bestRatio = -1;
        for (const [id, ratio] of ratioMap.entries()) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestId) setActiveId(bestId);
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1], rootMargin: "-80px 0px -20% 0px" }
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [sections]);

  let visualIndex = 0;

  return (
    <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-10 lg:items-start">
      <FeatureNav sections={sections} activeId={activeId} />

      <div className="space-y-8 mt-4 lg:mt-0">
        {sections.map((section) => {
          const id = toSectionId(section.title);
          if (section.visual) {
            const flip = visualIndex % 2 !== 0;
            visualIndex++;
            return (
              <div
                id={id}
                key={section.title}
                className="bg-background rounded-2xl border border-border p-8 scroll-mt-24"
              >
                <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <span className="text-3xl">{section.emoji}</span>
                  <span>{section.title}</span>
                  <span className="ml-auto text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                    {section.features.length} features
                  </span>
                </h3>
                <div
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-start ${flip ? "lg:[&>*:first-child]:order-2" : ""}`}
                >
                  <div className="w-full">{section.visual}</div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {section.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          }
          return (
            <div
              id={id}
              key={section.title}
              className="bg-background rounded-2xl border border-border p-8 scroll-mt-24"
            >
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="text-3xl">{section.emoji}</span>
                <span>{section.title}</span>
                <span className="ml-auto text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                  {section.features.length} features
                </span>
              </h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
                {section.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TOTAL_FEATURE_COUNT = FEATURE_SECTIONS.reduce((sum, s) => sum + s.features.length, 0);
const TOTAL_SECTION_COUNT = FEATURE_SECTIONS.length;

export default function LandingPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="py-24 md:py-32 overflow-hidden bg-background">
        <div className="container mx-auto px-4 md:px-8 text-center max-w-4xl">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8">
            The POS built for modern <span className="text-primary">Australian retail</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            KoaPOS is the reliable workhorse your retail business needs. Fast on a tablet, deeply connected, and designed for professionals who move fast.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto text-lg h-14 px-8">Start your free trial</Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">View Pricing</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature outline */}
      <section className="py-16 bg-muted/30 border-t border-border">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              Complete feature outline
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              <span className="font-semibold text-foreground">{TOTAL_FEATURE_COUNT}+ features</span> across{" "}
              <span className="font-semibold text-foreground">{TOTAL_SECTION_COUNT} categories</span> — every capability
              included in KoaPOS, built for Australian retailers who need professional tools, not compromises.
            </p>
          </div>

          <FeatureOutline sections={FEATURE_SECTIONS} />

          <div className="text-center mt-16">
            <p className="text-muted-foreground mb-6 text-lg">Ready to see it in action?</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto text-lg h-14 px-8">Start your free trial</Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">View Pricing</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
