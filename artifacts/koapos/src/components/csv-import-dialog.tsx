import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Upload, FileText, AlertTriangle, CheckCircle2, Loader2, ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── CSV parser ─────────────────────────────────────────────────────────────── */

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let field = "";
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') { field += '"'; i += 2; }
          else { i++; break; }
        } else { field += line[i++]; }
      }
      fields.push(field);
      if (i < line.length && line[i] === ",") i++;
    } else {
      const comma = line.indexOf(",", i);
      if (comma === -1) { fields.push(line.slice(i).trim()); break; }
      fields.push(line.slice(i, comma).trim());
      i = comma + 1;
    }
  }
  if (line.endsWith(",")) fields.push("");
  return fields;
}

function normalizeHeaderKey(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

/* ─── Entity configs ──────────────────────────────────────────────────────────── */

interface ColDef { key: string; label: string }

interface EntityConfig {
  title: string;
  entity: string;
  columns: ColDef[];
  templateFilename: string;
  templateContent: string;
  apiPath: string;
  headerMap: Record<string, string>;
  validate: (row: Record<string, string>) => string[];
}

const ENTITY_CONFIG: Record<"customer" | "product", EntityConfig> = {
  customer: {
    title: "Import Customers",
    entity: "customer",
    columns: [
      { key: "firstName",     label: "First Name" },
      { key: "lastName",      label: "Last Name"  },
      { key: "email",         label: "Email"      },
      { key: "phone",         label: "Phone"      },
      { key: "address",       label: "Address"    },
      { key: "loyaltyPoints", label: "Points"     },
      { key: "customerGroup", label: "Group"      },
      { key: "notes",         label: "Notes"      },
    ],
    templateFilename: "customers-template.csv",
    templateContent: [
      "first_name,last_name,email,phone,address,loyalty_points,group,notes",
      "Jane,Smith,jane@example.com,0412345678,123 Main St Sydney,0,Standard,",
      "John,Doe,john@example.com,0498765432,,100,VIP,Prefers email contact",
    ].join("\n"),
    apiPath: "/api/customers/import",
    headerMap: {
      first_name: "firstName",  firstname: "firstName",
      last_name:  "lastName",   lastname:  "lastName",
      email: "email",  email_address: "email",
      phone: "phone",  phone_number: "phone",  mobile: "phone",
      address: "address",  billing_address: "address",
      loyalty_points: "loyaltyPoints",  loyaltypoints: "loyaltyPoints",  points: "loyaltyPoints",
      group: "customerGroup",  customer_group: "customerGroup",  customergroup: "customerGroup",
      notes: "notes",  note: "notes",  comments: "notes",
    },
    validate(row) {
      const errors: string[] = [];
      if (!row.firstName && !row.lastName && !row.email && !row.phone) {
        errors.push("At least one of: name, email, or phone is required");
      }
      if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        errors.push("Invalid email format");
      }
      if (row.loyaltyPoints && isNaN(parseInt(row.loyaltyPoints))) {
        errors.push("Loyalty points must be a whole number");
      }
      return errors;
    },
  },

  product: {
    title: "Import Products",
    entity: "product",
    columns: [
      { key: "name",           label: "Name"      },
      { key: "category",       label: "Category"  },
      { key: "price",          label: "Price"     },
      { key: "costPrice",      label: "Cost"      },
      { key: "sku",            label: "SKU"       },
      { key: "barcode",        label: "Barcode"   },
      { key: "stockQuantity",  label: "Stock"     },
      { key: "trackInventory", label: "Track Inv."},
    ],
    templateFilename: "products-template.csv",
    templateContent: [
      "name,category,price,cost_price,sku,barcode,stock_quantity,track_inventory",
      "Coffee Mug,Drinkware,12.99,5.50,MUG-001,9312345001234,50,true",
      "Ballpoint Pen,Stationery,2.49,,PEN-001,,200,true",
    ].join("\n"),
    apiPath: "/api/products/import",
    headerMap: {
      name: "name",  product_name: "name",
      category: "category",  category_name: "category",
      price: "price",  selling_price: "price",
      cost_price: "costPrice",  cost: "costPrice",  costprice: "costPrice",
      sku: "sku",  sku_number: "sku",  item_code: "sku",
      barcode: "barcode",  upc: "barcode",  ean: "barcode",
      stock_quantity: "stockQuantity",  stock: "stockQuantity",
      quantity: "stockQuantity",  qty: "stockQuantity",
      track_inventory: "trackInventory",  track: "trackInventory",  trackinventory: "trackInventory",
    },
    validate(row) {
      const errors: string[] = [];
      if (!row.name?.trim()) errors.push("Name is required");
      const price = parseFloat(row.price ?? "");
      if (!row.price?.trim() || isNaN(price) || price < 0) {
        errors.push("Price must be a valid number ≥ 0");
      }
      if (row.costPrice?.trim() && (isNaN(parseFloat(row.costPrice)) || parseFloat(row.costPrice) < 0)) {
        errors.push("Cost price must be ≥ 0");
      }
      if (row.stockQuantity?.trim() && isNaN(parseInt(row.stockQuantity))) {
        errors.push("Stock quantity must be a whole number");
      }
      return errors;
    },
  },
};

