import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Upload, FileText, FileSpreadsheet, Loader2, Trash2, Plus,
  AlertCircle, Zap, ChevronRight, X,
} from "lucide-react";
import type { FormField, FieldType } from "@/lib/forms-api";
import { QUICK_CODES } from "@/lib/forms-api";

// ── Field type options ─────────────────────────────────────────────────────

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "short_answer",    label: "Short Answer"    },
  { value: "long_answer",     label: "Long Answer"     },
  { value: "yes_no",          label: "Yes / No"        },
  { value: "date",            label: "Date"            },
  { value: "time",            label: "Time"            },
  { value: "email",           label: "Email"           },
  { value: "phone",           label: "Phone"           },
  { value: "number",          label: "Number"          },
  { value: "signature",       label: "Signature"       },
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "dropdown",        label: "Dropdown"        },
  { value: "section_header",  label: "Section Header"  },
];

// ── Field type inference ───────────────────────────────────────────────────

function inferFieldType(label: string): FieldType {
  const l = label.toLowerCase();
  if (/email/.test(l))                                          return "email";
  if (/phone|mobile|tel|fax/.test(l))                           return "phone";
  if (/date|dob|birth|expir/.test(l))                           return "date";
  if (/\btime\b/.test(l))                                       return "time";
  if (/number|amount|qty|quantity|price|cost|\bno\b/.test(l))   return "number";
  if (/sign(?:ature)?$/.test(l))                                return "signature";
  if (/note|comment|description|detail|reason|remark/.test(l)) return "long_answer";
  if (/\?/.test(l))                                             return "yes_no";
  return "short_answer";
}

// ── Text → fields ──────────────────────────────────────────────────────────

function parseTextToFields(text: string): FormField[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && l.length < 200);
  const fields: FormField[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const cleaned = line.replace(/^[\d).\-*•◆▶]\s*/, "").trim();
    if (!cleaned) continue;

    const colonMatch  = cleaned.match(/^(.+?):\s*[-_\s]*$/);
    const underMatch  = cleaned.match(/^(.+?)\s*_{3,}/);

    let label: string | null = null;
    if (colonMatch)   label = colonMatch[1]!.trim();
    else if (underMatch) label = underMatch[1]!.trim();
    else {
      // Section-header heuristic: short, starts uppercase, no trailing colon
      if (
        cleaned.length >= 3 && cleaned.length <= 60 &&
        /^[A-Z]/.test(cleaned) &&
        !/[_/\\]/.test(cleaned)
      ) {
        const hLabel = cleaned.replace(/:$/, "").trim();
        if (!seen.has(hLabel.toLowerCase())) {
          seen.add(hLabel.toLowerCase());
          fields.push({ id: crypto.randomUUID(), type: "section_header", label: hLabel, required: false });
        }
      }
      continue;
    }

    if (!label || label.length < 2 || label.length > 100) continue;
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());

    fields.push({
      id: crypto.randomUUID(),
      type: inferFieldType(label),
      label,
      required: false,
    });
  }

  return fields;
}

// ── File parsers ───────────────────────────────────────────────────────────

async function parseExcel(file: File): Promise<FormField[]> {
  const { read, utils } = await import("xlsx");
  const buf  = await file.arrayBuffer();
  const wb   = read(buf, { type: "array" });
  const name = wb.SheetNames[0];
  if (!name) return [];
  const ws   = wb.Sheets[name]!;
  const rows = utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];

  const fields: FormField[] = [];
  const seen  = new Set<string>();
  const first = rows[0]?.map(c => String(c).trim()).filter(Boolean) ?? [];

  if (first.length > 1) {
    for (const cell of first) {
      if (!cell || seen.has(cell.toLowerCase())) continue;
      seen.add(cell.toLowerCase());
      fields.push({ id: crypto.randomUUID(), type: inferFieldType(cell), label: cell, required: false });
    }
  } else {
    for (const row of rows) {
      const label = String((row as unknown[])[0] ?? "").trim();
      if (!label || label.length < 2 || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      fields.push({ id: crypto.randomUUID(), type: inferFieldType(label), label, required: false });
    }
  }
  return fields;
}

async function parseWord(file: File): Promise<FormField[]> {
  const mammoth = (await import("mammoth")) as unknown as {
    extractRawText: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const buf    = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return parseTextToFields(result.value);
}

async function parsePdf(file: File): Promise<FormField[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const buf  = await file.arrayBuffer();
  const pdf  = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  let text   = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: unknown) => ((it as { str?: string }).str ?? "")).join("\n") + "\n";
  }
  return parseTextToFields(text);
}

async function parseFile(file: File): Promise<FormField[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return parseExcel(file);
  if (ext === "docx")                                    return parseWord(file);
  if (ext === "pdf")                                     return parsePdf(file);
  throw new Error(`Unsupported file type ".${ext}"`);
}

// ── Field row in review step ───────────────────────────────────────────────

