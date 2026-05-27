import { useState, useCallback, useRef, DragEvent } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Download, Upload, Users, Package, Truck, Bookmark, Check, FileText,
  AlertCircle, X, ArrowRight, Clock, ChevronLeft, ChevronRight,
  Tag, FolderOpen, History, Layers,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
  type?: "string" | "number" | "boolean";
}

interface ConflictEntry {
  rowIndex: number;
  existingId: number;
  existingLabel: string;
  importedPreview: string;
  action: "update" | "ignore" | "keep";
}

interface EntityConfig {
  key: string;
  label: string;
  pluralLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
  exportOnly?: boolean;
  description: string;
  fields: FieldDef[];
  sampleRows: Record<string, string>[];
  exportUrl: string;
  createUrl: string;
  updateUrl?: string;       // base URL for PUT /updateUrl/:id
  fetchAllUrl?: string;     // URL to fetch all existing items for dedupe
  dedupeBy?: (
    importPayload: Record<string, unknown>,
    existing: Record<string, unknown>
  ) => { match: boolean; id: number; label: string };
  /* Convert an API response item into a flat CSV row object */
  toExportRow: (item: Record<string, unknown>) => Record<string, string>;
}

/* ─── Country code expansion ─────────────────────────────────────────────── */

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  AU: "Australia",  NZ: "New Zealand",  US: "United States",  GB: "United Kingdom",
  CA: "Canada",     SG: "Singapore",    IN: "India",          ZA: "South Africa",
  FR: "France",     DE: "Germany",      IT: "Italy",          ES: "Spain",
  NL: "Netherlands",PT: "Portugal",     JP: "Japan",          KR: "South Korea",
  CN: "China",      TW: "Taiwan",       HK: "Hong Kong",      MY: "Malaysia",
  ID: "Indonesia",  TH: "Thailand",     VN: "Vietnam",        PH: "Philippines",
  AE: "United Arab Emirates", SA: "Saudi Arabia", QA: "Qatar",
  BR: "Brazil",     MX: "Mexico",       AR: "Argentina",      CL: "Chile",
  SE: "Sweden",     NO: "Norway",       DK: "Denmark",        FI: "Finland",
  CH: "Switzerland",AT: "Austria",      BE: "Belgium",        IE: "Ireland",
  PL: "Poland",     TR: "Turkey",       NG: "Nigeria",        KE: "Kenya",
  EG: "Egypt",      GH: "Ghana",        PK: "Pakistan",       BD: "Bangladesh",
  LK: "Sri Lanka",  NP: "Nepal",
};

function expandCountryValue(value: string): string {
  const trimmed = value.trim();
  return COUNTRY_CODE_TO_NAME[trimmed.toUpperCase()] ?? trimmed;
}

const COUNTRY_FIELD_KEYS = new Set(["billingCountry", "country"]);

const STATE_CODE_TO_NAME: Record<string, string> = {
  /* Australia */
  NSW: "New South Wales",      VIC: "Victoria",             QLD: "Queensland",
  WA:  "Western Australia",    SA:  "South Australia",      TAS: "Tasmania",
  ACT: "Australian Capital Territory", NT: "Northern Territory",
  /* United States */
  AL: "Alabama",    AK: "Alaska",        AZ: "Arizona",      AR: "Arkansas",
  CA: "California", CO: "Colorado",      CT: "Connecticut",  DE: "Delaware",
  FL: "Florida",    GA: "Georgia",       HI: "Hawaii",       ID: "Idaho",
  IL: "Illinois",   IN: "Indiana",       IA: "Iowa",         KS: "Kansas",
  KY: "Kentucky",   LA: "Louisiana",     ME: "Maine",        MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan",   MN: "Minnesota",    MS: "Mississippi",
  MO: "Missouri",   MT: "Montana",       NE: "Nebraska",     NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",   NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio",      OK: "Oklahoma",
  OR: "Oregon",     PA: "Pennsylvania",  RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee",   TX: "Texas",        UT: "Utah",
  VT: "Vermont",    VA: "Virginia",      WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming",    DC: "District of Columbia",
  /* Canada */
  AB: "Alberta",    BC: "British Columbia", MB: "Manitoba",  NB: "New Brunswick",
  NL: "Newfoundland and Labrador", NS: "Nova Scotia",       ON: "Ontario",
  PE: "Prince Edward Island",      QC: "Quebec",            SK: "Saskatchewan",
  YT: "Yukon",
  /* United Kingdom */
  ENG: "England",   SCT: "Scotland",     WLS: "Wales",       NIR: "Northern Ireland",
};

function expandStateValue(value: string): string {
  const trimmed = value.trim();
  return STATE_CODE_TO_NAME[trimmed.toUpperCase()] ?? trimmed;
}

const STATE_FIELD_KEYS = new Set(["billingState", "state"]);

/* ─── Entity configs ─────────────────────────────────────────────────────── */

