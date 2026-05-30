import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCustomerSettings,
  useUpdateCustomerSettings,
  getGetCustomerSettingsQueryKey,
} from "@workspace/api-client-react";

export interface CustomerGroup {
  id: string;
  name: string;
  description: string;
  color: string;
}

export interface CustomerRequiredFields {
  email: boolean;
  phone: boolean;
  dateOfBirth: boolean;
  company: boolean;
  abn: boolean;
  billingAddress: boolean;
}

export interface HeardFromSource {
  id: string;
  name: string;
  requiresDetails: boolean;
}

export interface CustomerSettings {
  groups: CustomerGroup[];
  requiredFields: CustomerRequiredFields;
  defaultGroup: string;
  loyaltyPointsPerDollar: number;
  enableLoyalty: boolean;
  heardFromSources: HeardFromSource[];
}

export const DEFAULT_CUSTOMER_GROUPS: CustomerGroup[] = [
  { id: "standard",  name: "Standard",   description: "Regular customers on standard pricing",                  color: "#3b82f6" },
  { id: "vip",       name: "VIP",        description: "High-value customers with exclusive benefits",           color: "#f59e0b" },
  { id: "wholesale", name: "Wholesale",  description: "Wholesale / reseller customers with discounted pricing", color: "#8b5cf6" },
  { id: "trade",     name: "Trade",      description: "Trade account holders",                                  color: "#10b981" },
  { id: "staff",     name: "Staff",      description: "Team members and staff accounts",                        color: "#ef4444" },
];

export const DEFAULT_HEARD_FROM_SOURCES: HeardFromSource[] = [
  { id: "google",       name: "Google",       requiresDetails: false },
  { id: "social-media", name: "Social Media", requiresDetails: false },
  { id: "friend",       name: "Friend",       requiresDetails: true  },
  { id: "other",        name: "Other",        requiresDetails: true  },
];

const DEFAULT_SETTINGS: CustomerSettings = {
  groups: DEFAULT_CUSTOMER_GROUPS,
  requiredFields: {
    email: false,
    phone: false,
    dateOfBirth: false,
    company: false,
    abn: false,
    billingAddress: false,
  },
  defaultGroup: "Standard",
  loyaltyPointsPerDollar: 1,
  enableLoyalty: true,
  heardFromSources: DEFAULT_HEARD_FROM_SOURCES,
};

export function useCustomerSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useGetCustomerSettings({ query: { queryKey: getGetCustomerSettingsQueryKey() } });

  const raw = data as Partial<CustomerSettings> | undefined;
  const settings: CustomerSettings = raw
    ? {
        ...DEFAULT_SETTINGS,
        ...raw,
        requiredFields: { ...DEFAULT_SETTINGS.requiredFields, ...(raw.requiredFields ?? {}) },
        groups: (raw.groups as CustomerGroup[]) ?? DEFAULT_CUSTOMER_GROUPS,
        heardFromSources: (raw.heardFromSources as HeardFromSource[]) ?? DEFAULT_HEARD_FROM_SOURCES,
      }
    : DEFAULT_SETTINGS;

  const { mutate } = useUpdateCustomerSettings();

  const save = (updates: Partial<CustomerSettings>) => {
    const next = { ...settings, ...updates };
    qc.setQueryData(getGetCustomerSettingsQueryKey(), next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutate({ data: next as any }, {
      onError: () => qc.invalidateQueries({ queryKey: getGetCustomerSettingsQueryKey() }),
    });
  };

  return { settings, save, isLoading };
}
