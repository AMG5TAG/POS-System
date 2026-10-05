import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import MailInRepairs from "@/components/MailInRepairs";
import SocialLinks from "@/components/SocialLinks";
import { Link } from "wouter";
import {
  MessageCircle, MapPin, Mail, Phone, Clock, ExternalLink,
  CheckCircle2, Shield, Globe, Lock, Eye, Cpu, Wifi, Smartphone, CreditCard,
} from "lucide-react";
import { suburbs, suburbPath } from "@/data/suburbs";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import MediaPromo from "@/components/MediaPromo";
import { yearsExperience } from "@/lib/experience";

const advantages = [
  {
    icon: Shield,
    title: "Real-Time Threat Protection",
    body: "Kaspersky Premium Total Security uses advanced AI and machine learning to detect and block viruses, ransomware, spyware, and zero-day threats before they can infect your system. It scans files, websites, emails, and downloads in real time — keeping your devices safe without slowing them down.",
  },
  {
    icon: Lock,
    title: "Ransomware & Cryptojacking Defense",
    body: "Kaspersky's System Watcher technology monitors application behaviour to detect and block ransomware attacks and cryptojacking attempts. It can even roll back malicious changes, protecting your photos, documents, and personal files from being encrypted or stolen.",
  },
  {
    icon: Eye,
    title: "Privacy Protection & Anti-Phishing",
    body: "Kaspersky stops phishing websites, fake login pages, and online scams from stealing your passwords and banking details. It also includes a secure browser mode for online shopping and banking, plus webcam and microphone protection to prevent spying.",
  },
  {
    icon: Globe,
    title: "VPN with Unlimited Traffic",
    body: "Kaspersky Premium includes a fast, unlimited VPN that encrypts your internet connection and hides your IP address. Browse safely on public Wi-Fi, access geo-restricted content, and keep your online activity private — with no data caps or speed throttling.",
  },
  {
    icon: Wifi,
    title: "Home Network Security Scanner",
    body: "Kaspersky scans your home Wi-Fi network to identify weak passwords, unpatched routers, unauthorised devices, and other vulnerabilities. It helps you secure your smart home gadgets, printers, and IoT devices from being exploited by hackers.",
  },
  {
    icon: Smartphone,
    title: "Cross-Platform Coverage",
    body: "One Kaspersky Premium licence covers all your devices — Windows PCs, Macs, Android phones and tablets, and iPhones. Keep every member of your family's digital life protected with a single, easy-to-manage subscription.",
  },
  {
    icon: Cpu,
    title: "Performance Optimisation Tools",
    body: "Kaspersky includes built-in tools to clean junk files, optimise startup programs, and manage disk space — helping your computer run faster while staying protected. Unlike some security suites that slow your PC down, Kaspersky is designed to be lightweight and efficient.",
  },
  {
    icon: CreditCard,
    title: "Safe Money & Password Manager",
    body: "Kaspersky Premium includes Safe Money technology that opens banking and shopping sites in a hardened, tamper-proof browser. It also comes with a built-in password manager that generates strong passwords, auto-fills login forms, and stores credentials securely.",
  },
];

const comparisonRows = [
  { feature: "Real-Time Virus & Malware Protection", kaspersky: true, norton: true, trendMicro: true },
  { feature: "Ransomware Rollback Protection", kaspersky: true, norton: true, trendMicro: false },
  { feature: "Unlimited VPN Included", kaspersky: true, norton: false, trendMicro: false },
  { feature: "Home Network Security Scanner", kaspersky: true, norton: false, trendMicro: true },
  { feature: "Performance Optimisation Tools", kaspersky: true, norton: true, trendMicro: false },
  { feature: "Built-In Password Manager", kaspersky: true, norton: true, trendMicro: false },
  { feature: "Safe Money / Hardened Browser", kaspersky: true, norton: true, trendMicro: false },
  { feature: "Webcam & Microphone Protection", kaspersky: true, norton: true, trendMicro: true },
  { feature: "Light System Impact", kaspersky: true, norton: false, trendMicro: true },
  { feature: "Central Coast Local Support", kaspersky: true, norton: false, trendMicro: false },
];

