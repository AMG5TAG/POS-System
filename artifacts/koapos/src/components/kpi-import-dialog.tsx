import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload, FileSpreadsheet, Download, CheckCircle2, XCircle, AlertCircle, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type KpiMetric =
  | "revenue" | "transactions" | "avg_transaction" | "items_per_transaction"
  | "new_customers" | "loyalty_signups" | "category_revenue" | "appointments"
  | "services" | "refund_rate" | "gross_margin" | "upsell_rate" | "net_profit";

type KpiPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

const VALID_METRICS: KpiMetric[] = [
  "revenue", "transactions", "avg_transaction", "items_per_transaction",
  "new_customers", "loyalty_signups", "category_revenue", "appointments",
  "services", "refund_rate", "gross_margin", "upsell_rate", "net_profit",
];

const VALID_PERIODS: KpiPeriod[] = ["daily", "weekly", "monthly", "quarterly", "annual"];

export interface KpiImportRow {
  name: string;
  metric: KpiMetric;
  period: KpiPeriod;
  target: number;
  notes: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

interface ParsedRow extends KpiImportRow {
  _rowIndex: number;
  _errors: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: KpiImportRow[]) => Promise<void>;
}

/* ─── Column normalisation ───────────────────────────────────────────────── */

function normalise(s: string) {
  return s.toLowerCase().replace(/[\s_\-().]+/g, "");
}

const COLUMN_MAP: Record<string, keyof KpiImportRow> = {
  name: "name", kpiname: "name", targetname: "name", title: "name",
  metric: "metric", kpimetric: "metric", type: "metric", metrictype: "metric",
  period: "period", frequency: "period", periodicity: "period",
  target: "target", targetvalue: "target", value: "target", goal: "target", amount: "target",
  notes: "notes", note: "notes", description: "notes", comment: "notes",
  active: "isActive", isactive: "isActive", enabled: "isActive", status: "isActive",
  start: "startDate", startdate: "startDate", from: "startDate",
  end: "endDate", enddate: "endDate", to: "endDate",
};

function resolveField(header: string): keyof KpiImportRow | null {
  return COLUMN_MAP[normalise(header)] ?? null;
}

/* ─── Date handling ──────────────────────────────────────────────────────────
   Excel cells parsed with cellDates arrive as Date objects; stringifying them
   would produce "Wed Jan 01 2026 …", which the KPI period math can't read. We
   normalise both Date objects and free-text dates to ISO yyyy-mm-dd. */

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Normalise a date cell to yyyy-mm-dd, or "" when it isn't a usable date. */
function normaliseDate(raw: unknown): string {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? "" : toISODate(raw);
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;            // already ISO
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : toISODate(d);
}

/* ─── Row parser / validator ─────────────────────────────────────────────── */

function parseRows(raw: Record<string, string>[]): ParsedRow[] {
  return raw.map((obj, i) => {
    const errors: string[] = [];
    const mapped: Partial<Record<keyof KpiImportRow, string>> = {};

    for (const [header, cell] of Object.entries(obj)) {
      const field = resolveField(header);
      if (field) mapped[field] = String(cell ?? "").trim();
    }

    const name = mapped.name ?? "";
    if (!name) errors.push("Name is required");

    const metricRaw = (mapped.metric ?? "").toLowerCase().replace(/[\s-]/g, "_");
    const metric = VALID_METRICS.find((m) => m === metricRaw) ?? null;
    if (!metric) errors.push(`Invalid metric "${mapped.metric ?? ""}". Valid: ${VALID_METRICS.join(", ")}`);

    const periodRaw = (mapped.period ?? "").toLowerCase();
    const period = VALID_PERIODS.find((p) => p === periodRaw) ?? null;
    if (!period) errors.push(`Invalid period "${mapped.period ?? ""}". Valid: ${VALID_PERIODS.join(", ")}`);

    const targetRaw = mapped.target ?? "";
    const target = parseFloat(targetRaw.replace(/[,$\s]/g, ""));
    if (!targetRaw || isNaN(target) || target < 0) errors.push("Target must be a positive number");

    const isActiveRaw = (mapped.isActive ?? "true").toLowerCase();
    const isActive = !["false", "no", "0", "inactive", "disabled"].includes(isActiveRaw);

    const startDate = normaliseDate(mapped.startDate);
    const endDate = normaliseDate(mapped.endDate);
    if ((mapped.startDate ?? "").trim() && !startDate) errors.push("Invalid start date (use YYYY-MM-DD)");
    if ((mapped.endDate ?? "").trim() && !endDate) errors.push("Invalid end date (use YYYY-MM-DD)");
    if (startDate && endDate && endDate < startDate) errors.push("End date is before start date");

    return {
      _rowIndex: i + 2,
      _errors: errors,
      name,
      metric: (metric ?? "revenue") as KpiMetric,
      period: (period ?? "monthly") as KpiPeriod,
      target: isNaN(target) ? 0 : target,
      notes: mapped.notes ?? "",
      isActive,
      startDate,
      endDate,
    };
  });
}