/* ─── Internal types ─────────────────────────────────────────────────────────── */

interface ParsedRow {
  index: number;
  normalized: Record<string, string>;
  errors: string[];
}

/* ─── CSV parsing + validation ───────────────────────────────────────────────── */

function parseAndValidateCSV(text: string, entity: "customer" | "product"): ParsedRow[] {
  const config = ENTITY_CONFIG[entity];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const rawHeaders      = parseCSVLine(lines[0]);
  const normalizedHdrs  = rawHeaders.map(normalizeHeaderKey);
  const colMap          = normalizedHdrs.map((h) => config.headerMap[h] ?? h);

  const rows = lines.slice(1).map((line, i) => {
    const cells: string[] = parseCSVLine(line);
    const normalized: Record<string, string> = {};
    colMap.forEach((fieldKey, idx) => {
      normalized[fieldKey] = cells[idx] ?? "";
    });
    return { index: i + 1, normalized, errors: config.validate(normalized) };
  });

  // Within-file duplicate detection
  const seenEmails = new Set<string>();
  const seenSkus   = new Set<string>();
  for (const row of rows) {
    if (entity === "customer") {
      const email = row.normalized.email?.trim().toLowerCase();
      if (email) {
        if (seenEmails.has(email)) row.errors.push(`Duplicate email in file: ${email}`);
        else seenEmails.add(email);
      }
    } else {
      const sku = row.normalized.sku?.trim().toLowerCase();
      if (sku) {
        if (seenSkus.has(sku)) row.errors.push(`Duplicate SKU in file: ${sku}`);
        else seenSkus.add(sku);
      }
    }
  }

  return rows;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export interface CsvImportDialogProps {
  entity: "customer" | "product";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

const PREVIEW_LIMIT = 10;

export function CsvImportDialog({ entity, open, onOpenChange, onSuccess }: CsvImportDialogProps) {
  const config = ENTITY_CONFIG[entity];

  const [step, setParsedRows_step] = useState<"upload" | "preview" | "importing">("upload");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [rawFile, setRawFile]       = useState<File | null>(null);
  const [fileName, setFileName]     = useState("");
  const [dragOver, setDragOver]     = useState(false);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  const setStep = setParsedRows_step;

  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setStep("upload");
      setParsedRows([]);
      setRawFile(null);
      setFileName("");
      setDragOver(false);
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv") && !["text/csv", "text/plain", "application/vnd.ms-excel"].includes(file.type)) {
      toast.error("Please upload a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseAndValidateCSV(text, entity);
      if (rows.length === 0) {
        toast.error("No data rows found in the CSV — check the file has a header row and at least one data row");
        return;
      }
      setRawFile(file);
      setParsedRows(rows);
      setFileName(file.name);
      setStep("preview");
    };
    reader.readAsText(file);
  }, [entity]);

  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);
  const handleDrop      = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  const downloadTemplate = useCallback(() => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([config.templateContent], { type: "text/csv" }));
    a.download = config.templateFilename;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [config]);

  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0 || !rawFile) return;
    setStep("importing");
    try {
      const formData = new FormData();
      formData.append("file", rawFile, rawFile.name);
      const response = await fetch(config.apiPath, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || `HTTP ${response.status}`);
      }
      const result = await response.json() as { imported: number; skipped: number; errors: { row: number; message: string }[] };
      onSuccess?.();
      onOpenChange(false);
      const label = config.entity;
      const msg   = `Imported ${result.imported} ${label}${result.imported !== 1 ? "s" : ""}`;
      const extra = result.skipped > 0 ? ` · ${result.skipped} skipped` : "";
      toast.success(`${msg}${extra}`);
    } catch {
      toast.error("Import failed — please try again");
      setStep("preview");
    }
  };

  const validCount  = parsedRows.filter((r) => r.errors.length === 0).length;
  const errorCount  = parsedRows.filter((r) => r.errors.length > 0).length;
  const previewRows = parsedRows.slice(0, PREVIEW_LIMIT);
  const entityLabel = entity === "customer" ? "Customer" : "Product";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-2xl", step === "preview" && "max-w-4xl")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            {config.title}
          </DialogTitle>
        </DialogHeader>

        {/* ── Upload step ────────────────────────────────────────────────── */}
        {step === "upload" && (
          <>
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors select-none",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/30",
                )}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium text-base">Drop your CSV file here</p>
                <p className="text-sm text-muted-foreground mt-1.5">or click to browse</p>
                <p className="text-xs text-muted-foreground/60 mt-3">.csv files only</p>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expected columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {config.columns.map((col) => (
                    <Badge key={col.key} variant="outline" className="text-xs font-normal">
                      {col.label}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Column names are matched flexibly — spaces, underscores, and capitalisation are all handled.
                </p>
              </div>
            </div>

            <DialogFooter className="justify-between sm:justify-between items-center">
              <Button
                variant="link"
                size="sm"
                className="gap-1.5 text-muted-foreground h-auto p-0 text-xs"
                onClick={downloadTemplate}
              >
                <FileText className="w-3.5 h-3.5" />
                Download template CSV
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            </DialogFooter>
          </>
        )}

        {/* ── Preview step ───────────────────────────────────────────────── */}
        {step === "preview" && (
          <>
            <div className="space-y-3">
              {/* Summary */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="gap-1 font-normal">
                  <FileText className="w-3 h-3" /> {fileName}
                </Badge>
                <span className="text-sm text-muted-foreground">{parsedRows.length} rows total</span>
                {validCount > 0 && (
                  <Badge className="gap-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0 hover:bg-green-100">
                    <CheckCircle2 className="w-3 h-3" /> {validCount} valid
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="w-3 h-3" /> {errorCount} with errors
                  </Badge>
                )}
              </div>

              {/* Table */}
              <div className="rounded-md border overflow-hidden">
                <ScrollArea className="h-[320px]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                          {config.columns.map((col) => (
                            <th key={col.key} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                              {col.label}
                            </th>
                          ))}
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row) => (
                          <tr
                            key={row.index}
                            className={cn(
                              "border-t transition-colors",
                              row.errors.length > 0
                                ? "bg-red-50/60 dark:bg-red-950/20"
                                : "hover:bg-muted/30",
                            )}
                          >
                            <td className="px-3 py-2 text-muted-foreground">{row.index}</td>
                            {config.columns.map((col) => (
                              <td key={col.key} className="px-3 py-2 max-w-[130px] truncate" title={row.normalized[col.key] ?? ""}>
                                {row.normalized[col.key] ? (
                                  row.normalized[col.key]
                                ) : (
                                  <span className="text-muted-foreground/30 italic">—</span>
                                )}
                              </td>
                            ))}
                            <td className="px-3 py-2 min-w-[120px]">
                              {row.errors.length === 0 ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                              ) : (
                                <span className="text-red-600 dark:text-red-400 text-[10px] leading-tight">
                                  {row.errors.join(" · ")}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </div>

              {parsedRows.length > PREVIEW_LIMIT && (
                <p className="text-xs text-muted-foreground text-center">
                  Showing first {PREVIEW_LIMIT} of {parsedRows.length} rows — all {validCount} valid rows will be imported.
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 sm:mr-auto"
                onClick={() => { setStep("upload"); setParsedRows([]); setFileName(""); }}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Change file
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={handleImport} disabled={validCount === 0}>
                  {validCount === 0
                    ? "No valid rows"
                    : `Import ${validCount} ${entityLabel}${validCount !== 1 ? "s" : ""}${errorCount > 0 ? ` (skip ${errorCount})` : ""}`}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {/* ── Importing step ─────────────────────────────────────────────── */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importing {entityLabel.toLowerCase()}s, please wait…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
