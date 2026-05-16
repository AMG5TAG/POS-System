import { useState, useCallback } from "react";

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

export interface CustomerSettings {
  groups: CustomerGroup[];
  requiredFields: CustomerRequiredFields;
  defaultGroup: string;
  loyaltyPointsPerDollar: number;
  enableLoyalty: boolean;
}

export const DEFAULT_CUSTOMER_GROUPS: CustomerGroup[] = [
  { id: "standard",  name: "Standard",   description: "Regular customers on standard pricing",                  color: "#3b82f6" },
  { id: "vip",       name: "VIP",        description: "High-value customers with exclusive benefits",           color: "#f59e0b" },
  { id: "wholesale", name: "Wholesale",  description: "Wholesale / reseller customers with discounted pricing", color: "#8b5cf6" },
  { id: "trade",     name: "Trade",      description: "Trade account holders",                                  color: "#10b981" },
  { id: "staff",     name: "Staff",      description: "Team members and staff accounts",                        color: "#ef4444" },
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
};

const STORAGE_KEY = "koapos_customer_settings";

export function useCustomerSettings() {
  const [settings, setSettings] = useState<CustomerSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<CustomerSettings>;
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          requiredFields: { ...DEFAULT_SETTINGS.requiredFields, ...(parsed.requiredFields ?? {}) },
        };
      }
    } catch { /* ignore */ }
    return DEFAULT_SETTINGS;
  });

  const save = useCallback((updates: Partial<CustomerSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { settings, save };
}