function ReviewFieldRow({
  field,
  onChange,
  onDelete,
}: {
  field: FormField;
  onChange: (updates: Partial<FormField>) => void;
  onDelete: () => void;
}) {
  const [qcOpen, setQcOpen] = useState(false);

  const appendCode = (code: string) => {
    onChange({ label: (field.label ?? "") + " " + code });
    setQcOpen(false);
  };

  return (
    <div className="flex items-center gap-2 py-2 border-b last:border-0">
      {/* Label */}
      <Input
        value={field.label}
        onChange={e => onChange({ label: e.target.value })}
        className="h-8 text-sm flex-1 min-w-0"
        placeholder="Field label…"
      />

      {/* Type */}
      <Select
        value={field.type}
        onValueChange={v => onChange({ type: v as FieldType })}
      >
        <SelectTrigger className="h-8 w-36 text-xs shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FIELD_TYPE_OPTIONS.map(o => (
            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Required */}
      <div className="flex items-center gap-1 shrink-0" title="Required">
        <Switch
          checked={field.required}
          onCheckedChange={v => onChange({ required: v })}
          className="scale-75"
        />
      </div>

      {/* Quick Code picker */}
      {field.type !== "divider" && field.type !== "section_header" && (
        <Popover open={qcOpen} onOpenChange={setQcOpen}>
          <PopoverTrigger asChild>
            <button
              className="shrink-0 p-1 rounded hover:bg-amber-50 text-amber-500 transition-colors"
              title="Append Quick Code"
            >
              <Zap className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-1" side="left">
            <p className="text-[10px] text-muted-foreground px-2 py-1 font-semibold uppercase tracking-wide">
              Append Quick Code
            </p>
            {QUICK_CODES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => appendCode(code)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono text-primary/70 text-[10px]">{code}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* Delete */}
      <button
        onClick={onDelete}
        className="shrink-0 p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────

type Step = "upload" | "parsing" | "review";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (fields: FormField[]) => void;
}

export function DocumentImportModal({ open, onClose, onImport }: Props) {
  const [step,     setStep]     = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [fields,   setFields]   = useState<FormField[]>([]);
  const [error,    setError]    = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setFields([]);
    setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const processFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setError(null);
    setStep("parsing");
    try {
      const detected = await parseFile(file);
      if (detected.length === 0) {
        setError("No form fields detected. Make sure the document contains labels ending in \":\" or \"____\".");
        setStep("upload");
        return;
      }
      setFields(detected);
      setStep("review");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to parse file";
      setError(msg);
      setStep("upload");
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = "";
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }, [processFile]);

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const deleteField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const addBlankField = () => {
    setFields(prev => [...prev, {
      id: crypto.randomUUID(),
      type: "short_answer",
      label: "",
      required: false,
    }]);
  };

  const handleImport = () => {
    const valid = fields.filter(f => f.label.trim().length > 0 || f.type === "divider");
    if (valid.length === 0) { toast.error("Add at least one field before importing"); return; }
    onImport(valid);
    toast.success(`${valid.length} field${valid.length !== 1 ? "s" : ""} imported`);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={open ? handleClose : undefined}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Import Document as Form
          </DialogTitle>
        </DialogHeader>

        {/* ── Step: upload ── */}
        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a PDF, Word, or Excel file. We'll scan it for field labels and
              let you review and adjust everything before adding to your form.
            </p>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors ${
                dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <Upload className={`h-10 w-10 ${dragging ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-center">
                <p className="font-medium text-sm">Drop a file here, or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF &nbsp;·&nbsp; Word (.docx) &nbsp;·&nbsp; Excel (.xlsx, .xls)
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>

            {/* Tips */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: <FileText className="h-4 w-4 text-rose-500" />,        label: "PDF",   desc: "Fields detected from text like \"Name:\" or \"Name:____\"" },
                { icon: <FileText className="h-4 w-4 text-blue-500" />,        label: "Word",  desc: "Paragraphs and table cells with label patterns" },
                { icon: <FileSpreadsheet className="h-4 w-4 text-green-600" />, label: "Excel", desc: "Column headers or rows in the first column" },
              ].map(t => (
                <div key={t.label} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {t.icon}
                    <span className="text-xs font-semibold">{t.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step: parsing ── */}
        {step === "parsing" && (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="font-medium">Parsing document…</p>
              <p className="text-sm text-muted-foreground mt-1 truncate max-w-xs">{fileName}</p>
            </div>
          </div>
        )}

        {/* ── Step: review ── */}
        {step === "review" && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{fields.length} field{fields.length !== 1 ? "s" : ""} detected</span>
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">from "{fileName}"</span>
              </div>
              <button
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => { reset(); }}
              >
                <X className="h-3 w-3" /> Change file
              </button>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wide px-0 pb-1 border-b">
              <span className="flex-1">Label</span>
              <span className="w-36 shrink-0">Type</span>
              <span className="shrink-0 w-10 text-center">Req.</span>
              <span className="shrink-0 w-6" title="Quick Code"><Zap className="h-3 w-3 text-amber-400 mx-auto" /></span>
              <span className="shrink-0 w-6" />
            </div>

            {/* Field list */}
            <div className="overflow-y-auto flex-1 min-h-0 max-h-[360px] pr-1">
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  All fields removed — add some below or change file.
                </p>
              ) : (
                fields.map(f => (
                  <ReviewFieldRow
                    key={f.id}
                    field={f}
                    onChange={u => updateField(f.id, u)}
                    onDelete={() => deleteField(f.id)}
                  />
                ))
              )}
            </div>

            {/* Add field row */}
            <button
              onClick={addBlankField}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add field manually
            </button>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={fields.length === 0}>
                <ChevronRight className="h-4 w-4 mr-1" />
                Import {fields.filter(f => f.label.trim() || f.type === "divider").length} Fields
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
