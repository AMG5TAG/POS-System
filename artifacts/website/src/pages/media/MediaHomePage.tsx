import { Link } from "wouter";
import { Globe, Server, Smartphone, Megaphone, Search, Code2 } from "lucide-react";
import MediaLayout from "@/components/MediaLayout";
import { useSeo } from "@/lib/useSeo";
import { pageGraph, useStructuredData } from "@/lib/structuredData";

const services = [
  {
    icon: Globe,
    title: "Affordable Web Design",
    body: "Pixel-perfect, conversion-focused websites built mobile-first and tuned for speed. Unlimited revisions until launch day.",
    href: "/media/website-design",
  },
  {
    icon: Server,
    title: "Australian & Offshore Hosting",
    body: "Sydney and Melbourne data centres backed by a global CDN. 99.99% uptime SLA, free SSL, daily backups and DDoS protection included.",
    href: "/media/domains",
  },
  {
    icon: Smartphone,
    title: "iOS & Android Apps",
    body: "Native and cross-platform apps deployed to the App Store and Google Play, with push notifications, analytics and ongoing updates.",
    href: "/media/apps",
  },
  {
    icon: Code2,
    title: "Web Applications",
    body: "Custom dashboards, SaaS platforms, secure auth and payments, realtime data and scalable cloud architecture.",
    href: "/media/apps",
  },
  {
    icon: Megaphone,
    title: "Social Media Setup",
    body: "Profile setup, branding, content calendars, scheduling, community management and clear performance reporting.",
    href: "/media",
  },
  {
    icon: Search,
    title: "SEO that Ranks",
    body: "Keyword and competitor research, technical SEO, Core Web Vitals, and a content strategy that brings the right traffic.",
    href: "/media",
  },
];

export default function MediaHomePage() {
  useSeo({
    title: "Websites, Apps, Hosting & SEO | Koastal Kollective",
    description:
      "Websites, mobile apps, hosting and SEO for Australian businesses, built locally by Koastal Kollective on the Central Coast & Lake Macquarie.",
  });

  useStructuredData(
    pageGraph({
      path: "/media",
      type: "CollectionPage",
      name: "Websites, Apps, Hosting & SEO",
      description: "Website design, app development, domains, hosting and business email from Koastal Kollective.",
      breadcrumbName: "Media",
    }),
    "media",
  );

  return (
    <MediaLayout
      eyebrow="Australian Owned · Global Reach"
      title={
        <>
          Beautiful sites. Powerful software.{" "}
          <span className="text-[#007b7d]">Real results.</span>
        </>
      }
      intro="Koastal Kollective builds high-converting websites, lightning-fast hosting, mobile apps and SEO campaigns that put your business on page one of Google and Bing."
    >
      <section className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            What we do
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-3">
            Everything your business needs to win online
          </h2>
          <p className="text-gray-600 text-center max-w-2xl mx-auto mb-10">
            From the first pixel to the last server log — we own the full stack so
            you only have one team to call.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {services.map((s) => (
              <Link
                key={s.title}
                href={s.href}
                className="block bg-gray-50 hover:bg-[#e8f4f5] border border-gray-100 hover:border-[#007b7d]/40 rounded-lg p-6 transition-colors"
              >
                <s.icon className="h-8 w-8 text-[#007b7d] mb-3" />
                <h3 className="font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{s.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 bg-gray-50 border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4 grid md:grid-cols-4 gap-6 text-center">
          {[
            { v: "14 days", l: "Typical launch time" },
            { v: "99.99%", l: "Hosting uptime SLA" },
            { v: "AU + Global", l: "Data centre coverage" },
            { v: "24 hrs", l: "Quote turnaround" },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-3xl font-extrabold text-[#007b7d]">{s.v}</p>
              <p className="text-sm text-gray-500 mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      </section>
    </MediaLayout>
  );
}
