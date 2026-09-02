/* ─── Saved QR picker ─────────────────────────────────────────────────────────
 * Lets a template's Custom QR come from the codes the merchant already designed
 * in Marketing › QR Codes, instead of only from an uploaded image.
 *
 * Picking one renders that code — frame, colours, dot style, tracking redirect
 * and all — to a PNG data URL and drops it into `customQrImage`, which is the
 * field every document renderer already reads (thermal receipt, A4 receipt,
 * invoice, quote, job sheet, and the PDF attached to invoice emails). So a
 * picked code needs no new plumbing anywhere downstream, and it prints on paper
 * exactly as it looks on screen.
 *
 * The image is a *snapshot*, deliberately: the printed documents include ones
 * rendered on the server, which can't run the browser-only QR renderer. The
 * link back to the saved code is kept (`customQrCodeId`) so the merchant can
 * pull a redesign through with Refresh, and so the UI can name what is printed.
 */
import { useMemo, useState } from "react";
import { useListQrCodes } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrCode, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { apiToQrEntry, isEntityQr, qrEntryData, renderQrEntryDataUrl, type QREntry } from "@/lib/qr-render";

/** Edge of the QR itself in the rendered PNG; frames add to it. ~500 dpi at 25mm. */
const PRINT_QR_PX = 512;

/** Matches the manual-upload cap, so a picked code can't bloat the saved row. */
const MAX_IMAGE_BYTES = 512 * 1024;

export interface SavedQrPickerProps {
  /** Saved QR id the template's custom QR came from ("" when uploaded/none). */
  codeId: string;
  /** Label of that code, remembered so the UI can name it without a refetch. */
  codeLabel: string;
  /** Store the rendered image, its provenance and what it encodes, in one go. */
  onPick: (image: string, entry: QREntry, data: string) => void;
  /** Forget the link. The image itself is left alone — the merchant may still want it. */
  onUnlink: () => void;
}

export function SavedQrPicker({ codeId, codeLabel, onPick, onUnlink }: SavedQrPickerProps) {
  const { data, isLoading } = useListQrCodes({ query: { queryKey: ["qr-codes"] } });
  const [busy, setBusy] = useState(false);

  // Product/customer/service codes are generated per record and managed on their
  // own pages — they'd be meaningless printed on every receipt.
  const entries = useMemo<QREntry[]>(() => {
    const items = (data as { items?: unknown[] } | undefined)?.items ?? [];
    return items
      .map((r) => apiToQrEntry(r as Record<string, unknown>))
      .filter((e) => !isEntityQr(e));
  }, [data]);

  const linked = entries.find((e) => e.id === codeId);

  const render = async (entry: QREntry) => {
    setBusy(true);
    try {
      const image = await renderQrEntryDataUrl(entry, PRINT_QR_PX);
      if (image.length > MAX_IMAGE_BYTES) {
        toast.error("That QR renders too large to store — simplify its design or upload a smaller image.");
        return;
      }
      onPick(image, entry, qrEntryData(entry));
      toast.success(`Using "${entry.label}"`);
    } catch {
      toast.error("Couldn't render that QR code");
    } finally {
      setBusy(false);
    }
  };

  if (!isLoading && entries.length === 0 && !codeId) {
    return (
      <p className="text-[11px] text-muted-foreground leading-snug">
        No saved QR codes yet — design one in <strong>Marketing → QR Codes</strong> and it will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <Select
        value={linked ? codeId : ""}
        disabled={busy || isLoading}
        onValueChange={(id) => {
          const entry = entries.find((e) => e.id === id);
          if (entry) void render(entry);
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={isLoading ? "Loading your QR codes…" : "Choose a saved QR code…"} />
        </SelectTrigger>
        <SelectContent>
          {entries.map((e) => (
            <SelectItem key={e.id} value={e.id} className="text-xs">
              <span className="inline-flex items-center gap-1.5">
                <QrCode className="w-3 h-3 text-muted-foreground" />
                {e.label || "Untitled"}
                <span className="text-muted-foreground">· {e.qrType ?? "website"}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {codeId && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground">
            {busy
              ? "Rendering…"
              /* Don't accuse a code of being deleted before the list arrives. */
              : isLoading
                ? "Loading your QR codes…"
              : linked
                ? <>Linked to <strong className="text-foreground">{linked.label || "Untitled"}</strong></>
                /* Deleted in Marketing since it was picked — the printed image is
                   still valid, so say so rather than silently dropping the link. */
                : <>Saved code <strong className="text-foreground">{codeLabel || codeId}</strong> no longer exists — the image below still prints.</>}
          </span>
          {linked && (
            <Button
              size="sm" variant="outline" type="button" disabled={busy}
              className="h-6 text-[11px] gap-1 px-2"
              onClick={() => void render(linked)}
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
          )}
          <Button
            size="sm" variant="outline" type="button" disabled={busy}
            className="h-6 text-[11px] gap-1 px-2"
            onClick={onUnlink}
          >
            <X className="w-3 h-3" /> Unlink
          </Button>
        </div>
      )}
    </div>
  );
}
