import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import { Mail, Phone, MapPin, MessageCircle, Clock, ExternalLink, Monitor, Globe, BookOpen } from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { yearsExperience } from "@/lib/experience";
import { useSeo } from "@/lib/useSeo";

const G1 = "#007b7d";
const G2 = "#7bb8bd";
const G_BORDER = "#006a6c";
const G_DARK_BG = "#004f50";

const operations = [
  {
    slug: "koastal",
    name: "Koastal Kollective",
    tagline: "Computer Repairs, Web Design & Pop Culture",
    description:
      "Your trusted local tech specialist on the Central Coast & Lake Macquarie. From laptop screen replacements and virus removal to MacBook servicing, data recovery and VHS-to-digital conversions — plus website design, hosting, business email and mobile apps built in-house by the same team. Koastal Kollective has been the go-to tech shop since 2011.",
    href: "https://www.koastal.com.au",
    ctaLabel: "Visit Koastal Kollective",
    primary: "#007b7d",
    secondary: "#7bb8bd",
    accent: "#e8f4f5",
    logo: "/images/logo.png",
    icon: <Monitor className="h-8 w-8" />,
    highlights: [
      "Computer & Laptop Repairs",
      "MacBook & Apple Servicing",
      "Virus Removal & Data Recovery",
      "VHS to Digital Conversion",
      "Website Design & Development",
      "Mobile & Web App Development",
      "Domains & Email Hosting",
      "Pop Culture & Collectables",
    ],
  },
  {
    slug: "direktories",
    name: "Direktories",
    tagline: "The Business & Community Directory",
    description:
      "A growing online directory platform connecting local businesses with the communities they serve. Direktories helps customers discover trusted providers across categories — and gives businesses a simple, effective way to get found online.",
    href: "#",
    ctaLabel: "Coming Soon",
    primary: "#800000",
    secondary: "#b05050",
    accent: "#fdf0f0",
    logo: "/images/direktories-logo.webp",
    icon: <BookOpen className="h-8 w-8" />,
    highlights: [
      "Local Business Listings",
      "Community Directory",
      "Central Coast Exclusive",
      "Trusted Provider Profiles",
      "Review Integration",
      "Mobile-Friendly Listings",
      "Free & Premium Plans",
      "Powered by Koastal Kollective",
    ],
    comingSoon: true,
  },
];

