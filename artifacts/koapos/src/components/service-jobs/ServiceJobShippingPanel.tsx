import { useState, useEffect } from "react";
import {
  useUpdateServiceJob,
  getListServiceJobsQueryKey,
  type ServiceJob,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, ExternalLink, Truck } from "lucide-react";
import { toast } from "sonner";

/** Build a carrier tracking URL where we know the format, else null. */
function trackUrl(carrier: string | null, tracking: string): string | null {
  if (!tracking) return null;
  const c = (carrier ?? "").toLowerCase();
  if (c.includes("auspost") || c.includes("australia")) return `https://auspost.com.au/mypost/track/#/details/${encodeURIComponent(tracking)}`;
  if (c.includes("startrack")) return `https://startrack.com.au/track/details/${encodeURIComponent(tracking)}`;
  return null;
}

/** Mail-in / postal repair tracking: inbound + return shipment details. */
export function ServiceJobShippingPanel({ job }: { job: ServiceJob }) {
  const queryClient = useQueryClient();
  const update = useUpdateServiceJob();

  const [isMailIn, setIsMailIn] = useState(!!job.isMailIn);
  const [carrier, setCarrier] = useState(job.shippingCarrier ?? "");
  const [inbound, setInbound] = useState(job.inboundTracking ?? "");
  const [ret, setRet] = useState(job.returnTracking ?? "");
  const [returnAddress, setReturnAddress] = useState(job.returnAddress ?? "");

  useEffect(() => {
    setIsMailIn(!!job.isMailIn);
    setCarrier(job.shippingCarrier ?? "");
    setInbound(job.inboundTracking ?? "");
    setRet(job.returnTracking ?? "");
    setReturnAddress(job.returnAddress ?? "");
  }, [job.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (patch: Record<string, unknown>) => {
    update.mutate({ id: job.id, data: patch as never }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListServiceJobsQueryKey() }); },
      onError: () => toast.error("Couldn't save shipping details"),
    });
  };

  const toggleMailIn = (v: boolean) => { setIsMailIn(v); save({ isMailIn: v }); };

  const saveAll = () => {
    save({ shippingCarrier: carrier, inboundTracking: inbound, returnTracking: ret, returnAddress });
    toast.success("Shipping details saved");
  };

  const inUrl = trackUrl(carrier, inbound);
  const retUrl = trackUrl(carrier, ret);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Mail-in / postal repair</p>
          <p className="text-xs text-muted-foreground">Device sent in and/or returned by post.</p>
        </div>
        <Switch checked={isMailIn} onCheckedChange={toggleMailIn} />
      </div>

      {isMailIn && (
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Carrier</Label>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. Australia Post, StarTrack" className="h-9" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center justify-between">
                Inbound tracking
                {inUrl && <a href={inUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-[11px]"><ExternalLink className="w-3 h-3" /> Track</a>}
              </Label>
              <Input value={inbound} onChange={(e) => setInbound(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center justify-between">
                Return tracking
                {retUrl && <a href={retUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-[11px]"><ExternalLink className="w-3 h-3" /> Track</a>}
              </Label>
              <Input value={ret} onChange={(e) => setRet(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Return address</Label>
            <Textarea value={returnAddress} onChange={(e) => setReturnAddress(e.target.value)} rows={2} placeholder="Where to post the device back" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={saveAll} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save shipping
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" disabled title="Connect Australia Post in Integrations to buy return labels">
              <Truck className="w-3.5 h-3.5" /> Buy return label (needs Australia Post)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