const whyKoastal = [
  "Authorised Kaspersky reseller with genuine licences — no grey-market keys",
  "Competitive local pricing, often below online retailer prices",
  "Personalised setup and configuration on your devices",
  "Hands-on help installing, activating, and optimising Kaspersky settings",
  "Ongoing local support if you need help renewing, troubleshooting, or upgrading",
  "Bundle discounts when combined with computer repair or IT services",
  "Available for home users, families, and small business multi-device protection",
];

const faqs = [
  {
    q: "What is the difference between Kaspersky Standard and Kaspersky Premium?",
    a: "Kaspersky Standard includes essential antivirus, anti-phishing, and ransomware protection. Kaspersky Premium adds an unlimited VPN, password manager, Safe Money hardened browser, home network scanner, and performance optimisation tools. For most users, Premium is the best value.",
  },
  {
    q: "How many devices does one licence cover?",
    a: "Kaspersky Premium Total Security is available in 3-device, 5-device, and 10-device plans. We can help you choose the right plan based on how many PCs, Macs, phones, and tablets you need to protect.",
  },
  {
    q: "Does Kaspersky slow down my computer?",
    a: "No. Kaspersky is consistently rated as one of the lightest security suites by independent testing labs like AV-Comparatives. It uses cloud-assisted scanning to minimise local resource usage, and its performance tools can actually speed up your PC.",
  },
  {
    q: "Will you install and set it up for me?",
    a: "Absolutely. When you purchase Kaspersky from Koastal Kollective, we can install it, activate your licence, run the initial full scan, configure real-time protection, and set up the VPN and password manager on all your devices.",
  },
  {
    q: "Can I transfer my licence if I get a new computer?",
    a: "Yes. Kaspersky licences are tied to your My Kaspersky account, not your hardware. You can deactivate protection on an old device and activate it on a new one at any time through your online portal.",
  },
  {
    q: "Is Kaspersky safe to use on a Mac?",
    a: "Yes. Kaspersky Premium Total Security fully supports macOS and provides real-time protection, anti-phishing, VPN, and password manager features on Mac computers. We handle the Mac installation regularly for Central Coast customers.",
  },
];

