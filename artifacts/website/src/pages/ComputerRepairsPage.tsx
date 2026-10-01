import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  Laptop, Monitor, Apple, Tablet, Zap, ShieldCheck, HardDrive,
  Wrench, CheckCircle2, AlertTriangle, DollarSign, Users,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { LOCAL_BUSINESS } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const repairCategories = [
  {
    icon: Laptop,
    title: "Laptop Repairs",
    body: "Cracked screens, dead keyboards, swollen batteries, snapped hinges, charging port repairs, liquid damage assessment, and motherboard-level fault-finding on HP, Dell, Lenovo, ASUS, Acer, MSI, Razer and Microsoft Surface.",
  },
  {
    icon: Monitor,
    title: "Desktop PC Repairs",
    body: "Won't-turn-on diagnostics, power supply replacement, motherboard swaps, GPU troubleshooting, thermal paste and cooling overhauls, custom upgrades, and full rebuilds — gaming, office and workstation PCs.",
  },
  {
    icon: Apple,
    title: "MacBook & iMac Servicing",
    body: "MacBook Pro and Air servicing, iMac diagnostics, SSD and RAM upgrades on supported models, macOS reinstallation, and T2/Apple Silicon-aware repairs. SolvUp-authorised out-of-warranty repairer for JB Hi-Fi and Officeworks.",
  },
  {
    icon: Tablet,
    title: "Surface, Chromebook & 2-in-1",
    body: "Microsoft Surface specialists. Chromebook and 2-in-1 device repairs covering screen replacement, charging issues, OS recovery and component-level fixes most workshops won't touch.",
  },
  {
    icon: ShieldCheck,
    title: "Virus, Malware & Ransomware Removal",
    body: "Pop-ups, browser hijacks, slow performance after a dodgy download, suspected ransomware — full manual disinfection, not just a quick scan. Protection installed afterwards at no extra charge.",
  },
  {
    icon: HardDrive,
    title: "Data Recovery from Failed Drives",
    body: "Software-level recovery in our workshop on a no-recovery-no-fee basis. Physically damaged drives requiring a clean-room are quoted transparently before being sent to our recovery partner.",
  },
];

const fixNowSymptoms = [
  "One-off blue screens or random restarts (usually RAM, driver or thermal — cheap)",
  "Slow boot, slow apps, fan running constantly (failing hard drive or thermal paste)",
  "Cracked screen on a 1–3 year old laptop (replacement screens are well-priced)",
  "Keyboard, trackpad, hinge or port damage (component-level repairs)",
  "Battery only lasts an hour (battery swaps are routine)",
  "Suspected virus, ransomware or strange pop-ups (urgent — book in today)",
  "Liquid spill (urgent — power it off, bring it in, do not turn it back on)",
];

const replaceSymptoms = [
  "8+ year old laptop with a major board-level fault",
  "Original-generation MacBook Air or pre-2017 entry-level laptops with logic board failure",
  "Water-damaged laptop where the spill hit the keyboard and the motherboard",
];

const decisionTable: Array<{ issue: string; young: string; mid: string; old: string }> = [
  { issue: "Cracked screen", young: "Repair", mid: "Repair", old: "Quote both" },
  { issue: "Slow / failing HDD", young: "Repair (SSD upgrade)", mid: "Repair (SSD upgrade)", old: "Quote both" },
  { issue: "Battery dead", young: "Repair", mid: "Repair", old: "Replace" },
  { issue: "Won't turn on", young: "Diagnose first", mid: "Diagnose first", old: "Often replace" },
  { issue: "Liquid damage", young: "Diagnose first", mid: "Quote both", old: "Replace" },
  { issue: "Motherboard failure", young: "Repair", mid: "Quote both", old: "Replace" },
];

const pricingItems = [
  { label: "Tune-up / virus removal", note: "Fixed-price service, typically same-day" },
  { label: "SSD upgrade with data migration", note: "Fixed-price labour + cost of the drive" },
  { label: "Laptop battery replacement", note: "Fixed-price labour + battery" },
  { label: "Laptop screen replacement", note: "Screen-dependent, quoted before work starts" },
  { label: "Data recovery (software-level)", note: "Flat-rate assessment, no recovery = no fee" },
];

const trustSignals = [
  { icon: CheckCircle2, title: "No-Fix, No-Fee", body: "If we can't fix it, you don't pay. No diagnostic fees, no call-out fees, no surprise line items." },
  { icon: Users, title: "Family-Run Since 2011", body: "The person who answers the phone is the person fixing your machine. Local workshop in Mannering Park." },
  { icon: Wrench, title: "Genuine Parts, Real Warranty", body: "Documented warranties on every repair. We use proper parts, not the cheapest thing on AliExpress." },
  { icon: DollarSign, title: "Transparent Pricing", body: "Fixed quotes before any work starts. Pensioners get 10% off every service, every time." },
];