const ENTITIES: EntityConfig[] = [
  {
    key: "customers",
    label: "Customers",
    pluralLabel: "Customers",
    icon: Users,
    description: "Import and export your customer contact list and loyalty data.",
    exportUrl: "/api/customers?limit=10000",
    createUrl: "/api/customers",
    updateUrl: "/api/customers",
    fetchAllUrl: "/api/customers?limit=10000",
    dedupeBy: (p, e) => {
      const pFull = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim().toLowerCase();
      const eFull = `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim().toLowerCase();
      const nameMatch  = pFull.length > 0 && pFull === eFull;
      const phoneMatch = !!p.phone && !!e.phone && String(p.phone) === String(e.phone);
      return {
        match: nameMatch && phoneMatch,
        id: e.id as number,
        label: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || String(e.email ?? ""),
      };
    },
    fields: [
      { key: "firstName",       label: "First Name",    required: true  },
      { key: "lastName",        label: "Last Name",     required: true  },
      { key: "email",           label: "Email",         hint: "Must be a valid email address" },
      { key: "phone",           label: "Phone"          },
      { key: "billingStreet",   label: "Street / Address" },
      { key: "billingCity",     label: "City / Suburb"  },
      { key: "billingState",    label: "State"          },
      { key: "billingPostcode", label: "Postcode"       },
      { key: "billingCountry",     label: "Country",              hint: "e.g. Australia" },
      { key: "company",            label: "Company"               },
      { key: "abn",                label: "ABN"                   },
      { key: "dateOfBirth",        label: "Date of Birth",        hint: "Format: YYYY-MM-DD" },
      { key: "notes",              label: "Notes"                 },
      { key: "group",              label: "Customer Group",       hint: "e.g. Wholesale, Retail, VIP" },
      { key: "shippingStreet",     label: "Shipping Street"       },
      { key: "shippingCity",       label: "Shipping City / Suburb" },
      { key: "shippingState",      label: "Shipping State"        },
      { key: "shippingPostcode",   label: "Shipping Postcode"     },
      { key: "shippingCountry",    label: "Shipping Country"      },
      { key: "referralCode",       label: "Referral Code",        hint: "This customer's shareable referral code" },
      { key: "referredBy",         label: "Referred By",          hint: "Referral code of the person who referred them" },
    ],
    sampleRows: [
      { firstName: "Sarah",  lastName: "Johnson", email: "sarah@example.com",  phone: "0412 345 678", billingStreet: "123 George St",    billingCity: "Sydney",    billingState: "NSW", billingPostcode: "2000", billingCountry: "Australia", company: "Johnson Group",  abn: "12 345 678 901", dateOfBirth: "1985-06-15", notes: "VIP customer",       group: "VIP",       shippingStreet: "123 George St",  shippingCity: "Sydney",    shippingState: "NSW", shippingPostcode: "2000", shippingCountry: "Australia", referralCode: "SARAH10",  referredBy: "" },
      { firstName: "Mike",   lastName: "Chen",    email: "mike@example.com",   phone: "0423 456 789", billingStreet: "456 Collins St",   billingCity: "Melbourne", billingState: "VIC", billingPostcode: "3000", billingCountry: "Australia", company: "",               abn: "",               dateOfBirth: "1990-03-20", notes: "",                    group: "Retail",    shippingStreet: "",               shippingCity: "",          shippingState: "",    shippingPostcode: "",     shippingCountry: "",          referralCode: "MIKE10",   referredBy: "SARAH10" },
      { firstName: "Priya",  lastName: "Patel",   email: "priya@example.com",  phone: "0434 567 890", billingStreet: "789 Bourke St",    billingCity: "Brisbane",  billingState: "QLD", billingPostcode: "4000", billingCountry: "Australia", company: "Patel Pty Ltd",  abn: "98 765 432 109", dateOfBirth: "1978-11-08", notes: "Wholesale account",  group: "Wholesale", shippingStreet: "789 Bourke St",  shippingCity: "Brisbane",  shippingState: "QLD", shippingPostcode: "4000", shippingCountry: "Australia", referralCode: "PRIYA10",  referredBy: "" },
    ],
    toExportRow: (item) => ({
      firstName:       String(item.firstName       ?? ""),
      lastName:        String(item.lastName        ?? ""),
      email:           String(item.email           ?? ""),
      phone:           String(item.phone           ?? ""),
      company:         String(item.company         ?? ""),
      abn:             String(item.abn             ?? ""),
      dateOfBirth:     String(item.dateOfBirth     ?? ""),
      billingStreet:   String(item.billingStreet   ?? ""),
      billingCity:     String(item.billingCity     ?? ""),
      billingState:    String(item.billingState    ?? ""),
      billingPostcode: String(item.billingPostcode ?? ""),
      billingCountry:  String(item.billingCountry  ?? ""),
      notes:           String(item.notes           ?? ""),
      group:           String((item as Record<string, unknown>).group              ?? ""),
      shippingStreet:  String((item as Record<string, unknown>).shippingStreet     ?? ""),
      shippingCity:    String((item as Record<string, unknown>).shippingCity       ?? ""),
      shippingState:   String((item as Record<string, unknown>).shippingState      ?? ""),
      shippingPostcode:String((item as Record<string, unknown>).shippingPostcode   ?? ""),
      shippingCountry: String((item as Record<string, unknown>).shippingCountry    ?? ""),
      referralCode:    String((item as Record<string, unknown>).referralCode       ?? ""),
      referredBy:      String((item as Record<string, unknown>).referredBy         ?? ""),
    }),
  },
  {
    key: "products",
    label: "Products",
    pluralLabel: "Products",
    icon: Package,
    description: "Import and export your product catalogue including pricing, stock levels, type, and category.",
    exportUrl: "/api/products?limit=10000",
    createUrl: "/api/products",
    updateUrl: "/api/products",
    fetchAllUrl: "/api/products?limit=10000",
    dedupeBy: (p, e) => {
      const matchSku     = !!p.sku     && !!e.sku     && String(p.sku)     === String(e.sku);
      const matchBarcode = !!p.barcode && !!e.barcode && String(p.barcode) === String(e.barcode);
      return { match: matchSku || matchBarcode, id: e.id as number, label: String(e.name ?? "") };
    },
    fields: [
      { key: "name",              label: "Product Name",    required: true  },
      { key: "price",             label: "Price",           required: true, type: "number", hint: "e.g. 29.99" },
      { key: "sku",               label: "SKU",             hint: "Unique product code"  },
      { key: "barcode",           label: "Barcode",         hint: "EAN/UPC/ISBN"         },
      { key: "description",       label: "Description"      },
      { key: "costPrice",         label: "Cost Price",      type: "number", hint: "e.g. 12.50" },
      { key: "productType",       label: "Product Type",    hint: "standard, service, digital, bundle" },
      { key: "category",          label: "Category",        hint: "Category name — must already exist in your catalogue" },
      { key: "taxRate",           label: "Tax Rate %",      type: "number", hint: "e.g. 10 for 10%" },
      { key: "imageUrl",          label: "Image URL"        },
      { key: "stockQuantity",     label: "Stock Quantity",  type: "number" },
      { key: "lowStockThreshold", label: "Low Stock Alert", type: "number" },
      { key: "trackInventory",    label: "Track Inventory",      type: "boolean", hint: "true or false" },
      { key: "isActive",          label: "Active",               type: "boolean", hint: "true or false" },
      { key: "excludeFromLoyalty", label: "Exclude from Loyalty", type: "boolean", hint: "true or false" },
      { key: "supplier",          label: "Supplier",             hint: "Supplier / vendor name" },
      { key: "supplierCode",      label: "Supplier Code",        hint: "Supplier's product code or SKU" },
      { key: "isEpay",            label: "ePay / Physical Card", type: "boolean", hint: "true if no digital code prints (card handles it)" },
    ],
    sampleRows: [
      { name: "Wireless Headphones", sku: "WH-001", price: "79.99",  costPrice: "45.00", description: "Premium Bluetooth headphones", barcode: "9781234567890", productType: "standard", category: "Electronics", taxRate: "10", imageUrl: "", stockQuantity: "50",  lowStockThreshold: "10", trackInventory: "true", isActive: "true", excludeFromLoyalty: "false", supplier: "Acme Wholesale",  supplierCode: "AW-WH-001", isEpay: "false" },
      { name: "USB-C Cable",         sku: "UC-002", price: "19.99",  costPrice: "8.00",  description: "Fast charging 2m USB-C cable", barcode: "9787654321098", productType: "standard", category: "Electronics", taxRate: "10", imageUrl: "", stockQuantity: "200", lowStockThreshold: "20", trackInventory: "true", isActive: "true", excludeFromLoyalty: "false", supplier: "Oz Distributors", supplierCode: "OZD-UC-2M",  isEpay: "false" },
      { name: "Steam Gift Card $50", sku: "SG-050", price: "50.00",  costPrice: "48.00", description: "Steam wallet $50 gift card",   barcode: "",              productType: "digital_code", category: "Electronics", taxRate: "0",  imageUrl: "", stockQuantity: "0",   lowStockThreshold: "5",  trackInventory: "false", isActive: "true", excludeFromLoyalty: "false", supplier: "Valve",           supplierCode: "STEAM-50",   isEpay: "false" },
      { name: "Visa ePay Card $100", sku: "VP-100", price: "100.00", costPrice: "99.00", description: "Visa prepaid ePay card $100",  barcode: "",              productType: "digital_code", category: "Electronics", taxRate: "0",  imageUrl: "", stockQuantity: "0",   lowStockThreshold: "5",  trackInventory: "false", isActive: "true", excludeFromLoyalty: "false", supplier: "Visa",            supplierCode: "VISA-EPAY-100", isEpay: "true" },
    ],
    toExportRow: (item) => ({
      name:               String(item.name               ?? ""),
      sku:                String(item.sku                ?? ""),
      price:              String(item.price              ?? ""),
      costPrice:          String(item.costPrice          ?? ""),
      description:        String(item.description        ?? ""),
      barcode:            String(item.barcode            ?? ""),
      productType:        String(item.productType        ?? ""),
      category:           String((item.category as { name?: string } | null)?.name ?? ""),
      taxRate:            String(item.taxRate            ?? ""),
      imageUrl:           String(item.imageUrl           ?? ""),
      stockQuantity:      String(item.stockQuantity      ?? ""),
      lowStockThreshold:  String(item.lowStockThreshold  ?? ""),
      trackInventory:     String(item.trackInventory     ?? ""),
      isActive:           String(item.isActive           ?? ""),
      excludeFromLoyalty: String(item.excludeFromLoyalty ?? ""),
      supplier:           String(item.supplier           ?? ""),
      supplierCode:       String(item.supplierCode       ?? ""),
      isEpay:             String((item as Record<string, unknown>).isEpay ?? "false"),
    }),
  },
  {
    key: "suppliers",
    label: "Suppliers",
    pluralLabel: "Suppliers",
    icon: Truck,
    description: "Import and export your supplier contact list and account details.",
    exportUrl: "/api/suppliers?limit=10000",
    createUrl: "/api/suppliers",
    fields: [
      { key: "name",           label: "Supplier Name",   required: true },
      { key: "contactName",    label: "Contact Name"     },
      { key: "email",          label: "Email"            },
      { key: "phone",          label: "Phone"            },
      { key: "website",        label: "Website"          },
      { key: "accountNumber",  label: "Account Number"   },
      { key: "paymentTerms",   label: "Payment Terms",   hint: "e.g. Net 30" },
      { key: "street",         label: "Street"           },
      { key: "city",           label: "City"             },
      { key: "state",          label: "State"            },
      { key: "postcode",       label: "Postcode"         },
      { key: "country",        label: "Country",         hint: "e.g. Australia" },
      { key: "notes",          label: "Notes"            },
    ],
    sampleRows: [
      { name: "Acme Wholesale",   contactName: "Tom Harris",    email: "tom@acme.com.au",  phone: "02 9123 4567", website: "acme.com.au",   accountNumber: "ACM-001", paymentTerms: "Net 30", street: "1 Pitt St",    city: "Sydney",    state: "NSW", postcode: "2000", country: "Australia", notes: "Preferred supplier" },
      { name: "Oz Distributors",  contactName: "Linda Wong",    email: "linda@ozdist.com", phone: "03 8765 4321", website: "ozdist.com.au", accountNumber: "OZD-042", paymentTerms: "Net 14", street: "200 Flinders", city: "Melbourne", state: "VIC", postcode: "3000", country: "Australia", notes: "" },
    ],
    toExportRow: (item) => ({
      name:          String(item.name          ?? ""),
      contactName:   String(item.contactName   ?? ""),
      email:         String(item.email         ?? ""),
      phone:         String(item.phone         ?? ""),
      website:       String(item.website       ?? ""),
      accountNumber: String(item.accountNumber ?? ""),
      paymentTerms:  String(item.paymentTerms  ?? ""),
      street:        String(item.street        ?? ""),
      city:          String(item.city          ?? ""),
      state:         String(item.state         ?? ""),
      postcode:      String(item.postcode      ?? ""),
      country:       String(item.country       ?? ""),
      notes:         String(item.notes         ?? ""),
    }),
  },
  {
    key: "brands",
    label: "Brands",
    pluralLabel: "Brands",
    icon: Bookmark,
    description: "Import and export your brand catalogue.",
    exportUrl: "/api/brands?limit=10000",
    createUrl: "/api/brands",
    fields: [
      { key: "name",        label: "Brand Name",  required: true },
      { key: "description", label: "Description"  },
      { key: "website",     label: "Website"      },
    ],
    sampleRows: [
      { name: "Samsung",  description: "Consumer electronics", website: "samsung.com"  },
      { name: "Nike",     description: "Sportswear",           website: "nike.com"     },
      { name: "Elegoo",   description: "3D printing hardware", website: "elegoo.com"   },
    ],
    toExportRow: (item) => ({
      name:        String(item.name        ?? ""),
      description: String(item.description ?? ""),
      website:     String(item.website     ?? ""),
    }),
  },
  {
    key: "tags",
    label: "Tags",
    pluralLabel: "Tags",
    icon: Tag,
    description: "Import and export your product tags used for filtering and categorisation.",
    exportUrl: "/api/tags",
    createUrl: "/api/tags",
    fields: [
      { key: "name",  label: "Tag Name", required: true },
      { key: "color", label: "Color",    hint: "Hex color e.g. #6366f1" },
    ],
    sampleRows: [
      { name: "New Arrival", color: "#22c55e" },
      { name: "On Sale",     color: "#ef4444" },
      { name: "Staff Pick",  color: "#8b5cf6" },
      { name: "Clearance",   color: "#f97316" },
    ],
    toExportRow: (item) => ({
      name:  String(item.name  ?? ""),
      color: String(item.color ?? ""),
    }),
  },
  {
    key: "categories",
    label: "Categories",
    pluralLabel: "Categories",
    icon: FolderOpen,
    description: "Import and export your product categories including colour coding and display order.",
    exportUrl: "/api/categories",
    createUrl: "/api/categories",
    fields: [
      { key: "name",      label: "Category Name", required: true },
      { key: "color",     label: "Color",          hint: "Hex color e.g. #3b82f6" },
      { key: "icon",      label: "Icon",           hint: "Lucide icon name e.g. Coffee, ShoppingCart" },
      { key: "sortOrder", label: "Sort Order",     type: "number", hint: "Display order (lower = first)" },
    ],
    sampleRows: [
      { name: "Beverages",   color: "#3b82f6", icon: "Coffee",       sortOrder: "1" },
      { name: "Snacks",      color: "#f97316", icon: "Cookie",       sortOrder: "2" },
      { name: "Electronics", color: "#8b5cf6", icon: "Cpu",          sortOrder: "3" },
      { name: "Apparel",     color: "#ec4899", icon: "Shirt",        sortOrder: "4" },
    ],
    toExportRow: (item) => ({
      name:      String(item.name      ?? ""),
      color:     String(item.color     ?? ""),
      icon:      String(item.icon      ?? ""),
      sortOrder: String(item.sortOrder ?? ""),
    }),
  },
  {
    key: "types",
    label: "Types",
    pluralLabel: "Product Types",
    icon: Layers,
    description: "Define custom product types for your catalogue (standard, service, digital, bundle, and more).",
    exportUrl: "",
    createUrl: "",
    fields: [
      { key: "name",        label: "Type Name",    required: true, hint: "e.g. Standard, Service, Digital, Bundle" },
      { key: "slug",        label: "Slug",         hint: "URL-safe identifier, e.g. digital_code" },
      { key: "description", label: "Description",  hint: "Brief description of this product type" },
      { key: "trackStock",  label: "Track Stock",  type: "boolean", hint: "true if inventory is tracked for this type" },
      { key: "printCode",   label: "Print Code",   type: "boolean", hint: "true if a digital code should be printed on receipt" },
      { key: "isActive",    label: "Active",       type: "boolean", hint: "true or false" },
    ],
    sampleRows: [
      { name: "Standard",    slug: "standard",     description: "Physical products sold from stock",              trackStock: "true",  printCode: "false", isActive: "true" },
      { name: "Service",     slug: "service",      description: "Labour, repairs, and professional services",     trackStock: "false", printCode: "false", isActive: "true" },
      { name: "Digital Code",slug: "digital_code", description: "Gift cards and activation codes printed on receipt", trackStock: "false", printCode: "true",  isActive: "true" },
      { name: "Bundle",      slug: "bundle",       description: "Grouped products sold together at a set price",  trackStock: "false", printCode: "false", isActive: "true" },
    ],
    toExportRow: (item) => ({
      name:        String(item.name        ?? ""),
      slug:        String(item.slug        ?? ""),
      description: String(item.description ?? ""),
      trackStock:  String(item.trackStock  ?? ""),
      printCode:   String(item.printCode   ?? ""),
      isActive:    String(item.isActive    ?? ""),
    }),
  },
  {
    key: "history",
    label: "History",
    pluralLabel: "Transaction History",
    icon: History,
    exportOnly: true,
    description: "Export your full transaction history as a CSV for accounting, reconciliation, or external analysis.",
    exportUrl: "/api/transactions?limit=10000",
    createUrl: "",
    fields: [
      { key: "id",            label: "Transaction ID"   },
      { key: "total",         label: "Total ($)"        },
      { key: "status",        label: "Status"           },
      { key: "paymentMethod", label: "Payment Method"   },
      { key: "customerName",  label: "Customer Name"    },
      { key: "createdAt",     label: "Date"             },
    ],
    sampleRows: [],
    toExportRow: (item) => {
      const cust = item.customer as { firstName?: string; lastName?: string } | null | undefined;
      return {
        id:            String(item.id            ?? ""),
        total:         String(item.total         ?? ""),
        status:        String(item.status        ?? ""),
        paymentMethod: String(item.paymentMethod ?? ""),
        customerName:  cust ? `${cust.firstName ?? ""} ${cust.lastName ?? ""}`.trim() : "",
        createdAt:     String(item.createdAt     ?? ""),
      };
    },
  },
];

/* ─── Column alias matching ──────────────────────────────────────────────── */

const ALIASES: Record<string, string[]> = {
  firstName:          ["firstname", "first", "givenname", "given", "forename"],
  lastName:           ["lastname", "last", "surname", "family", "familyname"],
  email:              ["email", "emailaddress", "mail", "emailid"],
  phone:              ["phone", "mobile", "cell", "telephone", "tel", "phonenumber"],
  group:              ["group", "customergroup", "tier", "segment", "category"],
  shippingStreet:     ["shippingstreet", "shipstreet", "deliverystreet", "shipaddress"],
  shippingCity:       ["shippingcity", "shipcity", "deliverycity", "shipsuburb"],
  shippingState:      ["shippingstate", "shipstate", "deliverystate"],
  shippingPostcode:   ["shippingpostcode", "shippostcode", "deliverypostcode", "shipzip"],
  shippingCountry:    ["shippingcountry", "shipcountry", "deliverycountry"],
  referralCode:       ["referralcode", "refcode", "referral", "mycode"],
  referredBy:         ["referredby", "referrer", "referralby", "referredbycode"],
  company:            ["company", "business", "organisation", "organization", "employer", "firm"],
  abn:                ["abn", "australianbusinessnumber", "businessnumber"],
  dateOfBirth:        ["dateofbirth", "dob", "birthday", "birthdate"],
  notes:              ["notes", "note", "comments", "comment", "memo", "remarks"],
  billingStreet:      ["billingstreet", "street", "streetaddress", "address", "address1", "addr", "addr1", "billingaddress", "billingaddr"],
  billingCity:        ["billingcity", "city", "suburb", "town", "locality", "billingsuburb"],
  billingState:       ["billingstate", "state", "province", "region", "billingprovince"],
  billingPostcode:    ["billingpostcode", "postcode", "postalcode", "zip", "zipcode", "postal", "billingzip"],
  billingCountry:     ["billingcountry", "country", "countryname"],
  name:               ["name", "productname", "title", "itemname", "item", "product"],
  price:              ["price", "retailprice", "sellprice", "saleprice", "unitprice", "rrp", "sell"],
  description:        ["description", "desc", "details", "info", "about"],
  costPrice:          ["costprice", "cost", "buyingprice", "purchaseprice", "nett", "wholesale"],
  sku:                ["sku", "stockkeepingunit", "itemcode", "productcode", "code", "ref", "reference", "partno"],
  barcode:            ["barcode", "ean", "upc", "gtin", "isbn", "barcodeean"],
  trackInventory:     ["trackinventory", "track", "managed", "inventorytracked"],
  stockQuantity:      ["stockquantity", "stock", "quantity", "qty", "onhand", "instock", "currentstock"],
  lowStockThreshold:  ["lowstockthreshold", "lowstock", "minstock", "reorderpoint", "alertat", "minqty"],
  isActive:           ["isactive", "active", "enabled", "status", "available"],
  contactName:        ["contactname", "contact", "primarycontact", "attn", "attention"],
  website:            ["website", "url", "web", "homepage", "site"],
  accountNumber:      ["accountnumber", "account", "accountno", "accno", "supplierno"],
  paymentTerms:       ["paymentterms", "terms", "creditterm", "creditdays"],
  street:             ["street", "streetaddress", "address1", "addr1", "streetline"],
  city:               ["city", "suburb", "town", "locality"],
  state:              ["state", "province", "region"],
  postcode:           ["postcode", "postalcode", "zip", "zipcode", "postal"],
  country:            ["country", "countryname"],
  productType:        ["producttype", "type", "itemtype", "variant", "kind"],
  category:           ["category", "categoryname", "cat", "group", "department"],
  taxRate:            ["taxrate", "tax", "gst", "vat", "taxpercentage", "taxamt"],
  imageUrl:           ["imageurl", "image", "photo", "picture", "img", "thumbnail"],
  supplier:           ["supplier", "suppliername", "vendor", "vendorname", "brand", "manufacturer"],
  supplierCode:       ["suppliercode", "vendorcode", "vendorsku", "suppliersku", "supplierref", "mfrcode"],
  excludeFromLoyalty: ["excludefromloyalty", "noloyalty", "loyaltyexcluded", "excludeloyalty"],
  color:              ["color", "colour", "hex", "hexcolor", "tagcolor", "catcolor"],
  icon:               ["icon", "iconname", "symbol", "emoji"],
  sortOrder:          ["sortorder", "order", "sort", "sequence", "position", "rank"],
  paymentMethod:      ["paymentmethod", "payment", "method", "tender", "paidby"],
  customerName:       ["customername", "customer", "buyer", "clientname", "client"],
};

function normalize(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }

function autoMatch(headers: string[], fields: FieldDef[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of fields) {
    const aliases = ALIASES[field.key] ?? [normalize(field.key)];
    const match = headers.find((h) => aliases.includes(normalize(h)));
    if (match) mapping[field.key] = match;
  }
  return mapping;
}

/* ─── CSV utilities ──────────────────────────────────────────────────────── */

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ  = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === "," && !inQ) {
      result.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines   = text.trim().split(/\r?\n/);
  const headers = parseCSVLine(lines[0]);
  const rows    = lines.slice(1).filter((l) => l.replace(/,/g, "").trim() !== "").map((line) => {
    const vals = parseCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
  return { headers, rows };
}

function escapeCSV(v: string) {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(headers: string[], rows: Record<string, string>[]): string {
  const body = rows.map((r) => headers.map((h) => escapeCSV(r[h] ?? "")).join(",")).join("\n");
  return headers.join(",") + "\n" + body;
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ─── Export card ────────────────────────────────────────────────────────── */

function ExportCard({ entity }: { entity: EntityConfig }) {
  const [exporting, setExporting] = useState(false);

  const handleExportSample = () => {
    const headers = entity.fields.map((f) => f.key);
    const csv     = toCSV(headers, entity.sampleRows);
    downloadCSV(`${entity.key}_sample.csv`, csv);
    toast.success("Sample CSV downloaded");
  };

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const res  = await fetch(entity.exportUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const list: Record<string, unknown>[] = Array.isArray(data)
        ? data
        : (Array.isArray(data.items) ? data.items : []);
      const rows    = list.map(entity.toExportRow);
      const headers = entity.fields.map((f) => f.key);
      const csv     = toCSV(headers, rows);
      downloadCSV(`${entity.key}_export.csv`, csv);
      toast.success(`${list.length} ${entity.pluralLabel.toLowerCase()} exported`);
    } catch {
      toast.error("Export failed — check your connection and try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-xl border bg-background p-5 flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Download className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Export</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Download your {entity.pluralLabel.toLowerCase()} as a CSV file you can open in Excel or Google Sheets.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-1">
        <p className="text-xs font-medium text-foreground/70 uppercase tracking-wide mb-2">Included Columns</p>
        <div className="flex flex-wrap gap-1.5">
          {entity.fields.map((f) => (
            <span key={f.key} className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border",
              f.required ? "bg-primary/10 text-primary border-primary/20 font-medium" : "bg-muted text-muted-foreground border-border"
            )}>
              {f.label}
              {f.required && <span className="ml-0.5 text-primary">*</span>}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground pt-1.5">* Required when importing</p>
      </div>

      <div className="flex flex-col gap-2 mt-auto">
        <Button variant="outline" size="sm" className="gap-1.5 justify-center" onClick={handleExportSample}>
          <FileText className="w-3.5 h-3.5" /> Download Sample CSV
        </Button>
        <Button size="sm" className="gap-1.5 justify-center" onClick={handleExportAll} disabled={exporting}>
          {exporting ? "Exporting…" : <><Download className="w-3.5 h-3.5" /> Export All {entity.pluralLabel}</>}
        </Button>
      </div>
    </div>
  );
}

/* ─── Import card ────────────────────────────────────────────────────────── */

interface ImportResult { success: number; failed: number; errors: string[] }

function ImportCard({ entity }: { entity: EntityConfig }) {
  const [step, setStep]         = useState<0 | 1 | 2>(0);
  const [dragging, setDragging] = useState(false);
  const [headers, setHeaders]   = useState<string[]>([]);
  const [rows, setRows]         = useState<Record<string, string>[]>([]);
  const [mapping, setMapping]   = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [result, setResult]       = useState<ImportResult | null>(null);
  const [expandCountryCodes, setExpandCountryCodes] = useState(false);
  const [expandStateCodes, setExpandStateCodes]     = useState(false);
  const [conflicts, setConflicts]           = useState<ConflictEntry[]>([]);
  const [conflictsStep, setConflictsStep]   = useState(false);
  const [fetchingConflicts, setFetchingConflicts] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasCountryField = entity.fields.some((f) => COUNTRY_FIELD_KEYS.has(f.key));
  const hasStateField   = entity.fields.some((f) => STATE_FIELD_KEYS.has(f.key));

  const reset = () => {
    setStep(0); setHeaders([]); setRows([]); setMapping({}); setResult(null); setProgress(0);
    setExpandCountryCodes(false); setExpandStateCodes(false);
    setConflicts([]); setConflictsStep(false); setFetchingConflicts(false);
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { headers: h, rows: r } = parseCSV(String(e.target?.result ?? ""));
        if (h.length === 0 || r.length === 0) { toast.error("CSV appears empty or invalid"); return; }
        setHeaders(h);
        setRows(r);
        setMapping(autoMatch(h, entity.fields));
        setStep(1);
      } catch {
        toast.error("Failed to parse CSV. Please check the file format.");
      }
    };
    reader.readAsText(file);
  };

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) { processFile(file); }
    else { toast.error("Please upload a .csv file"); }
  }, [entity]);

  const coerce = (value: string, type?: string) => {
    if (type === "number")  return value === "" ? undefined : parseFloat(value);
    if (type === "boolean") return value.toLowerCase() === "true" || value === "1";
    return value || undefined;
  };

  const buildPayload = (row: Record<string, string>) => {
    const payload: Record<string, unknown> = {};
    for (const field of entity.fields) {
      const csvCol = mapping[field.key];
      if (csvCol) {
        let rawVal = row[csvCol] ?? "";
        if (expandCountryCodes && COUNTRY_FIELD_KEYS.has(field.key)) rawVal = expandCountryValue(rawVal);
        if (expandStateCodes   && STATE_FIELD_KEYS.has(field.key))   rawVal = expandStateValue(rawVal);
        const val = coerce(rawVal, field.type);
        if (val !== undefined) payload[field.key] = val;
      }
    }
    return payload;
  };

  const checkConflicts = async () => {
    if (!entity.fetchAllUrl || !entity.dedupeBy) { setStep(2); return; }
    setFetchingConflicts(true);
    try {
      const r    = await fetch(entity.fetchAllUrl, { credentials: "include" });
      const data = await r.json() as Record<string, unknown>;
      const existing: Record<string, unknown>[] = (data.items as Record<string, unknown>[] | undefined) ?? (Array.isArray(data) ? data as Record<string, unknown>[] : []);

      const found: ConflictEntry[] = [];
      rows.forEach((row, i) => {
        const payload = buildPayload(row);
        for (const ex of existing) {
          const { match, id, label } = entity.dedupeBy!(payload, ex);
          if (match) {
            const preview = (payload.name as string | undefined) ?? (payload.firstName ? `${payload.firstName} ${payload.lastName ?? ""}`.trim() : `Row ${i + 1}`);
            found.push({ rowIndex: i, existingId: id, existingLabel: label, importedPreview: preview, action: "update" });
            break;
          }
        }
      });

      setConflicts(found);
      if (found.length > 0) { setConflictsStep(true); }
      else                  { setStep(2); }
    } catch {
      toast.error("Could not check for duplicates — proceeding to import.");
      setStep(2);
    } finally {
      setFetchingConflicts(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setProgress(0);
    const res: ImportResult = { success: 0, failed: 0, errors: [] };
    const conflictMap = new Map(conflicts.map((c) => [c.rowIndex, c]));
    let processed = 0;

    for (let i = 0; i < rows.length; i++) {
      const conflict = conflictMap.get(i);
      if (conflict?.action === "ignore") {
        processed++;
        setProgress(Math.round((processed / rows.length) * 100));
        continue;
      }

      const payload = buildPayload(rows[i]);

      /* Auto-generate SKU for products if not provided — matches Inventory SKU Generator format */
      if (entity.key === "products" && !payload.sku) {
        const prefix = (() => { try { return localStorage.getItem("koapos_sku_prefix") || "KP"; } catch { return "KP"; } })();
        payload.sku = `${prefix}-${Math.floor(10000 + Math.random() * 90000)}`;
      }

      const isUpdate = conflict?.action === "update" && !!entity.updateUrl;
      const url    = isUpdate ? `${entity.updateUrl}/${conflict!.existingId}` : entity.createUrl;
      const method = isUpdate ? "PUT" : "POST";

      try {
        const r = await fetch(url, {
          method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.ok) { res.success++; }
        else {
          res.failed++;
          const d = await r.json().catch(() => ({})) as Record<string, unknown>;
          res.errors.push(`Row ${i + 1}: ${String(d.error ?? r.statusText)}`);
        }
      } catch {
        res.failed++;
        res.errors.push(`Row ${i + 1}: Network error`);
      }
      processed++;
      setProgress(Math.round((processed / rows.length) * 100));
    }

    setResult(res);
    setImporting(false);
    if (res.success > 0) toast.success(`${res.success} ${entity.pluralLabel.toLowerCase()} imported successfully`);
    if (res.failed  > 0) toast.error(`${res.failed} rows failed — see details below`);
  };

  /* Derive preview rows (first 5 mapped), honouring expansion toggles */
  const previewRows = rows.slice(0, 5).map((row) => {
    const out: Record<string, string> = {};
    for (const field of entity.fields) {
      const col = mapping[field.key];
      let val = col ? (row[col] ?? "") : "";
      if (expandCountryCodes && COUNTRY_FIELD_KEYS.has(field.key)) val = expandCountryValue(val);
      if (expandStateCodes   && STATE_FIELD_KEYS.has(field.key))   val = expandStateValue(val);
      out[field.key] = val;
    }
    return out;
  });

  const hasRequiredMapping = entity.fields
    .filter((f) => f.required)
    .every((f) => !!mapping[f.key]);

  return (
    <div className="rounded-xl border bg-background p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Upload className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Import</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Upload a CSV file to add or update {entity.pluralLabel.toLowerCase()}.
          </p>
        </div>
        {step > 0 && !result && (
          <button onClick={reset} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Step indicator */}
      {(step > 0 || conflictsStep) && !result && (() => {
        const steps = entity.dedupeBy
          ? ["Upload", "Map Columns", "Resolve Duplicates", "Preview & Import"]
          : ["Upload", "Map Columns", "Preview & Import"];
        const currentStep = conflictsStep ? 2 : step === 2 ? (entity.dedupeBy ? 3 : 2) : step;
        return (
          <div className="flex items-center gap-1 text-xs">
            {steps.map((label, i) => (
              <div key={label} className="flex items-center gap-1">
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0",
                  i < currentStep  && "bg-emerald-500 text-white",
                  i === currentStep && "bg-primary text-primary-foreground",
                  i > currentStep  && "bg-muted text-muted-foreground",
                )}>
                  {i < currentStep ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                <span className={cn("hidden sm:inline", i === currentStep ? "text-foreground font-medium" : "text-muted-foreground")}>{label}</span>
                {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Step 0: Upload ── */}
      {step === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-10 gap-3 cursor-pointer transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20",
          )}
          onClick={() => fileRef.current?.click()}
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">Drop your CSV here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-0.5">Accepts .csv files only</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
          />
        </div>
      )}

      {/* ── Step 1: Map Columns ── */}
      {step === 1 && (
        <div className="space-y-3 flex-1 overflow-y-auto max-h-[380px] pr-0.5">
          <p className="text-xs text-muted-foreground">
            {rows.length} rows detected. Match each system field to the correct column in your CSV.
          </p>
          <div className="space-y-2">
            {entity.fields.map((field) => (
              <div key={field.key} className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <p className="text-xs font-medium">
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                  </p>
                  {field.hint && <p className="text-[10px] text-muted-foreground">{field.hint}</p>}
                </div>
                <Select
                  value={mapping[field.key] ?? "__skip__"}
                  onValueChange={(v) =>
                    setMapping((m) => {
                      const next = { ...m };
                      if (v === "__skip__") { delete next[field.key]; } else { next[field.key] = v; }
                      return next;
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="— Skip —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip__">— Skip —</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                        {rows[0]?.[h] && (
                          <span className="ml-1 text-muted-foreground">({rows[0][h].slice(0, 20)})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {(hasStateField || hasCountryField) && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
              {hasStateField && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={expandStateCodes}
                    onCheckedChange={(v) => setExpandStateCodes(!!v)}
                  />
                  Expand state codes (e.g. NSW → New South Wales)
                </label>
              )}
              {hasCountryField && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={expandCountryCodes}
                    onCheckedChange={(v) => setExpandCountryCodes(!!v)}
                  />
                  Expand country codes (e.g. AU → Australia)
                </label>
              )}
            </div>
          )}
          {!hasRequiredMapping && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Map all required (*) fields to continue.
            </div>
          )}
        </div>
      )}

      {/* ── Conflict resolution step ── */}
      {conflictsStep && !result && (
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span><strong>{conflicts.length}</strong> duplicate{conflicts.length !== 1 ? "s" : ""} found. Choose what to do with each row below.</span>
          </div>
          <div className="overflow-x-auto rounded-lg border text-xs max-h-[340px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">CSV Row</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Existing Record</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {conflicts.map((c) => (
                  <tr key={c.rowIndex} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{c.importedPreview} <span className="text-muted-foreground font-normal">(row {c.rowIndex + 1})</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{c.existingLabel}</td>
                    <td className="px-3 py-2">
                      <select
                        className="text-xs border rounded px-2 py-1 bg-background"
                        value={c.action}
                        onChange={(e) => setConflicts(prev => prev.map(x => x.rowIndex === c.rowIndex ? { ...x, action: e.target.value as ConflictEntry["action"] } : x))}
                      >
                        <option value="update">Update existing</option>
                        <option value="ignore">Ignore (skip)</option>
                        <option value="keep">Keep both (create new)</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Rows without duplicates ({rows.length - conflicts.length}) will always be created as new records.
          </p>
        </div>
      )}

      {/* ── Step 2: Preview & Import ── */}
      {step === 2 && !result && (
        <div className="space-y-4 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Previewing first {Math.min(5, rows.length)} of <strong>{rows.length}</strong> rows to import.
            </p>
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border text-xs">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  {entity.fields.filter((f) => mapping[f.key]).map((f) => (
                    <th key={f.key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {previewRows.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    {entity.fields.filter((f) => mapping[f.key]).map((f) => (
                      <td key={f.key} className="px-3 py-2 whitespace-nowrap max-w-[120px] truncate">
                        {row[f.key] || <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Progress bar */}
          {importing && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Importing…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Result ── */}
      {result && (
        <div className="space-y-3 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-emerald-50 border-emerald-200 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{result.success}</p>
              <p className="text-xs text-emerald-600 font-medium">Imported</p>
            </div>
            <div className={cn("rounded-lg border px-4 py-3 text-center", result.failed > 0 ? "bg-red-50 border-red-200" : "bg-muted border-border")}>
              <p className={cn("text-2xl font-bold", result.failed > 0 ? "text-red-700" : "text-muted-foreground")}>{result.failed}</p>
              <p className={cn("text-xs font-medium", result.failed > 0 ? "text-red-600" : "text-muted-foreground")}>Failed</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-lg border bg-red-50 border-red-200 p-3 max-h-32 overflow-y-auto space-y-1">
              {result.errors.slice(0, 10).map((e, i) => (
                <p key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />{e}
                </p>
              ))}
              {result.errors.length > 10 && (
                <p className="text-xs text-red-600">...and {result.errors.length - 10} more</p>
              )}
            </div>
          )}
          <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={reset}>
            <Upload className="w-3.5 h-3.5" /> Import Another File
          </Button>
        </div>
      )}

      {/* Footer buttons */}
      {!result && (
        <div className={cn("flex items-center", (step === 0 && !conflictsStep) ? "justify-end" : "justify-between")}>
          {(step > 0 || conflictsStep) && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => {
              if (conflictsStep) { setConflictsStep(false); }
              else { setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2); }
            }}>
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </Button>
          )}
          {step === 1 && !conflictsStep && (
            <Button
              size="sm"
              className="gap-1"
              disabled={!hasRequiredMapping || fetchingConflicts}
              onClick={checkConflicts}
            >
              {fetchingConflicts ? "Checking…" : <>Preview <ChevronRight className="w-3.5 h-3.5" /></>}
            </Button>
          )}
          {conflictsStep && (
            <Button size="sm" className="gap-1" onClick={() => { setConflictsStep(false); setStep(2); }}>
              Continue <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          )}
          {step === 2 && !conflictsStep && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? "Importing…" : <><ArrowRight className="w-3.5 h-3.5" /> Import {rows.length} Records</>}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Coming Soon card ───────────────────────────────────────────────────── */

function ComingSoonCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/10 p-8 flex flex-col items-center justify-center gap-3 text-center col-span-2">
      <Clock className="w-10 h-10 text-muted-foreground/30" />
      <div>
        <p className="font-medium text-muted-foreground">{label} Import/Export</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Full support is coming soon. For now, manage {label.toLowerCase()} directly from the {label} screen.
        </p>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementImportExportPage() {
  const [activeKey, setActiveKey] = useState("customers");
  const entity = ENTITIES.find((e) => e.key === activeKey) ?? ENTITIES[0];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Import / Export</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Move data in and out of KoaPOS using standard CSV files.
          </p>
        </div>

        {/* Entity selector */}
        <div className="flex flex-wrap items-center bg-muted rounded-xl p-1 gap-0.5">
          {ENTITIES.map((e) => {
            const Icon     = e.icon;
            const isActive = e.key === activeKey;
            return (
              <button
                key={e.key}
                type="button"
                onClick={() => !e.comingSoon && setActiveKey(e.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer select-none",
                  isActive
                    ? "bg-background shadow-sm text-primary"
                    : "text-muted-foreground hover:text-foreground",
                  e.comingSoon && "opacity-50 cursor-default",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{e.label}</span>
                {e.comingSoon && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-0.5">Soon</Badge>
                )}
              </button>
            );
          })}
        </div>

        {/* Entity description */}
        <p className="text-sm text-muted-foreground">{entity.description}</p>

        {/* Content area */}
        {entity.comingSoon ? (
          <div className="grid grid-cols-2 gap-6">
            <ComingSoonCard label={entity.label} />
          </div>
        ) : entity.exportOnly ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ExportCard entity={entity} />
            <div className="rounded-xl border border-dashed bg-muted/10 p-8 flex flex-col items-center justify-center gap-3 text-center">
              <Upload className="w-10 h-10 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-muted-foreground">Import Not Available</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {entity.pluralLabel} are created through normal system activity and cannot be imported via CSV.
                  Use the export above to download a copy for your records.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ExportCard entity={entity} />
            <ImportCard entity={entity} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
