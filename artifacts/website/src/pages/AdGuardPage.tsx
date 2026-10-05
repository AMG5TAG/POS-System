import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Shield, EyeOff, Zap, Lock, Smartphone, Wifi, Globe, AlertTriangle,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";

const advantages = [
  {
    icon: EyeOff,
    title: "Block Ads on Every Device",
    body: "AdGuard removes banner ads, pop-ups, video pre-rolls, and intrusive overlays from websites and apps across all your devices — Windows PCs, Macs, Android phones, iPhones, and smart TVs. Pages load faster, look cleaner, and use less data without the clutter.",
  },
  {
    icon: Shield,
    title: "Block Trackers & Stop Data Harvesting",
    body: "Every website you visit plants dozens of invisible trackers that follow you across the internet and sell your browsing data to advertisers. AdGuard blocks these tracking scripts at the network level — before they ever reach your device — keeping your online activity genuinely private.",
  },
  {
    icon: AlertTriangle,
    title: "Phishing & Malware Protection",
    body: "AdGuard checks every website you visit against real-time databases of known phishing pages, malware distributors, and scam sites. It blocks dangerous pages before they load, protecting you from fake login pages, tech support scams, and drive-by malware downloads.",
  },
  {
    icon: Zap,
    title: "Faster Browsing & Less Data Usage",
    body: "By blocking ads and tracking scripts before they download, AdGuard significantly reduces the amount of data loaded on every page. Most users report pages loading 30–50% faster, and mobile data usage drops noticeably — ideal for those on capped internet plans.",
  },
  {
    icon: Wifi,
    title: "DNS-Level Filtering for Whole-Home Protection",
    body: "AdGuard Home runs on your router and blocks ads, trackers, and malicious domains for every device on your network — including smart TVs, gaming consoles, and IoT devices that can't install apps. One setup protects the entire household without touching individual devices.",
  },
  {
    icon: Lock,
    title: "Parental Controls & Safe Browsing",
    body: "AdGuard's parental controls let you block adult content, gambling sites, social media, and other categories on a per-device or network-wide basis. Set schedules, create custom block lists, and keep younger family members safe online without expensive dedicated parental control software.",
  },
  {
    icon: Smartphone,
    title: "In-App Ad Blocking on Android & iOS",
    body: "Unlike browser extensions that only work in your browser, AdGuard for Android and iOS blocks ads inside apps too — including games, news readers, and streaming apps. It works as a local VPN tunnel, requiring no root access and no special permissions.",
  },
  {
    icon: Globe,
    title: "Custom Filtering & Allowlists",
    body: "AdGuard gives you full control with custom filter rules. Whitelist sites you want to support, create block rules for specific elements, and combine community filter lists to suit your exact needs. It's the most configurable ad blocker available without requiring technical expertise.",
  },
];

const comparisonRows = [
  { feature: "Blocks Website Ads", adguard: true, ublock: true, pihole: false },
  { feature: "Blocks In-App Ads (Mobile)", adguard: true, ublock: false, pihole: false },
  { feature: "Blocks Trackers & Analytics", adguard: true, ublock: true, pihole: true },
  { feature: "Phishing & Malware Protection", adguard: true, ublock: false, pihole: false },
  { feature: "DNS-Level Whole-Home Filtering", adguard: true, ublock: false, pihole: true },
  { feature: "Parental Controls", adguard: true, ublock: false, pihole: false },
  { feature: "Works Without Browser Extension", adguard: true, ublock: false, pihole: true },
  { feature: "Windows, Mac, iOS & Android Apps", adguard: true, ublock: false, pihole: false },
  { feature: "No Technical Setup Required", adguard: true, ublock: true, pihole: false },
  { feature: "Central Coast Local Support", adguard: true, ublock: false, pihole: false },
];

const whyKoastal = [
  "Authorised AdGuard reseller — genuine licences, no grey-market keys or dodgy activations",
  "We configure AdGuard on all your devices in-store so it's working perfectly before you leave",
  "Competitive local pricing on individual, family, and lifetime licence plans",
  "Expert advice on which AdGuard product suits you — browser extension, app, or AdGuard Home",
  "We can set up AdGuard Home on your router for whole-house ad blocking on every device",
  "Bundle with computer repair, MacBook servicing, or NBN setup for maximum convenience",
  "Ongoing local support if you have questions about filter lists, whitelists, or renewals",
];

