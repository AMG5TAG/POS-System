import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Shield, Award, Users, Wrench, ClipboardCheck, TrendingUp, Zap, Star,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { yearsExperience } from "@/lib/experience";

const advantages = [
  {
    icon: Shield,
    title: "Official Out-of-Warranty Repairer for JB Hi-Fi",
    body: "JB Hi-Fi, Australia's largest consumer electronics retailer, trusts Koastal Kollective to repair laptops, desktops, and devices that have moved beyond their manufacturer warranty period. That trust is earned through consistent quality, fast turnaround times, and genuine parts. If Australia's biggest tech retailer chooses us for their customers, you can be confident we'll do the same for you.",
  },
  {
    icon: Award,
    title: "Official Out-of-Warranty Repairer for Officeworks",
    body: "Officeworks — the go-to destination for Australian businesses, students, and home offices — relies on Koastal Kollective for post-warranty computer repairs across their entire national network. Being chosen by two of Australia's largest retail chains is not a coincidence. It's the result of years of proven reliability, transparent pricing, and repairs that actually last.",
  },
  {
    icon: Users,
    title: "Trusted by National Retail Because We Deliver",
    body: "Big businesses don't gamble with their reputations. When JB Hi-Fi and Officeworks hand over their customers' devices for repair, they need a partner who fixes them properly the first time, communicates clearly, meets deadlines, and treats every customer with respect. That's exactly what Koastal Kollective has delivered for years — which is why these partnerships exist.",
  },
  {
    icon: Wrench,
    title: "Same Expert Technicians, Same Standards",
    body: "The same technicians who repair devices for JB Hi-Fi and Officeworks customers are the ones who will repair yours. There is no 'retail channel' and 'walk-in channel' — everyone gets the same expert attention, the same diagnostic rigour, and the same quality parts. Your device is in the hands of technicians trusted by Australia's biggest retailers.",
  },
  {
    icon: ClipboardCheck,
    title: "Transparent Pricing & No-Fix, No-Fee Guarantee",
    body: "National retailers demand transparent, predictable pricing — and so do we. Every repair starts with a free diagnostic. You receive a clear quote before any work begins. If we can't fix it, you don't pay. This policy is the same whether you walked in off the street or were referred by Australia's largest electronics retailer.",
  },
  {
    icon: TrendingUp,
    title: "Proven Track Record of Reliability",
    body: "Koastal Kollective has been serving the Central Coast and Lake Macquarie since 2011. In that time we've built a reputation for honest advice, skilled repairs, and customer service that keeps people coming back. National retail partnerships are not given lightly — they are awarded to businesses that have proven themselves over time. We've done exactly that.",
  },
  {
    icon: Zap,
    title: "Fast Turnaround & Local Convenience",
    body: "Corporate repair agreements demand fast turnaround times because customers expect their devices back quickly. Koastal Kollective meets those SLAs every day — which means walk-in customers benefit from the same efficient workflow. Most common repairs (screen replacements, battery swaps, virus removal, data recovery) are completed within 24–48 hours.",
  },
  {
    icon: Star,
    title: "Manufacturer-Trained & Certified Technicians",
    body: "Our technicians are trained and experienced across all major brands: Apple MacBooks, Dell, HP, Lenovo, ASUS, Acer, Microsoft Surface, and more. We use genuine or OEM-equivalent parts, follow manufacturer repair guidelines, and document every repair. This is the standard that national retailers require — and the standard you receive as a local customer.",
  },
];

const whyBigBusiness = [
  "Free diagnostics on every device — no charge to find out what's wrong",
  "Clear, itemised quotes before any repair work begins — no surprise fees",
  "Strict no-fix, no-fee policy — if we can't repair it, you don't pay",
  "Genuine and OEM-equivalent parts used on all repairs — no cheap knockoffs",
  "Full repair documentation provided for warranty and insurance claims",
  "Fast turnaround — most repairs completed within 24–48 business hours",
  "Direct liaison with manufacturers for warranty parts and RMA processes",
  "Secure data handling protocols — your personal information is protected",
  "Consistent quality control — every repair is checked before handover",
  "Local accountability — we're a real business with a real shop you can visit",
];

