import { useGetMerchant } from "@workspace/api-client-react";
import { COUNTRY_STATES } from "@/lib/localisation";
import { expandState } from "@/lib/address-format";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface StateSelectInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Pass an explicit country code to skip the merchant lookup (e.g. when the form has a country field) */
  countryCode?: string;
}

export function StateSelectInput({ value, onChange, placeholder = "State / Province", className, countryCode }: StateSelectInputProps) {
  const { data: merchantData } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const resolvedCode = countryCode ?? ((merchantData as unknown as Record<string, unknown>)?.country as string) ?? "AU";
  const stateOptions = COUNTRY_STATES[resolvedCode] ?? [];

  if (stateOptions.length > 0) {
    return (
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className={cn("rounded-full", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Select state —</SelectItem>
          {stateOptions.map((s) => (
            <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onChange(expandState(e.target.value))}
      placeholder={placeholder}
      className={cn("rounded-full", className)}
    />
  );
}
