import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, DollarSign, Shield, Zap, Recycle, ThumbsUp, Cpu,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const grades = [
  {
    image: "/images/refurbished-retail-pc.webp",
    badge: "Budget Friendly",
    badgeColour: "bg-[#7bb8bd]",
    badgeText: "text-gray-900",
    title: "Retail Grade Refurbished",
    tagline: "A reliable everyday computer at a fraction of the cost.",
    description:
      "Our retail grade refurbished computers are ex-consumer machines that have been fully inspected, cleaned, and restored to working order. They're ideal for home users, students and families who need a dependable computer for everyday tasks — web browsing, email, streaming, schoolwork and light office use — without paying new-machine prices.",
    features: [
      "Cleaned, tested and reset to factory settings",
      "Windows 11 Home installed clean — no bloatware",
      "New or tested SSD fitted for fast boot times",
      "RAM checked and upgraded where needed",
      "6-month warranty on parts and labour",
      "Ideal for home, students and everyday use",
    ],
    warranty: "6-Month Warranty",
    startingFrom: "Starting from $199",
  },
  {
    image: "/images/refurbished-business-pc.webp",
    badge: "Best Value",
    badgeColour: "bg-[#007b7d]",
    badgeText: "text-white",
    title: "Business Grade Refurbished",
    tagline: "Enterprise quality. Home and small business price.",
    description:
      "Business grade machines are ex-corporate lease computers from brands like Dell, HP and Lenovo — built to a much higher standard than retail PCs. These workhorses are designed for years of daily use in demanding office environments. Refurbished and certified by our technicians, they offer outstanding reliability and performance at a price that makes new retail hardware look expensive.",
    features: [
      "Ex-corporate lease Dell, HP, Lenovo workstations",
      "Built to enterprise quality standards",
      "Professional-grade CPUs and larger RAM capacity",
      "Fast NVMe SSD — boots in under 10 seconds",
      "Windows 11 Pro installed — ready for business software",
      "12-month warranty on parts and labour",
    ],
    warranty: "12-Month Warranty",
    startingFrom: "Starting from $299",
  },
  {
    image: "/images/refurbished-laptop.webp",
    badge: "Portable & Affordable",
    badgeColour: "bg-[#005f61]",
    badgeText: "text-white",
    title: "Refurbished Laptops",
    tagline: "Go anywhere. Pay less. Do everything.",
    description:
      "Our refurbished laptops give you a portable, capable machine without the price tag of a new one. Whether you need something for working from home, studying, travelling or general use, we have retail and business grade laptops available. Every unit is inspected, cleaned, and fitted with a fresh Windows installation so it's ready to go the moment you take it home.",
    features: [
      "Retail and business grade options available",
      "Battery tested — only sold with healthy batteries",
      "Screen inspected for dead pixels and backlight issues",
      "Keyboard and ports fully checked",
      "Windows 11 clean install — no junk software",
      "6-month (retail) or 12-month (business) warranty",
    ],
    warranty: "6 or 12-Month Warranty",
    startingFrom: "Starting from $249",
  },
];

const whyChoose = [
  {
    icon: DollarSign,
    title: "Save Up to 70% vs New",
    body: "A refurbished business-grade workstation at $350 will outperform a $700 retail box from a department store. You get more machine for your money every single time.",
  },
  {
    icon: Shield,
    title: "Inspected & Warranted",
    body: "Every machine is fully tested by our technicians before sale. Retail grade machines carry a 6-month warranty and business grade machines a 12-month warranty — no exceptions.",
  },
  {
    icon: Zap,
    title: "Ready to Use Instantly",
    body: "Every computer leaves our workshop with a clean Windows 11 installation, updated drivers and no bloatware. Plug it in and it works.",
  },
  {
    icon: Cpu,
    title: "Upgraded Where It Counts",
    body: "We fit SSDs and boost RAM in machines that need it so every refurbished computer we sell feels fast and responsive — often faster than the day it was new.",
  },
  {
    icon: Recycle,
    title: "Better for the Environment",
    body: "Buying refurbished keeps quality hardware out of landfill and reduces the demand for new manufacturing. A great choice for the planet as well as your wallet.",
  },
  {
    icon: ThumbsUp,
    title: "Local Support After the Sale",
    body: "Buy from Koastal Kollective and you have a local technician to call if anything goes wrong. No overseas call centres, no manufacturer run-around — just Aaron down the road.",
  },
];

