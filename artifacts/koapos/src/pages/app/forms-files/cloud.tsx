/**
 * Forms & Files › Cloud Storage — which cloud providers the merchant has
 * connected, and what syncs to them. Connecting one happens in Settings ›
 * Integrations; this page is the file-side view of those connections.
 */
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Cloud, CloudOff, RefreshCw, Folder } from "lucide-react";
import { useListIntegrations } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { CLOUD_META, CloudFallbackImg } from "./shared";

const CLOUD_KEYS = new Set(["google_drive", "onedrive", "dropbox"]);

export default function CloudStoragePage() {
  const { data: integrationsData = [] } = useListIntegrations();
  const cloudIntegrations = (integrationsData as unknown as { key: string; label: string; status: string; connectedAt: string | null }[])
    .filter(i => CLOUD_KEYS.has(i.key));

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cloud Storage</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Google Drive, OneDrive and Dropbox connections, and the folders KoaPOS keeps in sync.
            </p>
          </div>
          <Button variant="outline" onClick={() => {
            const connected = cloudIntegrations.filter(i => i.status === "connected");
            if (connected.length === 0) {
              toast.info("No cloud storage providers connected yet.");
            } else {
              toast.success(`Syncing with ${connected.map(i => (CLOUD_META[i.key] ?? { label: i.label }).label).join(", ")}…`);
            }
          }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Sync All
          </Button>
        </div>

        <div className="space-y-4">
              {cloudIntegrations.length === 0 ? (
                <div className="text-center py-12 space-y-3 text-muted-foreground">
                  <Cloud className="h-10 w-10 mx-auto opacity-30" />
                  <p className="text-sm font-medium">Loading cloud storage integrations…</p>
                </div>
              ) : (() => {
                const connected    = cloudIntegrations.filter(i => i.status === "connected");
                const disconnected = cloudIntegrations.filter(i => i.status !== "connected");
                return (
                  <>
                    {connected.length === 0 && (
                      <div className="rounded-xl border bg-amber-50 border-amber-200 px-4 py-3 flex items-center gap-3">
                        <CloudOff className="h-4 w-4 text-amber-600 shrink-0" />
                        <p className="text-sm text-amber-800">
                          No cloud storage providers are connected. Set them up in{" "}
                          <a href="/management/settings-integrations/integrations" className="font-semibold underline">Management → Integrations</a>.
                        </p>
                      </div>
                    )}
                    {connected.map(intg => {
                      const meta = CLOUD_META[intg.key] ?? { label: intg.label, bg: "bg-muted", text: intg.label[0] };
                      return (
                        <div key={intg.key} className="rounded-xl border bg-card overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                            <div className="flex items-center gap-2.5">
                              <div className={cn("w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden", meta.bg)}>
                                {meta.src ? <CloudFallbackImg src={meta.src} alt={meta.label} size="w-4 h-4" fallback={meta.text} /> : meta.text}
                              </div>
                              <span className="font-semibold text-sm">{meta.label}</span>
                              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Connected</Badge>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 h-7 text-xs"
                              onClick={() => toast.success(`Syncing with ${meta.label}…`)}
                            >
                              <RefreshCw className="h-3 w-3" /> Sync Now
                            </Button>
                          </div>
                          <div className="divide-y">
                            {["Reports", "Receipts", "Exports", "Forms"].map(folder => (
                              <div key={folder} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors">
                                <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                                <span>{folder}</span>
                                <span className="ml-auto text-xs text-muted-foreground">Auto-sync enabled</span>
                              </div>
                            ))}
                          </div>
                          {intg.connectedAt && (
                            <p className="px-4 py-2 text-[11px] text-muted-foreground border-t">
                              Connected {new Date(intg.connectedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {disconnected.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not Connected</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {disconnected.map(intg => {
                            const meta = CLOUD_META[intg.key] ?? { label: intg.label, bg: "bg-muted", text: intg.label[0] };
                            return (
                              <div key={intg.key} className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0 opacity-40 overflow-hidden", meta.bg)}>
                                  {meta.src ? <CloudFallbackImg src={meta.src} alt={meta.label} size="w-5 h-5" fallback={meta.text} /> : meta.text}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium">{meta.label}</p>
                                  <p className="text-xs text-muted-foreground">Not connected</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Connect providers in{" "}
                          <a href="/management/settings-integrations/integrations" className="text-primary underline font-medium">Management → Integrations</a>.
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
        </div>
      </div>
    </AppLayout>
  );
}
