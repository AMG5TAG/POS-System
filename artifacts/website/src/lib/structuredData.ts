import { useEffect } from "react";

const SITE = "https://koastal.com.au";

/** Google Business Profile listing — also used as the schema `hasMap`. */
export const GBP_MAP_URL = "https://maps.app.goo.gl/V6MedKW2n1fCybob7";

/**
 * The single source of truth for the business's NAP details.
 *
 * Every page must build its LocalBusiness node from this object. The address
 * was previously duplicated (and had drifted) between here and the computer
 * repairs page, which undermines the name/address/phone consistency that local
 * ranking leans on. Keep `streetAddress` byte-identical to the Google Business
 * Profile listing.
 */
export const LOCAL_BUSINESS = {
  // ComputerStore is the specific type; LocalBusiness stays for consumers that
  // do not understand the subtype.
  "@type": ["LocalBusiness", "ComputerStore"],
  "@id": `${SITE}/#business`,
  name: "Koastal Kollective",
  logo: `${SITE}/images/logo.png`,
  image: `${SITE}/images/it-services-section.webp`,
  url: `${SITE}/`,
  telephone: "+61493145179",
  email: "sales@koastal.com.au",
  priceRange: "$$",
  currenciesAccepted: "AUD",
  hasMap: GBP_MAP_URL,
  // Tells Google which profiles are this business. Only Koastal Kollective
  // branded accounts belong here — the Kollective/Direktories accounts are a
  // different entity and would muddy entity resolution.
  sameAs: [
    GBP_MAP_URL,
    "https://www.facebook.com/koastal.com.au",
    "https://www.instagram.com/koastal.com.au",
    "https://www.threads.com/@koastal.com.au",
    "https://bsky.app/profile/koastal.com.au",
    "https://www.tiktok.com/@koastal.com.au",
    "https://www.youtube.com/@koastal-com-au",
  ],
  address: {
    "@type": "PostalAddress",
    streetAddress: "Shop 1/64 Vales Road",
    addressLocality: "Mannering Park",
    addressRegion: "NSW",
    postalCode: "2259",
    addressCountry: "AU",
  },
  // Surveyed from the Google Business Profile listing. Previously rounded to
  // two decimal places, which put the pin roughly 1.5 km off the workshop.
  geo: { "@type": "GeoCoordinates", latitude: -33.151863668688506, longitude: 151.5371856464241 },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday"],
      opens: "10:00",
      closes: "14:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "10:00",
      closes: "17:00",
    },
  ],
  areaServed: [
    { "@type": "AdministrativeArea", name: "Central Coast, NSW" },
    { "@type": "AdministrativeArea", name: "Lake Macquarie, NSW" },
  ],
};

interface ServiceGraphInput {
  path: string;
  serviceType: string;
  name: string;
  description: string;
  breadcrumbName: string;
  offers?: Array<string>;
}

export function serviceGraph({
  path,
  serviceType,
  name,
  description,
  breadcrumbName,
  offers,
}: ServiceGraphInput) {
  const url = `${SITE}${path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      LOCAL_BUSINESS,
      {
        "@type": "Service",
        "@id": `${url}#service`,
        serviceType,
        name,
        description,
        provider: { "@id": `${SITE}/#business` },
        areaServed: [
          { "@type": "AdministrativeArea", name: "Central Coast, NSW" },
          { "@type": "AdministrativeArea", name: "Lake Macquarie, NSW" },
        ],
        ...(offers && offers.length
          ? {
              hasOfferCatalog: {
                "@type": "OfferCatalog",
                name,
                itemListElement: offers.map((o) => ({
                  "@type": "Offer",
                  itemOffered: { "@type": "Service", name: o },
                })),
              },
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: breadcrumbName, item: url },
        ],
      },
    ],
  };
}

export function suburbGraph(suburb: string, path: string) {
  const url = `${SITE}${path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        ...LOCAL_BUSINESS,
        areaServed: [
          { "@type": "AdministrativeArea", name: "Central Coast, NSW" },
          { "@type": "AdministrativeArea", name: "Lake Macquarie, NSW" },
          { "@type": "Place", name: suburb },
        ],
      },
      {
        "@type": "Service",
        "@id": `${url}#service`,
        serviceType: "Computer repair, Mac repair, laptop repair, data recovery",
        name: `Computer Repairs ${suburb} | Koastal Kollective`,
        description: `Trusted local PC, Mac and laptop repairs in ${suburb}. Free diagnostic, no-fix no-fee guarantee. Call 0493 145 179.`,
        provider: { "@id": `${SITE}/#business` },
        areaServed: [
          { "@type": "AdministrativeArea", name: "Central Coast, NSW" },
          { "@type": "AdministrativeArea", name: "Lake Macquarie, NSW" },
          { "@type": "Place", name: suburb },
        ],
        image: `${SITE}/images/computer-repair-technician-laptop.webp`,
      },
      // The retired per-suburb Media pages folded into this one, so the web &
      // app offering is declared here rather than on a URL of its own.
      {
        "@type": "Service",
        "@id": `${url}#web-service`,
        serviceType:
          "Website design, website hosting, domain hosting, email hosting, mobile app development",
        name: `Website Design, Hosting & App Development ${suburb} | Koastal Kollective`,
        description: `Local website design, domain hosting, email hosting and iOS/Android app development serving ${suburb}. Fixed-price quotes, Australian team. Call 0493 145 179.`,
        provider: { "@id": `${SITE}/#business` },
        areaServed: [
          { "@type": "AdministrativeArea", name: "Central Coast, NSW" },
          { "@type": "AdministrativeArea", name: "Lake Macquarie, NSW" },
          { "@type": "Place", name: suburb },
        ],
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Koastal Kollective Web & App Services",
          itemListElement: [
            { "@type": "Offer", itemOffered: { "@type": "Service", name: "Website Design & Hosting" } },
            { "@type": "Offer", itemOffered: { "@type": "Service", name: "Domain Hosting" } },
            { "@type": "Offer", itemOffered: { "@type": "Service", name: "App Creation (iOS & Android)" } },
            { "@type": "Offer", itemOffered: { "@type": "Service", name: "Email Hosting" } },
          ],
        },
        image: `${SITE}/images/logo.png`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: `Computer Repairs ${suburb}`, item: url },
        ],
      },
    ],
  };
}

export function useStructuredData(data: unknown, id: string) {
  useEffect(() => {
    const scriptId = `ld-json-${id}`;
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    const created = !script;
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = scriptId;
      document.head.appendChild(script);
    }
    script.text = JSON.stringify(data);
    return () => {
      if (created && script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [data, id]);
}