const faqs = [
  {
    q: "What is the difference between retail grade and business grade?",
    a: "Retail grade machines are ex-consumer computers — the kind sold in department stores. Business grade are ex-corporate lease machines from brands like Dell, HP and Lenovo, built to a much higher standard with better CPUs, more durable components and longer service lives. Business grade offers significantly better value.",
  },
  {
    q: "Is a refurbished computer reliable?",
    a: "Yes — especially business grade machines. Corporate lease computers are typically 3–4 years old when they come off lease, serviced regularly and kept in climate-controlled offices. Our technicians inspect, test and restore every unit before sale, and all machines come with a warranty.",
  },
  {
    q: "What warranty do refurbished computers come with?",
    a: "Retail grade computers come with a 6-month warranty on parts and labour. Business grade computers come with a 12-month warranty on parts and labour. If something goes wrong, bring it back and we'll fix it at no charge within the warranty period.",
  },
  {
    q: "Do refurbished computers come with Windows?",
    a: "Yes. Every machine we sell has a clean installation of Windows 11 (Home for retail, Pro for business grade). There's no bloatware, no trial software — just a fast, clean system ready to use.",
  },
  {
    q: "Can I upgrade a refurbished computer later?",
    a: "Absolutely. Most of our refurbished machines have upgrade slots for extra RAM and additional storage. If you want to add more RAM or a second drive down the track, bring it in and we'll take care of it.",
  },
  {
    q: "Do you have stock available in store?",
    a: "Our stock changes regularly as new machines come in. Call us on 0493 145 179, WhatsApp us or drop into our Mannering Park store to see what's currently available. We can also let you know when specific machines come in.",
  },
];

const guarantees = [
  "Free Diagnostics",
  "No-Fix No-Fee Guarantee",
  "6-Month Retail Warranty",
  "12-Month Business Warranty",
];