/* ─── Template download ──────────────────────────────────────────────────── */

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["name", "metric", "period", "target", "notes", "isActive", "startDate", "endDate"],
    ["Monthly Revenue Target", "revenue", "monthly", 50000, "Increase store revenue", "true", "2026-01-01", "2026-12-31"],
    ["Daily Transactions", "transactions", "daily", 30, "", "true", "", ""],
    ["Staff Upsell Rate", "upsell_rate", "weekly", 25, "25% upsell target", "true", "", ""],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "KPI Import");
  XLSX.writeFile(wb, "kpi-import-template.xlsx");
}

/* ─── Component ──────────────────────────────────────────────────────────── */

type Step = "upload" | "preview" | "done";

export function KpiImportDialog({ open, onOpenChange, onImport }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setRows([]);
    setResult(null);
    setImporting(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        if (!raw.length) {
          setRows([{ _rowIndex: 2, _errors: ["File is empty or has no data rows"], name: "", metric: "revenue", period: "monthly", target: 0, notes: "", isActive: true, startDate: "", endDate: "" }]);
        } else {
          setRows(parseRows(raw));
        }
        setStep("preview");
      } catch {
        setRows([{ _rowIndex: 2, _errors: ["Could not read file. Ensure it is a valid CSV or Excel file."], name: "", metric: "revenue", period: "monthly", target: 0, notes: "", isActive: true, startDate: "", endDate: "" }]);
        setStep("preview");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const validRows = rows.filter((r) => r._errors.length === 0);
  const errorRows = rows.filter((r) => r._errors.length > 0);

  const handleImport = async () => {
    setImporting(true);
    try {
      await onImport(validRows);
      setResult({ imported: validRows.length, skipped: errorRows.length });
      setStep("done");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import KPIs from File
          </DialogTitle>
          <DialogDescription>
            Upload a CSV, Excel (.xlsx), or Google Sheets export to bulk-create KPI targets.
          </DialogDescription>
        </DialogHeader>

        {/* ── Upload step ── */}
        {step === "upload" && (
          <div className="space-y-4 py-2">
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
              )}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium text-sm">Drop your file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports .csv, .xlsx, .xls</p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Required columns</p>
              <div className="flex flex-wrap gap-1.5">
                {(["name", "metric", "period", "target"] as const).map((c) => (
                  <Badge key={c} variant="secondary" className="font-mono text-xs">{c}</Badge>
                ))}
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">Optional columns</p>
              <div className="flex flex-wrap gap-1.5">
                {(["notes", "isActive", "startDate", "endDate"] as const).map((c) => (
                  <Badge key={c} variant="outline" className="font-mono text-xs">{c}</Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <strong>metric</strong> values: {VALID_METRICS.join(", ")}
                <br />
                <strong>period</strong> values: {VALID_PERIODS.join(", ")}
              </p>
            </div>

            <div className="flex justify-between items-center">
              <Button variant="ghost" size="sm" onClick={downloadTemplate} className="text-xs gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Download template
              </Button>
            </div>
          </div>
        )}

        {/* ── Preview step ── */}
        {step === "preview" && (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate flex-1">{fileName}</span>
              <div className="flex gap-2 shrink-0">
                <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" />{validRows.length} valid</Badge>
                {errorRows.length > 0 && (
                  <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />{errorRows.length} errors</Badge>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1 rounded-lg border min-h-0" style={{ maxHeight: "calc(90vh - 320px)" }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-6">#</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Metric</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Period</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Target</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr
                      key={row._rowIndex}
                      className={cn(
                        row._errors.length > 0 ? "bg-destructive/5" : "hover:bg-muted/30",
                      )}
                    >
                      <td className="px-3 py-2 text-muted-foreground">{row._rowIndex}</td>
                      <td className="px-3 py-2 font-medium max-w-[140px] truncate">{row.name || <span className="text-muted-foreground italic">—</span>}</td>
                      <td className="px-3 py-2 font-mono">{row.metric}</td>
                      <td className="px-3 py-2 font-mono">{row.period}</td>
                      <td className="px-3 py-2">{row.target > 0 ? row.target.toLocaleString() : <span className="text-muted-foreground italic">—</span>}</td>
                      <td className="px-3 py-2">
                        {row._errors.length === 0 ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <div className="flex items-start gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                            <span className="text-destructive text-xs">{row._errors.join("; ")}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            {errorRows.length > 0 && validRows.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Rows with errors will be skipped. Only {validRows.length} valid row{validRows.length !== 1 ? "s" : ""} will be imported.
              </p>
            )}
          </div>
        )}

        {/* ── Done step ── */}
        {step === "done" && result && (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <p className="font-semibold text-lg">Import complete</p>
            <div className="flex justify-center gap-3">
              <Badge variant="secondary" className="gap-1.5 text-sm py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                {result.imported} imported
              </Badge>
              {result.skipped > 0 && (
                <Badge variant="outline" className="gap-1.5 text-sm py-1">
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  {result.skipped} skipped
                </Badge>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="mt-2">
          {step === "upload" && (
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset} className="gap-1.5 mr-auto">
                <RotateCcw className="h-3.5 w-3.5" />
                Change file
              </Button>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleImport} disabled={validRows.length === 0 || importing}>
                {importing ? "Importing…" : `Import ${validRows.length} KPI${validRows.length !== 1 ? "s" : ""}`}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => handleClose(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
