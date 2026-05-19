import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { PenLine, Printer, Save, Send } from "lucide-react";
import type { FormField, FormTemplate } from "@/lib/forms-api";
import { resolveQuickCodes, buildQuickCodeContext } from "@/lib/forms-api";

// ── Signature Canvas ──────────────────────────────────────────────────────

function SignatureCanvas({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (value && canvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx && canvasRef.current) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.drawImage(img, 0, 0);
        }
      };
      img.src = value;
    }
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0]!;
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current || !lastPos.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = pos;
    onChange(canvas.toDataURL());
  };

  const stopDraw = () => { drawing.current = false; lastPos.current = null; };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="space-y-1.5">
      <div className="relative border-2 rounded-lg overflow-hidden bg-white cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={600}
          height={150}
          className="w-full h-36 touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {!value && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <PenLine className="h-4 w-4" /> Sign here
            </span>
          </div>
        )}
      </div>
      <button onClick={clear} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
        Clear signature
      </button>
    </div>
  );
}

// ── Field Renderer ────────────────────────────────────────────────────────

function FieldInput({
  field,
  value,
  onChange,
  ctx,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: Record<string, string>;
}) {
  const label = resolveQuickCodes(field.label, ctx);
  const placeholder = resolveQuickCodes(field.placeholder, ctx);
  const helpText = resolveQuickCodes(field.helpText, ctx);
  const str = (value ?? "") as string;

  const inputProps = {
    placeholder: placeholder || undefined,
    value: str,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    className: "mt-1",
  };

  const wrapLabel = (children: React.ReactNode) => (
    <div className="space-y-1">
      <Label className="text-sm font-medium">
        {label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );

  switch (field.type) {
    case "short_answer":
      return wrapLabel(<Input type="text" {...inputProps} />);
    case "long_answer":
      return wrapLabel(<Textarea {...inputProps} className="mt-1 min-h-[80px] resize-none" />);
    case "email":
      return wrapLabel(<Input type="email" {...inputProps} />);
    case "phone":
      return wrapLabel(<Input type="tel" {...inputProps} />);
    case "number":
      return wrapLabel(<Input type="number" {...inputProps} />);
    case "date":
      return wrapLabel(<Input type="date" {...inputProps} />);
    case "time":
      return wrapLabel(<Input type="time" {...inputProps} />);
    case "yes_no":
      return wrapLabel(
        <div className="flex items-center gap-3 mt-2">
          <Switch
            checked={value === "yes"}
            onCheckedChange={v => onChange(v ? "yes" : "no")}
          />
          <span className="text-sm">{value === "yes" ? "Yes" : "No"}</span>
        </div>
      );
    case "multiple_choice":
      return wrapLabel(
        <RadioGroup value={str} onValueChange={onChange} className="mt-2 space-y-1.5">
          {(field.options ?? []).map(opt => (
            <div key={opt} className="flex items-center gap-2">
              <RadioGroupItem value={opt} id={`${field.id}-${opt}`} />
              <Label htmlFor={`${field.id}-${opt}`} className="font-normal text-sm">{opt}</Label>
            </div>
          ))}
        </RadioGroup>
      );
    case "dropdown":
      return wrapLabel(
        <Select value={str} onValueChange={onChange}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={placeholder || "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "signature":
      return wrapLabel(<SignatureCanvas value={str} onChange={onChange} />);
    case "file_upload":
      return wrapLabel(
        <Input
          type="file"
          className="mt-1"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onChange(file.name);
          }}
        />
      );
    case "section_header":
      return (
        <div>
          <h3 className="text-base font-semibold">{label}</h3>
          {helpText && <p className="text-sm text-muted-foreground">{helpText}</p>}
        </div>
      );
    case "divider":
      return <Separator />;
    default:
      return null;
  }
}

// ── FormRenderer ──────────────────────────────────────────────────────────

export interface FormRendererProps {
  form: FormTemplate;
  customer?: { firstName?: string; lastName?: string; email?: string; phone?: string } | null;
  business?: { name?: string; phone?: string; email?: string; address?: string; primaryColor?: string; logoUrl?: string } | null;
  onSubmit: (data: Record<string, unknown>) => void;
  onPrint?: () => void;
  onSaveToProfile?: () => void;
  isSubmitting?: boolean;
  staffMode?: boolean;
}

export function FormRenderer({
  form,
  customer,
  business,
  onSubmit,
  onPrint,
  onSaveToProfile,
  isSubmitting,
  staffMode = false,
}: FormRendererProps) {
  const ctx = buildQuickCodeContext(customer, business);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    form.fields.forEach(f => {
      if (f.quickCode) {
        const key = f.quickCode.replace(/\{\{|\}\}/g, "");
        init[f.id] = ctx[key] ?? "";
      }
    });
    return init;
  });

  const setValue = (id: string, v: unknown) => setValues(prev => ({ ...prev, [id]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const required = form.fields.filter(f => f.required && f.type !== "section_header" && f.type !== "divider");
    const missing = required.filter(f => !values[f.id]);
    if (missing.length > 0) {
      const names = missing.map(f => f.label || f.type).join(", ");
      alert(`Please fill in required fields: ${names}`);
      return;
    }
    onSubmit(values);
  };

  const brandColor = business?.primaryColor ?? "#0f766e";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Business header */}
      {business?.name && (
        <div
          className="rounded-t-xl p-5 text-white flex items-center gap-4"
          style={{ backgroundColor: brandColor }}
        >
          {business.logoUrl && (
            <img src={business.logoUrl} alt="" className="h-12 w-12 rounded-lg object-contain bg-white/20 p-1" />
          )}
          <div>
            <h2 className="text-lg font-bold">{business.name}</h2>
            {business.phone && <p className="text-sm opacity-80">{business.phone}</p>}
          </div>
        </div>
      )}

      <div className={`bg-card border ${business?.name ? "rounded-b-xl border-t-0" : "rounded-xl"} p-6`}>
        <h1 className="text-xl font-bold mb-1">{form.name}</h1>

        {form.description && (
          <div className="bg-muted/50 rounded-lg p-4 mb-5 text-sm text-muted-foreground whitespace-pre-wrap">
            {resolveQuickCodes(form.description, ctx)}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {form.fields.map(field => (
            <FieldInput
              key={field.id}
              field={field}
              value={values[field.id]}
              onChange={v => setValue(field.id, v)}
              ctx={ctx}
            />
          ))}

          <div className="flex gap-2 pt-2 border-t">
            <Button type="submit" disabled={isSubmitting} className="flex-1" style={{ backgroundColor: brandColor }}>
              {isSubmitting ? "Submitting…" : "Submit Form"}
            </Button>
            {staffMode && (
              <>
                {onPrint && (
                  <Button type="button" variant="outline" onClick={onPrint}>
                    <Printer className="h-4 w-4 mr-1.5" /> Print
                  </Button>
                )}
                {onSaveToProfile && (
                  <Button type="button" variant="outline" onClick={onSaveToProfile}>
                    <Save className="h-4 w-4 mr-1.5" /> Save to Profile
                  </Button>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
