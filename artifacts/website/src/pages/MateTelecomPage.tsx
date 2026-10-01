import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Wifi, Zap, Headphones, Users, TrendingUp, Shield, Star, ArrowRight,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";

const REFERRAL = "https://www.letsbemates.com.au/mate/koastalkomputers-mate/";

const reasons = [
  {
    icon: Users,
    title: "Australian-Owned, Family-Run Telco",
    body: "MATE is an independent, Australian-owned telco founded in 2015 and still run by its founders — the Fazio brothers — out of Wetherill Park in Western Sydney. It's not a faceless multinational or a reseller badge on a big telco. MATE treats people like mates, not account numbers, and that ethos shows up in every part of the experience.",
  },
  {
    icon: Headphones,
    title: "100% Australian-Based Support",
    body: "When you call MATE on 13 14 13 you speak to a real person here in Australia — no overseas call centres and no scripted deflections. Aussie-based support is one of MATE's core promises, and it's a big reason customers rate them so highly for service.",
  },
  {
    icon: Shield,
    title: "No Lock-In Contracts",
    body: "Every MATE NBN plan is month-to-month. No lock-in contracts, no setup fees and no plan-change fees. Want to move up a speed tier or down again? No dramas. You stay because the service is good — not because you're trapped.",
  },
  {
    icon: Star,
    title: "Unlimited Data, Honest Pricing",
    body: "All MATE NBN plans come with unlimited data and no surprise excess charges — just straightforward, fair-dinkum pricing. New customers get six months at a discounted promo rate before reverting to the standard price, so you know exactly what you're paying.",
  },
  {
    icon: Zap,
    title: "Speeds From NBN 25 to Hyperfast 2000",
    body: "Whether you're a light browser on NBN 25, a family household needing NBN 100, or a power user chasing Gigabit or the new Hyperfast 2000/200 tier, MATE has a plan to match — across FTTP, FTTN, FTTC, HFC and Fixed Wireless connections.",
  },
  {
    icon: Wifi,
    title: "Fair-Dinkum Plan Names You'll Actually Remember",
    body: "MATE ditches the confusing jargon. Plans are named Crikey, Ripper, No Worries, You Beaut, Fair Dinkum, Flamin' Fast and Scorchin' Fast — a cheeky, distinctly Aussie way of picking the speed that fits your life without a spreadsheet.",
  },
  {
    icon: TrendingUp,
    title: "Bundle Mobile + Internet & Save",
    body: "MATE also does SIM-only mobile on the Telstra wholesale network — unlimited talk and text, 5G, eSIM, and data banking that rolls over up to 1000GB. Bundle your mobile with your NBN and save $10 a month on top.",
  },
  {
    icon: CheckCircle2,
    title: "1-Month Money-Back Guarantee",
    body: "MATE backs new residential services with a risk-free money-back guarantee in your first month — return the modem as-new for a full refund if it's not for you. Combined with no contracts, there's genuinely nothing to lose by trying.",
  },
];

const whyKoastal = [
  "We're a MATE Official partner — signing up through us can earn a refer-a-mate credit and helps support our local business",
  "We can advise which NBN speed tier suits your household or small business needs before you sign up",
  "We set up and configure your router and WiFi for optimal performance with your new MATE connection",
  "Troubleshooting slow speeds? We diagnose whether the issue is your router, cabling, WiFi setup, or the NBN service itself",
  "We can combine a MATE setup with our NBN & WiFi consulting service for a complete home network installation",
  "Starlink customers switching to or combining with NBN — we advise on dual-WAN and failover configurations",
  "Local expertise on Central Coast and Lake Macquarie-specific NBN node performance and which speed tier makes sense for your area",
];

const plans = [
  { name: "Crikey", speed: "25/10", ideal: "Light browsing, email, single-user streaming", price: "From ~$55/mo" },
  { name: "Ripper", speed: "50/20", ideal: "Small households, general streaming, working from home", price: "From ~$70/mo" },
  { name: "No Worries", speed: "100/20", ideal: "Families, 4K streaming, video calls, online gaming", price: "From ~$75/mo" },
  { name: "You Beaut", speed: "100/40", ideal: "Households needing faster uploads for cloud & video", price: "From ~$85/mo" },
  { name: "Fair Dinkum", speed: "750/50", ideal: "Power users, large households, heavy uploads", price: "From ~$100/mo" },
  { name: "Flamin' Fast", speed: "1000/100", ideal: "Gigabit downloads, home office, content creators", price: "From ~$101/mo" },
];

