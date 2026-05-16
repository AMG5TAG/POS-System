import { useState, useEffect } from "react";

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

const STORAGE_KEY = "koapos_business_profile";

export function useBusinessProfile() {
  const [profile, setProfile] = useState<BusinessProfile>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<BusinessProfile>;
        return {
          ...DEFAULT_BUSINESS_PROFILE,
          ...parsed,
          openingHours: { ...DEFAULT_HOURS, ...(parsed.openingHours ?? {}) },
          socialLinks: { ...DEFAULT_BUSINESS_PROFILE.socialLinks, ...(parsed.socialLinks ?? {}) },
        };
      }
    } catch {}
    return DEFAULT_BUSINESS_PROFILE;
  });

  const save = (next: BusinessProfile) => {
    setProfile(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return { profile, save };
}

export { DAYS };
