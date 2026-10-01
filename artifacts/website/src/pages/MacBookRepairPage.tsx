import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Monitor, Battery, Wifi, Settings, Shield,
  HardDrive, ArrowUpCircle, Zap, Droplets,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const problems = [
  {
    icon: Monitor,
    title: "Cracked, Black or Flickering Screen",
    body: "MacBook screens are precision-engineered but still vulnerable to drops, pressure and liquid damage. We replace screens for all MacBook Air and MacBook Pro models — Retina, non-Retina, M1, M2, M3 and Intel generations. Every replacement uses high-quality panels that match Apple's colour accuracy and brightness. We also repair iMac displays and external monitor issues.",
  },
  {
    icon: Battery,
    title: "Battery Not Holding Charge",
    body: "If your MacBook dies within an hour of unplugging, the battery has likely reached the end of its lifespan. We replace MacBook batteries with quality cells that restore full-day usage. We also handle battery swelling — a serious issue that can damage the trackpad and chassis if ignored.",
  },
  {
    icon: Zap,
    title: "Won't Turn On or Power Issues",
    body: "A MacBook that won't power on could have a faulty logic board, damaged power circuit, failed SSD or corrupted firmware. We diagnose the exact cause using professional equipment — no guessing. Many no-power issues are repairable without replacing the entire logic board, saving you hundreds of dollars.",
  },
  {
    icon: Droplets,
    title: "Liquid & Water Damage",
    body: "Spilled coffee, rain, or an accidental dunk — liquid damage is one of the most common MacBook killers. We offer professional liquid damage assessment and component-level cleaning. The sooner you bring it in, the better the chances of recovery. We clean corrosion, replace damaged components and test thoroughly before returning your Mac.",
  },
  {
    icon: HardDrive,
    title: "Slow Performance or Storage Full",
    body: "An older Mac running slow or constantly running out of space doesn't need replacing — it needs optimising. We upgrade MacBook SSDs to larger, faster drives, clean up unnecessary files, remove bloatware and optimise macOS settings. Many 5-year-old MacBooks feel brand new after our tune-up.",
  },
  {
    icon: Wifi,
    title: "Wi-Fi, Bluetooth & Connectivity Issues",
    body: "MacBooks that drop Wi-Fi, won't pair with Bluetooth devices, or have erratic network behaviour often have antenna, flex cable or software issues. We diagnose whether the problem is hardware or software and fix it properly — whether that's replacing a Wi-Fi card, reseating an antenna cable or reconfiguring network settings.",
  },
  {
    icon: Settings,
    title: "macOS Installation, Updates & Corruption",
    body: "Failed macOS updates, boot loops, kernel panics and corrupted system files can render a Mac unusable. We reinstall macOS cleanly, preserve your data where possible, update to the latest compatible version, and ensure all drivers and firmware are correct. We also help with downgrades when a new macOS version causes problems.",
  },
  {
    icon: Shield,
    title: "Virus, Malware & Scam Cleanup",
    body: "Macs aren't immune to malware. Browser hijackers, adware, fake antivirus pop-ups and phishing scams all target Mac users. We scan, identify and remove every trace of malicious software, reset compromised browser settings, and install proper protection. We also educate you on how to avoid common Mac-targeted scams.",
  },
];

const models = [
  "MacBook Air (M1, M2, M3)",
  "MacBook Air (Intel)",
  "MacBook Pro 13\" (M1, M2, M3)",
  "MacBook Pro 14\" & 16\" (M1 Pro/Max, M2 Pro/Max, M3 Pro/Max)",
  "MacBook Pro 13\" (Intel)",
  "MacBook Pro 15\" & 16\" (Intel)",
  "iMac 21.5\" & 24\" & 27\"",
  "Mac Mini (M1, M2, M3)",
  "Mac Mini (Intel)",
  "Mac Studio",
  "Mac Pro",
];

const faqs = [
  {
    q: "Do you use genuine Apple parts for repairs?",
    a: "For most repairs we use high-quality aftermarket parts that meet or exceed Apple's specifications — at a fraction of the cost of Apple-authorised repairs. For logic board and complex component repairs, we source professional-grade replacement chips and components. Every repair is backed by our 24-month warranty. We always explain what parts we're using and why.",
  },
  {
    q: "How long does a MacBook screen replacement take?",
    a: "Most MacBook screen replacements are completed within 24–48 hours. We keep common screen panels in stock for popular models. For older or rare models, we may need to order the part, which typically takes 2–4 business days. We'll give you an exact timeline when you bring it in.",
  },
  {
    q: "Is it worth repairing an old MacBook?",
    a: "Often, yes. A MacBook from 2015–2019 can be transformed by an SSD upgrade and RAM increase for a fraction of the cost of a new machine. We assess each Mac honestly — if the repair cost approaches the value of the machine, we'll tell you straight. Many customers are surprised how affordable it is to extend their Mac's life by several years.",
  },
  {
    q: "Will repairing my Mac void my Apple warranty?",
    a: "If your Mac is still under Apple's original warranty or AppleCare, any third-party repair will void that coverage. However, most Macs we repair are out of warranty anyway. For out-of-warranty Macs, our repairs come with a 24-month warranty on parts and labour — longer than Apple's own 90-day repair warranty.",
  },
  {
    q: "Can you recover data from a dead MacBook?",
    a: "Yes, in most cases. Even if your MacBook won't turn on, the SSD often contains perfectly recoverable data. We have specialised tools to extract data from non-booting Macs, failed SSDs and encrypted drives. We handle data recovery with complete confidentiality and can transfer everything to a new device or external drive.",
  },
  {
    q: "Do you offer on-site Mac repairs?",
    a: "For most hardware repairs, the device needs to come to our workshop. However, we do offer on-site visits for software issues, network setup, printer configuration, email problems and general Mac troubleshooting. If you're unsure whether your issue can be fixed on-site, call us on 0493 145 179 and we'll advise.",
  },
];

