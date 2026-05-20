import { useState, useCallback, useRef, DragEvent } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Download, Upload, Users, Package, Truck, Bookmark, Check, FileText,
  AlertCircle, X, ArrowRight, Clock, ChevronLeft, ChevronRight,
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

interface EntityConfig {
  key: string;
  label: string;
  pluralLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
  description: string;
  fields: FieldDef[];
  sampleRows: Record<string, string>[];
  exportUrl: string;
  createUrl: string;
  /* Convert an API response item into a flat CSV row object */
  toExportRow: (item: Record<string, unknown>) => Record<string, string>;
}

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
    fields: [
      { key: "firstName",       label: "First Name",    required: true  },
      { key: "lastName",        label: "Last Name",     required: true  },
      { key: "email",           label: "Email",         hint: "Must be a valid email address" },
      { key: "phone",           label: "Phone"          },
      { key: "billingStreet",   label: "Street / Address" },
      { key: "billingCity",     label: "City / Suburb"  },
      { key: "billingState",    label: "State"          },
      { key: "billingPostcode", label: "Postcode"       },
      { key: "billingCountry",  label: "Country",       hint: "e.g. Australia" },
      { key: "address",         label: "Address (legacy, single-line)", hint: "Use the individual address fields above for best results" },
      { key: "company",         label: "Company"        },
      { key: "abn",             label: "ABN"            },
      { key: "dateOfBirth",     label: "Date of Birth", hint: "Format: YYYY-MM-DD" },
      { key: "notes",           label: "Notes"          },
    ],
    sampleRows: [
      { firstName: "Sarah",  lastName: "Johnson", email: "sarah@example.com",  phone: "0412 345 678", billingStreet: "123 George St",    billingCity: "Sydney",    billingState: "NSW", billingPostcode: "2000", billingCountry: "Australia", company: "Johnson Group",  abn: "12 345 678 901", dateOfBirth: "1985-06-15", notes: "VIP customer",       address: "" },
      { firstName: "Mike",   lastName: "Chen",    email: "mike@example.com",   phone: "0423 456 789", billingStreet: "456 Collins St",   billingCity: "Melbourne", billingState: "VIC", billingPostcode: "3000", billingCountry: "Australia", company: "",               abn: "",               dateOfBirth: "1990-03-20", notes: "",                    address: "" },
      { firstName: "Priya",  lastName: "Patel",   email: "priya@example.com",  phone: "0434 567 890", billingStreet: "789 Bourke St",    billingCity: "Brisbane",  billingState: "QLD", billingPostcode: "4000", billingCountry: "Australia", company: "Patel Pty Ltd",  abn: "98 765 432 109", dateOfBirth: "1978-11-08", notes: "Wholesale account",  address: "" },
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
      address:         String(item.address         ?? ""),
      notes:           String(item.notes           ?? ""),
    }),
  },
  {
    key: "products",
    label: "Products",
    pluralLabel: "Products",
    icon: Package,
    description: "Import and export your product catalogue including pricing and stock levels.",
    exportUrl: "/api/products?limit=10000",
    createUrl: "/api/products",
    fields: [
      { key: "name",              label: "Product Name",       required: true  },
      { key: "price",             label: "Price",              required: true, type: "number", hint: "e.g. 29.99" },
      { key: "sku",               label: "SKU",                hint: "Unique product code"  },
      { key: "barcode",           label: "Barcode",            hint: "EAN/UPC/ISBN"         },
      { key: "description",       label: "Description"         },
      { key: "costPrice",         label: "Cost Price",         type: "number", hint: "e.g. 12.50" },
      { key: "stockQuantity",     label: "Stock Quantity",     type: "number" },
      { key: "lowStockThreshold", label: "Low Stock Alert",    type: "number" },
      { key: "trackInventory",    label: "Track Inventory",    type: "boolean", hint: "true or false" },
      { key: "isActive",          label: "Active",             type: "boolean", hint: "true or false" },
    ],
    sampleRows: [
      { name: "Wireless Headphones", sku: "WH-001", price: "79.99",  costPrice: "45.00", description: "Premium Bluetooth headphones",  barcode: "9781234567890", stockQuantity: "50",  lowStockThreshold: "10", trackInventory: "true", isActive: "true" },
      { name: "USB-C Cable",         sku: "UC-002", price: "19.99",  costPrice: "8.00",  description: "Fast charging 2m USB-C cable",  barcode: "9787654321098", stockQuantity: "200", lowStockThreshold: "20", trackInventory: "true", isActive: "true" },
      { name: "Coffee Mug",          sku: "MG-003", price: "12.00",  costPrice: "4.50",  description: "Ceramic 350ml mug",            barcode: "",              stockQuantity: "80",  lowStockThreshold: "15", trackInventory: "true", isActive: "true" },
    ],
    toExportRow: (item) => ({
      name:              String(item.name              ?? ""),
      sku:               String(item.sku               ?? ""),
      price:             String(item.price             ?? ""),
      costPrice:         String(item.costPrice         ?? ""),
      description:       String(item.description       ?? ""),
      barcode:           String(item.barcode           ?? ""),
      stockQuantity:     String(item.stockQuantity     ?? ""),
      lowStockThreshold: String(item.lowStockThreshold ?? ""),
      trackInventory:    String(item.trackInventory    ?? ""),
      isActive:          String(item.isActive          ?? ""),
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
];

/* ─── Column alias matching ──────────────────────────────────────────────── */

const ALIASES: Record<string, string[]> = {
  firstName:          ["firstname", "first", "givenname", "given", "forename"],
  lastName:           ["lastname", "last", "surname", "family", "familyname"],
  email:              ["email", "emailaddress", "mail", "emailid"],
  phone:              ["phone", "mobile", "cell", "telephone", "tel", "phonenumber"],
  address:            ["address", "streetaddress", "street", "location", "addr", "fulladdress", "singlelineaddress"],
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
  const rows    = lines.slice(1).filter((l) => l.trim()).map((line) => {
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
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStep(0); setHeaders([]); setRows([]); setMapping({}); setResult(null); setProgress(0); };

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

  const handleImport = async () => {
    setImporting(true);
    setProgress(0);
    const res: ImportResult = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row     = rows[i];
      const payload: Record<string, unknown> = {};
      for (const field of entity.fields) {
        const csvCol = mapping[field.key];
        if (csvCol) {
          const val = coerce(row[csvCol] ?? "", field.type);
          if (val !== undefined) payload[field.key] = val;
        }
      }

      try {
        const r = await fetch(entity.createUrl, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.ok) { res.success++; }
        else {
          res.failed++;
          const data = await r.json().catch(() => ({}));
          res.errors.push(`Row ${i + 1}: ${data.error ?? r.statusText}`);
        }
      } catch {
        res.failed++;
        res.errors.push(`Row ${i + 1}: Network error`);
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }

    setResult(res);
    setImporting(false);
    if (res.success > 0) toast.success(`${res.success} ${entity.pluralLabel.toLowerCase()} imported successfully`);
    if (res.failed  > 0) toast.error(`${res.failed} rows failed — see details below`);
  };

  /* Derive preview rows (first 5 mapped) */
  const previewRows = rows.slice(0, 5).map((row) => {
    const out: Record<string, string> = {};
    for (const field of entity.fields) {
      const col = mapping[field.key];
      out[field.key] = col ? (row[col] ?? "") : "";
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
      {step > 0 && !result && (
        <div className="flex items-center gap-1 text-xs">
          {(["Upload", "Map Columns", "Preview & Import"] as const).map((label, i) => (
            <div key={label} className="flex items-center gap-1">
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0",
                i < step  && "bg-emerald-500 text-white",
                i === step && "bg-primary text-primary-foreground",
                i > step  && "bg-muted text-muted-foreground",
              )}>
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              <span className={cn("hidden sm:inline", i === step ? "text-foreground font-medium" : "text-muted-foreground")}>{label}</span>
              {i < 2 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
            </div>
          ))}
        </div>
      )}

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
          {!hasRequiredMapping && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Map all required (*) fields to continue.
            </div>
          )}
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
        <div className={cn("flex items-center", step === 0 ? "justify-end" : "justify-between")}>
          {step > 0 && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2)}>
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </Button>
          )}
          {step === 1 && (
            <Button
              size="sm"
              className="gap-1"
              disabled={!hasRequiredMapping}
              onClick={() => setStep(2)}
            >
              Preview <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          )}
          {step === 2 && (
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
