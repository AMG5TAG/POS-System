import { useGetMerchant } from "@workspace/api-client-react";

/* ── Country code ↔ name ─────────────────────────────────────────────────── */

export const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  AU: "Australia",        NZ: "New Zealand",       US: "United States",     GB: "United Kingdom",
  CA: "Canada",           SG: "Singapore",         IN: "India",             ZA: "South Africa",
  FR: "France",           DE: "Germany",           IT: "Italy",             ES: "Spain",
  NL: "Netherlands",      PT: "Portugal",          JP: "Japan",             KR: "South Korea",
  CN: "China",            TW: "Taiwan",            HK: "Hong Kong",         MY: "Malaysia",
  ID: "Indonesia",        TH: "Thailand",          VN: "Vietnam",           PH: "Philippines",
  AE: "United Arab Emirates", SA: "Saudi Arabia",  QA: "Qatar",
  BR: "Brazil",           MX: "Mexico",            AR: "Argentina",         CL: "Chile",
  SE: "Sweden",           NO: "Norway",            DK: "Denmark",           FI: "Finland",
  CH: "Switzerland",      AT: "Austria",           BE: "Belgium",           IE: "Ireland",
  PL: "Poland",           TR: "Turkey",            NG: "Nigeria",           KE: "Kenya",
  EG: "Egypt",            GH: "Ghana",             PK: "Pakistan",          BD: "Bangladesh",
  LK: "Sri Lanka",        NP: "Nepal",
};

/* ── State options per country ───────────────────────────────────────────── */

export interface StateOption { code: string; name: string; }

export const COUNTRY_STATES: Record<string, StateOption[]> = {
  AU: [
    { code: "NSW", name: "New South Wales" },
    { code: "VIC", name: "Victoria" },
    { code: "QLD", name: "Queensland" },
    { code: "WA",  name: "Western Australia" },
    { code: "SA",  name: "South Australia" },
    { code: "TAS", name: "Tasmania" },
    { code: "ACT", name: "Australian Capital Territory" },
    { code: "NT",  name: "Northern Territory" },
  ],
  NZ: [
    { code: "AUK", name: "Auckland" },
    { code: "WGN", name: "Wellington" },
    { code: "CAN", name: "Canterbury" },
    { code: "WKO", name: "Waikato" },
    { code: "BOP", name: "Bay of Plenty" },
    { code: "OTA", name: "Otago" },
    { code: "STL", name: "Southland" },
    { code: "HKB", name: "Hawke's Bay" },
    { code: "MWT", name: "Manawatu-Whanganui" },
    { code: "TKI", name: "Taranaki" },
    { code: "NTL", name: "Northland" },
    { code: "NSN", name: "Nelson" },
    { code: "MBH", name: "Marlborough" },
    { code: "GIS", name: "Gisborne" },
    { code: "TAS", name: "Tasman" },
    { code: "WTC", name: "West Coast" },
  ],
  US: [
    { code: "AL", name: "Alabama" },       { code: "AK", name: "Alaska" },
    { code: "AZ", name: "Arizona" },       { code: "AR", name: "Arkansas" },
    { code: "CA", name: "California" },    { code: "CO", name: "Colorado" },
    { code: "CT", name: "Connecticut" },   { code: "DE", name: "Delaware" },
    { code: "FL", name: "Florida" },       { code: "GA", name: "Georgia" },
    { code: "HI", name: "Hawaii" },        { code: "ID", name: "Idaho" },
    { code: "IL", name: "Illinois" },      { code: "IN", name: "Indiana" },
    { code: "IA", name: "Iowa" },          { code: "KS", name: "Kansas" },
    { code: "KY", name: "Kentucky" },      { code: "LA", name: "Louisiana" },
    { code: "ME", name: "Maine" },         { code: "MD", name: "Maryland" },
    { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" },
    { code: "MN", name: "Minnesota" },     { code: "MS", name: "Mississippi" },
    { code: "MO", name: "Missouri" },      { code: "MT", name: "Montana" },
    { code: "NE", name: "Nebraska" },      { code: "NV", name: "Nevada" },
    { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
    { code: "NM", name: "New Mexico" },    { code: "NY", name: "New York" },
    { code: "NC", name: "North Carolina" },{ code: "ND", name: "North Dakota" },
    { code: "OH", name: "Ohio" },          { code: "OK", name: "Oklahoma" },
    { code: "OR", name: "Oregon" },        { code: "PA", name: "Pennsylvania" },
    { code: "RI", name: "Rhode Island" },  { code: "SC", name: "South Carolina" },
    { code: "SD", name: "South Dakota" },  { code: "TN", name: "Tennessee" },
    { code: "TX", name: "Texas" },         { code: "UT", name: "Utah" },
    { code: "VT", name: "Vermont" },       { code: "VA", name: "Virginia" },
    { code: "WA", name: "Washington" },    { code: "WV", name: "West Virginia" },
    { code: "WI", name: "Wisconsin" },     { code: "WY", name: "Wyoming" },
    { code: "DC", name: "District of Columbia" },
  ],
  CA: [
    { code: "AB", name: "Alberta" },
    { code: "BC", name: "British Columbia" },
    { code: "MB", name: "Manitoba" },
    { code: "NB", name: "New Brunswick" },
    { code: "NL", name: "Newfoundland and Labrador" },
    { code: "NS", name: "Nova Scotia" },
    { code: "ON", name: "Ontario" },
    { code: "PE", name: "Prince Edward Island" },
    { code: "QC", name: "Quebec" },
    { code: "SK", name: "Saskatchewan" },
    { code: "YT", name: "Yukon" },
    { code: "NT", name: "Northwest Territories" },
    { code: "NU", name: "Nunavut" },
  ],
  GB: [
    { code: "ENG", name: "England" },
    { code: "SCT", name: "Scotland" },
    { code: "WLS", name: "Wales" },
    { code: "NIR", name: "Northern Ireland" },
  ],
};

/* ── Hook ────────────────────────────────────────────────────────────────── */

export function useLocalisationDefaults() {
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const countryCode  = (merchant as { country?: string } | undefined)?.country ?? "AU";
  const countryName  = COUNTRY_CODE_TO_NAME[countryCode] ?? countryCode;
  const stateOptions = COUNTRY_STATES[countryCode] ?? [];
  return { countryCode, countryName, stateOptions };
}