const comparisonRows = [
  { feature: "100% Australian-Based Support", mate: true, telstra: false, tpg: false },
  { feature: "No Lock-In Contracts", mate: true, telstra: false, tpg: true },
  { feature: "Unlimited Data on All Plans", mate: true, telstra: true, tpg: true },
  { feature: "No Setup or Plan-Change Fees", mate: true, telstra: false, tpg: true },
  { feature: "1-Month Money-Back Guarantee", mate: true, telstra: false, tpg: false },
  { feature: "Family-Owned Australian Telco", mate: true, telstra: false, tpg: false },
  { feature: "Mobile + Internet Bundle Discount", mate: true, telstra: true, tpg: false },
  { feature: "Award-Winning Customer Service", mate: true, telstra: false, tpg: false },
  { feature: "Refer-a-Mate Credit for Local Setup Help", mate: true, telstra: false, tpg: false },
];

const faqs = [
  {
    q: "Is MATE available on the Central Coast and Lake Macquarie?",
    a: "Yes. MATE services all NBN-connected areas on the Central Coast and Lake Macquarie, including Gosford, Wyong, Tuggerah, The Entrance, Morisset, Swansea, Cessnock (fringe areas), and all suburbs in between. Enter your address on the MATE website to confirm availability, connection type, and the speed tiers you can get.",
  },
  {
    q: "Who owns MATE — are they really Australian?",
    a: "MATE is an independent, Australian-owned telco founded in 2015 and still run by its founders, the Fazio brothers, from Wetherill Park in Western Sydney. It carries the 'Australian Owned' certification, runs its support team onshore, and isn't a rebadge of one of the big telcos.",
  },
  {
    q: "What do MATE's plan names mean?",
    a: "MATE names its NBN plans with Aussie slang instead of confusing tech-speak. Crikey is NBN 25/10, Ripper is 50/20, No Worries covers 100/20 and 500/50, You Beaut is 100/40, Fair Dinkum is 750/50, Flamin' Fast is Gigabit 1000/100 and Scorchin' Fast is the new Hyperfast 2000. Come into Koastal Kollective and we'll help you pick the right tier for your household.",
  },
  {
    q: "Does MATE supply a modem/router?",
    a: "MATE offers a compatible modem as an add-on to your plan, or you can bring your own compatible device. Koastal Kollective can supply, configure, and install a quality router optimised for your MATE connection — often a better outcome than the bundled option.",
  },
  {
    q: "Can I keep my existing phone number when I switch?",
    a: "Yes. MATE supports number porting for both mobile and landline voice services, so if you're switching from another provider you can generally keep your existing number. Koastal Kollective can advise on the process and timing.",
  },
  {
    q: "How does the refer-a-mate credit work?",
    a: "MATE runs a 'Refer a Mate' program — once a referred friend's service is activated, a once-off credit is applied (up to $50 for internet, $25 for mobile). The referral details must be provided at the time of signing up, not afterwards. Come and see us at Koastal Kollective and we'll walk you through signing up the right way and set up your connection from day one.",
  },
];