export default function KasperskyPage() {
  const reviewsRef = useRef<HTMLDivElement>(null);

  useSeo({
    title: "Kaspersky Antivirus | Koastal Kollective",
    description: "Kaspersky antivirus through Koastal Kollective. Licences, installation and local Central Coast support — keep your PC, Mac and family devices protected.",
  });

  useStructuredData(
    serviceGraph({
      path: "/kaspersky",
      serviceType: "Antivirus Licensing & Installation",
      name: "Kaspersky Antivirus",
      description: "Kaspersky antivirus licences, installation and local support for PC, Mac and family devices.",
      breadcrumbName: "Kaspersky",
    }),
    "kaspersky",
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
      <section className="bg-gray-50 py-10 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col items-center gap-6 text-center">
            <img
              src="/images/logo.png"
              alt="Koastal Kollective"
              className="w-56 h-56 md:w-64 md:h-64 object-contain"
            />
            <div className="max-w-3xl">
              <p className="text-[#007b7d] font-bold tracking-[0.2em] text-sm uppercase mb-3">
                Kaspersky Premium Total Security
              </p>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
                Award-Winning Protection for Your Digital Life.
              </h1>
              <p className="text-gray-600 leading-relaxed mt-4 max-w-2xl mx-auto">
                Kaspersky Premium Total Security delivers world-class antivirus, ransomware protection, unlimited VPN, password management, and home network security — all in one powerful suite. Buy from Koastal Kollective on the Central Coast or Lake Macquarie for genuine licences, expert installation, and local support.
              </p>
              <div className="flex flex-wrap gap-4 justify-center mt-6">
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
          </div>
        </div>
      </section>

      {/* ─── Hero Image ─── */}
      <section className="py-0">
        <img
          src="/images/kaspersky-hero.webp"
          alt="Kaspersky cybersecurity protection shield"
          className="w-full h-56 md:h-80 object-cover"
        />
      </section>

      {/* ─── Why Buy Kaspersky ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Why Kaspersky Premium Total Security
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-10">
            Protection That Works <em className="text-[#007b7d] not-italic">Without Slowing You Down</em>
          </h2>
          <p className="text-gray-600 leading-relaxed text-center max-w-3xl mx-auto mb-10">
            Kaspersky is consistently rated as one of the best antivirus solutions by independent testing organisations like AV-Test, AV-Comparatives, and SE Labs. It detects 99.9% of threats with minimal false positives and a lighter system impact than most competitors. Whether you use a Windows PC, Mac, Android phone, or iPhone, Kaspersky Premium Total Security keeps your entire digital ecosystem safe.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {advantages.map((a) => (
              <div
                key={a.title}
                className="flex gap-4 bg-gray-50 border border-gray-100 rounded-lg p-5"
              >
                <div className="flex-shrink-0 mt-1">
                  <a.icon className="h-6 w-6 text-[#007b7d]" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{a.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{a.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Comparison Table ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Head-to-Head Comparison
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-4">
            Kaspersky vs Norton vs Trend Micro
          </h2>
          <p className="text-gray-600 leading-relaxed text-center max-w-2xl mx-auto mb-10">
            Kaspersky Premium Total Security offers more features for less money, including an unlimited VPN and home network scanner that competitors either charge extra for or don't offer at all. Here's how they stack up.
          </p>

          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#007b7d] text-white">
                  <th className="text-left px-4 py-3 font-semibold">Feature</th>
                  <th className="text-center px-4 py-3 font-semibold">Kaspersky Premium</th>
                  <th className="text-center px-4 py-3 font-semibold">Norton 360</th>
                  <th className="text-center px-4 py-3 font-semibold">Trend Micro Maximum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {comparisonRows.map((row, i) => (
                  <tr key={row.feature} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-4 py-3 text-gray-800 font-medium">{row.feature}</td>
                    <td className="px-4 py-3 text-center">
                      {row.kaspersky ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.norton ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.trendMicro ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-gray-500 text-xs text-center mt-4">
            Comparison based on publicly available product specifications as of 2025. Features and pricing subject to change by respective vendors.
          </p>
        </div>
      </section>

      {/* ─── Why Buy From Koastal Kollective ─── */}
      <section className="bg-[#007b7d] py-14 border-b border-[#006a6c]">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#7bb8bd] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Local Advantage
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-10">
            Why Buy Kaspersky from <em className="text-[#7bb8bd] not-italic">Koastal Kollective</em>?
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {whyKoastal.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#7bb8bd] flex-shrink-0 mt-0.5" />
                <p className="text-white/90 text-sm leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <a
              href="tel:+61493145179"
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 text-[#007b7d] font-bold px-7 py-3 rounded-full text-sm transition-colors"
            >
              <Phone className="h-4 w-4" />
              Call for a Quote Today
            </a>
          </div>
        </div>
      </section>

            <MediaPromo />

      {/* ─── About Us ─── */}
      <section className="bg-white py-14 border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            About Us
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-8">
            Your Local IT & Security Experts
          </h2>
          <p className="text-gray-600 leading-relaxed text-center max-w-3xl mx-auto">
            Koastal Kollective has been protecting families and businesses across the Central Coast and Lake Macquarie since 2011. We don't just sell software — we make sure it works properly on your devices, is configured correctly, and stays up to date. When you buy Kaspersky from us, you get genuine licences, expert installation, and a local team you can call if anything goes wrong.
          </p>
          <div className="flex flex-wrap justify-center gap-10 mt-8">
            {[
              { value: `${yearsExperience}`, label: "Years in Business" },
              { value: "500+", label: "Customers Protected" },
              { value: "Local", label: "Central Coast Support" },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-3xl font-bold text-[#007b7d]">{value}</p>
                <p className="text-sm text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="bg-gray-50 py-14 border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            FAQ
          </p>
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">
            Kaspersky Questions & Answers
          </h2>
          <div className="space-y-5">
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