export default function AboutPage() {
  // Without this the page inherited whatever title the previously-visited SPA
  // route left in the document head — and, once prerendered, the homepage's.
  useSeo({
    title: "About Koastal Kollective | Central Coast & Lake Macquarie",
    description:
      "Computer repairs, web design and app development, pop culture and collectables, plus Direktories business listings — Central Coast & Lake Macquarie.",
  });

  const reviewsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = reviewsRef.current;
    if (!container) return;
    const existing = container.querySelector('script[src*="cdn.trustindex.io"]');
    if (existing) return;
    const script = document.createElement("script");
    script.src = "https://cdn.trustindex.io/loader.js?cf2cb364235f94440e6622bb352";
    script.defer = true;
    script.async = true;
    container.appendChild(script);
  }, []);

  return (
    <div className="bg-white text-gray-900">

      {/* ─── Hero ─── */}
      <section className="bg-gray-50 py-10 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col items-center gap-6 text-center">
            <img
              src="/images/logo.png"
              alt="Koastal Kollective — Computers, Pop Culture, Web Design & App Development"
              title="Koastal Kollective"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-3xl">
              <p className="font-bold tracking-[0.2em] text-sm uppercase mb-3" style={{ color: G1 }}>
                Proudly Australian · Central Coast &amp; Lake Macquarie, NSW
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-6">
                Two Operations.{" "}
                <em className="not-italic" style={{ color: G1 }}>One Team.</em>
              </h1>
              <div className="flex flex-wrap justify-center gap-3">
                <a
                  href="tel:+61493145179"
                  className="inline-flex items-center gap-2 font-bold px-7 py-3 rounded-full text-sm text-white transition-colors"
                  style={{ backgroundColor: G1 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = G_BORDER; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = G1; }}
                >
                  <Phone className="h-4 w-4" /> 0493 145 179
                </a>
                <a
                  href="mailto:sales@koastal.com.au"
                  className="inline-flex items-center gap-2 font-bold px-7 py-3 rounded-full text-sm transition-colors"
                  style={{ border: `2px solid ${G1}`, color: G1 }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.backgroundColor = G1;
                    el.style.color = "white";
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.backgroundColor = "";
                    el.style.color = G1;
                  }}
                >
                  <Mail className="h-4 w-4" /> sales@koastal.com.au
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Our Operations ─── */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="font-bold tracking-[0.2em] text-xs uppercase mb-3" style={{ color: G1 }}>
              Our Operations
            </p>
            <h2 className="text-2xl md:text-4xl font-bold text-gray-900">
              Each operation stands on its own.{" "}
              <em className="not-italic" style={{ color: G1 }}>All under one roof.</em>
            </h2>
            <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
              Drawing on shared expertise, values, and the same Central Coast team.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {operations.map((op) => (
              <div
                key={op.slug}
                className="op-card flex flex-col rounded-2xl overflow-hidden shadow-md border"
                style={{ borderColor: op.secondary }}
              >
                {/* Card header */}
                <div className="op-header px-6 py-8 text-white flex flex-col items-center text-center" style={{ backgroundColor: op.primary }}>
                  <img
                    src={op.logo}
                    alt={op.name}
                    className="w-28 h-28 object-contain mb-4 drop-shadow-md"
                  />
                  <h3 className="text-xl font-bold mb-1">{op.name}</h3>
                  <p className="text-sm" style={{ color: "rgba(255,255,255,0.80)" }}>
                    {op.tagline}
                  </p>
                </div>

                {/* Card body */}
                <div className="op-body flex flex-col flex-1 px-6 py-6" style={{ backgroundColor: op.accent }}>
                  <p className="text-gray-700 text-sm leading-relaxed mb-5">
                    {op.description}
                  </p>
                  <ul className="space-y-1.5 mb-6 flex-1">
                    {op.highlights.map((h) => (
                      <li key={h} className="flex items-center gap-2 text-sm text-gray-700">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: op.primary }}
                        />
                        {h}
                      </li>
                    ))}
                  </ul>
                  {op.comingSoon ? (
                    <span
                      className="inline-flex items-center justify-center font-bold px-5 py-2.5 rounded-full text-sm cursor-default opacity-60 text-white"
                      style={{ backgroundColor: op.primary }}
                    >
                      Coming Soon
                    </span>
                  ) : (
                    <a
                      href={op.href}
                      className="inline-flex items-center justify-center font-bold px-5 py-2.5 rounded-full text-sm transition-colors text-white"
                      style={{ backgroundColor: op.primary }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.12)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.filter = ""; }}
                    >
                      {op.ctaLabel} →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── About Us / Stats ─── */}
      <section className="py-14 border-b overflow-hidden relative" style={{ backgroundColor: G1, borderColor: G_BORDER }}>
        <div className="absolute top-0 left-0 w-24 h-24 bg-white/5 rotate-45 -translate-x-12 -translate-y-12" />
        <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rotate-45 translate-x-8 -translate-y-8" />
        <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rotate-45 translate-x-12 translate-y-12" />
        <div className="max-w-5xl mx-auto px-4 relative">
          <p className="font-bold tracking-[0.2em] text-xs uppercase mb-3" style={{ color: G2 }}>
            About Us
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 max-w-xl leading-tight">
            Our many years of <em className="not-italic" style={{ color: G2 }}>experience</em> are the
            foundation of our success.
          </h2>
          <div className="flex flex-wrap gap-10">
            {[
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <path d="M16 2v4M8 2v4M3 10h18"/>
                    <path d="M8 14h2M12 14h2M8 17h2M12 17h2"/>
                  </svg>
                ),
                value: `${yearsExperience}`,
                label: "Years Experience",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                    <path d="M18 8l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
                value: "500+",
                label: "Customers Helped",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                    <rect x="2" y="4" width="20" height="14" rx="2"/>
                    <path d="M8 20h8M12 18v2"/>
                    <path d="M9 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
                value: "2",
                label: "Operations, One Team",
              },
            ].map(({ icon, value, label }) => (
              <div key={label} className="flex items-center gap-4">
                <div style={{ color: G2 }}>{icon}</div>
                <div>
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-sm text-white/70">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Team ─── */}
      <section id="team" className="py-14 border-b" style={{ backgroundColor: "#e8f4f5", borderColor: "#c8e0e2" }}>
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="font-bold tracking-[0.2em] text-xs uppercase mb-3" style={{ color: G1 }}>
            Koastal Kollective Team
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10">
            Introducing <em className="not-italic" style={{ color: G1 }}>Your Expert</em> Team
          </h2>
          <div className="flex flex-wrap justify-center gap-16">
            {[
              { name: "Aaron Gregory", image: "/images/aaron-gregory.webp", role: "IT Technician & Web Developer" },
              { name: "Larissa Gregory", image: "/images/larissa-gregory.webp", role: "IT Technician & Web Developer" },
            ].map(({ name, image, role }) => (
              <div key={name} className="flex flex-col items-center gap-3">
                <div className="w-40 h-40 rounded-full overflow-hidden ring-offset-2" style={{ outline: `4px solid ${G1}`, outlineOffset: "2px" }}>
                  <img src={image} alt={name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-base">{name}</p>
                  <p className="text-sm text-gray-500">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section id="testimonials" className="bg-white py-6 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="font-bold tracking-[0.18em] text-xs uppercase mb-3" style={{ color: G1 }}>
            Testimonials
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Our real reviews from clients
          </h2>
          <blockquote className="text-lg md:text-xl italic text-gray-700 max-w-3xl mx-auto leading-relaxed">
            <p>
              &ldquo;We are committed to delivering the highest level of{" "}
              <span className="font-semibold not-italic" style={{ color: G1 }}>service</span>{" "}
              for our clients on the{" "}
              <span className="font-semibold not-italic" style={{ color: G1 }}>Central Coast</span>{" "}
              and{" "}
              <span className="font-semibold not-italic" style={{ color: G1 }}>Lake Macquarie</span>.&rdquo;
            </p>
            <footer className="mt-2 text-base font-bold not-italic text-gray-900">
              – Aaron and the Koastal Kollective Team
            </footer>
          </blockquote>
        </div>
        <div className="mt-6 px-4 scale-[0.92] origin-top" ref={reviewsRef} />
      </section>

      {/* ─── Contact ─── */}
      <section id="contact" className="py-8 border-b" style={{ backgroundColor: G1, borderColor: G_BORDER }}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-6">
            <p className="font-bold tracking-[0.18em] text-xs uppercase mb-2" style={{ color: G2 }}>
              Contact Us
            </p>
            <h2 className="text-4xl md:text-5xl font-bold text-white">Koastal Kollective</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto">
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: G2 }} />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Visit:</p>
                  <a
                    href="https://maps.app.goo.gl/V6MedKW2n1fCybob7"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-white transition-colors hover:opacity-80"
                  >
                    1/64 Vales Road, Mannering Park, NSW, 2259
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: G2 }} />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Email:</p>
                  <a href="mailto:sales@koastal.com.au" className="font-bold text-white hover:opacity-80 transition-colors">
                    sales@koastal.com.au
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: G2 }} />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Call:</p>
                  <a href="tel:+61493145179" className="font-bold text-white hover:opacity-80 transition-colors">
                    0493 145 179
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MessageCircle className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: G2 }} />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">WhatsApp Message:</p>
                  <a
                    href="https://wa.me/61493145179"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-white hover:opacity-80 transition-colors"
                  >
                    Start a Conversation
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ExternalLink className="h-4 w-4 mt-1 flex-shrink-0" style={{ color: G2 }} />
                <div>
                  <p className="font-bold text-white/80 mb-1.5">Scan to &lsquo;Add To Contacts&rsquo;:</p>
                  <a href="https://hover.cards/0b70cf8e" target="_blank" rel="noopener noreferrer">
                    <img src="/images/vcard-aaron.webp" alt="vcard QR Code" className="w-28 h-28 rounded" />
                  </a>
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-start gap-3 mb-4">
                <Clock className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: G2 }} />
                <h3 className="font-bold text-white text-lg">Operating Hours</h3>
              </div>
              <div className="space-y-2 text-sm ml-8">
                {[
                  { day: "Monday", hours: "10am to 2:00pm" },
                  { day: "Tuesday", hours: "10am to 5pm" },
                  { day: "Wednesday", hours: "10am to 5pm" },
                  { day: "Thursday", hours: "10am to 5pm" },
                  { day: "Friday", hours: "10am to 5pm" },
                  { day: "Saturday", hours: "Closed" },
                  { day: "Sunday", hours: "Closed" },
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
        </div>
      </section>

      {/* ─── Visit Us / Map ─── */}
      <section className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center py-6">
          <p className="font-bold tracking-[0.18em] text-xs uppercase mb-2" style={{ color: G1 }}>
            Visit Us
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
            Fully Stocked Repair &amp; Development Centre
          </h2>
        </div>
        <iframe
          title="Koastal Kollective Location – Mannering Park"
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3315.2!2d151.5!3d-33.15!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6b7344c8e5cfffff%3A0x6fba3a4a44f14b7b!2s1%2F64%20Vales%20Rd%2C%20Mannering%20Park%20NSW%202259!5e0!3m2!1sen!2sau!4v1700000000000!5m2!1sen!2sau"
          width="100%"
          height="400"
          style={{ border: 0, display: "block" }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </section>

      {/* ─── Service Areas ─── */}
      <section id="service-areas" className="bg-gray-50 py-10 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
              Koastal Kollective — Serving the Central Coast &amp; Lake Macquarie
            </h2>
            <p className="text-sm mt-2 font-semibold" style={{ color: G1 }}>
              CLICK A SUBURB TO LEARN MORE
            </p>
          </div>
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-6">
            {Object.entries(suburbs).map(([letter, names]) => (
              <div key={letter} className="break-inside-avoid mb-4">
                <h4 className="font-bold text-gray-900 text-sm border-b border-gray-300 pb-1 mb-1.5">
                  {letter}
                </h4>
                <ul className="space-y-0.5">
                  {names.map((name) => (
                    <li key={name}>
                      <Link
                        href={suburbPath(name)}
                        className="text-sm font-semibold transition-colors hover:underline"
                        style={{ color: G1 }}
                      >
                        {name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <SiteFooter />

      {/* ─── WhatsApp Float Button ─── */}
      <a
        href="https://wa.me/61493145179"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 left-6 z-50 whatsapp-float flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white px-4 py-2.5 rounded-full shadow-lg transition-colors group"
        aria-label="WhatsApp"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        <span className="text-sm font-bold">Need Help?</span>
      </a>
    </div>
  );
}