const comparisonRows = [
  { feature: "Official Retail Partner (JB Hi-Fi & Officeworks)", koastal: true, competitorA: false, competitorB: false },
  { feature: "Free Diagnostic", koastal: true, competitorA: false, competitorB: false },
  { feature: "No-Fix, No-Fee Guarantee", koastal: true, competitorA: false, competitorB: false },
  { feature: "Genuine / OEM-Equivalent Parts", koastal: true, competitorA: false, competitorB: true },
  { feature: "24–48 Hour Turnaround", koastal: true, competitorA: true, competitorB: false },
  { feature: "Manufacturer Warranty Liaison", koastal: true, competitorA: false, competitorB: false },
  { feature: "Secure Data Handling", koastal: true, competitorA: false, competitorB: false },
  { feature: "Local Shop You Can Visit", koastal: true, competitorA: false, competitorB: false },
  { feature: `${yearsExperience} Years Local Experience`, koastal: true, competitorA: false, competitorB: true },
  { feature: "Full Repair Documentation", koastal: true, competitorA: false, competitorB: false },
];

const faqs = [
  {
    q: "What is SolvUp and how is Koastal Kollective connected?",
    a: "SolvUp is a managed repair services platform that connects national retailers with trusted, vetted local repair partners. Koastal Kollective is an authorised SolvUp repair provider, which is how we became the official out-of-warranty repairer for JB Hi-Fi and Officeworks. SolvUp ensures every repair meets strict quality, turnaround, and customer service standards.",
  },
  {
    q: "Does being a retail repair partner mean you prioritise corporate jobs over local customers?",
    a: "Absolutely not. Every device — whether referred by JB Hi-Fi, Officeworks, or a local walk-in customer — goes through the same diagnostic queue and is repaired by the same technicians using the same parts and procedures. The retail partnerships simply prove the quality of our work. Local customers benefit from the same professional standards.",
  },
  {
    q: "What types of devices can you repair?",
    a: "We repair laptops (all brands), desktop PCs, MacBooks and iMacs, tablets, monitors, and peripherals. Common repairs include screen replacements, battery replacements, keyboard/trackpad repairs, liquid damage recovery, virus and malware removal, operating system reinstalls, data recovery, SSD upgrades, RAM upgrades, and thermal paste replacement.",
  },
  {
    q: "How does the repair process work?",
    a: "Bring your device to our shop in Mannering Park or contact us first. We perform a free diagnostic (typically same day), then provide a clear quote with no obligation. Once you approve, we order any necessary parts and complete the repair. We notify you when it's ready for pickup. Every repair includes a post-repair test and warranty.",
  },
  {
    q: "Do you offer a warranty on repairs?",
    a: "Yes. All repairs carry a warranty on both labour and parts. The exact period varies by repair type — typically 90 days for software repairs and 6–12 months for hardware replacements. We use this warranty because we trust our work. If something isn't right, we fix it at no extra cost.",
  },
  {
    q: "Can I get a repair if I bought my device from JB Hi-Fi or Officeworks?",
    a: "Yes. If your device is out of manufacturer warranty, both JB Hi-Fi and Officeworks may refer you to Koastal Kollective through SolvUp. You can also come directly to us — no referral needed. We handle warranty-voided, expired-warranty, and accidental-damage repairs for all customers regardless of where the device was originally purchased.",
  },
];