const faqs = [
  {
    q: "How long does a typical computer repair take?",
    a: "Most repairs are completed within 2–5 business days. Same-day is often possible for common faults like SSD upgrades, virus removal and stocked screen models.",
  },
  {
    q: "Do you charge a call-out or inspection fee?",
    a: "No. Diagnostics in our workshop are free, and we don't charge inspection fees for drop-offs. On-site call-outs across the Central Coast and Lake Macquarie are quoted upfront with no surprise charges.",
  },
  {
    q: "What does \"no fix, no fee\" actually cover?",
    a: "If we can't repair the fault you brought us, you don't pay for the labour. Parts we've ordered specifically for your job are the only exception, and we always confirm part orders with you first.",
  },
  {
    q: "Can you recover data from a hard drive that won't read?",
    a: "Yes — software-level recovery happens here with no-recovery-no-fee. Physically damaged drives needing a clean-room are quoted before being sent to our recovery partner.",
  },
  {
    q: "Do you repair gaming PCs and consoles?",
    a: "Yes — custom and pre-built gaming PCs, plus PlayStation, Xbox and Nintendo console repairs.",
  },
  {
    q: "Are you authorised to repair out-of-warranty JB Hi-Fi and Officeworks devices?",
    a: "Yes — we're a SolvUp-authorised partner for both retailers.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    LOCAL_BUSINESS,
    {
      "@type": "Service",
      "@id": "https://koastal.com.au/computer-repairs#service",
      serviceType: "Computer Repairs",
      name: "Computer Repairs Central Coast & Lake Macquarie",
      provider: { "@id": "https://koastal.com.au/#business" },
      areaServed: [
        { "@type": "AdministrativeArea", name: "Central Coast, NSW" },
        { "@type": "AdministrativeArea", name: "Lake Macquarie, NSW" },
      ],
      offers: {
        "@type": "Offer",
        priceCurrency: "AUD",
        description: "No-fix, no-fee computer repair. Free diagnostic. Fixed-price quote before work starts.",
      },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Computer Repair Services",
        itemListElement: [
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "Laptop Repairs" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "Desktop PC Repairs" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "MacBook & iMac Servicing" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "Virus, Malware & Ransomware Removal" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "Data Recovery from Failed Drives" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "On-Site Business IT Support" } },
        ],
      },
    },
    {
      "@type": "FAQPage",
      "@id": "https://koastal.com.au/computer-repairs#faq",
      mainEntity: faqs.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://koastal.com.au/" },
        { "@type": "ListItem", position: 2, name: "Computer Repairs", item: "https://koastal.com.au/computer-repairs" },
      ],
    },
  ],
};

