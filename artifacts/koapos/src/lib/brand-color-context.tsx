import { createContext, useContext, type ReactNode } from "react";
import { useBusinessProfile, DEFAULT_BUSINESS_PROFILE } from "./business-profile";

interface BrandColorContextValue {
  brandColors: string[];
  bgColors: string[];
  textColors: string[];
}

const BrandColorContext = createContext<BrandColorContextValue>({
  brandColors: DEFAULT_BUSINESS_PROFILE.brandColors,
  bgColors:    DEFAULT_BUSINESS_PROFILE.bgColors,
  textColors:  DEFAULT_BUSINESS_PROFILE.textColors,
});

export function BrandColorProvider({ children }: { children: ReactNode }) {
  const { profile } = useBusinessProfile();
  return (
    <BrandColorContext.Provider
      value={{
        brandColors: profile.brandColors,
        bgColors:    profile.bgColors,
        textColors:  profile.textColors,
      }}
    >
      {children}
    </BrandColorContext.Provider>
  );
}

export function useBrandColors() {
  return useContext(BrandColorContext);
}