export default function SolvUpPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "SolvUp Repairs Central Coast | JB Hi-Fi & Officeworks",
    description: "Authorised SolvUp repair partner on the Central Coast. Out-of-warranty fixes for devices bought from JB Hi-Fi, Officeworks and other major retailers.",
  });

  useEffect(() => {
    if (!reviewsRef.current) return;
    const script = document.createElement("script");
    script.src = "https://cdn.trustindex.io/loader.js?cf2cb364235f94440e6622bb352";
    script.async = true;
    script.defer = true;
    reviewsRef.current.appendChild(script);
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ─── Hero ─── */}
      <section className="bg-white pt-10 pb-6 text-center border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex justify-center mb-6">
            <img src="/images/logo.png" alt="Koastal Kollective" className="h-44 w-auto" />
          </div>
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3">SolvUp · Official Retail Repair Partner</p>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            Australia's Biggest Retailers <span className="text-[#007b7d]">Trust Us.</span>
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
            Koastal Kollective is the official out-of-warranty repairer for JB Hi-Fi and Officeworks through SolvUp. If Australia's largest electronics retailers trust us with their customers, so can you.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="tel:+61493145179"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              <Phone className="h-4 w-4" />
              Call 0493 145 179
            </a>
            <a
              href="https://wa.me/61493145179"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp Us
            </a>
          </div>
        </div>
      </section>

      {/* ─── Hero banner ─── */}
      <section className="bg-gradient-to-br from-[#e8f4f5] to-[#c8e0e2] py-10 flex items-center justify-center border-b border-[#c8e0e2]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white shadow-lg mb-6 ring-4 ring-[#007b7d]/20">
            <svg viewBox="0 0 60 60" className="w-14 h-14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="60" height="60" rx="14" fill="#007b7d"/>
              <path d="M30 12L16 20V32C16 41.94 22.2 50.62 30 52C37.8 50.62 44 41.94 44 32V20L30 12Z" stroke="white" strokeWidth="2.5" fill="white" fillOpacity="0.15"/>
              <path d="M24 30L28 34L36 26" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="solvup-banner-text text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            Trusted by JB Hi-Fi. Trusted by Officeworks.
          </h2>
          <p className="text-gray-600 leading-relaxed max-w-xl mx-auto">
            We are the only independent repair centre on the Central Coast authorised by two of Australia's largest national retailers to handle their out-of-warranty computer repairs. That trust is earned, not bought.
          </p>
        </div>
      </section>

      {/* ─── Intro ─── */}
      <section className="bg-white py-12 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Why It Matters</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-5 text-center">
            A Retail Partnership Is the Highest <span className="text-[#007b7d]">Endorsement.</span>
          </h2>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto mb-4">
            Anyone can call themselves a computer repairer. But when JB Hi-Fi and Officeworks — businesses that collectively serve millions of Australians every year — choose Koastal Kollective as their official out-of-warranty repair partner, that says something that no marketing claim can.
          </p>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto mb-4">
            These partnerships mean we meet strict service level agreements, quality benchmarks, turnaround deadlines, and customer satisfaction targets that most independent repair shops simply don't have to worry about. And because we do it every day for national retail, we bring that same professionalism to every local customer who walks through our door.
          </p>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto">
            You don't need to buy your device from JB Hi-Fi or Officeworks to benefit. Every repair — whether corporate-referred or local walk-in — is handled by the same technicians, with the same parts, to the same standard. The only difference is that you know exactly what standard that is: the one trusted by Australia's biggest retailers.
          </p>
        </div>
      </section>

      {/* ─── Retail logos / trust bar ─── */}
      <section className="bg-gray-50 py-12 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-6 text-center">Official Partners</p>
          <div className="flex flex-wrap justify-center items-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center">
                <span className="text-sm font-bold text-gray-800 tracking-tight">JB Hi-Fi</span>
              </div>
              <span className="text-xs text-gray-500">Official Repair Partner</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center">
                <span className="text-sm font-bold text-gray-800 tracking-tight">Officeworks</span>
              </div>
              <span className="text-xs text-gray-500">Official Repair Partner</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center">
                <span className="text-sm font-bold text-[#007b7d] tracking-tight">SolvUp</span>
              </div>
              <span className="text-xs text-gray-500">Managed Repair Platform</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">What Sets Us Apart</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10 text-center">
            8 Reasons National Retail <span className="text-[#007b7d]">Chooses Koastal Kollective</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {advantages.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-lg bg-[#007b7d]/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-[#007b7d]" />
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why big business trusts us ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">The Koastal Kollective Standard</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">
            Why Big Business <span className="text-[#007b7d]">Trusts &amp; Uses</span> Koastal Kollective
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {whyBigBusiness.map((point) => (
              <div key={point} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#007b7d] flex-shrink-0 mt-0.5" />
                <p className="text-gray-700 text-sm leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Comparison table ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Head-to-Head Comparison</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
            Koastal Kollective vs Typical Repair Shops
          </h2>
          <p className="text-gray-600 text-center max-w-xl mx-auto mb-8">
            The difference between a retail-trusted repairer and a typical shop is in the details that actually matter.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#007b7d] text-white">
                  <th className="text-left px-4 py-3 text-sm font-bold">Feature</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">Koastal Kollective</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">Typical Shop A</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">Typical Shop B</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(({ feature, koastal, competitorA, competitorB }, i) => (
                  <tr key={feature} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5 text-sm text-gray-700 border-b border-gray-100">{feature}</td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {koastal ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {competitorA ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {competitorB ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">FAQ</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="grid gap-4">
            {faqs.map(({ q, a }) => (
              <div key={q} className="bg-white border border-gray-100 rounded-lg p-5">
                <h3 className="font-bold text-gray-900 mb-2">{q}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Mail-In Repairs ─── */}
      <MailInRepairs />

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
    </div>
  );
}