export default function MateTelecomPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "MATE Telecom NBN | Sign Up via Koastal Kollective",
    description: "Sign up to MATE Telecom NBN through your local Central Coast IT shop. No contracts, unlimited data, Aussie support and expert local setup.",
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
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3">MATE Telecom · NBN Internet &amp; Mobile</p>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            Australia's Friendliest Telco <span className="block text-[#007b7d] whitespace-nowrap">on the Central Coast and Lake Macquarie.</span>
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
            No contracts, unlimited data, and all-Aussie based support. Yeah, mate. Sign up to MATE through Koastal Kollective and get expert local setup included.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={REFERRAL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              <ArrowRight className="h-4 w-4" />
              View NBN Plans
            </a>
            <a
              href="tel:+61493145179"
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-[#007b7d] border-2 border-[#007b7d] font-bold px-7 py-3 rounded-full text-sm transition-colors"
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

      {/* ─── Trust banner ─── */}
      <section className="bg-gradient-to-br from-[#e8f4f5] to-[#c8e0e2] py-10 border-b border-[#c8e0e2]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white shadow-lg mb-6 ring-4 ring-[#007b7d]/20">
            <svg viewBox="0 0 60 60" className="w-14 h-14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="60" height="60" rx="14" fill="#007b7d"/>
              <path d="M30 44C30 44 15 35 15 25C15 20 18.5 17 23 17C26 17 28.5 18.8 30 21C31.5 18.8 34 17 37 17C41.5 17 45 20 45 25C45 35 30 44 30 44Z" fill="white"/>
            </svg>
          </div>
          <h2 className="mate-banner-text text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            No contracts. All-Aussie support. Yeah, mate.
          </h2>
          <p className="text-gray-600 leading-relaxed max-w-xl mx-auto mb-5">
            MATE is an award-winning, Australian-owned telco that treats you like a mate, not a number — unlimited data, month-to-month plans, and support you can actually reach. The obvious choice for Central Coast and Lake Macquarie households and businesses tired of being let down by the big telcos.
          </p>
          <a
            href={REFERRAL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-6 py-2.5 rounded-full text-sm transition-colors"
          >
            View NBN Plans <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* ─── Intro ─── */}
      <section className="bg-white py-12 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Why MATE</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-5 text-center">
            The Telco That Treats You Like a <span className="text-[#007b7d]">Mate.</span>
          </h2>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto mb-4">
            Most Australians have been there — locked into a contract, stuck on hold to an overseas call centre, and paying for data you can't even use. It doesn't have to be that way. Your telco should have your back — that's what mates do.
          </p>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto mb-4">
            MATE is different. Founded in 2015 and still family-run out of Western Sydney, they keep it simple: unlimited data, no lock-in contracts, no setup fees, and 100% Australian-based support on 13 14 13. Cheeky plan names, fair-dinkum pricing, and a genuine money-back guarantee if it's not for you.
          </p>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto mb-6">
            Koastal Kollective is a MATE Official Reseller. When you sign up through us you support a local business — then come into store and we'll set up your connection, router, and WiFi properly from day one.
          </p>
          <div className="flex justify-center">
            <a
              href={REFERRAL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-6 py-2.5 rounded-full text-sm transition-colors"
            >
              Check Plans &amp; Availability <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ─── Plans ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">NBN Plans</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
            Pick the Speed That <span className="text-[#007b7d]">Fits Your Life</span>
          </h2>
          <p className="text-gray-600 text-center max-w-xl mx-auto mb-8">
            All plans are month-to-month, unlimited data, no setup fees. Prices shown are indicative promo rates — check the MATE website for current pricing.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {plans.map(({ name, speed, ideal, price }) => (
              <div key={name} className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900">{name}</span>
                  <span className="text-xs font-bold bg-[#007b7d]/10 text-[#007b7d] px-2 py-0.5 rounded-full">{speed}</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed flex-1">{ideal}</p>
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <span className="text-sm font-bold text-gray-700">{price}</span>
                  <a
                    href={REFERRAL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-[#007b7d] hover:underline inline-flex items-center gap-1"
                  >
                    Learn More <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <a
              href={REFERRAL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              View All Plans on MATE <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ─── Reasons ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Why Switch</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10 text-center">
            8 Reasons Central Coast and Lake Macquarie Residents<br />
            <span className="text-[#007b7d]">Love MATE</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-6 mb-10">
            {reasons.map(({ icon: Icon, title, body }) => (
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
          <div className="flex justify-center">
            <a
              href={REFERRAL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              Learn More &amp; Check Availability <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ─── Why Koastal Kollective ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Local Setup Advantage</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-8 text-center">
            <span className="text-[#7bb8bd]">Sign Up Through Koastal Kollective</span><br />
            <span className="text-[#007b7d]">&amp; Get Expert Local Help</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            {whyKoastal.map((point) => (
              <div key={point} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#007b7d] flex-shrink-0 mt-0.5" />
                <p className="text-gray-700 text-sm leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <a
              href={REFERRAL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              Sign Up via Koastal Kollective <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ─── Comparison table ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Head-to-Head Comparison</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
            MATE vs Telstra vs TPG
          </h2>
          <p className="text-gray-600 text-center max-w-xl mx-auto mb-8">
            The little Aussie telco that punches well above its weight. MATE wins on support, contracts, and value.
          </p>
          <div className="overflow-x-auto mb-8">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#007b7d] text-white">
                  <th className="text-left px-4 py-3 text-sm font-bold">Feature</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">MATE</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">Telstra</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">TPG</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(({ feature, mate, telstra, tpg }, i) => (
                  <tr key={feature} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5 text-sm text-gray-700 border-b border-gray-100">{feature}</td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {mate ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {telstra ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {tpg ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-center">
            <a
              href={REFERRAL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              Learn More About MATE <ArrowRight className="h-4 w-4" />
            </a>
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
          <div className="grid gap-4 mb-8">
            {faqs.map(({ q, a }) => (
              <div key={q} className="bg-white border border-gray-100 rounded-lg p-5">
                <h3 className="font-bold text-gray-900 mb-2">{q}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <a
              href={REFERRAL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              View MATE NBN Plans <ArrowRight className="h-4 w-4" />
            </a>
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
                  <p className="font-bold text-white/80 mb-1.5">Scan for Our Social Media Accounts:</p>
                  <img src="/images/social-media-accounts.webp" alt="Koastal Kollective Social Media Accounts QR Code" className="w-28 h-28 rounded" />
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
