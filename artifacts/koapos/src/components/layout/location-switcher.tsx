import {
  useListLocations,
  useSetActiveLocation,
  getListLocationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

/** Active store/branch switcher. Hidden for single-location merchants so the
 *  experience is unchanged unless multi-location is actually in use. */
export function LocationSwitcher() {
  const queryClient = useQueryClient();
  const { data } = useListLocations({ query: { queryKey: getListLocationsQueryKey() } });
  const setActive = useSetActiveLocation();

  const items = data?.items ?? [];
  const activeId = data?.activeLocationId;
  if (items.length < 2) return null;

  const onChange = async (val: string) => {
    try {
      await setActive.mutateAsync({ data: { locationId: Number(val) } as never });
      // Active location changes what location-scoped screens show — refresh all.
      queryClient.invalidateQueries();
      toast.success("Switched location");
    } catch {
      toast.error("Couldn't switch location");
    }
  };

  return (
    <Select value={activeId ? String(activeId) : undefined} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto gap-1.5 text-xs border-border px-2.5" aria-label="Active location">
        <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <SelectValue placeholder="Location" />
      </SelectTrigger>
      <SelectContent>
        {items.map((l) => (
          <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
