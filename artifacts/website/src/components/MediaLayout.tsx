import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import SocialLinks from "@/components/SocialLinks";
import { Link, useLocation } from "wouter";
import { Mail, Phone, MapPin, MessageCircle, Clock, ExternalLink, ShoppingCart } from "lucide-react";
import RepairsPromo from "@/components/RepairsPromo";
import { suburbs, suburbPath, toSuburbSlug } from "@/data/suburbs";
import { yearsExperience } from "@/lib/experience";

type Props = {
  eyebrow: string;
  title: React.ReactNode;
  intro: string;
  children: React.ReactNode;
  heroActions?: React.ReactNode;
  /* Where this service is sold in the online shop. Shown first among the hero
     buttons, ahead of call/email. The shop is a separate app under /shop, so
     it is a plain <a> (a full page load), never a wouter <Link>. */
  shopLink?: { href: string; label: string; ariaLabel?: string };
};

export default function MediaLayout({ eyebrow, title, intro, children, heroActions, shopLink }: Props) {
  const reviewsRef = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  const currentSuburbSlug = (() => {
    const m = location.match(/^\/computer-repairs\/([^/]+)/);
    return m ? m[1] : null;
  })();

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
    <div className="media-page min-h-screen bg-white text-gray-900">

      {/* ─── Hero ─── */}
      <section className="bg-gray-50 py-10 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col items-center gap-6 text-center">
            <img
              src="/images/logo.png"
              alt="Koastal Kollective – Web Design, Software and App Development"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-4xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                {eyebrow}
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                {title}
              </h1>
              <p className="text-gray-700 text-base md:text-lg leading-relaxed mb-6 max-w-3xl mx-auto">
                {intro}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {heroActions ?? (
                  <>
                    {shopLink && (
                      <a
                        href={shopLink.href}
                        className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2"
                        aria-label={shopLink.ariaLabel}
                      >
                        <ShoppingCart className="h-4 w-4" /> {shopLink.label}
                      </a>
                    )}
                    <a
                      href="tel:+61493145179"
                      className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2"
                    >
                      <Phone className="h-4 w-4" /> Call 0493 145 179
                    </a>
                    <a
                      href="mailto:sales@koastal.com.au"
                      className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-7 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2"
                    >
                      <Mail className="h-4 w-4" /> sales@koastal.com.au
                    </a>
                  </>
                )}
              </div>
              <p className="text-gray-500 text-sm mt-5">
                By Koastal Kollective · Central Coast &amp; Lake Macquarie, NSW
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Page content ─── */}
      <main>{children}</main>

      <RepairsPromo />

      {/* ─── About / Stats ─── */}
      <section className="bg-[#007b7d] py-14 border-b border-[#005f61] overflow-hidden relative">
        <div className="absolute top-0 left-0 w-24 h-24 bg-white/5 rotate-45 -translate-x-12 -translate-y-12" />
        <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rotate-45 translate-x-8 -translate-y-8" />
        <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rotate-45 translate-x-12 translate-y-12" />
        <div className="max-w-5xl mx-auto px-4 relative">
          <p className="text-[#7bb8bd] font-bold tracking-[0.2em] text-xs uppercase mb-3">About Us</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 max-w-xl leading-tight">
            Our many years of <em className="text-[#7bb8bd] not-italic">experience</em> are the foundation of our success.
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
                value: `${yearsExperience}`, label: "Years Experience",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                ),
                value: "50+", label: "Clients Served",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                    <rect x="2" y="4" width="20" height="14" rx="2"/>
                    <path d="M8 20h8M12 18v2"/>
                  </svg>
                ),
                value: "100+", label: "Projects Delivered",
              },
            ].map(({ icon, value, label }) => (
              <div key={label} className="flex items-center gap-4">
                <div className="text-[#7bb8bd]">{icon}</div>
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
      <section id="team" className="bg-[#e8f4f5] py-14 border-b border-[#c8e0e2]">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3">Koastal Kollective Team</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10">
            Introducing <em className="text-[#007b7d] not-italic">Your Expert</em> Web Developers
          </h2>
          <div className="flex flex-wrap justify-center gap-16">
            {[
              { name: "Aaron G.", image: "/images/aaron-gregory.webp" },
              { name: "Larissa G.", image: "/images/larissa-gregory.webp" },
            ].map(({ name, image }) => (
              <div key={name} className="flex flex-col items-center gap-3">
                <div className="w-40 h-40 rounded-full overflow-hidden ring-4 ring-[#007b7d] ring-offset-2">
                  <img src={image} alt={name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-base">{name}</p>
                  <p className="text-sm text-gray-500">Web Developer</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section id="testimonials" className="bg-white py-6 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3">Testimonials</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Our real reviews from clients</h2>
          <blockquote className="text-lg md:text-xl italic text-gray-700 max-w-3xl mx-auto leading-relaxed">
            <p>
              &ldquo;We are committed to delivering the highest level of{" "}
              <span className="text-[#007b7d] font-semibold not-italic">service</span>{" "}
              for our clients on the{" "}
              <span className="text-[#007b7d] font-semibold not-italic">Central Coast</span>{" "}
              and{" "}
              <span className="text-[#007b7d] font-semibold not-italic">Lake Macquarie</span>.&rdquo;
            </p>
            <footer className="mt-2 text-base font-bold not-italic text-gray-900">
              – Aaron and the Koastal Kollective Team
            </footer>
          </blockquote>
        </div>
        <div className="mt-6 px-4 scale-[0.92] origin-top" ref={reviewsRef} />
      </section>

      {/* ─── Contact ─── */}
      <section id="contact" className="bg-[#007b7d] py-8 border-b border-[#005f61]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-6">
            <p className="text-[#7bb8bd] font-bold tracking-[0.18em] text-xs uppercase mb-2">Contact Us</p>
            <h2 className="text-4xl md:text-5xl font-bold text-white">Koastal Kollective</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto">
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Visit:</p>
                  <a
                    href="https://maps.app.goo.gl/V6MedKW2n1fCybob7"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-white hover:text-[#7bb8bd] transition-colors"
                  >
                    Shop 1/64 Vales Road, Mannering Park, NSW, 2259
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Email:</p>
                  <a
                    href="mailto:sales@koastal.com.au"
                    className="font-bold text-white hover:text-[#7bb8bd] transition-colors"
                  >
                    sales@koastal.com.au
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Call:</p>
                  <a
                    href="tel:+61493145179"
                    className="font-bold text-white hover:text-[#7bb8bd] transition-colors"
                  >
                    0493 145 179
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MessageCircle className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">WhatsApp Message:</p>
                  <a
                    href="https://wa.me/61493145179"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-white hover:text-[#7bb8bd] transition-colors"
                  >
                    Start a Conversation
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ExternalLink className="h-4 w-4 text-[#7bb8bd] mt-1 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-1.5">Scan to &lsquo;Add To Contacts&rsquo;:</p>
                  <a href="https://hover.cards/0b70cf8e" target="_blank" rel="noopener noreferrer">
                    <img src="/images/vcard-aaron.webp" alt="vcard-aaron QR Code" className="w-28 h-28 rounded" />
                  </a>
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
                  { day: "Monday", hours: "10am to 5pm" },
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
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">
            Visit Us
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
            Fully Stocked Web &amp; App Development Centre
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
              We Build &amp; Host for These Areas
            </h2>
            <p className="text-[#007b7d] text-sm mt-2 font-semibold">
              CLICK A SUBURB TO LEARN MORE
            </p>
            <p className="text-gray-700 text-sm mt-2 max-w-2xl mx-auto font-medium leading-relaxed">
              <span className="text-[#007b7d] font-bold">
                We proudly serve clients across all of Australia
              </span>{" "}
              — not just the Central Coast and Lake Macquarie. Whether you are in Sydney, Melbourne, Perth or anywhere in between, we design, build and support websites, apps and email hosting remotely and face-to-face.
            </p>
          </div>
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-6">
            {Object.entries(suburbs).map(([letter, names]) => (
              <div key={letter} className="break-inside-avoid mb-4">
                <h4 className="font-bold text-gray-900 text-sm border-b border-gray-300 pb-1 mb-1.5">
                  {letter}
                </h4>
                <ul className="space-y-0.5">
                  {names.map((name) => {
                    const isCurrent = toSuburbSlug(name) === currentSuburbSlug;
                    return (
                      <li key={name}>
                        <Link
                          href={suburbPath(name)}
                          className={`text-sm hover:underline font-semibold transition-colors ${
                            isCurrent
                              ? "text-gray-900 underline"
                              : "text-[#007b7d] hover:text-[#005f61]"
                          }`}
                        >
                          {name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <SiteFooter />
    </div>
  );
}
