import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { FormSelectorField } from "@/components/forms/FormSelectorField";
import { AppLayout } from "@/components/layout/app-layout";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import {
  useCreateServiceJob,
  useGetMerchant,
  type ServiceJob,
  type Customer,
} from "@workspace/api-client-react";
import {
  LabelPreview, useStickerTemplates,
  STICKER_TYPES, DYMO_SIZES,
} from "@/lib/sticker-config";
import { useBusinessProfile } from "@/lib/business-profile";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  Video,
  FileText,
  ArrowLeft,
  AlertCircle,
  MonitorSmartphone,
  Check,
  ClipboardList,
  CheckCircle2,
  Mail,
  Printer,
  Tag,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const DEVICE_TYPES = [
  "AIO",
  "Desktop",
  "Laptop",
  "Tablet",
  "Smartphone",
  "Printer",
  "Network Device",
  "VHS Tape",
  "DVD",
  "Cassette Tape",
  "Game Console",
  "Pictures",
  "External Hard Drive",
  "Other",
];

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface ToggleCardProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleCard({ icon, label, description, checked, onChange }: ToggleCardProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center justify-between w-full border rounded-xl px-4 py-3 text-left transition-colors",
        checked ? "border-primary/40 bg-primary/5" : "border-border bg-background hover:bg-muted/30"
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-primary/70">{icon}</span>
        <div>
          <p className="text-sm font-medium leading-tight">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div
        className={cn(
          "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
          checked ? "border-primary bg-primary" : "border-muted-foreground/40"
        )}
      >
        {checked && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
    </button>
  );
}

const PHOTO_WARN_BYTES  = 2 * 1024 * 1024;  // 2 MB per image — yellow
const PHOTO_ERROR_BYTES = 5 * 1024 * 1024;  // 5 MB per image — red
const VIDEO_WARN_BYTES  = 5 * 1024 * 1024;  // 5 MB per video — yellow
const VIDEO_ERROR_BYTES = 8 * 1024 * 1024;  // 8 MB per video — red
const TOTAL_WARN_BYTES  = 7 * 1024 * 1024;  // 7 MB total — banner warning

function fmtBytes(b: number) {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

interface PhotoSlotProps {
  index: number;
  value: string;
  onChange: (v: string) => void;
  onSizeChange: (bytes: number) => void;
  icon: React.ReactNode;
  label: string;
  accept?: string;
  isVideo?: boolean;
}

function PhotoSlot({ index, value, onChange, onSizeChange, icon, label, accept = "image/*", isVideo = false }: PhotoSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileBytes, setFileBytes] = useState(0);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const bytes = file.size;
    setFileBytes(bytes);
    onSizeChange(bytes);
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange(ev.target?.result as string ?? "");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const warnAt  = isVideo ? VIDEO_WARN_BYTES  : PHOTO_WARN_BYTES;
  const errorAt = isVideo ? VIDEO_ERROR_BYTES : PHOTO_ERROR_BYTES;
  const isError = value && fileBytes >= errorAt;
  const isWarn  = value && !isError && fileBytes >= warnAt;

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed aspect-square transition-colors text-muted-foreground",
        isError ? "border-destructive/60" :
        isWarn  ? "border-amber-400/70" :
        value   ? "border-primary/30 bg-primary/5" :
                  "border-border hover:border-muted-foreground/40 hover:bg-muted/20"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFile}
      />
      {value ? (
        <>
          <img src={value} alt={`slot ${index}`} className="absolute inset-0 w-full h-full object-cover rounded-xl" />
          {(isWarn || isError) && (
            <span className={cn(
              "absolute top-1 right-1 text-[9px] font-semibold px-1 py-0.5 rounded leading-none",
              isError ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"
            )}>
              {fmtBytes(fileBytes)}
            </span>
          )}
        </>
      ) : (
        <>
          <span className="text-muted-foreground/60">{icon}</span>
          <span className="text-[10px] mt-1 text-muted-foreground/60">{label}</span>
        </>
      )}
    </button>
  );
}

