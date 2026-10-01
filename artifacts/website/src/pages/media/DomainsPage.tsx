import MediaLayout from "@/components/MediaLayout";
import { useSeo } from "@/lib/useSeo";
import { Globe2, Shield, Server, RefreshCw, Lock, Cloud, CheckCircle2, ShoppingCart } from "lucide-react";

const features = [
  { icon: Globe2, title: "Any TLD", body: ".com.au, .com, .net.au, .org, .io and most country and niche extensions." },
  { icon: Server, title: "AU & global hosting", body: "Sydney and Melbourne data centres with a global CDN for fast loads everywhere." },
  { icon: Shield, title: "Free SSL + DDoS protection", body: "Every domain we manage ships with HTTPS and traffic-flood protection out of the box." },
  { icon: RefreshCw, title: "Daily backups", body: "Off-site backups taken every night so we can roll back any mistake quickly." },
  { icon: Lock, title: "DNS managed for you", body: "We handle records, redirects and email setup — you never need to log into a registrar." },
  { icon: Cloud, title: "99.99% uptime SLA", body: "Monitored 24/7 with automatic failover to keep your site online." },
];

const planFeatures = [
  "Personalised Domain",
  "your-business.com.au",
  "Brand Authority and Professionalism",
  "Improved Search Engine Visibility",
  "Enhanced Email Credibility",
  "Increased Customer Trust",
  "Portability and Ownership Independence",
  "Protection of Brand Identity",
  "Strategic SEO Advantage",
];

/* Domain names are sold from the "Domain Hosting" category of the online shop
   (koastal.com.au/shop) — the same id in dev and production. It links to the
   category rather than a product because none has been added to it yet. The
   shop is a separate app, so these links are plain <a>s (a full page load). */
const DOMAIN_CATEGORY_ID = 1000071;
const domainShopUrl = `/shop/products?category=${DOMAIN_CATEGORY_ID}`;

const plan = {
  name: "Domain Hosting",
  price: "$30/year",
};

export default function DomainsPage() {
  useSeo({
    title: "Domains & Web Hosting Australia | Koastal Kollective",
    description:
      "Domain registration and managed hosting from Koastal Kollective. Sydney and Melbourne data centres, free SSL, daily backups, DDoS protection and a 99.99% uptime SLA.",
  });

  return (
    <MediaLayout
      eyebrow="Domains & Hosting"
      title={<>Your domain, sorted — and hosted properly</>}
      intro="Register, transfer and manage your domain with a team that also runs the hosting. One invoice, one phone number, no finger-pointing."
      shopLink={{
        href: domainShopUrl,
        label: "Shop domain names",
        ariaLabel: "Shop domain names in our online shop",
      }}
    >
      <section className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Included
          </p>
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-10">
            What you get with every domain
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="bg-gray-50 border border-gray-100 rounded-lg p-5">
                <f.icon className="h-7 w-7 text-[#007b7d] mb-3" />
                <h3 className="font-bold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 bg-gray-50 border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Pricing
          </p>
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-10">
            Domain Hosting
          </h2>
          <div className="max-w-md mx-auto">
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-xs font-bold tracking-[0.18em] uppercase text-[#007b7d] mb-2">
                Plan
              </p>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
              <p className="text-4xl font-extrabold text-[#007b7d] mb-6">{plan.price}</p>
              <ul className="space-y-2 text-left">
                {planFeatures.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="h-4 w-4 text-[#007b7d] mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={domainShopUrl}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#007b7d] px-4 py-3 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#004f51]"
                aria-label="Shop domain names in our online shop"
              >
                <ShoppingCart className="h-4 w-4" />
                Shop domain names
              </a>
            </div>
          </div>
          <p className="text-center text-gray-500 text-sm mt-6">
            Already have a domain elsewhere? We&apos;ll transfer it across for free.
          </p>
        </div>
      </section>
    </MediaLayout>
  );
}