export default function ComputerRepairsPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Computer Repairs Central Coast & Lake Macquarie",
    description: `Fast, local computer repairs from Mannering Park. No-fix no-fee, free diagnostics, ${yearsExperience} years experience serving the Central Coast & Lake Macquarie. Call 0493 145 179.`,
  });

  useEffect(() => {
    const ldScript = document.createElement("script");
    ldScript.type = "application/ld+json";
    ldScript.text = JSON.stringify(jsonLd);
    ldScript.dataset.page = "computer-repairs";
    document.head.appendChild(ldScript);
    return () => {
      if (ldScript.parentNode) ldScript.parentNode.removeChild(ldScript);
    };
  }, []);

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
              alt="Koastal Kollective Computer Repairs Central Coast"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-4xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Computer Repairs · Central Coast &amp; Lake Macquarie
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Computer Repairs on the<br />
                <em className="text-[#007b7d] not-italic">Central Coast &amp; Lake Macquarie</em>
              </h1>
              <p className="text-gray-700 text-base md:text-lg leading-relaxed mb-6 max-w-3xl mx-auto">
                Your laptop won't boot. Your workstation is throwing blue screens at 9 a.m. on a Monday. Your kid's gaming PC just made a noise it shouldn't make. You don't need a sales pitch — you need a technician who'll pick up the phone, give you a straight answer, and have it back on your desk this week.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href="tel:+61493145179" className="bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2">
                  <Phone className="h-4 w-4" /> Call 0493 145 179
                </a>
                <a href="https://wa.me/61493145179" target="_blank" rel="noopener noreferrer" className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors inline-flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> WhatsApp Us
                </a>
                <a href="#diagnostic-guide" className="border-2 border-[#007b7d] text-[#007b7d] hover:bg-[#007b7d] hover:text-white font-bold px-7 py-3 rounded-full text-sm transition-colors">
                  Should I Repair or Replace?
                </a>
              </div>
              <p className="text-gray-600 text-sm mt-5">
                Family-run from Mannering Park since 2011 · 1,000+ machines repaired · 5★ Google rating
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── This Week, Not Next Month ─── */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Fast Turnaround</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Get Your Computer Fixed This Week — Not Next Month
          </h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            Most repairs we book on a Monday are back in the customer's hands by Friday. Some — like screen replacements on common laptop models — are same-day. We hold stock of the parts that fail most often (SSDs, RAM, fans, batteries, popular laptop screens) so you're not waiting on a courier.
          </p>
          <div className="bg-[#f5f9fa] border border-[#c8e0e2] rounded-xl p-6">
            <h3 className="font-bold text-gray-900 mb-3">What "free diagnostic" actually means here</h3>
            <ul className="space-y-2 text-gray-700">
              {[
                "A qualified technician inspects the hardware and runs full system diagnostics.",
                "You get a written quote with a fixed price before any work starts.",
                "If you decide not to proceed, you owe us nothing — no inspection fee, no \"looking\" charge.",
                "If we can't fix it, you don't pay. That's the no-fix-no-fee promise.",
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-[#007b7d] flex-shrink-0 mt-0.5" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Every Repair We Handle ─── */}
      <section className="bg-gray-50 py-12 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-8">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Every Repair We Handle</p>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              PC, Mac, Laptop &amp; Beyond
            </h2>
            <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
              We're generalists by design — most households and small businesses run a mix of brands, and bouncing between three different shops is nobody's idea of a good day.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {repairCategories.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-[#007b7d] text-white flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Diagnostic Guide ─── */}
      <section id="diagnostic-guide" className="py-12">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Honest Diagnostic Guide</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Is Your Computer Worth Repairing?
          </h2>
          <p className="text-gray-700 leading-relaxed mb-8">
            This is the question nobody at a big-box store will answer honestly, because their job is to sell you a new one. Here's the framework we actually use on the bench.
          </p>

          <div className="bg-[#007b7d] text-white rounded-xl p-6 mb-8">
            <h3 className="font-bold text-lg mb-2">The 50% Rule</h3>
            <p className="text-white/90 leading-relaxed">
              If the repair quote is more than <strong>50% of the cost of a comparable replacement</strong>, and the machine is more than 5 years old, replacement usually wins on total cost of ownership. Under that threshold, repair almost always wins.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-10">
            <div className="bg-white border-2 border-[#007b7d] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-5 w-5 text-[#007b7d]" />
                <h3 className="font-bold text-gray-900">Fix It Now</h3>
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                {fixNowSymptoms.map((s) => (
                  <li key={s} className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#007b7d] flex-shrink-0 mt-0.5" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white border-2 border-amber-500 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-gray-900">Usually Time to Replace</h3>
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                {replaceSymptoms.map((s) => (
                  <li key={s} className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Decision Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-[#e8f4f5] px-6 py-4 border-b border-[#c8e0e2]">
              <h3 className="font-bold text-gray-900">Repair vs Replace — Quick Reference</h3>
              <p className="text-sm text-gray-600">Our bench-level call by issue and machine age.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold">Issue</th>
                    <th className="text-left px-4 py-3 font-bold">1–3 yrs old</th>
                    <th className="text-left px-4 py-3 font-bold">4–6 yrs old</th>
                    <th className="text-left px-4 py-3 font-bold">7+ yrs old</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  {decisionTable.map((row, i) => (
                    <tr key={row.issue} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-semibold text-gray-900">{row.issue}</td>
                      <td className="px-4 py-3">{row.young}</td>
                      <td className="px-4 py-3">{row.mid}</td>
                      <td className="px-4 py-3">{row.old}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-gray-700 mt-6 leading-relaxed">
            Bring it in. We'll tell you straight which side of the line your machine sits on — no upsell, no pressure.
          </p>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section className="bg-gray-50 py-12 border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Honest Pricing</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Typical Repair Pricing — No Surprises at the Counter
          </h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            We publish indicative pricing because the "call for a quote" runaround wastes everyone's time. Every job is quoted in writing before any work begins.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {pricingItems.map(({ label, note }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-lg p-5">
                <p className="font-bold text-gray-900 mb-1">{label}</p>
                <p className="text-sm text-gray-600">{note}</p>
              </div>
            ))}
          </div>
          <div className="bg-[#e8f4f5] border border-[#c8e0e2] rounded-xl p-5 text-gray-800">
            <p className="text-sm">
              <strong>What pushes a quote up:</strong> rare parts, obsolete models, board-level micro-soldering, water damage. <strong>What doesn't:</strong> us "having a look." That's always free.
            </p>
            <p className="text-sm mt-3">
              <strong>Seniors get 10% off all services.</strong> Just mention it when you book.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Data Recovery ─── */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">When Repair Comes Too Late</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Data Recovery from Failed Drives
          </h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            Failed hard drives, accidentally deleted folders, ransomware-encrypted files, dropped external drives — we attempt recovery on all of them. Software-level recovery happens in our workshop with <strong>no recovery, no fee</strong>. For physically damaged drives that need a clean-room, we partner with specialist labs and quote transparently before sending it on.
          </p>
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
            <p className="text-sm text-gray-800">
              <strong>The single most important thing:</strong> stop using the drive immediately. Every minute of use after a failure reduces the odds of a clean recovery.
            </p>
          </div>
          <div className="mt-6">
            <Link href="/data-recovery" className="text-[#007b7d] font-bold hover:underline">
              Learn more about our data recovery service →
            </Link>
          </div>
        </div>
      </section>

      {/* ─── On-Site Business ─── */}
      <section className="bg-gray-50 py-12 border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">For Business</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            On-Site Computer Repair for Small Business
          </h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            We come to you across the Central Coast and Lake Macquarie for:
          </p>
          <ul className="grid sm:grid-cols-2 gap-3 mb-6">
            {[
              "Server and NAS issues that can't leave the office",
              "Network, NBN, Wi-Fi and Starlink troubleshooting",
              "New workstation rollouts and data migration",
              "Email, Microsoft 365 and shared-drive setup",
              "After-hours and weekend emergency call-outs by arrangement",
              "One technician, one invoice, one number to call",
            ].map((item) => (
              <li key={item} className="flex gap-2 text-gray-700">
                <CheckCircle2 className="h-5 w-5 text-[#007b7d] flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Link href="/business-it-support" className="text-[#007b7d] font-bold hover:underline">
            See our full business IT support →
          </Link>
        </div>
      </section>

      {/* ─── Why Locals Choose Us ─── */}
      <section className="py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-8">
            <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">Why Locals Choose Us</p>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              Family-Run Beats Big-Box, Every Time
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {trustSignals.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-[#f5f9fa] border border-[#c8e0e2] rounded-xl p-6">
                <div className="w-12 h-12 rounded-lg bg-[#007b7d] text-white flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="bg-gray-50 py-12 border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2 text-center">FAQ</p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="grid gap-4">
            {faqs.map(({ q, a }) => (
              <div key={q} className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="font-bold text-gray-900 mb-2">{q}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="bg-[#007b7d] py-14 border-y border-[#006a6c]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Ready to Book?
          </h2>
          <p className="text-white/80 text-base mb-6 leading-relaxed">
            Call, message, or drop in to the Mannering Park workshop. Free diagnostic, fixed-price quote, no-fix-no-fee.
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

            <MediaPromo />

      {/* ─── About / Stats ─── */}
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
          <div className="max-w-3xl mx-auto mb-10 grid sm:grid-cols-2 gap-4">
            <Link href="/computer-repairs/central-coast" className="block bg-white border border-[#c8e0e2] rounded-xl p-5 hover:shadow-lg transition-shadow">
              <p className="text-[#007b7d] font-bold tracking-[0.15em] text-xs uppercase mb-1">Region</p>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Central Coast Computer Repairs</h3>
              <p className="text-sm text-gray-600">Gosford, Terrigal, Woy Woy, The Entrance, Wyong and Toukley →</p>
            </Link>
            <Link href="/computer-repairs/lake-macquarie" className="block bg-white border border-[#c8e0e2] rounded-xl p-5 hover:shadow-lg transition-shadow">
              <p className="text-[#007b7d] font-bold tracking-[0.15em] text-xs uppercase mb-1">Region</p>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Lake Macquarie Computer Repairs</h3>
              <p className="text-sm text-gray-600">Swansea, Belmont, Warners Bay, Toronto and Morisset →</p>
            </Link>
          </div>
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">Servicing and Supplying Every Suburb</h2>
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

      {/* ─── WhatsApp Float ─── */}
      <a
        href="https://wa.me/61493145179"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 left-6 z-50 whatsapp-float flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white px-4 py-2.5 rounded-full shadow-lg transition-colors"
        aria-label="WhatsApp"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="font-bold text-sm">Need Help?</span>
      </a>
    </div>
  );
}
