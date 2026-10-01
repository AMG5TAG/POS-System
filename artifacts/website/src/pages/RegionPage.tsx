import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import { Link, useRoute } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, Car, Wrench, ShieldCheck,
  HardDrive, Laptop, Monitor, Apple, CheckCircle2,
} from "lucide-react";
import NotFound from "@/pages/not-found";
import { findRegionBySlug, regionPath, type Region } from "@/data/regions";
import { suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { LOCAL_BUSINESS, useStructuredData } from "@/lib/structuredData";
import { yearsExperience } from "@/lib/experience";

const SITE = "https://koastal.com.au";

const repairTypes = [
  { icon: Laptop, title: "Laptop repairs", body: "Cracked screens, dead keyboards, swollen batteries, snapped hinges, charging ports and liquid damage across HP, Dell, Lenovo, ASUS, Acer and Microsoft Surface." },
  { icon: Monitor, title: "Desktop PC repairs", body: "Won't-turn-on diagnostics, power supplies, motherboards, graphics faults, cooling overhauls and upgrades for gaming, office and workstation machines." },
  { icon: Apple, title: "Mac servicing", body: "MacBook Pro and Air servicing, iMac diagnostics, SSD and RAM upgrades on supported models, and macOS reinstalls. SolvUp-authorised for JB Hi-Fi and Officeworks." },
  { icon: ShieldCheck, title: "Virus & malware removal", body: "Pop-ups, browser hijacks and suspected ransomware cleaned out by hand, not just a quick scan. Protection installed afterwards at no extra charge." },
  { icon: HardDrive, title: "Data recovery", body: "Software-level recovery in our workshop on a no-recovery-no-fee basis. Clean-room cases are quoted before anything is sent to our recovery partner." },
  { icon: Wrench, title: "Upgrades & tune-ups", body: "SSD upgrades with full data migration, RAM increases, thermal paste and fan servicing — the cheapest way to make a slow machine usable again." },
];

function regionGraph(region: Region) {
  const url = `${SITE}${regionPath(region)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      LOCAL_BUSINESS,
      {
        "@type": "Service",
        "@id": `${url}#service`,
        serviceType: "Computer repair, laptop repair, Mac repair, data recovery",
        name: region.headline,
        description: region.description,
        provider: { "@id": `${SITE}/#business` },
        areaServed: {
          "@type": "AdministrativeArea",
          name: `${region.name}, NSW`,
          containsPlace: region.groups
            .flatMap((g) => g.suburbs)
            .map((s) => ({ "@type": "Place", name: s })),
        },
        offers: {
          "@type": "Offer",
          priceCurrency: "AUD",
          description: "Free diagnostic. Fixed-price quote before work starts. No fix, no fee.",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: region.faqs.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Computer Repairs", item: `${SITE}/computer-repairs` },
          { "@type": "ListItem", position: 3, name: region.headline, item: url },
        ],
      },
    ],
  };
}