const faqs = [
  {
    q: "What is AdGuard and how is it different from a browser ad blocker?",
    a: "AdGuard is a system-wide ad and tracker blocker that works across all apps and browsers — not just inside a single browser. Unlike extensions such as uBlock Origin, AdGuard can block ads inside mobile apps, games, and at the DNS level across your entire home network.",
  },
  {
    q: "Is AdGuard legal to use in Australia?",
    a: "Yes, completely legal. Ad blocking is lawful in Australia. AdGuard simply filters network traffic on your own devices — the same way your firewall blocks unwanted connections. There is no legal issue with blocking ads on content you receive.",
  },
  {
    q: "Will AdGuard break websites?",
    a: "Rarely. AdGuard's default filter lists are carefully maintained to block ads and trackers without breaking website functionality. If a site doesn't work correctly, you can whitelist it with one click. Most users browse for months without needing to whitelist anything.",
  },
  {
    q: "Does AdGuard slow down my device or internet?",
    a: "No — it actually speeds things up. By blocking ads and tracking scripts before they download, pages load significantly faster and your device uses less CPU and RAM. This is especially noticeable on older PCs, Macs, and Android phones.",
  },
  {
    q: "What is AdGuard Home and do I need it?",
    a: "AdGuard Home is a self-hosted DNS server you install on a small device (like a Raspberry Pi or NAS) connected to your router. It blocks ads and trackers for every device on your network — including smart TVs and gaming consoles. We can set it up for you at our Mannering Park store.",
  },
  {
    q: "How many devices does one AdGuard licence cover?",
    a: "AdGuard Personal covers 1 device, Family covers 9 devices, and there is also a lifetime licence option. For whole-home coverage, AdGuard Home has no device limit since it works at the router level. We'll help you pick the right plan during your visit.",
  },
];

export default function AdGuardPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "AdGuard Ad Blocker | Koastal Kollective",
    description: "AdGuard licences from Koastal Kollective — block ads, trackers and malicious sites on every device. Local Central Coast setup help included.",
  });

  useStructuredData(
    serviceGraph({
      path: "/adguard",
      serviceType: "Ad Blocker Licensing & Setup",
      name: "AdGuard Ad Blocker",
      description: "AdGuard licences with local setup help, blocking ads, trackers and malicious sites on every device.",
      breadcrumbName: "AdGuard",
    }),
    "adguard",
  );

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
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3">AdGuard · Ad Blocking &amp; Privacy</p>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            Browse Faster. Stay <span className="text-[#007b7d]">Private.</span>
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto mb-6 leading-relaxed">
            AdGuard blocks ads, trackers, and malware across every device — even inside apps. Buy it from Koastal Kollective on the Central Coast for genuine licences, expert setup, and local support.
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
              <path d="M30 10L14 18V30C14 39.4 21.2 48.2 30 50C38.8 48.2 46 39.4 46 30V18L30 10Z" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="2"/>
              <path d="M22 30L27.5 35.5L38 25" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="adguard-banner-text text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            Ad blocking that works everywhere
          </h2>
          <p className="text-gray-600 leading-relaxed max-w-xl mx-auto">
            AdGuard is trusted by over 500 million users worldwide. It blocks ads and trackers in browsers, inside apps, and across your entire home network — with no technical expertise required.
          </p>
        </div>
      </section>

      {/* ─── Intro ─── */}
      <section className="bg-white py-12 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Why AdGuard</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-5 text-center">
            Your Privacy Is Worth <span className="text-[#007b7d]">Protecting.</span>
          </h2>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto mb-4">
            Every website you visit tracks what you read, what you click, and how long you stay. This data is collected by hundreds of invisible third-party companies, packaged, and sold to advertisers — often without your knowledge. The average webpage loads over 70 tracking requests alongside its content.
          </p>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto">
            AdGuard is the most complete solution for taking back your privacy online. It works at the system level — blocking ads and trackers before they even reach your browser or app — which means faster pages, less data usage, fewer distractions, and genuinely private browsing on every device you own.
          </p>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10 text-center">
            Complete Protection, <span className="text-[#007b7d]">Every Device</span>
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

      {/* ─── Why buy from Koastal Kollective ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Why Buy Local</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">
            Why Buy AdGuard from <span className="text-[#007b7d]">Koastal Kollective?</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {whyKoastal.map((point) => (
              <div key={point} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#007b7d] flex-shrink-0 mt-0.5" />
                <p className="text-gray-700 text-sm leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Comparison table ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-3 text-center">Head-to-Head Comparison</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
            AdGuard vs uBlock Origin vs Pi-hole
          </h2>
          <p className="text-gray-600 text-center max-w-xl mx-auto mb-8">
            AdGuard is the only option that blocks ads in apps, provides phishing protection, and works out of the box with no technical setup.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#007b7d] text-white">
                  <th className="text-left px-4 py-3 text-sm font-bold">Feature</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">AdGuard</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">uBlock Origin</th>
                  <th className="px-4 py-3 text-sm font-bold text-center">Pi-hole</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(({ feature, adguard, ublock, pihole }, i) => (
                  <tr key={feature} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5 text-sm text-gray-700 border-b border-gray-100">{feature}</td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {adguard ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {ublock ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center border-b border-gray-100">
                      {pihole ? <CheckCircle2 className="h-4 w-4 text-[#007b7d] inline" /> : <span className="text-gray-300 text-lg">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
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
