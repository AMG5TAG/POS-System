import MediaLayout from "@/components/MediaLayout";
import { useSeo } from "@/lib/useSeo";
import { CheckCircle2, Smartphone, Gauge, Search, Wand2, Layers } from "lucide-react";

const features = [
  { icon: Wand2, title: "Pixel-perfect design", body: "Custom layouts that match your brand, not a recycled theme." },
  { icon: Smartphone, title: "Mobile & tablet first", body: "Designed for the device most of your customers actually use." },
  { icon: Gauge, title: "Lightning fast", body: "Tuned for Core Web Vitals so Google ranks you higher." },
  { icon: Search, title: "SEO built in", body: "Clean markup, structured data and sitemaps from day one." },
  { icon: Layers, title: "Easy to update", body: "Edit your content yourself — no developer required for daily changes." },
  { icon: CheckCircle2, title: "Unlimited revisions", body: "We keep iterating until you love the result before launch." },
];

const planFeatures = [
  "Mobile-Responsive Design",
  "Blazing-Fast Loading Speeds",
  "Custom, Modern Layouts",
  "User-Friendly Content Management",
  "Free SSL Certificate Included",
  "99.9% Uptime Guarantee",
  "Automated Daily Backups",
  "Advanced Hack & Malware Protection",
  "SEO-Ready Foundation",
  "Domain & Professional Email Setup",
  "Lead & Call-to-Action Optimization",
  "100% Local, Direct Support",
];

const plans = [
  {
    name: "Bronze",
    price: "$750",
    establishment: "No Establishment Fee",
    renews: "$750/year",
    pages: "Single Page Site",
    emails: "1x Email (@your-business.com.au)",
    seo: "Basic SEO",
    featured: false,
  },
  {
    name: "Silver",
    price: "$1,495",
    establishment: "$750 Establishment Fee",
    renews: "$750/year",
    pages: "1-5 Page Site",
    emails: "1x Email (@your-business.com.au)",
    seo: "Basic SEO",
    featured: false,
  },
  {
    name: "Gold",
    price: "$2,950",
    establishment: "$750 Establishment Fee",
    renews: "$950/year",
    pages: "5-10 Page Site",
    emails: "5x Email (@your-business.com.au)",
    seo: "Standard SEO",
    featured: true,
  },
  {
    name: "Diamond",
    price: "$3,950",
    establishment: "$750 Establishment Fee",
    renews: "$950/year",
    pages: "Unlimited Page Site",
    emails: "10x Email (@your-business.com.au)",
    seo: "Best SEO",
    featured: false,
  },
];

export default function WebsiteDesignPage() {
  useSeo({
    title: "Website Design Central Coast | Koastal Kollective",
    description:
      "Affordable, conversion-focused website design from Koastal Kollective. Mobile-first, lightning fast, SEO built in. Packages from Bronze to Diamond.",
  });

  return (
    <MediaLayout
      eyebrow="Web Design"
      title={<>Websites that look great and actually convert</>}
      intro="We design and build mobile-first websites that load fast, rank well and turn visitors into customers."
    >
      <section className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            What you get
          </p>
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-10">
            Every site we build includes
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
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Pricing
          </p>
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-10">
            Transparent packages with no hidden fees
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`rounded-xl p-6 flex flex-col h-full ${
                  p.featured
                    ? "bg-[#007b7d] text-white shadow-xl ring-4 ring-[#007b7d]/30"
                    : "bg-white border border-gray-200 text-gray-900"
                }`}
              >
                <p
                  className={`text-xs font-bold tracking-[0.18em] uppercase mb-2 ${
                    p.featured ? "text-[#e8f4f5]" : "text-[#007b7d]"
                  }`}
                >
                  {p.featured ? "Most Popular" : "Package"}
                </p>
                <h3 className="text-xl font-bold mb-1">{p.name}</h3>
                <p
                  className={`text-3xl font-extrabold mb-1 ${
                    p.featured ? "text-white" : "text-[#007b7d]"
                  }`}
                >
                  {p.price}
                </p>
                <p
                  className={`text-xs font-semibold mb-2 ${
                    p.featured ? "text-white/80" : "text-gray-500"
                  }`}
                >
                  {p.establishment}
                </p>
                <p
                  className={`text-xs mb-4 ${
                    p.featured ? "text-white/70" : "text-gray-500"
                  }`}
                >
                  Renews at {p.renews}
                </p>
                <div className="space-y-1.5 text-sm mb-4">
                  <p className={p.featured ? "text-white/90" : "text-gray-700"}>
                    <strong>{p.pages}</strong>
                  </p>
                  <p className={p.featured ? "text-white/90" : "text-gray-700"}>
                    {p.emails}
                  </p>
                  <p className={p.featured ? "text-white/90" : "text-gray-700"}>
                    {p.seo}
                  </p>
                </div>
                <ul className="space-y-1.5 mt-auto">
                  {planFeatures.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <CheckCircle2
                        className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${
                          p.featured ? "text-[#e8f4f5]" : "text-[#007b7d]"
                        }`}
                      />
                      <span
                        className={
                          p.featured ? "text-white/90" : "text-gray-700"
                        }
                      >
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MediaLayout>
  );
}
