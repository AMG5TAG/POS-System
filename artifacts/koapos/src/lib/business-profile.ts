import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBusinessProfile,
  useUpdateBusinessProfile,
  getGetBusinessProfileQueryKey,
} from "@workspace/api-client-react";

export interface DayHours {
  enabled: boolean;
  open: string;
  close: string;
}

export interface CustomLink {
  label: string;
  url: string;
}

export interface BusinessProfile {
  abn: string;
  tagline: string;
  description: string;
  openingDate: string;
  categories: string[];
  logo: string;
  brandFont: string;
  brandColors: string[];
  bgColors: string[];
  textColors: string[];
  contactEmail: string;
  website: string;
  state: string;
  postcode: string;
  openingHours: Record<string, DayHours>;
  paymentTypes: string[];
  socialLinks: {
    facebook: string;
    instagram: string;
    twitter: string;
    linkedin: string;
    youtube: string;
    tiktok: string;
  };
  customLinks: CustomLink[];
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DEFAULT_HOURS: Record<string, DayHours> = Object.fromEntries(
  DAYS.map((d) => [d, { enabled: d !== "Sunday", open: "09:00", close: "17:00" }])
);

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  abn: "",
  tagline: "",
  description: "",
  openingDate: "",
  categories: [],
  logo: "",
  brandFont: "",
  brandColors: ["#efbf04", "#374151", "#6b7280", "#d1d5db"],
  bgColors: ["#ffffff", "#f9fafb", "#f3f4f6"],
  textColors: ["#111827", "#6b7280"],
  contactEmail: "",
  website: "",
  state: "",
  postcode: "",
  openingHours: DEFAULT_HOURS,
  paymentTypes: ["Cash", "EFTPOS", "Mastercard", "Visa"],
  socialLinks: { facebook: "", instagram: "", twitter: "", linkedin: "", youtube: "", tiktok: "" },
  customLinks: [],
};

export function useBusinessProfile() {
  const qc = useQueryClient();
  const { data, isLoading } = useGetBusinessProfile({ query: { queryKey: getGetBusinessProfileQueryKey() } });

  const raw = data as Partial<BusinessProfile> | undefined;
  const profile: BusinessProfile = raw
    ? {
        ...DEFAULT_BUSINESS_PROFILE,
        ...raw,
        openingHours: { ...DEFAULT_HOURS, ...(raw.openingHours ?? {}) },
        socialLinks: { ...DEFAULT_BUSINESS_PROFILE.socialLinks, ...(raw.socialLinks ?? {}) },
      }
    : DEFAULT_BUSINESS_PROFILE;

  const { mutate } = useUpdateBusinessProfile();

  const save = (next: BusinessProfile) => {
    qc.setQueryData(getGetBusinessProfileQueryKey(), next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutate({ data: next as any }, {
      onError: () => qc.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() }),
    });
  };

  return { profile, save, isLoading };
}

export { DAYS };
