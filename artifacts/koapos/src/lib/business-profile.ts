import { useEffect } from "react";
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

/* ── One-time recovery: localStorage → backend ───────────────────────────────
   Before the backend migration, the business profile lived only in browser
   localStorage under `koapos_business_profile`. The migration switched the app
   to read from the API but never seeded existing local data, so merchants who
   had filled in their details saw a blank profile ("lost their business info").

   On first load after the update we copy any surviving local profile into the
   backend — but ONLY when the backend profile is still empty, so we never
   clobber details that were entered (or migrated) since. Runs at most once per
   browser, gated by both a module flag (concurrent mounts) and a persisted
   flag (subsequent loads). */
const LEGACY_STORAGE_KEY = "koapos_business_profile";
const MIGRATION_DONE_KEY = "koapos_business_profile_migrated";

let migrationAttempted = false;

function readLegacyProfile(): Partial<BusinessProfile> | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BusinessProfile>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Whether a profile carries any merchant-entered details worth preserving. */
function hasUserData(p: BusinessProfile): boolean {
  return Boolean(
    p.abn || p.tagline || p.description || p.logo || p.contactEmail ||
    p.website || p.openingDate || p.state || p.postcode ||
    (p.categories.length > 0),
  );
}

export function useBusinessProfile() {
  const qc = useQueryClient();
  const { data, isLoading } = useGetBusinessProfile({ query: { queryKey: getGetBusinessProfileQueryKey() } });

  const raw = data as Partial<BusinessProfile> | undefined;
  // Coerce array fields back to their defaults when the API returns null /
  // missing / a non-array. These extended fields aren't fully round-tripped by
  // the backend, so a saved profile can come back with e.g. `brandColors: null`;
  // letting that overwrite the default array crashes consumers that `.map()` it
  // (e.g. ColourPicker) — blanking the page after save.
  const arr = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
  const profile: BusinessProfile = raw
    ? {
        ...DEFAULT_BUSINESS_PROFILE,
        ...raw,
        categories:   arr(raw.categories,   DEFAULT_BUSINESS_PROFILE.categories),
        brandColors:  arr(raw.brandColors,  DEFAULT_BUSINESS_PROFILE.brandColors),
        bgColors:     arr(raw.bgColors,     DEFAULT_BUSINESS_PROFILE.bgColors),
        textColors:   arr(raw.textColors,   DEFAULT_BUSINESS_PROFILE.textColors),
        paymentTypes: arr(raw.paymentTypes, DEFAULT_BUSINESS_PROFILE.paymentTypes),
        customLinks:  arr(raw.customLinks,  DEFAULT_BUSINESS_PROFILE.customLinks),
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

  // One-time recovery of a pre-migration localStorage profile (see above).
  useEffect(() => {
    if (migrationAttempted || isLoading) return;
    try {
      if (localStorage.getItem(MIGRATION_DONE_KEY)) { migrationAttempted = true; return; }
    } catch { migrationAttempted = true; return; }

    // Backend already has details — nothing to recover; don't run again.
    if (hasUserData(profile)) {
      migrationAttempted = true;
      try { localStorage.setItem(MIGRATION_DONE_KEY, "1"); } catch { /* ignore */ }
      return;
    }

    const legacy = readLegacyProfile();
    const merged: BusinessProfile | null = legacy
      ? {
          ...DEFAULT_BUSINESS_PROFILE,
          ...legacy,
          categories:   arr(legacy.categories,   DEFAULT_BUSINESS_PROFILE.categories),
          brandColors:  arr(legacy.brandColors,  DEFAULT_BUSINESS_PROFILE.brandColors),
          bgColors:     arr(legacy.bgColors,     DEFAULT_BUSINESS_PROFILE.bgColors),
          textColors:   arr(legacy.textColors,   DEFAULT_BUSINESS_PROFILE.textColors),
          paymentTypes: arr(legacy.paymentTypes, DEFAULT_BUSINESS_PROFILE.paymentTypes),
          customLinks:  arr(legacy.customLinks,  DEFAULT_BUSINESS_PROFILE.customLinks),
          openingHours: { ...DEFAULT_HOURS, ...(legacy.openingHours ?? {}) },
          socialLinks:  { ...DEFAULT_BUSINESS_PROFILE.socialLinks, ...(legacy.socialLinks ?? {}) },
        }
      : null;

    // No local data, or local data is itself empty — nothing useful to migrate.
    if (!merged || !hasUserData(merged)) {
      migrationAttempted = true;
      try { localStorage.setItem(MIGRATION_DONE_KEY, "1"); } catch { /* ignore */ }
      return;
    }

    migrationAttempted = true;
    qc.setQueryData(getGetBusinessProfileQueryKey(), merged);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutate({ data: merged as any }, {
      // Only mark the migration done once it has actually persisted, so a
      // transient failure can retry on the next load instead of losing the data.
      onSuccess: () => { try { localStorage.setItem(MIGRATION_DONE_KEY, "1"); } catch { /* ignore */ } },
      onError:   () => { migrationAttempted = false; qc.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() }); },
    });
  }, [isLoading, profile, mutate, qc]);

  return { profile, save, isLoading };
}

export { DAYS };
