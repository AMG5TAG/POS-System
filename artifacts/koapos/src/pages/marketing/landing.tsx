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
      "Integrated EFTPOS — Tyro, CommBank Smart, Square Terminal",
      "Split payments across any combination of methods",
      "Gift card payments at checkout",
      "Layby / pay-by-instalment checkout",
      "Store credit payments",
      "Afterpay, Zip, and Klarna scan-to-pay at the counter",
      "PayPal, WeChat Pay, and Alipay QR payments",
      "Define your own custom payment methods",
      "Per-method surcharges — pass on to the customer or absorb as a cost",
      "Item-level discounts (percentage or fixed dollar)",
      "Sale-wide discounts (percentage or fixed dollar)",
      "Coupon codes and automatic discounts applied at the till",
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
      "AI Upsell Coach — add-on suggestions with a script for the cashier",
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
    title: "Quotes",
    emoji: "🧾",
    features: [
      "Build priced quotes from catalogue products or free-text lines",
      "Overall discount as a fixed amount or a percentage",
      "GST calculated and shown on every quote",
      "\"Valid until\" expiry date with automatic expired flagging",
      "Default validity period configured once and pre-filled",
      "Quote numbering with custom prefix and digit count",
      "Status tracking: draft, sent, accepted, expired, converted",
      "One-click Accept on sent quotes",
      "Email the quote to the customer as a PDF",
      "Download or print the quote PDF",
      "Convert a quote straight into a sale with product links intact",
      "Customers approve or decline quotes online in the portal",
      "Active and Converted & Expired tabs with search",
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
      "Recurring invoices — weekly, fortnightly, monthly, or custom cycles",
      "Set a fixed number of occurrences or bill indefinitely",
      "Instalment payment schedules with per-instalment due dates",
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
      "Per-product warranty period",
      "PC part compatibility rules with slot-based logic",
      "3D print job settings per product",
      "Print a product sticker/label (Dymo or thermal printer templates)",
      "Auto-generated product QR codes for shelf labels",
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
    title: "Warranty Tracking",
    emoji: "🛡️",
    features: [
      "One live register of everything still under warranty",
      "Covers both products sold and completed repairs",
      "Grouped by time remaining — 1 month through 3 years",
      "Days-remaining badge turns red inside 30 days",
      "Serial numbers, customer, and reference number on every row",
      "Search by product, SKU, serial, reference, or customer",
      "Jump straight to the original tax invoice or service job",
      "Warranty periods pulled from the product and the repair job",
    ],
  },
  {
    title: "Multi-Location",
    emoji: "📍",
    features: [
      "Create multiple branches with name, code, address, and phone",
      "Nominate a default location for the business",
      "Switch the register's active location in one click",
      "Per-product stock levels shown side by side across every branch",
      "Stock transfers between locations with server-side validation",
      "Deletion guard explains when a location is still in use",
    ],
  },
  {
    title: "Customers & CRM",
    emoji: "👥",
    visual: <CustomersVisual />,
    features: [
      "Full customer profile: name, email, phone, address",
      "ABN field with checksum validation for business customers",
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
      "Customer forms and intake questionnaires",
      "Sync customers to Google, Outlook, or iCloud Contacts",
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
      "Apple Wallet loyalty pass — issued from the customer portal",
      "Google Wallet loyalty pass — issued from the customer portal",
      "Earn loyalty points on online store purchases",
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
    title: "Discounts & Promotions",
    emoji: "🏷️",
    features: [
      "Percentage off, fixed amount off, and BOGO discount types",
      "Coupon codes with one-click copy, or automatic code-free discounts",
      "Minimum order amount before a discount applies",
      "Maximum uses cap with live usage tracking, or unlimited",
      "Start and end dates for scheduled and seasonal promotions",
      "Product exclusions — items that never receive the discount",
      "Active / inactive toggle per discount",
      "The same discount rules apply at the POS and in the online store",
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
      "Internal staff notes",
      "Staff quick-links hub",
      "Staff overview dashboard",
    ],
  },
  {
    title: "Payroll",
    emoji: "💼",
    features: [
      "Connect Xero Payroll by OAuth — AU, NZ, and UK regions",
      "Create a draft pay run for any period",
      "Post and lodge a pay run so the provider handles STP",
      "Pay run detail with Gross, PAYG, Super, and Net totals",
      "Per-employee payslip breakdown on every run",
      "All-payslips view across every pay run",
      "Push the pay run journal into your Xero accounting connection",
      "Merchant-set account codes for wages, PAYG, super, and net pay",
      "Sync employees and leave balances from the provider",
      "Leave balances by type — annual, personal, long service",
      "Staff cost summary: pay rate and on-costs against revenue earned",
      "Cost period filters — week, month, quarter, or year",
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
      "Estimate approval and deposit collection",
      "Diagnostics and QC checklists",
      "Technician time tracking per job",
      "On-screen customer sign-off",
      "Mail-in shipping and tracking details",
      "Repair warranty and no-charge rework periods with defaults",
      "Turn optional job sections on or off for your workflow",
      "Print a professional A4 service job sheet",
      "Print an 80mm service docket to the receipt printer",
      "Print a Device ID sticker",
      "Attach custom forms or checklists to jobs",
      "Customer status updates by email or SMS when a job changes",
      "Custom service job number prefix and digit count",
      "Overdue job banners on the dashboard",
      "Link a completed job to a POS sale",
    ],
  },
  {
    title: "Trade-Ins, Loaners & Service Plans",
    emoji: "🔁",
    features: [
      "Record trade-ins with device name, IMEI or serial, and condition grade",
      "Quoted → accepted → listed trade-in workflow",
      "Pay a trade-in out as cash or as store credit",
      "List an accepted device as refurbished stock in one click",
      "Register a loaner device pool with serial or asset tags",
      "Issue a loaner with a due-back date and condition-on-issue note",
      "Overdue loaner alerts and one-click return to the pool",
      "Service plans: recurring contracts and retainers per customer",
      "Plan fee, billing cycle, and response SLA in hours",
      "Monthly Recurring Revenue and active plan tiles",
      "Bill a plan on demand — generates the invoice immediately",
      "Pause, resume, or cancel a plan at any time",
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
      "Push appointments to Google, Outlook, or Apple Calendar",
    ],
  },
  {
    title: "Customer Portal, Booking & Display",
    emoji: "🔗",
    features: [
      "Customer self-service portal via a unique link — no password needed",
      "Portal loyalty tab with balance and Apple/Google Wallet passes",
      "Customers update their own profile, address, and date of birth",
      "Customers view and request appointments online",
      "Customers track their repair jobs and statuses",
      "Customers approve or decline quotes online",
      "Custom domain for the portal with CNAME setup instructions",
      "Public repair booking form — branded, no account required",
      "Booking form raises a pending service job and returns a reference number",
      "Customer-facing second screen at the POS counter",
      "Live cart mirror with discounts, GST, and total",
      "Loyalty points-to-earn banner on the customer display",
    ],
  },
  {
    title: "Companion Apps",
    emoji: "📱",
    features: [
      "Tech App — a shop-floor app for technicians, opened by link, no install",
      "Staff PIN sign-in scoped to your business only",
      "Technicians view assigned jobs, add notes, and upload photos and video",
      "Live QR scanner — scan a printed ticket to open that job",
      "Managers control access to customer contacts and device credentials",
      "Full moderation trail of every technician action",
      "Mobile POS — a phone-sized till for selling on the floor",
      "Mobile POS sells from the catalogue and takes cash, card, or EFTPOS",
      "Mobile POS creates and views invoices",
      "Per-tab visibility controls for the mobile till",
      "Dashboard App — a read-only wall display on an unguessable link",
      "Choose exactly which metrics and widgets the display exposes",
      "Kill any app link instantly from Management",
      "Share app links by copy, email, or SMS",
    ],
  },
  {
    title: "Online Store",
    emoji: "🛍️",
    features: [
      "Block-based store builder with 27 block types",
      "Starter page templates and a saved-section library",
      "Multi-page site with visibility and scheduled publish dates",
      "Colour presets, font and corner-radius themes, logo and favicon",
      "Responsive preview widths and a full-screen editor",
      "Live storefront with a shoppable cart layer",
      "Custom domain with CNAME setup and certificate verification",
      "Public product pages — the landing page for your QR stickers",
      "Customer product reviews with moderation and verified badges",
      "Checkout revalidates live prices and stock on every line",
      "Discount codes honoured at online checkout",
      "Orders decrement stock and land on the delivery board automatically",
      "Order confirmation email with an order number",
      "Public order tracking by email and order number",
      "SEO: meta tags, Open Graph, Twitter cards, JSON-LD, and sitemap.xml",
      "Or record a connection to an existing Shopify, WooCommerce, BigCommerce, Squarespace, Wix, or Neto store",
    ],
  },
  {
    title: "Deliveries & Shipping",
    emoji: "🚚",
    features: [
      "Delivery order management board (Kanban-style)",
      "Order statuses: Pending, Accepted, Preparing, Ready, Out for Delivery, Delivered, Cancelled",
      "Multi-platform order intake with platform label per order",
      "Customer name, address, phone per delivery order",
      "Estimated delivery time field",
      "Order notes",
      "Shipping carrier and account credential management",
      "Carrier tracking links on service jobs for mail-in repairs",
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
      "Excel (XLSX) export with styled formatting",
    ],
  },
  {
    title: "Marketing & Campaigns",
    emoji: "📣",
    features: [
      "Email campaign builder",
      "Rich-text email template editor with merge codes",
      "Send campaigns to customer segments",
      "Schedule campaigns for future delivery",
      "Trigger-based marketing automations",
      "Birthday bonus automation",
      "First-visit welcome automation",
      "Re-engagement automation for lapsed customers",
      "Follow-up work list of customers due a check-in after a job or appointment",
      "Send follow-ups by email, SMS, or both, in bulk",
      "Follow-up merge shortcodes with live preview before sending",
      "Configurable review link to ask happy customers for a review",
      "Send log with sent / skipped / failed reporting and undo",
      "Email signature generator",
      "Landing page / bio-link builder (Linktree-style)",
      "Customisable landing page: background, fonts, button styles, profile image",
      "Referral program management",
      "Referral reward configuration",
    ],
  },
  {
    title: "SMS & Messaging",
    emoji: "💬",
    features: [
      "Twilio SMS integration with encrypted credential storage",
      "Send a test SMS from settings to verify your setup",
      "SMS campaigns with live character counter and segment calculation",
      "Audience targeting: all, loyalty members, new, inactive, or high-value customers",
      "Live recipient count before you send",
      "Send now, schedule for later, or save as a draft",
      "Reusable SMS templates with merge fields and categories",
      "Starter template pack — welcome, promo, win-back, reminders",
      "Automatic service job status notifications to customers",
      "Master SMS on/off switch per business",
    ],
  },
  {
    title: "QR Codes, Short Links & Analytics",
    emoji: "📶",
    features: [
      "16 QR code types — URL, vCard, Wi-Fi, calendar, SMS, dynamic, and more",
      "19 frame templates, 6 dot styles, custom eye and frame colours",
      "Centre logo, brand fonts, and 4 error-correction levels",
      "PNG and SVG export at print scale",
      "Dynamic QR codes — change the destination after printing",
      "Auto-generated QR codes for products, customers, and service jobs",
      "Branded koast.al short links with custom endings",
      "Reserved-word and profanity guards on custom endings",
      "Tag, search, edit, and delete short links",
      "Click and scan tracking with device, country, and referrer",
      "Marketing analytics hub with daily time-series charts",
      "Total events, unique visitors, and top-performing targets",
    ],
  },
  {
    title: "AI Assistant",
    emoji: "🤖",
    features: [
      "AI Business Assistant grounded in your own live business data",
      "Budget & profit forecasting from your last 30 days of real revenue",
      "Stock order recommendations built from your actual low-stock list",
      "Marketing ideas tailored to Australian retail",
      "Saved conversations per mode with suggested starter prompts",
      "Streaming responses with markdown formatting",
      "AI Upsell Coach at the till, validated against real in-stock products",
      "Business-wide AI on/off switch",
      "Bring your own OpenAI API key if you prefer",
    ],
  },
  {
    title: "Printing & Hardware",
    emoji: "🖨️",
    features: [
      "Named printer profiles — as many printers as the shop has",
      "Route 12 document types each to a different printer",
      "Receipts, dockets, invoices, quotes, purchase orders, labels, and more",
      "Silent receipt printing straight from Chrome or Edge over USB or serial",
      "Print Bridge — a small till service for A4, LAN, and label printers",
      "Automatic fallback: raw ESC/POS → bridge → print dialog, so a print never blocks a sale",
      "Warning when a document is routed to a printer with the wrong paper loaded",
      "Per-till printer overrides for machine-specific queue names",
      "Cash drawer kick with configurable pulse and open-on-cash-sale",
      "Printer model presets — Partner Tech RP-700/630/600 and generic 80mm/58mm",
      "Auto-cutter, native QR, and correct text wrapping per paper width",
      "Test receipt that exercises the cutter and drawer",
      "Die-cut label stock printed at the exact template size",
      "Barcode scanner config: USB-HID, serial, or Bluetooth with prefix/suffix",
      "Auto-print on sale and on refund",
    ],
  },
  {
    title: "Integrations",
    emoji: "🔌",
    features: [
      "Xero: sync sales, invoices, purchase orders, and contacts with GST mapped",
      "Xero Payroll: pay runs, payslips, leave, and STP lodgement",
      "Tyro EFTPOS: fully integrated countertop payments",
      "CommBank Smart Terminal: integrated EFTPOS",
      "Square: Terminal and Reader payments",
      "Stripe: connect your own account with your API keys",
      "PayPal: in-store QR payments",
      "WeChat Pay and Alipay: in-store merchant QR codes",
      "Afterpay, Zip, and Klarna: buy-now-pay-later at the counter",
      "Apple Wallet and Google Wallet: digital loyalty passes",
      "Google Workspace: Drive backups, Contacts, and Calendar",
      "Google Ads and Google Business Profile",
      "Microsoft 365: OneDrive, Outlook Contacts, and Calendar",
      "Apple iCloud: Contacts and Calendar via app-specific password",
      "Dropbox: file storage and sync",
      "Nextcloud: self-hosted storage on your own server",
      "Australia Post: carrier account credentials and tracking links",
      "Twilio: SMS campaigns and customer notifications",
      "OpenAI: bring your own key for AI features",
      "OAuth token vault with AES-256-GCM encryption",
      "Key rotation support without merchant reconnection",
      "Integration enable/disable per merchant without losing config",
    ],
  },
  {
    title: "Backups & Cloud Sync",
    emoji: "☁️",
    features: [
      "Full-store encrypted backups (AES-256) with a password only you know",
      "Six destination types: server, Amazon S3, Google Cloud Storage, SFTP, OneDrive, Nextcloud",
      "Back up to several destinations at once",
      "Named multi-schedules — nightly to S3 and monthly to OneDrive side by side",
      "Daily, weekly, monthly, or manual-only frequencies",
      "Back up now on demand with live status and per-backup logs",
      "Restore any backup inside one transaction — a failure rolls back cleanly",
      "Download a backup archive to your own computer",
      "One failing destination never aborts the others",
      "Contacts and calendar sync to Google, Microsoft, and Apple iCloud",
      "Automatic sync schedules: instant, 8-hourly, daily, or monthly",
      "Mirror every customer file to OneDrive, Google Drive, Dropbox, or Nextcloud",
      "Banner alert when an automatic sync last failed",
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
      "Business username for portal and app links",
    ],
  },
  {
    title: "Settings — Tax & Regional",
    emoji: "🌏",
    features: [
      "GST / tax rate configuration",
      "Tax-inclusive or tax-exclusive pricing toggle",
      "Multiple tax classes",
      "Per-payment-method surcharges: percent plus fixed fee",
      "Pass surcharges on to the customer or absorb them as a business cost",
      "Surcharge worked example shown live as you configure",
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
    title: "Settings — POS & Templates",
    emoji: "⚙️",
    features: [
      "Product type management: rename, reorder, add custom types",
      "Modifier group configuration",
      "Pricing rule management (time/day/product/category)",
      "Custom payment method creation",
      "Tyro EFTPOS terminal pairing and configuration",
      "Customer settings (loyalty opt-in default, ABN prompt, etc.)",
      "Map provider preference: Google Maps, Apple Maps, OpenStreetMap, Waze",
      "Document code prefixes: receipt, invoice, quote, service, appointment, purchase order",
      "Document number digit length per type",
      "Receipt and invoice print template customisation",
      "Label and sticker template designer",
    ],
  },
  {
    title: "Appearance & Themes",
    emoji: "🎨",
    features: [
      "Use your brand colour and brand font as the app theme",
      "Custom primary colour via colour picker or hex entry",
      "One-click preset themes including dark variants",
      "Day, Night, and System appearance modes",
      "Text size options: normal, large, extra large",
      "High-contrast accessibility mode",
      "Universal search bar layout and visibility controls",
      "Save a look as a named theme and set a store default",
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
      "Hashed staff PINs with rate-limited verification",
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
      "Time Cards — sell prepaid time passes with live countdown timers",
      "Time Cards — start, pause, and stop customer sessions from the counter",
      "KPIs — business KPI tracking and target management",
    ],
  },
  {
    title: "Legal & Compliance",
    emoji: "⚖️",
    features: [
      "Compliance reference hub for AU, NZ, UK, US, and Canada",
      "Curated links to the official bodies you deal with — ATO, ASIC, Fair Work, OAIC",
      "Superannuation guarantee rate table by financial year",
      "Award wages, national minimum wage, and penalty rate guides",
      "Grants and funding finders, including the R&D Tax Incentive",
      "Employment obligations: NES, Single Touch Payroll, payroll tax, workers comp",
    ],
  },
  {
    title: "Files, Import & Export",
    emoji: "📤",
    features: [
      "Media library of every image, video, and document you've uploaded",
      "Filter by kind, search by filename, and see total storage used",
      "\"Attached to\" shows exactly which records point at each file",
      "Replace a file everywhere, with a confirmation of what will change",
      "Safe delete — a file still in use can't be removed by accident",
      "Find leftovers: read-only scan for unreferenced files and space to reclaim",
      "Upload de-duplication reuses a file you already have",
      "CSV import for products with column mapping",
      "CSV import for customers",
      "CSV export for products, customers, and transactions",
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
                    : "pill-selector bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
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
