import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  Monitor, Zap, Shield, CheckCircle2, Truck, Wrench, Star,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const symptoms = [
  "Cracked or shattered screen",
  "Black or blank display with power on",
  "Lines, streaks or dead pixels",
  "Flickering or dim backlight",
  "Touch screen not responding",
  "Screen with water or pressure damage",
  "Loose or damaged hinges affecting the display",
  "Image discolouration or bleed",
];

const benefits = [
  {
    icon: Wrench,
    title: "All Brands & Models",
    body: "We repair laptop screens for Dell, HP, Lenovo, ASUS, Acer, Samsung, Toshiba, MSI and more. MacBook screen repairs are also available — just ask.",
  },
  {
    icon: Monitor,
    title: "HD, FHD & 4K Panels",
    body: "Whether your laptop has a standard HD panel or a high-res IPS or OLED display, we source the correct replacement screen for your exact model.",
  },
  {
    icon: Zap,
    title: "Fast Same-Week Turnaround",
    body: "Most laptop screen replacements are completed within 1–3 business days. We keep common panels in stock so you're not waiting weeks for a part to arrive.",
  },
  {
    icon: Shield,
    title: "24-Month Parts Warranty",
    body: "Every screen we install is covered by a 24-month parts warranty. If the replacement panel develops a fault, we'll fix it at no charge.",
  },
  {
    icon: Truck,
    title: "Mail-In Repairs Australia Wide",
    body: "Not on the Central Coast? No problem. We accept mail-in repairs from anywhere in Australia. Simply package your laptop safely, send it to our Mannering Park workshop and we'll repair and return it fast.",
  },
  {
    icon: Star,
    title: "No-Fix No-Fee Guarantee",
    body: "If we can't replace your screen successfully, you pay nothing. We assess every device before ordering parts and only proceed when we're confident in the repair.",
  },
];

const faqs = [
  {
    q: "How much does a laptop screen repair cost?",
    a: "The cost varies depending on your laptop brand, model and screen type. Common laptop screens typically range from $150–$350 all-in including labour. Contact us with your laptop model for an accurate quote.",
  },
  {
    q: "Is it worth repairing a cracked laptop screen?",
    a: "In most cases yes — especially for laptops that are otherwise working well. A screen replacement is far cheaper than buying a new laptop and your data stays exactly where it is.",
  },
  {
    q: "Do you repair MacBook screens?",
    a: "Yes. We repair MacBook Air and MacBook Pro screens across various generations. MacBook displays are more complex than standard laptops so please contact us first to confirm availability for your specific model.",
  },
  {
    q: "How do I send my laptop for a mail-in repair?",
    a: "Contact us first for a quote. Once confirmed, pack your laptop securely in a sturdy box with bubble wrap and send it via tracked post to Shop 1/64 Vales Road, Mannering Park, NSW, 2259. We handle the rest.",
  },
  {
    q: "Will my data be safe during the repair?",
    a: "Yes. A screen replacement does not require us to access your hard drive or operating system. Your files, photos and documents are untouched during the repair process.",
  },
  {
    q: "Do you offer a warranty on screen repairs?",
    a: "Yes — all replacement screens are covered by our 24-month parts warranty. If the panel develops a fault through normal use within that period, we'll replace it at no charge.",
  },
];

const guarantees = [
  "Free Diagnostics",
  "No-Fix No-Fee Guarantee",
  "24-Month Parts Warranty",
  "10% Pension Discount",
];