export default function RefurbishedComputersPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Refurbished Computers Central Coast | Budget PCs",
    description: "Refurbished laptops and desktops on the Central Coast from $300. Tested, cleaned, fresh Windows install and a 3-month warranty.",
  });
  useStructuredData(
    serviceGraph({
      path: "/refurbished-computers",
      serviceType: "Refurbished Computer Sales",
      name: "Refurbished Computers Central Coast",
      description: "Refurbished laptops and desktops from $300. Fully tested, cleaned, fresh Windows install and a 3-month warranty — a budget upgrade you can trust.",
      breadcrumbName: "Refurbished Computers",
      offers: ["Refurbished Laptops", "Refurbished Desktop PCs", "Student & Budget PCs", "3-Month Warranty Included"],
    }),
    "refurbished-computers",
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
              alt="Koastal Kollective Refurbished Computers Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-3xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Refurbished Computers · Central Coast &amp; Lake Macquarie
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Quality Computers.<br />
                <em className="text-[#007b7d] not-italic">Half the Price of New.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                Fully tested and warranted refurbished desktops and laptops — retail grade from $199, business grade from $299. Get a faster, more reliable computer than anything in your price range at the shops.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a
                  href="#stock"
                  className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
                >
                  See Our Stock
                </a>
                <a
                  href="tel:+61493145179"
                  className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
                >
                  Call 0493 145 179
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Social proof strip ─── */}
      <section className="bg-[#e8f4f5] py-5 border-b border-[#c8e0e2]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-8 text-center">
            {[
              { value: `${yearsExperience}`, label: "Years Experience" },
              { value: "500+", label: "Happy Customers" },
              { value: "1000+", label: "Computers Sold & Repaired" },
              { value: "5★", label: "Google Reviews" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-2xl md:text-3xl font-bold text-[#007b7d]">{value}</p>
                <p className="text-xs text-gray-600 font-semibold mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Intro Copy ─── */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 space-y-8 text-base md:text-lg text-gray-700 leading-relaxed text-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Why Pay New Prices When You Don't Have To?
            </h2>
            <p>
              A brand new computer from a department store is not always the best value — or even the best machine. Retail PCs are often packed with cheap components, slow mechanical hard drives and pre-installed bloatware that slows them down from day one. A refurbished business-grade workstation from Koastal Kollective, on the other hand, is built to a higher standard, runs faster and costs a fraction of the price. The savings are real and the quality speaks for itself.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Every Machine Tested, Cleaned and Warranted
            </h2>
            <p>
              We don't just wipe and resell. Every refurbished computer that leaves our Mannering Park workshop has been fully inspected, internally cleaned, fitted with a fast SSD where needed, and loaded with a clean Windows 11 installation. Retail grade machines come with a 6-month warranty and business grade machines with a 12-month warranty. You're covered if anything goes wrong.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              The Smart Choice for Home, Students and Small Business
            </h2>
            <p>
              Whether you're setting up a home computer for the kids, replacing an ageing family PC, outfitting a small business or studying on a tight budget — a refurbished computer from Koastal Kollective gives you more performance per dollar than anything you'll find new at the same price. Call us on{" "}
              <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a>{" "}
              or drop into our store in Mannering Park to see what's currently in stock.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Grade Showcases ─── */}
      <section id="stock" className="bg-gray-50 py-14 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Our Refurbished Stock</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Choose Your Machine</h2>
            <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">All machines are inspected, cleaned and warranted before sale. Prices shown are starting guides — contact us to see current stock.</p>
          </div>

          <div className="space-y-16">
            {grades.map((grade, i) => (
              <div
                key={grade.title}
                className={`flex flex-col ${i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"} gap-8 items-center bg-white rounded-2xl shadow-md overflow-hidden`}
              >
                <div className="md:w-1/2 w-full flex-shrink-0">
                  <img
                    src={grade.image}
                    alt={grade.title}
                    className="w-full h-72 md:h-96 object-cover"
                  />
                </div>
                <div className="md:w-1/2 px-6 pb-8 md:py-8 md:px-8 space-y-4">
                  <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${grade.badgeColour} ${grade.badgeText}`}>
                    {grade.badge}
                  </span>
                  <h3 className="text-2xl md:text-3xl font-bold text-gray-900">{grade.title}</h3>
                  <p className="text-[#007b7d] font-semibold text-base">{grade.tagline}</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{grade.description}</p>
                  <ul className="space-y-1.5">
                    {grade.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="h-4 w-4 text-[#007b7d] flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <span className="inline-flex items-center gap-1.5 bg-[#007b7d]/10 text-[#007b7d] font-bold text-sm px-3 py-1.5 rounded-full">
                      <Shield className="h-4 w-4" />
                      {grade.warranty}
                    </span>
                    <span className="text-lg font-bold text-[#007b7d]">{grade.startingFrom}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <a
                      href="#contact"
                      className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-5 py-2.5 rounded-full text-sm transition-colors"
                    >
                      Enquire Now
                    </a>
                    <a
                      href="tel:+61493145179"
                      className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-5 py-2.5 rounded-full text-sm transition-colors"
                    >
                      Call Us
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why Choose Us ─── */}
      <section className="py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Why Koastal Kollective</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">The Smarter Way to Buy a Computer</h2>
            <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">
              Refurbished doesn't mean second-best. It means smarter spending — and we make sure every machine earns that description.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {whyChoose.map(({ icon: Icon, title, body }) => (
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

      {/* ─── Warranty comparison ─── */}
      <section className="bg-[#007b7d] py-12 border-y border-[#006a6c]">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-white">Warranty at a Glance</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white/10 border border-white/20 rounded-xl p-6 text-center">
              <p className="text-[#7bb8bd] font-bold tracking-widest text-xs uppercase mb-2">Retail Grade</p>
              <p className="text-4xl font-bold text-white mb-2">6 Months</p>
              <p className="text-white/70 text-sm">Parts &amp; Labour Warranty</p>
              <ul className="mt-4 space-y-1.5 text-left">
                {["Ex-consumer machines", "Home & everyday use", "Starting from $199", "Windows 11 Home"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                    <CheckCircle2 className="h-4 w-4 text-[#7bb8bd] flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-xl p-6 text-center">
              <p className="text-[#7bb8bd] font-bold tracking-widest text-xs uppercase mb-2">Business Grade</p>
              <p className="text-4xl font-bold text-white mb-2">12 Months</p>
              <p className="text-white/70 text-sm">Parts &amp; Labour Warranty</p>
              <ul className="mt-4 space-y-1.5 text-left">
                {["Ex-corporate Dell, HP, Lenovo", "Small business & power users", "Starting from $299", "Windows 11 Pro"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                    <CheckCircle2 className="h-4 w-4 text-[#7bb8bd] flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
            </div>
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
            Ready to Find Your Next Computer?
          </h2>
          <p className="text-gray-600 mb-6 text-base">
            Call us or drop into our Mannering Park store to see what refurbished stock is currently available. New machines come in regularly — we'll put you on the list for the model you're after.
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

      {/* ─── Mail-In Repairs ─── */}
      <MailInRepairs />

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
                icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h2M12 14h2M8 17h2M12 17h2"/></svg>),
                value: `${yearsExperience}`, label: "Years Experience",
              },
              {
                icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M18 8l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
                value: "500+", label: "Customers Helped",
              },
              {
                icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 20h8M12 18v2"/><path d="M9 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
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
              { name: "Aaron Gregory", image: "/images/aaron-gregory.webp" },
              { name: "Larissa Gregory", image: "/images/larissa-gregory.webp" },
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
                    1/64 Vales Road, Mannering Park, NSW, 2259
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
