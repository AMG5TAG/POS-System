import MediaLayout from "@/components/MediaLayout";
import { useSeo } from "@/lib/useSeo";
import { pageGraph, useStructuredData } from "@/lib/structuredData";
import { ExternalLink } from "lucide-react";

type Project = {
  name: string;
  tag: string;
  status?: string;
  url: string;
  image: string;
  items: string[];
};

type PortfolioSection = {
  id: string;
  heading: string;
  blurb: string;
  projects: Project[];
};

const websites: Project[] = [
  {
    name: "The Corner Cafe and Spill The Tea",
    tag: "Website + Hosting",
    status: "New",
    image: "/images/portfolio-corner-cafe.webp",
    url: "https://www.thecornercafeco.com.au/",
    items: ["New Website Design", "Brand Overhaul", "Email Hosting", "Mobile Friendly"],
  },
  {
    name: "Australian Poker Series",
    tag: "Website + Hosting",
    image: "/images/portfolio-aps.webp",
    url: "https://www.apsnewcastle.com/",
    items: ["Brand upgrade", "Website overhaul", "Social media overhaul", "Live leaderboard integration"],
  },
  {
    name: "Ladder Finance",
    tag: "Website + Hosting",
    image: "/images/portfolio-ladder-finance.webp",
    url: "https://www.ladderfinance.com.au/",
    items: ["Brand upgrade", "Single page site", "Google Workspace", "Basic SEO"],
  },
  {
    name: "Stain Busters Newcastle",
    tag: "Website + Hosting",
    image: "/images/portfolio-stain-busters.webp",
    url: "https://stainbustersnewcastle.com.au/",
    items: ["Hosting takeover", "Adjusted all pages", "Improved SEO", "Ongoing management"],
  },
  {
    name: "Yellow Duck Motorsport",
    tag: "Website + Hosting",
    image: "/images/portfolio-yellow-duck.webp",
    url: "http://yellowduckmotorsport.com/",
    items: ["Hosting takeover", "Adjusted all pages", "Improved SEO", "Ongoing management"],
  },
  {
    name: "Koastal Kollective",
    tag: "Website + Hosting + App",
    image: "/images/portfolio-koastal.webp",
    url: "https://www.koastal.com.au/",
    items: ["Full custom website", "App support", "Suburb SEO optimisation", "Google Workspace setup & management"],
  },
];

const softwareAndApps: Project[] = [
  {
    name: "Direktories",
    tag: "Website / App + Hosting",
    status: "Work in progress",
    image: "/images/portfolio-direktories.webp",
    url: "https://www.direktories.com.au/",
    items: ["Location-specific directory", "Live app", "Integrated web search", "Payments and subscriptions"],
  },
  {
    name: "KoaPOS",
    tag: "Website + Mobile App",
    status: "Work in progress",
    image: "/images/portfolio-koapos.webp",
    url: "https://koapos.com.au/",
    items: ["Fully customised POS system", "Tailored for different markets", "Web + mobile app", "Ongoing support"],
  },
  {
    name: "KKamera",
    tag: "Mobile App + Hosting",
    status: "Work in progress",
    image: "/images/portfolio-kkamera.webp",
    url: "https://kkamera.app/",
    items: ["Cloud-based photography app", "Built from the ground up", "App Store & Google Play", "E2E encryption"],
  },
  {
    name: "KoaPOKER",
    tag: "Website + Mobile App",
    status: "Work in progress",
    image: "/images/portfolio-koapoker.webp",
    url: "https://koapoker.com.au/",
    items: ["Poker tournament management", "Customer integration", "Player scoreboards", "Live streaming + social"],
  },
];

const addOns: Project[] = [
  {
    name: "Starred Sidebar",
    tag: "Thunderbird Add-On",
    image: "/images/portfolio-thunderbird.webp",
    url: "https://addons.thunderbird.net/en-US/thunderbird/addon/starred-sidebar-by-media/",
    items: ["See all your stars in one place", "Open or unstar in a click", "Find fast", "Private"],
  },
];

const sections: PortfolioSection[] = [
  {
    id: "websites",
    heading: "Websites",
    blurb: "Custom sites, brand overhauls and hosting we manage end-to-end.",
    projects: websites,
  },
  {
    id: "software-and-apps",
    heading: "Software and Apps",
    blurb: "Custom software, web platforms and mobile apps built from the ground up.",
    projects: softwareAndApps,
  },
  {
    id: "add-ons",
    heading: "Add-Ons",
    blurb: "Extra tools, integrations and services that plug into what we build.",
    projects: addOns,
  },
];

export default function PortfolioPage() {
  useSeo({
    title: "Portfolio — Websites, Apps & Hosting | Koastal Kollective",
    description:
      "Recent websites and apps by Koastal Kollective — The Corner Cafe, Australian Poker Series, Direktories, Ladder Finance, Stain Busters, KKamera and more.",
  });

  useStructuredData(
    pageGraph({
      path: "/media/portfolio",
      type: "CollectionPage",
      name: "Portfolio",
      description: "Websites and apps built by Koastal Kollective.",
      breadcrumbName: "Portfolio",
      parent: { name: "Media", path: "/media" },
    }),
    "media-portfolio",
  );

  return (
    <MediaLayout
      eyebrow="Portfolio"
      title={<>Some of our favourite recent work</>}
      intro="A snapshot of websites, apps and brand work we&apos;ve shipped for clients across Australia."
      heroActions={sections
        .filter((s) => s.projects.length > 0)
        .map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-7 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2"
          >
            {s.heading}
          </a>
        ))}
    >
      <section className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-4 space-y-16">
          {sections
            .filter((s) => s.projects.length > 0)
            .map((s) => (
              <div key={s.id} id={s.id}>
                <div className="mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900">{s.heading}</h2>
                  <p className="mt-2 text-gray-600 max-w-2xl">{s.blurb}</p>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {s.projects.map((p) => (
                    <article key={p.name} className="bg-gray-50 border border-gray-100 rounded-lg overflow-hidden flex flex-col">
                      <div className="relative">
                        <img
                          src={p.image}
                          alt={`${p.name} project header`}
                          className="w-full h-40 object-cover"
                        />
                        {p.status && (
                          <span
                            className={`absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide text-white px-3 py-1 rounded-full shadow-sm ${
                              p.status === "New" ? "bg-[#7bb8bd]" : "bg-[#007b7d]"
                            }`}
                          >
                            {p.status}
                          </span>
                        )}
                      </div>
                      <div className="p-6 flex flex-col flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase">{p.tag}</p>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-3">{p.name}</h3>
                        <ul className="space-y-1.5 text-sm text-gray-700 mb-5">
                          {p.items.map((i) => (
                            <li key={i}>• {i}</li>
                          ))}
                        </ul>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-auto inline-flex items-center gap-1.5 text-[#007b7d] font-bold text-sm hover:underline"
                        >
                          Visit live site
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </section>
    </MediaLayout>
  );
}
