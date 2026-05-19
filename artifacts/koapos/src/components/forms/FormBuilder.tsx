import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlignLeft, AlignJustify, ToggleLeft, Calendar, Clock, Mail, Phone,
  Hash, PenLine, Upload, ListOrdered, ChevronDown, Minus, SeparatorHorizontal,
  ChevronUp, ChevronDown as ChevronDownIcon, Trash2, Eye, EyeOff, Save,
  Plus, X, Copy, Check, Zap,
} from "lucide-react";
import type { FormField, FieldType } from "@/lib/forms-api";
import { QUICK_CODES } from "@/lib/forms-api";

// ── Field type palette config ────────────────────────────────────────────

interface FieldTypeDef {
  type: FieldType;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const FIELD_TYPES: FieldTypeDef[] = [
  { type: "short_answer",    label: "Short Answer",   Icon: AlignLeft,         color: "text-blue-500"   },
  { type: "long_answer",     label: "Long Answer",    Icon: AlignJustify,      color: "text-blue-500"   },
  { type: "yes_no",          label: "Yes / No",       Icon: ToggleLeft,        color: "text-green-500"  },
  { type: "date",            label: "Date",           Icon: Calendar,          color: "text-orange-500" },
  { type: "time",            label: "Time",           Icon: Clock,             color: "text-orange-400" },
  { type: "email",           label: "Email",          Icon: Mail,              color: "text-green-600"  },
  { type: "phone",           label: "Phone",          Icon: Phone,             color: "text-blue-600"   },
  { type: "number",          label: "Number",         Icon: Hash,              color: "text-purple-500" },
  { type: "signature",       label: "Signature",      Icon: PenLine,           color: "text-rose-500"   },
  { type: "file_upload",     label: "File Upload",    Icon: Upload,            color: "text-indigo-500" },
  { type: "multiple_choice", label: "Multiple Choice",Icon: ListOrdered,       color: "text-purple-600" },
  { type: "dropdown",        label: "Dropdown",       Icon: ChevronDown,       color: "text-blue-500"   },
  { type: "section_header",  label: "Section Header", Icon: Minus,             color: "text-muted-foreground" },
  { type: "divider",         label: "Divider",        Icon: SeparatorHorizontal,color: "text-muted-foreground"},
];

const DEFAULT_LABELS: Record<FieldType, string> = {
  short_answer:    "Short Answer",
  long_answer:     "Long Answer",
  yes_no:          "Yes / No",
  date:            "Date",
  time:            "Time",
  email:           "Email Address",
  phone:           "Phone Number",
  number:          "Number",
  signature:       "Signature",
  file_upload:     "File Upload",
  multiple_choice: "Multiple Choice",
  dropdown:        "Dropdown",
  section_header:  "Section",
  divider:         "",
};

function getFieldDef(type: FieldType): FieldTypeDef {
  return FIELD_TYPES.find(f => f.type === type) ?? FIELD_TYPES[0]!;
}

// ── Sub-components ──────────────────────────────────────────────────────

function FieldRow({
  field, selected, onSelect, onDelete, onMove, isFirst, isLast,
}: {
  field: FormField;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const def = getFieldDef(field.type);
  const { Icon } = def;

  if (field.type === "divider") {
    return (
      <div
        className={`group relative flex items-center gap-2 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
        onClick={onSelect}
      >
        <SeparatorHorizontal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground italic flex-1">── Divider ──</span>
        <RowActions onDelete={onDelete} onMove={onMove} isFirst={isFirst} isLast={isLast} />
      </div>
    );
  }

  return (
    <div
      className={`group relative flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
      onClick={onSelect}
    >
      <Icon className={`h-4 w-4 shrink-0 ${def.color}`} />
      <span className="text-sm font-medium flex-1 truncate">
        {field.label || def.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </span>
      <RowActions onDelete={onDelete} onMove={onMove} isFirst={isFirst} isLast={isLast} />
    </div>
  );
}

function RowActions({ onDelete, onMove, isFirst, isLast }: {
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => onMove("up")}
        disabled={isFirst}
        className="p-1 rounded hover:bg-muted disabled:opacity-30"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => onMove("down")}
        disabled={isLast}
        className="p-1 rounded hover:bg-muted disabled:opacity-30"
      >
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        className="p-1 rounded hover:bg-destructive/10 text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function OptionsEditor({ options, onChange }: {
  options: string[];
  onChange: (opts: string[]) => void;
}) {
  const [newOpt, setNewOpt] = useState("");
  return (
    <div className="space-y-2">
      <Label className="text-xs">Options</Label>
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              value={opt}
              onChange={e => {
                const next = [...options];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="h-8 text-sm"
            />
            <button
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="p-1 rounded hover:bg-destructive/10 text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-1.5">
          <Input
            value={newOpt}
            onChange={e => setNewOpt(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && newOpt.trim()) {
                onChange([...options, newOpt.trim()]);
                setNewOpt("");
              }
            }}
            placeholder="Add option…"
            className="h-8 text-sm"
          />
          <button
            onClick={() => {
              if (newOpt.trim()) { onChange([...options, newOpt.trim()]); setNewOpt(""); }
            }}
            className="p-1 rounded hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickCodesPanel({ onInsert }: { onInsert: (code: string) => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    });
    onInsert(code);
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <Zap className="h-3.5 w-3.5 text-amber-500" />
        Quick Codes
        {open ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDownIcon className="h-3 w-3 ml-auto" />}
      </button>
      {open && (
        <div className="p-2 space-y-1 border-t bg-muted/20">
          {QUICK_CODES.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => handleCopy(code)}
              className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-xs hover:bg-muted transition-colors group"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="flex items-center gap-1 font-mono text-primary/70">
                {copied === code ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100" />}
              </span>
            </button>
          ))}
          <p className="text-[10px] text-muted-foreground px-2 pt-1">Click a code to copy & insert it into the selected field's label.</p>
        </div>
      )}
    </div>
  );
}

function FieldSettings({
  field,
  onChange,
  onDelete,
}: {
  field: FormField;
  onChange: (updates: Partial<FormField>) => void;
  onDelete: () => void;
}) {
  const def = getFieldDef(field.type);
  const { Icon } = def;
  const hasOptions = field.type === "multiple_choice" || field.type === "dropdown";
  const isLayout = field.type === "section_header" || field.type === "divider";

  const insertQuickCode = (code: string) => {
    onChange({ label: (field.label ?? "") + code });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b">
        <Icon className={`h-4 w-4 ${def.color}`} />
        <span className="text-sm font-semibold uppercase tracking-wide">{def.label}</span>
        <button onClick={onDelete} className="ml-auto p-1 rounded hover:bg-destructive/10 text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {field.type !== "divider" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            value={field.label}
            onChange={e => onChange({ label: e.target.value })}
            placeholder={def.label}
            className="h-8 text-sm"
          />
        </div>
      )}

      {!isLayout && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Placeholder</Label>
            <Input
              value={field.placeholder ?? ""}
              onChange={e => onChange({ placeholder: e.target.value })}
              placeholder="Optional placeholder…"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Help text</Label>
            <Input
              value={field.helpText ?? ""}
              onChange={e => onChange({ helpText: e.target.value })}
              placeholder="Optional helper text…"
              className="h-8 text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Required</Label>
            <Switch
              checked={field.required}
              onCheckedChange={v => onChange({ required: v })}
            />
          </div>
        </>
      )}

