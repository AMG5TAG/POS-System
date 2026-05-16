import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { QuickAddCustomerDialog } from "@/components/customers/QuickAddCustomerDialog";
import {
  useCreateServiceJob,
  useListCustomers,
  Customer,
} from "@workspace/api-client-react";
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
  Search,
  Check,
  UserPlus,
  ClipboardList,
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

interface PhotoSlotProps {
  index: number;
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
  label: string;
  accept?: string;
}

function PhotoSlot({ index, value, onChange, icon, label, accept = "image/*" }: PhotoSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange(ev.target?.result as string ?? "");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed aspect-square transition-colors text-muted-foreground",
        value ? "border-primary/30 bg-primary/5" : "border-border hover:border-muted-foreground/40 hover:bg-muted/20"
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
        <img src={value} alt={`slot ${index}`} className="absolute inset-0 w-full h-full object-cover rounded-xl" />
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

  const { data: customersData } = useListCustomers();
  const customers = Array.isArray(customersData) ? customersData : [];

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);

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

  const [additionalEquipment, setAdditionalEquipment] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [passwordOrPin, setPasswordOrPin] = useState("");
  const [accounts, setAccounts] = useState("");

  const [signatureSaved, setSignatureSaved] = useState(false);
  const [signature, setSignature] = useState("");

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

  const selectedCustomer = customers.find((c) => String(c.id) === customerId);

  const filteredCustomers = customers.filter((c: Customer) => {
    const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase();
    return (
      name.includes(customerSearch.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(customerSearch.toLowerCase())
    );
  });

  function handleSubmit() {
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
          passwordOrPin: passwordOrPin || null,
          accounts: accounts || null,
          signature: signature || null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Service job created");
          queryClient.invalidateQueries({ queryKey: ["listServiceJobs"] });
          navigate("/service-jobs");
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setCustomerOpen((o) => !o)}
                className="w-full flex items-center justify-between border rounded-lg px-3 py-2.5 text-sm bg-background hover:bg-muted/30 transition-colors"
              >
                <span className={selectedCustomer ? "text-foreground" : "text-muted-foreground"}>
                  {selectedCustomer
                    ? `${selectedCustomer.firstName ?? ""} ${selectedCustomer.lastName ?? ""}`.trim()
                    : "Search customer..."}
                </span>
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
              {customerOpen && (
                <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-lg">
                  <div className="p-2 border-b">
                    <Input
                      autoFocus
                      placeholder="Search by name or email..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {/* Create new customer — always pinned to top */}
                    <button
                      type="button"
                      onClick={() => { setCustomerOpen(false); setQuickAddOpen(true); }}
                      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-primary font-medium hover:bg-primary/5 border-b"
                    >
                      <UserPlus className="w-3.5 h-3.5 shrink-0" />
                      Create new customer
                    </button>
                    {/* Walk-in / no customer */}
                    <button
                      type="button"
                      onClick={() => { setCustomerId(""); setCustomerOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40"
                    >
                      No customer (walk-in)
                    </button>
                    {filteredCustomers.map((c: Customer) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setCustomerId(String(c.id)); setCustomerOpen(false); setCustomerSearch(""); }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-muted/40",
                          customerId === String(c.id) && "bg-primary/10 font-medium"
                        )}
                      >
                        <span className="font-medium">
                          {`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()}
                        </span>
                        {c.email && <span className="ml-2 text-muted-foreground text-xs">{c.email}</span>}
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && customerSearch && (
                      <div className="px-3 py-3 text-sm text-center text-muted-foreground">
                        No customers match &ldquo;{customerSearch}&rdquo; —{" "}
                        <button
                          type="button"
                          className="text-primary font-medium underline-offset-2 hover:underline"
                          onClick={() => { setCustomerOpen(false); setQuickAddOpen(true); }}
                        >
                          create one
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Password or PIN</Label>
              <Input
                placeholder="Enter password or PIN..."
                value={passwordOrPin}
                onChange={(e) => setPasswordOrPin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Accounts</Label>
              <Input
                placeholder="e.g. Google, Microsoft..."
                value={accounts}
                onChange={(e) => setAccounts(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Photos / Media */}
        <div className="border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-sm">Photos &amp; Media</h2>
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <PhotoSlot
                key={i}
                index={i}
                value={photos[i]}
                onChange={(v) => updatePhoto(i, v)}
                icon={<Camera className="w-4 h-4" />}
                label="Camera"
              />
            ))}
            <PhotoSlot
              index={4}
              value={photos[4]}
              onChange={(v) => updatePhoto(4, v)}
              icon={<Video className="w-4 h-4" />}
              label="Video"
              accept="video/*"
            />
          </div>
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
              className={cn(
                "flex-1 gap-1.5",
                signatureSaved ? "bg-teal-600 hover:bg-teal-700" : ""
              )}
              onClick={saveSignature}
            >
              {signatureSaved ? <Check className="w-4 h-4" /> : null}
              {signatureSaved ? "Signature Saved" : "Save Signature"}
            </Button>
          </div>
        </div>

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

    <QuickAddCustomerDialog
      open={quickAddOpen}
      onClose={() => setQuickAddOpen(false)}
      prefillName={customerSearch}
      onCreated={(customer) => {
        setCustomerId(String(customer.id));
        setCustomerSearch("");
      }}
    />
  </>
  );
}