export default function MacBookRepairPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "MacBook & Mac Repairs Central Coast",
    description: "MacBook, iMac and Apple repairs on the Central Coast. SSD upgrades, screen swaps, logic-board diagnostics and SolvUp out-of-warranty servicing.",
  });
  useStructuredData(
    serviceGraph({
      path: "/macbook-repair",
      serviceType: "MacBook & Apple Repair",
      name: "MacBook & Apple Repairs Central Coast & Lake Macquarie",
      description: "Authorised MacBook, iMac and Apple servicing. SSD upgrades, screen swaps, logic-board diagnostics and SolvUp-backed out-of-warranty repairs.",
      breadcrumbName: "MacBook Repair",
      offers: ["MacBook Screen Replacement", "MacBook SSD & Memory Upgrades", "iMac Servicing", "Logic Board Diagnostics", "SolvUp Out-of-Warranty Repairs"],
    }),
    "macbook-repair",
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
              alt="Koastal Kollective MacBook Repair Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-4xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                MacBook &amp; Apple Repairs · Central Coast &amp; Lake Macquarie
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Your Local Apple<br />
                <em className="text-[#007b7d] not-italic">Repair Experts.</em>
              </h1>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-2">
                MacBook Screen Replacement · Battery Replacement · Liquid Damage · Slow Mac Fix · macOS Repair · iMac Servicing · Data Recovery
              </p>
              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                Expert MacBook, MacBook Air, MacBook Pro and iMac repairs on the Central Coast and Lake Macquarie. We fix screens, batteries, liquid damage, logic boards, slow performance and every software issue — without the Apple store price tag.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href="#problems" className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors">
                  Common Mac Problems We Fix
                </a>
                <a href="tel:+61493145179" className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-7 py-3 rounded-full text-sm transition-colors">
                  Call 0493 145 179
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Hero image ─── */}
      <section>
        <img
          src="/images/macbook-repair.webp"
          alt="MacBook repair workshop"
          className="w-full h-72 md:h-96 object-cover"
        />
      </section>

      {/* ─── SEO intro ─── */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-6 text-gray-700 leading-relaxed text-base md:text-lg">
          <p>
            If you're searching for a <strong>MacBook repair service on the Central Coast</strong> or <strong>Apple computer repair in Lake Macquarie</strong>, you've found your local experts. Koastal Kollective in Mannering Park repairs <strong>all Apple devices</strong> — MacBook Air, MacBook Pro, iMac, Mac Mini and Mac Studio — at prices significantly lower than Apple-authorised service centres, with faster turnaround and a personal touch the big chains can't match.
          </p>
          <p>
            We fix <strong>cracked screens, failing batteries, liquid damage, slow performance, software corruption, virus and malware infections</strong>, and every other problem your Mac might develop. Whether your MacBook won't turn on, the screen has gone black, the battery barely lasts an hour, or it's simply running so slow it's unusable — we diagnose accurately, quote honestly and repair properly. Every Mac repair starts with a <strong>free diagnostic</strong> and is backed by a <strong>24-month warranty</strong> on parts and labour.
          </p>
          <p>
            Unlike Apple stores that often push replacement over repair, we believe in extending the life of your MacBook. A <strong>screen replacement</strong> or <strong>SSD upgrade</strong> can add years of useful life to a perfectly good machine. We work on <strong>MacBooks from 2012 to the latest M3 models</strong> and can source parts for virtually any generation. Call <a href="tel:+61493145179" className="font-bold text-[#007b7d] hover:underline">0493 145 179</a> or drop into our Mannering Park workshop.
          </p>
        </div>
      </section>

      {/* ─── Models we service ─── */}
      <section className="bg-[#007b7d] py-10 border-y border-[#006a6c]">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
            Every Mac Model. Every Generation.
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {models.map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 text-white font-medium text-sm px-3 py-1.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#7bb8bd]" />
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Apple devices image ─── */}
      <section className="border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <img
              src="/images/apple-devices.webp"
              alt="Apple MacBook, iMac, iPhone and iPad lineup"
              className="w-full h-72 md:h-96 object-cover"
            />
          </div>
          <p className="text-center text-sm text-gray-500 mt-3 italic">
            We service every Apple device — from vintage MacBooks to the latest M3 generation.
          </p>
        </div>
      </section>

      {/* ─── Common problems ─── */}
      <section id="problems" className="py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">What We Fix</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Common MacBook Problems We Repair</h2>
            <p className="text-gray-500 mt-2 max-w-2xl mx-auto text-sm">
              These are the issues we see most often — and every one of them is fixable by our technicians.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {problems.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-[#f5f9fa] border border-[#c8e0e2] rounded-xl p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[#007b7d] text-white flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="bg-[#007b7d] py-14 border-y border-[#006a6c]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Don't Replace Your Mac. Repair It.
          </h2>
          <p className="text-white/80 text-base mb-6 leading-relaxed">
            Most MacBook problems are repairable at a fraction of replacement cost. A screen fix, battery swap or SSD upgrade can add years of life to your perfectly good machine.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="tel:+61493145179" className="bg-white text-[#007b7d] hover:bg-[#e8f4f5] font-bold px-8 py-3 rounded-full text-sm transition-colors">
              Call 0493 145 179
            </a>
            <a href="https://wa.me/61493145179" target="_blank" rel="noopener noreferrer" className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold px-8 py-3 rounded-full text-sm transition-colors">
              WhatsApp Us
            </a>
          </div>
        </div>
      </section>

      {/* ─── Why us ─── */}
      <section className="py-14 bg-gray-50 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Why Choose Us</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Apple Repairs Without the Apple Price</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Significantly Cheaper", body: "MacBook screen replacements, battery swaps and repairs cost 40–60% less than Apple-authorised service centres. Same quality parts, better warranty." },
              { title: "Faster Turnaround", body: "Most repairs completed within 24–48 hours. No booking weeks ahead. No shipping your Mac away. Walk in, get fixed, walk out." },
              { title: "All Models Supported", body: "From 2012 MacBooks to the latest M3 MacBook Pro. We source parts for vintage, current and everything in between." },
              { title: "Free Diagnostic", body: "We identify the exact problem before any work begins. No charge for assessment. No pressure to proceed." },
              { title: "24-Month Warranty", body: "Every Mac repair is covered by a 24-month warranty on parts and labour — longer than Apple's own repair warranty." },
              { title: "Local & Personal", body: "Aaron and Larissa Gregory run Koastal Kollective from Mannering Park. You deal directly with the technicians who work on your Mac." },
            ].map(({ title, body }) => (
              <div key={title} className="bg-white border border-gray-200 rounded-xl p-6 text-center">
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-14 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">FAQ</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Mac Repair Questions</h2>
          </div>
          <div className="space-y-4">
            {faqs.map(({ q, a }) => (
              <div key={q} className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                <h3 className="font-bold text-gray-900 mb-2 text-base">{q}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SEO long-form ─── */}
      <section className="py-14">
        <div className="max-w-5xl mx-auto px-4 space-y-10 text-gray-700 leading-relaxed text-base md:text-lg">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              MacBook Screen Replacement on the Central Coast
            </h2>
            <p>
              A cracked or broken MacBook screen is one of the most common repairs we perform. Whether your MacBook Air fell off a desk, your MacBook Pro was sat on, or the display simply stopped working one morning, we can replace it quickly and affordably. We replace screens for <strong>all MacBook Air and MacBook Pro models</strong> including the latest M1, M2 and M3 generations. Our screen replacements use high-quality panels with accurate colour reproduction, full brightness and proper touch functionality where applicable. Every screen replacement includes a <strong>24-month warranty</strong>. We also repair <strong>iMac displays</strong> and can source panels for older Retina and non-Retina models that Apple no longer supports.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              MacBook Battery Replacement Central Coast &amp; Lake Macquarie
            </h2>
            <p>
              MacBook batteries gradually lose capacity over time — it's normal chemistry, but it doesn't mean you need a new laptop. If your MacBook barely lasts an hour unplugged, shuts down at 30%, or the battery has started swelling, a battery replacement will restore full-day usage. We replace batteries for <strong>all MacBook Air and MacBook Pro models</strong> using quality cells that match Apple's original specifications. Swollen batteries are particularly important to address promptly — they can push against the trackpad, distort the chassis and in rare cases cause further damage. We also safely dispose of old batteries according to environmental regulations.
            </p>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Liquid Damage Recovery for MacBooks
            </h2>
            <p>
              Spilled liquid on your MacBook? Don't panic — and don't try to turn it on. The single most important thing is to bring it to a repair shop as quickly as possible. Liquid damage causes corrosion on the logic board, keyboard, trackpad and battery connectors. The longer it sits, the more components are affected. At Koastal Kollective, we perform <strong>professional liquid damage assessment</strong> including ultrasonic cleaning of the logic board, component testing, and replacement of damaged chips and connectors. Many liquid-damaged MacBooks are fully recoverable if treated promptly. Even if your Mac was soaked weeks ago, it's worth bringing in — we've recovered MacBooks that other shops had written off.
            </p>
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
                icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>),
                value: "500+", label: "Customers Helped",
              },
              {
                icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 20h8M12 18v2"/></svg>),
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