export default function ServiceJobNewPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const createMutation = useCreateServiceJob();

  const { data: merchant } = useGetMerchant();
  const { templates: stickerTemplates } = useStickerTemplates();
  const { profile: bizProfile } = useBusinessProfile();

  const [customerId, setCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [successJob, setSuccessJob] = useState<ServiceJob | null>(null);
  const [showStickerDialog, setShowStickerDialog] = useState(false);
  const [selectedStickerTplId, setSelectedStickerTplId] = useState("");

  const repairStickerType = STICKER_TYPES.find((t) => t.id === "repair")!;
  const repairTemplates = stickerTemplates.filter((t) => t.typeId === "repair");
  const activeStickerTpl = repairTemplates.find((t) => t.id === selectedStickerTplId) ?? null;
  const stickerSize = DYMO_SIZES.find((s) => s.id === (activeStickerTpl?.sizeId ?? repairStickerType.defaultSize)) ?? DYMO_SIZES.find((s) => s.id === "30256")!;
  const stickerBaseFields = activeStickerTpl?.fields ?? Object.fromEntries(repairStickerType.fields.map((f) => [f.key, f.defaultValue]));
  const stickerFields = {
    ...stickerBaseFields,
    jobNo: successJob?.jobNumber ?? `SVC-${successJob?.id ?? 0}`,
    customer: selectedCustomer
      ? [selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(" ") || "Walk-in"
      : (successJob?.customerName ?? "Walk-in"),
    device: successJob?.deviceDescription ?? successJob?.deviceType ?? stickerBaseFields.device ?? "",
    fault: successJob?.workDescription ?? stickerBaseFields.fault ?? "",
    dueDate: new Date().toLocaleDateString("en-AU"),
  };
  const brandColor = bizProfile?.brandColors?.[0] ?? "#374151";
  const businessName = merchant?.businessName ?? "";

  const [status, setStatus] = useState("pending");
  const [bookInDate, setBookInDate] = useState(todayISO());
  const [isPartnerRepair, setIsPartnerRepair] = useState(false);
  const [isCritical, setIsCritical] = useState(false);
  const [isUnderWarranty, setIsUnderWarranty] = useState(false);

  const [deviceType, setDeviceType] = useState("");
  const [deviceDescription, setDeviceDescription] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [condition, setCondition] = useState("");
  const [partnerRepairCode, setPartnerRepairCode] = useState("");

  const [photos, setPhotos] = useState<string[]>(Array(9).fill(""));
  const [photoSizes, setPhotoSizes] = useState<number[]>(Array(9).fill(0));

  const [additionalEquipment, setAdditionalEquipment] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [credentials, setCredentials] = useState<Array<{ passwordOrPin: string; accounts: string }>>([
    { passwordOrPin: "", accounts: "" },
  ]);

  function updateCredential(index: number, field: "passwordOrPin" | "accounts", value: string) {
    setCredentials((prev) => {
      const next = prev.map((c, i) => (i === index ? { ...c, [field]: value } : c));
      const last = next[next.length - 1];
      if (last.passwordOrPin.trim() && last.accounts.trim()) {
        next.push({ passwordOrPin: "", accounts: "" });
      }
      return next;
    });
  }

  const [signatureSaved, setSignatureSaved] = useState(false);
  const [signature, setSignature] = useState("");
  const [selectedFormIds, setSelectedFormIds] = useState<number[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getCanvasPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    lastPos.current = getCanvasPos(e, canvas);
    setSignatureSaved(false);
    setSignature("");
  }, []);

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getCanvasPos(e, canvas);
    ctx.beginPath();
    if (lastPos.current) {
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
    }
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }, []);

  const endDraw = useCallback(() => {
    isDrawing.current = false;
    lastPos.current = null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", endDraw);
    canvas.addEventListener("mouseleave", endDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", endDraw);
    return () => {
      canvas.removeEventListener("mousedown", startDraw);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", endDraw);
      canvas.removeEventListener("mouseleave", endDraw);
      canvas.removeEventListener("touchstart", startDraw);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", endDraw);
    };
  }, [startDraw, draw, endDraw]);

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureSaved(false);
    setSignature("");
  }

  function saveSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL("image/png");
    setSignature(data);
    setSignatureSaved(true);
    toast.success("Signature saved");
  }

  function updatePhoto(idx: number, value: string) {
    setPhotos((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function updatePhotoSize(idx: number, bytes: number) {
    setPhotoSizes((prev) => {
      const next = [...prev];
      next[idx] = bytes;
      return next;
    });
  }

  const totalPhotoBytes = photoSizes.reduce((a, b) => a + b, 0);
  const hasOversizedFile = photos.some((v, i) => {
    if (!v) return false;
    const isVid = i === 4;
    return photoSizes[i] >= (isVid ? VIDEO_ERROR_BYTES : PHOTO_ERROR_BYTES);
  });
  const hasTotalWarning = totalPhotoBytes >= TOTAL_WARN_BYTES;

  function handleSubmit() {
    let jobNumberPrefix = "KS", jobNumberDigits = 4;
    try {
      const raw = localStorage.getItem("koapos_code_prefixes");
      if (raw) {
        const p = JSON.parse(raw) as Record<string, unknown>;
        if (typeof p.servicePrefix === "string" && p.servicePrefix) jobNumberPrefix = p.servicePrefix;
        if (typeof p.serviceDigits === "number" && p.serviceDigits > 0) jobNumberDigits = p.serviceDigits;
      }
    } catch { /* use defaults */ }

    createMutation.mutate(
      {
        data: {
          customerId: customerId ? Number(customerId) : null,
          status: status as "pending" | "in-progress" | "completed" | "cancelled",
          bookInDate,
          isPartnerRepair,
          isCritical,
          isUnderWarranty,
          deviceType: deviceType || null,
          deviceDescription: deviceDescription || null,
          serialNumber: serialNumber || null,
          condition: condition || null,
          partnerRepairCode: partnerRepairCode || null,
          photos: photos.filter(Boolean),
          additionalEquipment: additionalEquipment || null,
          workDescription: workDescription || null,
          passwordOrPin: credentials.filter(c => c.passwordOrPin.trim()).map(c => c.passwordOrPin.trim()).join("\n") || null,
          accounts: credentials.filter(c => c.accounts.trim()).map(c => c.accounts.trim()).join("\n") || null,
          signature: signature || null,
          jobNumberPrefix,
          jobNumberDigits,
        } as Parameters<typeof createMutation.mutate>[0]["data"],
      },
      {
        onSuccess: (job) => {
          queryClient.invalidateQueries({ queryKey: ["listServiceJobs"] });
          setSuccessJob(job);
        },
        onError: () => toast.error("Failed to create service job"),
      }
    );
  }

  return (
    <>
    <AppLayout>
      <div className="p-6 space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate("/service-jobs")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">New Service</h1>
          </div>
        </div>

        {/* Customer */}
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <Label>
              Customer <span className="text-destructive">*</span>
            </Label>
            <CustomerSearchInput
              value={customerId}
              onChange={(id, customer) => { setCustomerId(id); setSelectedCustomer(customer); }}
              placeholder="Search customer..."
              allowNone
              noneLabel="No customer (walk-in)"
            />
          </div>
        </div>

        {/* Book-In Date + Partner Repair */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 border rounded-xl px-4 py-3 bg-background">
            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground mb-0.5">Book-In Date</p>
              <input
                type="date"
                value={bookInDate}
                onChange={(e) => setBookInDate(e.target.value)}
                className="text-sm font-medium bg-transparent border-none outline-none w-full cursor-pointer"
              />
            </div>
          </div>
          <ToggleCard
            icon={<FileText className="w-4 h-4" />}
            label="Partner Repair"
            description="Partner Repair"
            checked={isPartnerRepair}
            onChange={setIsPartnerRepair}
          />
        </div>

        {/* Critical + Under Warranty */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ToggleCard
            icon={<AlertCircle className="w-4 h-4" />}
            label="Critical"
            description="High priority job"
            checked={isCritical}
            onChange={setIsCritical}
          />
          <ToggleCard
            icon={<Check className="w-4 h-4" />}
            label="Under Warranty"
            description="Manufacturer warranty"
            checked={isUnderWarranty}
            onChange={setIsUnderWarranty}
          />
        </div>

        {/* Device Section */}
        <div className="border rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Device</h2>
          </div>

          {/* Device Type grid */}
          <div>
            <p className="text-xs text-muted-foreground mb-3">Device Type</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DEVICE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDeviceType(type === deviceType ? "" : type)}
                  className={cn(
                    "flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors text-left",
                    deviceType === type
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-muted/40 text-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 shrink-0",
                      deviceType === type ? "border-primary bg-primary" : "border-muted-foreground/40"
                    )}
                  >
                    {deviceType === type && <div className="w-1.5 h-1.5 rounded-full bg-white m-auto mt-0.5" />}
                  </div>
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Device detail fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Device Description (Brand / Colour)</Label>
              <Input
                placeholder="e.g. Apple MacBook Pro, Space Grey..."
                value={deviceDescription}
                onChange={(e) => setDeviceDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Serial Number</Label>
              <Input
                placeholder="e.g. C02XG2JHJGH7 or scan barcode..."
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Known Damage</Label>
              <Input
                placeholder="e.g. Cracked screen, water damage..."
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              />
            </div>
            {isPartnerRepair && (
              <div className="space-y-1.5">
                <Label>Partner Repair Code</Label>
                <Input
                  placeholder="e.g. PR-00123..."
                  value={partnerRepairCode}
                  onChange={(e) => setPartnerRepairCode(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Work Details */}
        <div className="border rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Work Details</h2>
          </div>

          <div className="space-y-1.5">
            <Label>Additional Equipment</Label>
            <Textarea
              placeholder="List any additional equipment..."
              value={additionalEquipment}
              onChange={(e) => setAdditionalEquipment(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Work Description</Label>
            <Textarea
              placeholder="Describe the service..."
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Logins / Accounts</Label>
            {credentials.map((cred, i) => (
              <div key={i} className="flex gap-0">
                <Input
                  placeholder="Account (e.g. Steam, Google)"
                  value={cred.accounts}
                  onChange={(e) => updateCredential(i, "accounts", e.target.value)}
                  className="rounded-r-none border-r-0 flex-1"
                />
                <Input
                  placeholder="Password / PIN"
                  value={cred.passwordOrPin}
                  onChange={(e) => updateCredential(i, "passwordOrPin", e.target.value)}
                  className="rounded-l-none flex-1"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Photos / Media */}
        <div className="border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Photos &amp; Media</h2>
            {totalPhotoBytes > 0 && (
              <span className="text-xs text-muted-foreground">
                Total: {fmtBytes(totalPhotoBytes)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <PhotoSlot
                key={i}
                index={i}
                value={photos[i]}
                onChange={(v) => updatePhoto(i, v)}
                onSizeChange={(b) => updatePhotoSize(i, b)}
                icon={<Camera className="w-4 h-4" />}
                label="Camera"
              />
            ))}
            <PhotoSlot
              index={4}
              value={photos[4]}
              onChange={(v) => updatePhoto(4, v)}
              onSizeChange={(b) => updatePhotoSize(4, b)}
              icon={<Video className="w-4 h-4" />}
              label="Video"
              accept="video/*"
              isVideo
            />
          </div>
          {hasOversizedFile && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>One or more files are very large and may fail to submit. Consider resizing images to under 5 MB each.</span>
            </div>
          )}
          {!hasOversizedFile && hasTotalWarning && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Total media size is {fmtBytes(totalPhotoBytes)} — this may slow down submission. Consider reducing image sizes.</span>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground/60">Images: warn above 2 MB · Video: warn above 5 MB</p>
        </div>

        {/* Customer Signature */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-semibold">Customer Signature</Label>
            <span className="ml-2 text-xs text-muted-foreground">(optional — can be captured now or sent via email)</span>
          </div>
          <div className="border rounded-xl overflow-hidden">
            <canvas
              ref={canvasRef}
              width={800}
              height={200}
              className="w-full h-36 cursor-crosshair bg-white block"
              style={{ touchAction: "none" }}
            />
            <div className="flex items-center gap-3 p-3 border-t bg-muted/10">
              <p className="text-xs text-muted-foreground flex-1 italic text-center">
                Sign here using mouse or finger
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={clearSignature}>
              Clear
            </Button>
            <Button
              size="sm"
              variant={signatureSaved ? "secondary" : "default"}
              className="flex-1 gap-1.5"
              onClick={saveSignature}
            >
              {signatureSaved ? <Check className="w-4 h-4" /> : null}
              {signatureSaved ? "Signature Saved" : "Save Signature"}
            </Button>
          </div>
        </div>

        {/* Form Selector */}
        <FormSelectorField
          value={selectedFormIds}
          onChange={setSelectedFormIds}
          label="Attach Forms"
        />

        {/* Submit */}
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="px-8"
          >
            {createMutation.isPending ? "Creating..." : "Create Service"}
          </Button>
        </div>
      </div>
    </AppLayout>

    {/* Success dialog */}
    <Dialog open={!!successJob} onOpenChange={(open) => { if (!open) { setSuccessJob(null); navigate("/service-jobs"); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex flex-col items-center gap-3 pt-2 pb-1">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <DialogTitle className="text-center text-xl">Service Created!</DialogTitle>
            {successJob && (
              <p className="text-center text-sm text-muted-foreground">
                Job <span className="font-semibold text-foreground">#{successJob.jobNumber ?? successJob.id}</span> has been booked in successfully.
              </p>
            )}
          </div>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col mt-2">
          {selectedCustomer?.email && (
            <Button
              className="w-full gap-2"
              variant="outline"
              asChild
            >
              <a
                href={`mailto:${selectedCustomer.email}?subject=Service%20Job%20Confirmation%20%23${successJob?.jobNumber ?? successJob?.id}&body=Hi%20${encodeURIComponent((selectedCustomer.firstName ?? "") + " " + (selectedCustomer.lastName ?? "")).trim()}%2C%0A%0AYour%20device%20has%20been%20booked%20in%20for%20service.%20Your%20job%20number%20is%20%23${successJob?.jobNumber ?? successJob?.id}.%0A%0AWe%20will%20be%20in%20touch%20with%20an%20update%20shortly.%0A%0AThank%20you%21`}
                target="_blank"
                rel="noreferrer"
              >
                <Mail className="w-4 h-4" />
                Email Customer
              </a>
            </Button>
          )}
          <Button
            className="w-full gap-2"
            variant="outline"
            onClick={() => {
              document.body.setAttribute("data-print", "sheet");
              window.print();
              document.body.removeAttribute("data-print");
            }}
          >
            <Printer className="w-4 h-4" />
            Print Job Sheet
          </Button>
          <Button
            className="w-full gap-2"
            variant="outline"
            onClick={() => setShowStickerDialog(true)}
          >
            <Tag className="w-4 h-4" />
            Print Service Sticker
          </Button>
          <Button
            className="w-full"
            onClick={() => { setSuccessJob(null); navigate(`/service-jobs/${successJob?.id}`); }}
          >
            View Service Job
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => { setSuccessJob(null); navigate("/service-jobs"); }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Sticker sub-dialog */}
    <Dialog open={showStickerDialog} onOpenChange={setShowStickerDialog}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Print Service Sticker</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {repairTemplates.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Template</Label>
              <div className="grid gap-1">
                <button
                  onClick={() => setSelectedStickerTplId("")}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md border text-left text-sm transition-colors",
                    !selectedStickerTplId ? "border-primary bg-primary/5 font-medium" : "border-border hover:bg-muted/50"
                  )}
                >
                  <repairStickerType.icon className={cn("w-3.5 h-3.5 shrink-0", repairStickerType.color)} />
                  Default (pre-filled with job data)
                </button>
                {repairTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => setSelectedStickerTplId(tpl.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md border text-left text-sm transition-colors",
                      selectedStickerTplId === tpl.id ? "border-primary bg-primary/5 font-medium" : "border-border hover:bg-muted/50"
                    )}
                  >
                    <repairStickerType.icon className={cn("w-3.5 h-3.5 shrink-0", repairStickerType.color)} />
                    {tpl.name}
                    {tpl.isDefault && <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1">Default</Badge>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</Label>
            <div className="border rounded-lg p-4 flex items-center justify-center bg-muted/20 min-h-[120px]">
              <LabelPreview
                type={repairStickerType}
                fields={stickerFields}
                size={stickerSize}
                businessName={businessName}
                brandColor={brandColor}
                fillWidth={380}
                fillHeight={140}
              />
            </div>
            <p className="text-xs text-muted-foreground">Sticker size: {stickerSize.name}</p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setShowStickerDialog(false)}>Cancel</Button>
          <Button
            className="flex-1 gap-2"
            onClick={() => {
              setShowStickerDialog(false);
              setTimeout(() => {
                document.body.setAttribute("data-print", "sticker");
                window.print();
                document.body.removeAttribute("data-print");
              }, 50);
            }}
          >
            <Printer className="w-4 h-4" />
            Print Sticker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Hidden print area — visible only during window.print() */}
    <style dangerouslySetInnerHTML={{ __html:
      `@media print {
        body { visibility: hidden; }
        body[data-print="sticker"] #svc-sticker-print-area { visibility: visible !important; position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
        body[data-print="sticker"] #svc-sticker-print-area * { visibility: visible !important; }
        body[data-print="sheet"] #svc-job-sheet-print-area { visibility: visible !important; position: fixed; left: 0; top: 0; width: 100%; }
        body[data-print="sheet"] #svc-job-sheet-print-area * { visibility: visible !important; }
      }`
    }} />

    {/* ── Job Sheet print area ─────────────────────────────────────── */}
    <div id="svc-job-sheet-print-area" aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: 0, width: "800px", background: "white", padding: "40px", boxSizing: "border-box", fontFamily: "Arial, sans-serif", fontSize: "12px", color: "#111", lineHeight: "1.6" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #222", paddingBottom: "14px", marginBottom: "22px" }}>
        <div>
          <div style={{ width: "30px", height: "30px", borderRadius: "5px", background: brandColor, marginBottom: "6px" }} />
          <div style={{ fontSize: "18px", fontWeight: "bold" }}>{merchant?.businessName ?? "Service Centre"}</div>
          {bizProfile?.abn && <div style={{ color: "#666", fontSize: "11px" }}>ABN {bizProfile.abn}</div>}
          {(bizProfile?.state || bizProfile?.postcode) && (
            <div style={{ color: "#666", fontSize: "11px" }}>{[bizProfile.state, bizProfile.postcode].filter(Boolean).join(" ")}</div>
          )}
          {(bizProfile?.contactEmail ?? merchant?.email) && (
            <div style={{ color: "#666", fontSize: "11px" }}>{bizProfile?.contactEmail ?? merchant?.email}</div>
          )}
          {bizProfile?.website && <div style={{ color: "#666", fontSize: "11px" }}>{bizProfile.website}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "20px", fontWeight: "bold", textTransform: "uppercase", color: "#444", letterSpacing: "1px" }}>Service Job Sheet</div>
          <div style={{ marginTop: "6px" }}>Job No: <strong>{successJob?.jobNumber ?? `SVC-${successJob?.id}`}</strong></div>
          <div>Date: <strong>{new Date(bookInDate || Date.now()).toLocaleDateString("en-AU")}</strong></div>
          <div>Status: <strong style={{ textTransform: "capitalize" }}>{status}</strong></div>
          <div style={{ marginTop: "6px", display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
            {isCritical && <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>CRITICAL</span>}
            {isUnderWarranty && <span style={{ background: "#d1fae5", color: "#065f46", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>WARRANTY</span>}
            {isPartnerRepair && <span style={{ background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>PARTNER REPAIR{partnerRepairCode ? ` · ${partnerRepairCode}` : ""}</span>}
          </div>
        </div>
      </div>

      {/* Customer + Device 2-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
        <div style={{ border: "1px solid #ddd", borderRadius: "6px", padding: "12px" }}>
          <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#888", letterSpacing: "0.5px", marginBottom: "8px" }}>Customer Details</div>
          <div><strong>Name:</strong> {selectedCustomer ? [selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(" ") : (successJob?.customerName ?? "Walk-in")}</div>
          {selectedCustomer?.phone && <div><strong>Phone:</strong> {selectedCustomer.phone}</div>}
          {selectedCustomer?.email && <div><strong>Email:</strong> {selectedCustomer.email}</div>}
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: "6px", padding: "12px" }}>
          <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#888", letterSpacing: "0.5px", marginBottom: "8px" }}>Device Details</div>
          {deviceType && <div><strong>Type:</strong> {deviceType}</div>}
          {deviceDescription && <div><strong>Model:</strong> {deviceDescription}</div>}
          {serialNumber && <div><strong>Serial:</strong> {serialNumber}</div>}
          {condition && <div><strong>Condition:</strong> {condition}</div>}
        </div>
      </div>

      {/* Work description */}
      <div style={{ border: "1px solid #ddd", borderRadius: "6px", padding: "12px", marginBottom: "16px" }}>
        <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#888", letterSpacing: "0.5px", marginBottom: "8px" }}>Fault / Work Required</div>
        <div style={{ minHeight: "48px", whiteSpace: "pre-wrap" }}>{workDescription || "—"}</div>
      </div>

      {/* Additional equipment */}
      {additionalEquipment && (
        <div style={{ border: "1px solid #ddd", borderRadius: "6px", padding: "12px", marginBottom: "16px" }}>
          <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#888", letterSpacing: "0.5px", marginBottom: "8px" }}>Equipment / Accessories Received</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{additionalEquipment}</div>
        </div>
      )}

      {/* Partner repair */}
      {isPartnerRepair && partnerRepairCode && (
        <div style={{ border: "1px solid #bfdbfe", borderRadius: "6px", padding: "12px", marginBottom: "16px", background: "#eff6ff" }}>
          <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#888", letterSpacing: "0.5px", marginBottom: "8px" }}>Partner Repair</div>
          <div>Code: <strong>{partnerRepairCode}</strong></div>
        </div>
      )}

      {/* Photos */}
      {photos.some(Boolean) && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#888", letterSpacing: "0.5px", marginBottom: "8px" }}>Device Photos</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {photos.filter(Boolean).map((p, i) => (
              <img key={i} src={p} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "4px", border: "1px solid #ddd" }} alt={`photo ${i + 1}`} />
            ))}
          </div>
        </div>
      )}

      {/* Signature (captured) */}
      {signature && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#888", letterSpacing: "0.5px", marginBottom: "8px" }}>Customer Signature (captured on device)</div>
          <div style={{ border: "1px solid #ddd", borderRadius: "4px", padding: "4px", display: "inline-block" }}>
            <img src={signature} style={{ maxHeight: "70px", maxWidth: "320px", display: "block" }} alt="customer signature" />
          </div>
        </div>
      )}

      {/* Call History table */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#888", letterSpacing: "0.5px", marginBottom: "8px" }}>Call History</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ccc" }}>
              <th style={{ textAlign: "left", padding: "6px 10px", width: "110px", fontWeight: "bold" }}>Date</th>
              <th style={{ textAlign: "left", padding: "6px 10px", width: "130px", fontWeight: "bold" }}>Staff</th>
              <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: "bold" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 7 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "16px 10px" }}> </td>
                <td style={{ padding: "16px 10px" }}> </td>
                <td style={{ padding: "16px 10px" }}> </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Signature row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", marginTop: "32px" }}>
        <div style={{ borderTop: "1px solid #aaa", paddingTop: "6px" }}>
          <div style={{ fontSize: "10px", color: "#666" }}>Customer Signature</div>
          {!signature && <div style={{ marginTop: "36px" }}> </div>}
        </div>
        <div style={{ borderTop: "1px solid #aaa", paddingTop: "6px" }}>
          <div style={{ fontSize: "10px", color: "#666" }}>Technician / Staff</div>
          <div style={{ marginTop: "36px" }}> </div>
        </div>
      </div>
    </div>

    {/* ── Sticker print area ───────────────────────────────────────── */}
    <div id="svc-sticker-print-area" aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: 0 }}>
      <LabelPreview
        type={repairStickerType}
        fields={stickerFields}
        size={stickerSize}
        businessName={businessName}
        brandColor={brandColor}
      />
    </div>
    </>
  );
}