export default function LaptopScreenRepairPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Laptop Screen Repairs Central Coast | Mail-In AU",
    description: "Same-week laptop screen replacements on the Central Coast & mail-in Australia-wide. Genuine panels, fixed-price quotes, no-fix no-fee on every job.",
  });
  useStructuredData(
    serviceGraph({
      path: "/laptop-screen-repairs",
      serviceType: "Laptop Screen Replacement",
      name: "Laptop Screen Repairs Central Coast & Mail-In Australia-Wide",
      description: "Genuine laptop screen replacements with same-week turnaround on the Central Coast and a mail-in option Australia-wide. Fixed-price quotes, no-fix no-fee.",
      breadcrumbName: "Laptop Screen Repairs",
      offers: ["Cracked Laptop Screen Replacement", "Touchscreen Laptop Repairs", "Mail-In Laptop Screen Service", "Hinge & Bezel Repairs"],
    }),
    "laptop-screen-repairs",
  );

  useEffect(() => {
    const container = reviewsRef.current;
    if (!container) return;
    const existingScript = container.querySelector('script[src*="cdn.trustindex.io"]');
    if (existingScript) return;
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
              alt="Koastal Kollective Laptop Screen Repairs Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-3xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Laptop Screen Repairs · Central Coast &amp; Australia Wide
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight">
                Cracked or Broken Laptop Screen?<br />
                <em className="text-[#007b7d] not-italic">We Fix It Fast.</em>
              </h1>
              <p className="mt-4 text-gray-600 text-base md:text-lg leading-relaxed">
                Professional laptop screen replacements on the Central Coast and Lake Macquarie — with mail-in repairs available Australia wide. Fast turnaround, 24-month warranty, no-fix no-fee.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a
                  href="#contact"
                  className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-6 py-3 rounded-full text-sm transition-colors"
                >
                  Book a Repair
                </a>
                <a
                  href="tel:+61493145179"
                  className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-6 py-3 rounded-full text-sm transition-colors"
                >
                  Call 0493 145 179
                </a>
                <a
                  href="https://wa.me/61493145179"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold px-6 py-3 rounded-full text-sm transition-colors"
                >
                  WhatsApp Us
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Hero image ─── */}
      <section className="border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <img
            src="/images/laptop-screen-repair.webp"
            alt="Laptop screen repair in progress at Koastal Kollective workshop"
            className="w-full max-h-[420px] object-cover rounded-xl shadow-md"
          />
        </div>
      </section>

      {/* ─── Intro ─── */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 space-y-10 text-base md:text-lg text-gray-700 leading-relaxed text-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Don't Replace Your Laptop — Repair It
            </h2>
            <p>
              A cracked or damaged screen can make your laptop completely unusable, but it doesn't mean you need a new one. In most cases a screen replacement costs a fraction of what a new laptop would set you back — and your data, software and settings stay exactly as they are. At Koastal Kollective we replace laptop screens for all major brands across the Central Coast and Lake Macquarie, with fast turnaround times and genuine quality panels.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Mail-In Repairs — Anywhere in Australia
            </h2>
            <p>
              Can't get to Mannering Park? No problem. We offer a convenient mail-in repair service for customers anywhere in Australia. Contact us for a quote, ship your laptop to our workshop, and we'll repair and return it quickly — fully tested and covered by our 24-month warranty. It's the same quality repair, just delivered to your door.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Trusted Local Technicians Since 2011
            </h2>
            <p>
              Aaron G. and Larissa G. have been repairing laptops on the Central Coast for over {yearsExperience} years. We use quality replacement panels, never cheap knockoffs, and every repair comes with our no-fix no-fee guarantee. You'll get an honest quote upfront with no hidden costs. Call us on{" "}
              <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a>{" "}
              or send a WhatsApp message to get started.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Symptoms ─── */}
      <section className="bg-gray-50 py-12 border-y border-gray-200">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-8">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Common Signs</p>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Does Your Laptop Have Any of These Issues?</h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
            {symptoms.map((s) => (
              <div key={s} className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4">
                <CheckCircle2 className="h-5 w-5 text-[#007b7d] flex-shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700 font-medium">{s}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-6">
            If any of these match your situation, bring it in or mail it to us — we offer a free diagnosis before any work begins.
          </p>
        </div>
      </section>

      {/* ─── Benefits Grid ─── */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">What We Offer</p>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Why Choose Koastal Kollective for Screen Repairs</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-[#f5f9fa] border border-[#c8e0e2] rounded-xl p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-[#007b7d] text-white flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Mail-In Repairs ─── */}
      <MailInRepairs />

      {/* ─── Guarantees ─── */}
      <section className="bg-[#007b7d] py-10 border-y border-[#006a6c]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-white">Our Promise to You</h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {guarantees.map((g) => (
              <div key={g} className="flex items-center gap-3 bg-white/10 border border-white/20 rounded-lg p-4">
                <CheckCircle2 className="h-6 w-6 text-[#7bb8bd] flex-shrink-0" />
                <span className="font-bold text-white text-sm">{g}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-14 bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">FAQ</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-4">
            {faqs.map(({ q, a }) => (
              <div key={q} className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="font-bold text-gray-900 mb-2 text-base">{q}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="bg-[#e8f4f5] py-12 border-b border-[#c8e0e2]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            Ready to Get Your Screen Fixed?
          </h2>
          <p className="text-gray-600 mb-6 text-base">
            Drop into our Mannering Park store, give us a call, or mail your laptop in from anywhere in Australia. Free quote, no obligation.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="tel:+61493145179" className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-8 py-3 rounded-full text-sm transition-colors">
              Call 0493 145 179
            </a>
            <a href="https://wa.me/61493145179" target="_blank" rel="noopener noreferrer" className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold px-8 py-3 rounded-full text-sm transition-colors">
              WhatsApp Us
            </a>
            <a href="#contact" className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-8 py-3 rounded-full text-sm transition-colors">
              See Contact Info
            </a>
          </div>
        </div>
      </section>

            <MediaPromo />

      {/* ─── About Us ─── */}
      <section className="bg-[#007b7d] py-14 border-b border-[#006a6c] overflow-hidden relative">
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
                    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h2M12 14h2M8 17h2M12 17h2"/>
                  </svg>
                ),
                value: `${yearsExperience}`, label: "Years Experience",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M18 8l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
                value: "500+", label: "Customers Helped",
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                    <rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 20h8M12 18v2"/><path d="M9 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
                value: "1000+", label: "Computers Repaired",
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
            Introducing <em className="text-[#007b7d] not-italic">Your Expert</em> IT Technicians
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
                  <p className="text-sm text-gray-500">IT Technician</p>
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
              <a href="/computer-services" className="text-[#007b7d] hover:underline font-semibold not-italic">service</a>{" "}
              for our clients on the{" "}
              <a href="/computer-repairs/central-coast" className="text-[#007b7d] hover:underline font-semibold not-italic">Central Coast</a>{" "}
              and{" "}
              <a href="/computer-repairs/lake-macquarie" className="text-[#007b7d] hover:underline font-semibold not-italic">Lake Macquarie</a>.&rdquo;
            </p>
            <footer className="mt-2 text-base font-bold not-italic text-gray-900">
              – Aaron and the Koastal Kollective Team
            </footer>
          </blockquote>
        </div>
        <div className="mt-6 px-4 scale-[0.92] origin-top" ref={reviewsRef} />
      </section>

      {/* ─── Contact ─── */}
      <section id="contact" className="bg-[#007b7d] py-8 border-b border-[#006a6c]">
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
                  <a href="https://maps.app.goo.gl/V6MedKW2n1fCybob7" target="_blank" rel="noopener noreferrer" className="font-bold text-white hover:text-[#7bb8bd] transition-colors">
                    Shop 1/64 Vales Road, Mannering Park, NSW, 2259
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Email:</p>
                  <a href="mailto:sales@koastal.com.au" className="font-bold text-white hover:text-[#7bb8bd] transition-colors">
                    sales@koastal.com.au
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">Call:</p>
                  <a href="tel:+61493145179" className="font-bold text-white hover:text-[#7bb8bd] transition-colors">
                    0493 145 179
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MessageCircle className="h-5 w-5 text-[#7bb8bd] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white/80 mb-0.5">WhatsApp Message:</p>
                  <a href="https://wa.me/61493145179" target="_blank" rel="noopener noreferrer" className="font-bold text-white hover:text-[#7bb8bd] transition-colors">
                    Start a Conversation
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  <ExternalLink className="h-4 w-4 text-[#7bb8bd]" />
                </div>
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

      {/* ─── Visit Us ─── */}
      <section className="bg-white py-6 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Visit Us</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">Fully Stocked Retail Store and Repair Centre</h2>
        </div>
      </section>

      {/* ─── Map ─── */}
      <section className="border-b border-gray-100">
        <iframe
          title="Koastal Kollective Location"
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
      <section id="service-areas" className="bg-gray-50 py-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">Introducing Your Expert IT Technicians</h2>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900">on The Central Coast and Lake Macquarie</h3>
            <p className="text-[#007b7d] text-sm mt-2 font-semibold">CLICK A SUBURB TO LEARN MORE</p>
          </div>
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-6">
            {Object.entries(suburbs).map(([letter, names]) => (
              <div key={letter} className="break-inside-avoid mb-4">
                <h4 className="font-bold text-gray-900 text-sm border-b border-gray-300 pb-1 mb-1.5">{letter}</h4>
                <ul className="space-y-0.5">
                  {names.map((name) => (
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
        </div>
      </section>

      {/* ─── Footer ─── */}
      <SiteFooter />

      {/* ─── WhatsApp Float Button ─── */}
      <a
        href="https://wa.me/61493145179"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 left-6 z-50 whatsapp-float flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white px-4 py-2.5 rounded-full shadow-lg transition-colors"
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