export default function RegionPage() {
  const [, params] = useRoute<{ region: string }>("/computer-repairs/:region");
  const region = findRegionBySlug(params?.region ?? "");
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: region ? region.title : "Page Not Found | Koastal Kollective",
    description: region
      ? region.description
      : "That page doesn't exist. Head back to Koastal Kollective for computer repairs across the Central Coast & Lake Macquarie.",
    ogImage: `${SITE}/api/share-image.png`,
    noindex: !region,
  });

  useStructuredData(region ? regionGraph(region) : null, "region");

  useEffect(() => {
    const container = reviewsRef.current;
    if (!container || container.querySelector('script[src*="cdn.trustindex.io"]')) return;
    const script = document.createElement("script");
    script.src = "https://cdn.trustindex.io/loader.js?cf2cb364235f94440e6622bb352";
    script.defer = true;
    script.async = true;
    container.appendChild(script);
  }, [region]);

  if (!region) return <NotFound />;

  const other = region.slug === "central-coast" ? "lake-macquarie" : "central-coast";
  const otherName = region.slug === "central-coast" ? "Lake Macquarie" : "the Central Coast";
  const suburbCount = region.groups.reduce((n, g) => n + g.suburbs.length, 0);

  return (
    <main>
      {/* ─── Hero ─── */}
      <section className="bg-gray-50 py-12 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <nav aria-label="Breadcrumb" className="text-sm text-gray-500 mb-4">
            <Link href="/" className="hover:text-[#007b7d]">Home</Link>
            <span className="mx-2">/</span>
            <Link href="/computer-repairs" className="hover:text-[#007b7d]">Computer Repairs</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-900 font-semibold">{region.name}</span>
          </nav>
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3">
            {region.name}, NSW
          </p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-5">
            {region.headline}
          </h1>
          {region.intro.map((p) => (
            <p key={p.slice(0, 40)} className="text-gray-700 leading-relaxed mb-4 max-w-3xl">{p}</p>
          ))}
          <div className="flex flex-wrap gap-3 mt-6">
            <a href="tel:+61493145179" className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-6 py-3 rounded-full transition-colors">
              <Phone className="h-4 w-4" /> 0493 145 179
            </a>
            <a href="https://wa.me/61493145179" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold px-6 py-3 rounded-full transition-colors">
              <MessageCircle className="h-4 w-4" /> WhatsApp us
            </a>
          </div>
        </div>
      </section>

      {/* ─── Where we are relative to this region ─── */}
      <section className="bg-white py-12 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            How far are we from you?
          </h2>
          <p className="text-gray-700 leading-relaxed mb-6 max-w-3xl">{region.proximity}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {region.travel.map(({ place, time }) => (
              <div key={place} className="flex items-start gap-3 bg-[#f5f9fa] border border-[#c8e0e2] rounded-lg p-4">
                <Car className="h-5 w-5 text-[#007b7d] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-gray-900 text-sm">{place}</p>
                  <p className="text-sm text-gray-600">{time}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Drive times are approximate and assume normal traffic from our Mannering Park workshop.
          </p>
        </div>
      </section>

      {/* ─── Three ways to get it fixed ─── */}
      <section className="bg-gray-50 py-12 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            Three ways to get it fixed in {region.name}
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {region.coverage.map(({ heading, body }) => (
              <div key={heading} className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-2">{heading}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── What we repair ─── */}
      <section className="bg-white py-12 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            What we repair for {region.name} customers
          </h2>
          <p className="text-gray-600 mb-8 max-w-2xl">
            {yearsExperience} years of it, from a fully stocked workshop. Free diagnostic on every job.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {repairTypes.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-[#f5f9fa] border border-[#c8e0e2] rounded-xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[#007b7d] text-white flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900">{title}</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-8 text-sm">
            <Link href="/computer-repairs" className="text-[#007b7d] font-bold hover:underline">All computer repairs →</Link>
            <Link href="/data-recovery" className="text-[#007b7d] font-bold hover:underline">Data recovery →</Link>
            <Link href="/macbook-repair" className="text-[#007b7d] font-bold hover:underline">MacBook &amp; Mac repairs →</Link>
            <Link href="/virus-removal" className="text-[#007b7d] font-bold hover:underline">Virus removal →</Link>
            <Link href="/laptop-screen-repairs" className="text-[#007b7d] font-bold hover:underline">Laptop screen repairs →</Link>
            <Link href="/business-it-support" className="text-[#007b7d] font-bold hover:underline">Business IT support →</Link>
          </div>
        </div>
      </section>

      {/* ─── Trust ─── */}
      <section className="bg-[#007b7d] py-12 border-b border-[#006a6c]">
        <div className="max-w-5xl mx-auto px-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { t: "No fix, no fee", b: "Can't fix it? You don't pay the labour." },
            { t: "Free diagnostic", b: "No inspection fee, no call-out fee in our area." },
            { t: "Family-run since 2011", b: "The person answering the phone fixes your machine." },
            { t: "10% pensioner discount", b: "Every service, every time." },
          ].map(({ t, b }) => (
            <div key={t} className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold text-white text-sm">{t}</p>
                <p className="text-sm text-white/70 leading-relaxed">{b}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Suburbs ─── */}
      <section className="bg-white py-12 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            {suburbCount} {region.name} suburbs we cover
          </h2>
          <p className="text-gray-600 mb-8 max-w-2xl">
            Grouped the way locals actually think about the region. Click a suburb for details on
            repairs there.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {region.groups.map((group) => (
              <div key={group.label}>
                <h3 className="font-bold text-gray-900 text-sm border-b border-gray-300 pb-1.5 mb-2">
                  {group.label}
                </h3>
                <ul className="space-y-1">
                  {group.suburbs.map((name) => (
                    <li key={name}>
                      <Link href={suburbPath(name)} className="text-sm text-[#007b7d] hover:text-[#005f61] hover:underline font-semibold transition-colors">
                        {name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-600 mt-8">
            Based in {otherName} instead?{" "}
            <Link href={`/computer-repairs/${other}`} className="text-[#007b7d] font-bold hover:underline">
              See our {otherName === "the Central Coast" ? "Central Coast" : otherName} page →
            </Link>
          </p>
        </div>
      </section>

      {/* ─── FAQs ─── */}
      <section className="bg-gray-50 py-12 border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            {region.name} questions we get asked
          </h2>
          <div className="grid gap-4">
            {region.faqs.map(({ q, a }) => (
              <div key={q} className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-bold text-gray-900 mb-1.5">{q}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Reviews ─── */}
      <section className="bg-white py-10 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">What our customers say</h2>
        </div>
        <div className="mt-4 px-4 scale-[0.92] origin-top" ref={reviewsRef} />
      </section>

      {/* ─── Contact ─── */}
      <section id="contact" className="bg-[#007b7d] py-12">
        <div className="max-w-5xl mx-auto px-4 grid md:grid-cols-2 gap-10">
          <div className="space-y-5">
            <h2 className="text-2xl md:text-3xl font-bold text-white">
              Book a {region.name} repair
            </h2>
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold text-white/80 mb-0.5">Workshop:</p>
                <a href="https://maps.app.goo.gl/V6MedKW2n1fCybob7" target="_blank" rel="noopener noreferrer" className="font-bold text-white hover:text-[#7bb8bd] transition-colors">
                  Shop 1/64 Vales Road, Mannering Park NSW 2259
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold text-white/80 mb-0.5">Call:</p>
                <a href="tel:+61493145179" className="font-bold text-white hover:text-[#7bb8bd] transition-colors">0493 145 179</a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold text-white/80 mb-0.5">Email:</p>
                <a href="mailto:sales@koastal.com.au" className="font-bold text-white hover:text-[#7bb8bd] transition-colors">sales@koastal.com.au</a>
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-start gap-3 mb-4">
              <Clock className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
              <h3 className="font-bold text-white text-lg">Operating Hours</h3>
            </div>
            <div className="space-y-2 text-sm ml-8">
              {[
                { day: "Monday", hours: "10am to 2:00pm" },
                { day: "Tuesday to Friday", hours: "10am to 5pm" },
                { day: "Saturday & Sunday", hours: "Closed" },
                { day: "Public Holidays", hours: "Closed" },
              ].map(({ day, hours }) => (
                <div key={day} className="flex justify-between max-w-xs">
                  <span className="text-white/70">{day}:</span>
                  <span className={`font-bold ${hours === "Closed" ? "text-white/50" : "text-white"}`}>{hours}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