      {hasOptions && (
        <OptionsEditor
          options={field.options ?? []}
          onChange={opts => onChange({ options: opts })}
        />
      )}

      <QuickCodesPanel onInsert={insertQuickCode} />
    </div>
  );
}

// ── Main FormBuilder ─────────────────────────────────────────────────────

export interface FormBuilderProps {
  initialName?: string;
  initialDescription?: string;
  initialFields?: FormField[];
  onSave: (name: string, description: string, fields: FormField[]) => void;
  onClose: () => void;
  isSaving?: boolean;
}

export function FormBuilder({
  initialName = "",
  initialDescription = "",
  initialFields = [],
  onSave,
  onClose,
  isSaving,
}: FormBuilderProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [fields, setFields] = useState<FormField[]>(initialFields);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedField = fields.find(f => f.id === selectedId) ?? null;

  const addField = (type: FieldType) => {
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: DEFAULT_LABELS[type],
      required: false,
      options: (type === "multiple_choice" || type === "dropdown") ? ["Option 1", "Option 2"] : undefined,
    };
    setFields(prev => [...prev, newField]);
    setSelectedId(newField.id);
    setTimeout(() => canvasRef.current?.scrollTo({ top: canvasRef.current.scrollHeight, behavior: "smooth" }), 50);
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const deleteField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const moveField = (id: string, dir: "up" | "down") => {
    const idx = fields.findIndex(f => f.id === id);
    const next = [...fields];
    if (dir === "up" && idx > 0) [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
    if (dir === "down" && idx < next.length - 1) [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
    setFields(next);
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error("Please enter a form name"); return; }
    onSave(name.trim(), description, fields);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Form name…"
          className="flex-1 text-lg font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground"
        />
        <Button variant="outline" size="sm" onClick={() => setPreview(v => !v)}>
          {preview ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
          {preview ? "Edit" : "Preview"}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-1.5" />
          {isSaving ? "Saving…" : "Save Form"}
        </Button>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-muted">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ── Three-panel body ── */}
      <div className="flex flex-1 min-h-0">
        {/* Left — field palette */}
        {!preview && (
          <div className="w-48 shrink-0 border-r overflow-y-auto p-3 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pb-1">Add Field</p>
            {FIELD_TYPES.map(({ type, label, Icon, color }) => (
              <button
                key={type}
                onClick={() => addField(type)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors text-left"
              >
                <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Center — form canvas */}
        <div ref={canvasRef} className="flex-1 overflow-y-auto p-6" onClick={() => setSelectedId(null)}>
          <div className="max-w-2xl mx-auto space-y-3">
            {/* Intro text */}
            <div className="rounded-xl border p-4 space-y-2 bg-card">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Disclaimer / Intro text</p>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional intro text shown at the top of the form…"
                className="min-h-[80px] resize-none text-sm"
                onClick={e => e.stopPropagation()}
              />
            </div>

            {/* Fields */}
            {fields.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-border flex items-center justify-center h-40 text-sm text-muted-foreground">
                Click a field type on the left to add it
              </div>
            ) : (
              fields.map((field, i) => (
                <div key={field.id} onClick={e => { e.stopPropagation(); setSelectedId(field.id); }}>
                  <FieldRow
                    field={field}
                    selected={selectedId === field.id}
                    onSelect={() => setSelectedId(field.id)}
                    onDelete={() => deleteField(field.id)}
                    onMove={dir => moveField(field.id, dir)}
                    isFirst={i === 0}
                    isLast={i === fields.length - 1}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right — field settings */}
        {!preview && (
          <div className="w-64 shrink-0 border-l overflow-y-auto p-4">
            {selectedField ? (
              <FieldSettings
                field={selectedField}
                onChange={updates => updateField(selectedField.id, updates)}
                onDelete={() => deleteField(selectedField.id)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-sm text-muted-foreground gap-2">
                <Zap className="h-8 w-8 text-muted-foreground/30" />
                <p>Select a field to edit its settings</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
