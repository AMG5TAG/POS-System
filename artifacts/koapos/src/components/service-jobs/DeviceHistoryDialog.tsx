import {
  useGetDeviceHistory,
  getGetDeviceHistoryQueryKey,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Wrench, ShoppingCart, Loader2, History } from "lucide-react";

/** Full repair + sale history for a device, looked up by serial / IMEI. */
export function DeviceHistoryDialog({
  serial, open, onClose,
}: { serial: string | null; open: boolean; onClose: () => void }) {
  const enabled = open && !!serial;
  const { data, isLoading, isError } = useGetDeviceHistory(
    { serial: serial ?? "" },
    { query: { queryKey: getGetDeviceHistoryQueryKey({ serial: serial ?? "" }), enabled } },
  );

  const jobs  = data?.serviceJobs ?? [];
  const sales = data?.sales ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="w-5 h-5 text-primary" />
            Device History
            {serial && <span className="font-mono text-sm text-muted-foreground">{serial}</span>}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Couldn't load device history.</p>
        ) : jobs.length === 0 && sales.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No other records for this serial.</p>
        ) : (
          <div className="space-y-4">
            {/* Repairs */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" /> Repairs ({jobs.length})
              </p>
              {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No repairs recorded.</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {jobs.map((j) => (
                    <div key={j.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="font-mono text-xs">{j.jobNumber}</span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{j.deviceDescription || j.deviceType || "Device"}</p>
                        <p className="text-xs text-muted-foreground">
                          {j.bookInDate || new Date(j.createdAt).toLocaleDateString("en-AU")}
                          {j.customerName ? ` · ${j.customerName}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize shrink-0">{j.status.replace(/-/g, " ")}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sales */}
            {sales.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <ShoppingCart className="w-3.5 h-3.5" /> Sales ({sales.length})
                </p>
                <div className="rounded-lg border divide-y">
                  {sales.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{s.productName || `Product #${s.productId}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.soldAt ? `Sold ${new Date(s.soldAt).toLocaleDateString("en-AU")}` : "In stock"}
                          {s.transactionId ? ` · Sale #${s.transactionId}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize shrink-0">{s.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
