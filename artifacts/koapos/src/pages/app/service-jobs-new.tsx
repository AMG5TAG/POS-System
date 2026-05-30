import { useState, useEffect, useRef, useMemo } from "react";
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
import { SignaturePad } from "@/components/ui/signature-pad";
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
import { useSalesTemplate } from "@/lib/use-sales-template";
import { ServiceJobSheet } from "@/components/printing/ServiceJobSheet";

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

  const { opts: svcOpts, fontCss: svcFontCss } = useSalesTemplate("Service_Ticket");

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
  const [heardFrom, setHeardFrom] = useState("");
  const [heardFromDetails, setHeardFromDetails] = useState("");
  const [referredByCustomerId, setReferredByCustomerId] = useState("");

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

  const [signature, setSignature] = useState("");
  const [selectedFormIds, setSelectedFormIds] = useState<number[]>([]);

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
    if (!customerId) { toast.error("Please select a customer"); return; }
    const jobNumberPrefix = "KS", jobNumberDigits = 4;

    createMutation.mutate(
      {
        data: {
          customerId: customerId ? Number(customerId) : null,
          status: status as "pending" | "in-progress" | "awaiting-partner-approval" | "partner-replacement" | "awaiting-stock" | "awaiting-customer" | "completed" | "cancelled",
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
          heardFrom: heardFrom || null,
          heardFromDetails: heardFromDetails || null,
          referredByCustomerId: referredByCustomerId ? Number(referredByCustomerId) : null,
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
              invalid={!customerId}
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

        {/* Heard From */}
        <div className="border rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Lead Source</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Heard From</Label>
              <Select value={heardFrom} onValueChange={(v) => { setHeardFrom(v); setHeardFromDetails(""); }}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Google">Google</SelectItem>
                  <SelectItem value="Social Media">Social Media</SelectItem>
                  <SelectItem value="Friend">Friend</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {heardFrom === "Friend" && (
              <div className="space-y-1.5">
                <Label>Friend's Name</Label>
                <Input value={heardFromDetails} onChange={(e) => setHeardFromDetails(e.target.value)} placeholder="Who referred them?" />
              </div>
            )}
            {heardFrom === "Other" && (
              <div className="space-y-1.5">
                <Label>Other Details</Label>
                <Input value={heardFromDetails} onChange={(e) => setHeardFromDetails(e.target.value)} placeholder="e.g. Billboard, Flyer..." />
              </div>
            )}
            {heardFrom !== "Friend" && heardFrom !== "Other" && <div />}
          </div>
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
        <div className="space-y-2">
          <div>
            <Label className="text-sm font-semibold">Customer Signature</Label>
            <span className="ml-2 text-xs text-muted-foreground">(optional — can be captured now or sent via email)</span>
          </div>
          <SignaturePad
            height={180}
            onSave={(dataUrl) => {
              setSignature(dataUrl);
              toast.success("Signature saved");
            }}
            onClear={() => setSignature("")}
          />
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
            <Button className="w-full gap-2" variant="outline" asChild>
              <a
                href={(() => {
                  const jobRef = successJob?.jobNumber ?? `SVC-${successJob?.id}`;
                  const custName = `${selectedCustomer.firstName ?? ""} ${selectedCustomer.lastName ?? ""}`.trim();
                  const defaultBody = `Hi ${custName},\n\nYour device has been booked in for service. Your job number is #${jobRef}.\n\nWe will be in touch with an update shortly.\n\nThank you!`;
                  const subject = encodeURIComponent(
                    svcOpts.subjectLine || `Service Job Confirmation #${jobRef}`,
                  );
                  const body = encodeURIComponent(
                    (svcOpts.messageText || defaultBody)
                      .replace(/\{jobNumber\}/g, jobRef)
                      .replace(/\{customerName\}/g, custName)
                      .replace(/\{businessName\}/g, businessName),
                  );
                  return `mailto:${selectedCustomer.email}?subject=${subject}&body=${body}`;
                })()}
                target="_blank"
                rel="noreferrer"
              >
                <Mail className="w-4 h-4" />
                Email Customer
              </a>
            </Button>
          )}
          {selectedCustomer?.phone && (
            <Button className="w-full gap-2" variant="outline" asChild>
              <a
                href={(() => {
                  const jobRef = successJob?.jobNumber ?? `SVC-${successJob?.id}`;
                  const custName = `${selectedCustomer.firstName ?? ""} ${selectedCustomer.lastName ?? ""}`.trim();
                  const defaultMsg = `Hi ${custName}, your device has been booked in. Job #${jobRef}. We'll be in touch soon. — ${businessName}`;
                  const msg = encodeURIComponent(
                    (svcOpts.messageText || defaultMsg)
                      .replace(/\{jobNumber\}/g, jobRef)
                      .replace(/\{customerName\}/g, custName)
                      .replace(/\{businessName\}/g, businessName),
                  );
                  return `sms:${selectedCustomer.phone}?body=${msg}`;
                })()}
              >
                <Tag className="w-4 h-4" />
                SMS Customer
              </a>
            </Button>
          )}
          <Button
            className="w-full gap-2"
            variant="outline"
            onClick={() => {
              setTimeout(() => {
                document.body.setAttribute("data-print", "sheet");
                const cleanup = () => document.body.removeAttribute("data-print");
                window.addEventListener("afterprint", cleanup, { once: true });
                setTimeout(cleanup, 30_000);
                window.print();
              }, 80);
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
                const cleanup = () => document.body.removeAttribute("data-print");
                window.addEventListener("afterprint", cleanup, { once: true });
                setTimeout(cleanup, 30_000);
                window.print();
              }, 150);
            }}
          >
            <Printer className="w-4 h-4" />
            Print Sticker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Print-only areas — hidden on screen, shown during window.print() */}
    <style dangerouslySetInnerHTML={{ __html:
      `@media screen {
        #svc-job-sheet-print-area, #svc-sticker-print-area { display: none !important; }
      }
      @media print {
        body * { visibility: hidden !important; }
        body[data-print="sheet"] #svc-job-sheet-print-area,
        body[data-print="sheet"] #svc-job-sheet-print-area * { visibility: visible !important; }
        body[data-print="sheet"] #svc-job-sheet-print-area {
          display: block !important;
          position: fixed !important; left: 0 !important; top: 0 !important;
          width: 100% !important; box-sizing: border-box !important;
        }
        body[data-print="sticker"] #svc-sticker-print-area,
        body[data-print="sticker"] #svc-sticker-print-area * { visibility: visible !important; }
        body[data-print="sticker"] #svc-sticker-print-area {
          display: flex !important;
          position: fixed !important; left: 0 !important; top: 0 !important;
          width: 100vw !important; height: 100vh !important;
          align-items: center !important; justify-content: center !important;
        }
        @page { size: A4 portrait; margin: 10mm; }
      }`
    }} />

    {/* ── Job Sheet print area (unified template) ──────────────────── */}
    <ServiceJobSheet
      id="svc-job-sheet-print-area"
      opts={svcOpts}
      fontCss={svcFontCss}
      branding={{
        businessName: merchant?.businessName ?? "Service Centre",
        abn: bizProfile?.abn,
        website: bizProfile?.website,
        email: bizProfile?.contactEmail ?? merchant?.email ?? undefined,
        address: [bizProfile?.state, bizProfile?.postcode].filter(Boolean).join(" "),
        brandColor,
        logo: bizProfile?.logo,
      }}
      data={{
        jobNumber: successJob?.jobNumber ?? `SVC-${successJob?.id ?? ""}`,
        date: bookInDate || Date.now(),
        status,
        customerName: selectedCustomer ? [selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(" ") : (successJob?.customerName ?? "Walk-in"),
        customerPhone: selectedCustomer?.phone ?? undefined,
        customerEmail: selectedCustomer?.email ?? undefined,
        deviceType,
        deviceModel: deviceDescription,
        serialNumber,
        condition,
        workDescription,
        additionalEquipment,
        accounts: credentials.map((c) => c.accounts.trim()).join("\n"),
        logins: credentials.map((c) => c.passwordOrPin.trim()).join("\n"),
        photos,
        signature: signature || undefined,
        isCritical,
        isUnderWarranty,
        isPartnerRepair,
        partnerRepairCode,
      }}
    />

    {/* ── Sticker print area ───────────────────────────────────────── */}
    <div id="svc-sticker-print-area">
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
